// Empty pigments share one positive-zero plane. Verify it before skipping it:
// callers may have edited a layer directly, including this shared array.
export function sharedZeroLayer(sheet) {
  const zero = sheet._zeroLayer;
  if (!(zero instanceof Float32Array) || zero.length !== sheet.n) return null;
  const bits = new Uint32Array(zero.buffer, zero.byteOffset, zero.length);
  for (let i = 0; i < bits.length; i++) if (bits[i] !== 0) return null;
  return zero;
}

// Keep layer, pigment and float32 addition order for every nonempty plane.
// The accumulator starts at positive zero; adding a positive-zero plane cannot
// change it. The newest layer is handled separately by GPU fix.
export function fixedBedLower(sheet, { skipEmpty = false } = {}) {
  const bed = new Float32Array(sheet.n), zero = skipEmpty ? sharedZeroLayer(sheet) : null;
  for (const layer of sheet.layers.slice(0, -1)) for (const plane of layer) {
    if (zero && plane === zero) continue;
    for (let i = 0; i < bed.length; i++) bed[i] += plane[i];
  }
  return bed;
}
