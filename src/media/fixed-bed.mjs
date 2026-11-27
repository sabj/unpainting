// Empty pigments share one positive-zero plane. Verify it before skipping it:
// callers may have edited a layer directly, including this shared array.
function sharedZeroLayer(sheet) {
  const zero = sheet._zeroLayer;
  if (!(zero instanceof Float32Array) || zero.length !== sheet.n) return null;
  const bits = new Uint32Array(zero.buffer, zero.byteOffset, zero.length);
  let i = 0;
  for (; i + 3 < bits.length; i += 4) if ((bits[i] | bits[i + 1] | bits[i + 2] | bits[i + 3]) !== 0) return null;
  for (; i < bits.length; i++) if (bits[i] !== 0) return null;
  return zero;
}

// Add one layer's planes into `bed`, pigment order, skipping the verified zero plane. With `signed` it returns a
// fingerprint of the bits it read, which only verifyFixedBed looks at; a sum that is not kept does not pay for one.
function addLayer(bed, layer, zero, signed = false) {
  let sig = 2166136261;
  for (const plane of layer) {
    if (zero && plane === zero) continue;
    if (!signed) { for (let i = 0; i < bed.length; i++) bed[i] += plane[i]; continue; }
    const bits = new Uint32Array(plane.buffer, plane.byteOffset, plane.length);
    for (let i = 0; i < bed.length; i++) { bed[i] += plane[i]; sig = Math.imul(sig ^ bits[i], 16777619); }
  }
  return sig >>> 0;
}

// The sum kept from the last call, per sheet: the bed of the first entries.length lower layers.
// The bed of layers 0..m-1 is exactly the bed of layers 0..m-2 with layer m-1's planes added in
// pigment order, so a kept prefix can be extended and the float32 bits come out the same, as long
// as none of the layers in it has changed. Each entry remembers what would show a change:
//  - the layer object (a replaced layer, a swapped or truncated layers array),
//  - layer._cacheVersion, which layersChanged and GpuLink.syncLower bump when they write a dried layer in place,
//  - each plane object (a plane replaced or swapped for the shared zero plane),
// and the cache as a whole remembers sheet._layerVer (any layersChanged) and the sheet size.
const kept = new WeakMap();

// The plane held in a layer slot, read without triggering the storage getter that rehydrates a cropped
// plane (layer-storage.mjs). undefined means such a getter is in place.
const heldPlane = (layer, k) => Object.getOwnPropertyDescriptor(layer, k)?.value;

function entryHolds(entry, layer) {
  if (entry.layer !== layer || entry.version !== (layer._cacheVersion ?? 0) || entry.planes.length !== layer.length) return false;
  // A cropped plane (getter in place) holds the same bits it was summed with: storage never changes values.
  for (let k = 0; k < layer.length; k++) { const now = heldPlane(layer, k); if (now !== undefined && now !== entry.planes[k]) return false; }
  return true;
}

function prefixHolds(cache, sheet, layers, limit) {
  if (cache.n !== sheet.n || cache.layers !== layers || cache.layerVer !== (sheet._layerVer || 0) || cache.entries.length > limit) return false;
  return cache.entries.every((entry, q) => entryHolds(entry, layers[q]));
}

// Layers a GPU readback has yet to fill in place stay out of the kept prefix; they are added to the copy only.
function settledCount(sheet, lower) {
  let limit = lower;
  for (const pending of sheet._gpu?.pendingLayers ?? []) if (pending.index < limit) limit = pending.index;
  return limit;
}

// Keep layer, pigment and float32 addition order for every nonempty plane.
// The accumulator starts at positive zero; adding a positive-zero plane cannot
// change it. The newest layer is handled separately by GPU fix.
// With skipEmpty the sum of the settled lower layers is kept and only layers added since are summed;
// a fresh array is returned every time.
export function fixedBedLower(sheet, { skipEmpty = false } = {}) {
  const layers = sheet.layers, lower = layers.length - 1, zero = skipEmpty ? sharedZeroLayer(sheet) : null;
  if (!zero) {
    kept.delete(sheet);
    const bed = new Float32Array(sheet.n);
    for (let q = 0; q < lower; q++) addLayer(bed, layers[q], null);
    return bed;
  }
  const limit = settledCount(sheet, Math.max(0, lower));
  let cache = kept.get(sheet);
  if (!cache || !prefixHolds(cache, sheet, layers, limit)) {
    cache = { n: sheet.n, layers, layerVer: sheet._layerVer || 0, bed: new Float32Array(sheet.n), entries: [] };
    kept.set(sheet, cache);
  }
  for (let q = cache.entries.length; q < limit; q++) {
    const layer = layers[q], sig = addLayer(cache.bed, layer, zero, true);
    cache.entries.push({ layer, version: layer._cacheVersion ?? 0, planes: Array.from(layer, (_, k) => heldPlane(layer, k)), sig });
  }
  const bed = cache.bed.slice();
  for (let q = limit; q < lower; q++) addLayer(bed, layers[q], zero);
  return bed;
}

// For tests: prove the kept sum still matches the layers, and name the layer where it does not.
// It catches a write into a dried layer that skipped layersChanged. A change that was announced (or a
// replaced layer) is no fault: the next fixedBedLower drops the kept sum, so there is nothing to prove.
export function verifyFixedBed(sheet) {
  const cache = kept.get(sheet);
  if (!cache || !prefixHolds(cache, sheet, sheet.layers, cache.entries.length)) return;
  const zero = sharedZeroLayer(sheet);
  if (!zero) throw new Error('fixed bed: the shared zero plane is no longer all zero');
  const fresh = new Float32Array(sheet.n);
  cache.entries.forEach((entry, q) => {
    if (addLayer(fresh, entry.layer, zero, true) !== entry.sig) throw new Error(`fixed bed: layer ${q} changed in place without being announced`);
  });
  const a = new Uint32Array(fresh.buffer), b = new Uint32Array(cache.bed.buffer);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(`fixed bed: the kept sum differs from a fresh sum at cell ${i}`);
}
