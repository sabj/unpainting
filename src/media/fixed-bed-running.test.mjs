import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, fix, liftResist, layersChanged } from './sheet.mjs';
import { compactLowerLayers } from './layer-storage.mjs';
import { fixedBedLower, verifyFixedBed } from './fixed-bed.mjs';
import { GpuLink } from './gpu/link.mjs';

const pigments = [0, 1, 2].map(() => ({ K: [1, .7, .5], S: [.02, .02, .02], rho: .05, omega: 60, gamma: 0 }));
const bits = a => new Uint32Array(a.buffer, a.byteOffset, a.length);
const same = (a, b, what) => assert.deepEqual(bits(a), bits(b), what);

// The sum as it was before the kept prefix: every plane of every lower layer, from scratch.
function scratchBed(sheet, skipEmpty) {
  const zero = skipEmpty && sheet._zeroLayer && sheet._zeroLayer.every(v => Object.is(v, 0)) ? sheet._zeroLayer : null;
  const bed = new Float32Array(sheet.n);
  for (const layer of sheet.layers.slice(0, -1)) for (const plane of layer) {
    if (zero && plane === zero) continue;
    for (let i = 0; i < bed.length; i++) bed[i] += plane[i];
  }
  return bed;
}
function rng(seed) { let s = seed; return () => ((s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296); }
function newSheet() {
  const sheet = createSheet(makePaper(12, 9), pigments);
  sheet._zeroLayer = new Float32Array(sheet.n);
  return sheet;
}
function plane(sheet, rnd) {
  const kind = rnd();
  if (kind < .4) return sheet._zeroLayer;
  return Float32Array.from({ length: sheet.n }, () => rnd() < .1 ? -0 : (rnd() - .5) * 2 ** Math.floor(rnd() * 60 - 30));
}
const randomLayer = (sheet, rnd) => pigments.map(() => plane(sheet, rnd));
const nonzeroPlane = (sheet, l, k) => { const p = sheet.layers[l][k]; return p === sheet._zeroLayer ? null : p; };

test('the kept running sum equals a from-scratch sum over random edits, announced or not', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const rnd = rng(seed), sheet = newSheet();
    for (let step = 0; step < 40; step++) {
      const L = sheet.layers.length, op = Math.floor(rnd() * 11), pick = () => Math.floor(rnd() * L);
      if (op <= 2 || !L) sheet.layers.push(randomLayer(sheet, rnd));
      else if (op === 3) { // fix: the real writer that pushes a layer from the deposit
        for (const Dk of sheet.D) for (let i = 0; i < sheet.n; i++) if (rnd() < .3) Dk[i] = rnd();
        fix(sheet);
      } else if (op === 4) { // in-place write into a dried layer, announced the way every real writer announces it
        const p = nonzeroPlane(sheet, pick(), Math.floor(rnd() * 3));
        if (p) { p[Math.floor(rnd() * sheet.n)] = rnd(); layersChanged(sheet); }
      } else if (op === 5) { // masking fluid lifted from dried layers (the real in-place writer)
        sheet.resist = Uint8Array.from({ length: sheet.n }, () => rnd() < .3 ? 1 : 0);
        sheet.resistFrom = pick(); sheet.resistStrength = rnd() < .5 ? Float32Array.from({ length: sheet.n }, () => rnd()) : null;
        // liftResist scales the layer's shared zero plane in place too; that is still zero
        liftResist(sheet, { byPlane: rnd() < .5 });
      } else if (op === 6) sheet.layers[pick()][Math.floor(rnd() * 3)] = plane(sheet, rnd); // a plane replaced, nothing announced
      else if (op === 7) sheet.layers.length = Math.floor(rnd() * L); // layers dropped
      else if (op === 8) compactLowerLayers(sheet, { from: 0 }); // storage swaps planes for cropped records
      else if (op === 9) sheet.layers = sheet.layers.map(layer => layer.map(p => p === sheet._zeroLayer ? p : p.slice())); // same values, new objects
      else sheet.layers.splice(Math.floor(rnd() * L), 0, randomLayer(sheet, rnd)); // a layer slipped in below the others
      if (rnd() < .7) {
        same(fixedBedLower(sheet, { skipEmpty: true }), scratchBed(sheet, true), `seed ${seed} step ${step} op ${op}`);
        verifyFixedBed(sheet);
        same(fixedBedLower(sheet), scratchBed(sheet, false), 'no skip');
      }
    }
  }
});

test('a layer in the bed is added to a fresh array each call, and the shared zero plane is verified every time', () => {
  const sheet = newSheet(), rnd = rng(9);
  for (let l = 0; l < 4; l++) sheet.layers.push(randomLayer(sheet, rnd));
  const a = fixedBedLower(sheet, { skipEmpty: true }), b = fixedBedLower(sheet, { skipEmpty: true });
  assert.notEqual(a, b); a.fill(5); same(fixedBedLower(sheet, { skipEmpty: true }), scratchBed(sheet, true));
  for (const v of [-0, .5, NaN]) { sheet._zeroLayer[0] = v; same(fixedBedLower(sheet, { skipEmpty: true }), scratchBed(sheet, false), `zero plane holds ${v}`); }
  sheet._zeroLayer[0] = 0; same(fixedBedLower(sheet, { skipEmpty: true }), scratchBed(sheet, true));
});

test('verifyFixedBed names a dried layer written in place behind the sum', () => {
  const sheet = newSheet(), rnd = rng(3);
  for (let l = 0; l < 5; l++) sheet.layers.push(pigments.map(() => Float32Array.from({ length: sheet.n }, () => rnd())));
  fixedBedLower(sheet, { skipEmpty: true });
  verifyFixedBed(sheet);
  sheet.layers[2][1][4] += 1; // no layersChanged: the kept sum would now be wrong
  assert.throws(() => verifyFixedBed(sheet), /layer 2 changed in place/);
  assert.notDeepEqual(bits(fixedBedLower(sheet, { skipEmpty: true })), bits(scratchBed(sheet, true))); // and it is wrong: that is the case to catch
  // the same write, announced: the sum is dropped, so it is exact again
  const other = newSheet();
  for (let l = 0; l < 5; l++) other.layers.push(pigments.map(() => Float32Array.from({ length: other.n }, () => rnd())));
  fixedBedLower(other, { skipEmpty: true });
  other.layers[2][1][4] += 1; layersChanged(other);
  verifyFixedBed(other);
  same(fixedBedLower(other, { skipEmpty: true }), scratchBed(other, true));
});

// A GPU link whose readback is a plain function: deferred layers are filled in place by the real syncLower.
function linkFixture() {
  const n = 12 * 9, zero = new Float32Array(n), sheet = { n, pigments, _zeroLayer: zero, layers: [] }, archives = new Map();
  const link = Object.assign(Object.create(GpuLink.prototype), {
    n, K: 3, sheet, pendingLayers: [], stats: {}, queuedDrys: 0, drainingDrys: false, ctrl: new Int32Array(16), rectData: new Float32Array(24),
    call(message) {
      const out = new Uint32Array(message.output); let at = 0;
      for (const id of message.ids) for (const p of archives.get(id)) { out.set(bits(p), at); at += n; }
    },
  });
  sheet._gpu = link;
  return { sheet, link, archives };
}

test('layers filled in place by a deferred-archive readback are caught and summed again', () => {
  const { sheet, link, archives } = linkFixture(), rnd = rng(5);
  for (let id = 1; id <= 6; id++) {
    const values = [Float32Array.from({ length: sheet.n }, () => rnd()), Float32Array.from({ length: sheet.n }, () => -rnd())];
    archives.set(id, values);
    sheet.layers.push(link.layerPlanes(sheet, 0b101));
    link.pendingLayers.push({ index: sheet.layers.length - 1, mask: 0b101, id });
    if (id % 2 === 0) { // some calls land while layers are still placeholders, some after a sync
      same(fixedBedLower(sheet, { skipEmpty: true }), scratchBed(sheet, true), 'before the readback');
      if (id === 4) link.syncLower(sheet);
      same(fixedBedLower(sheet, { skipEmpty: true }), scratchBed(sheet, true), 'after');
      verifyFixedBed(sheet);
    }
  }
  sheet.layers.push(link.layerPlanes(sheet, 0)); // the newest layer is never in the bed
  link.syncLower(sheet);
  same(fixedBedLower(sheet, { skipEmpty: true }), scratchBed(sheet, true), 'all read back');
  verifyFixedBed(sheet);
});

test('each marker alone drops the kept sum: layer version, sheet version, plane object, layer object, shorter layers', () => {
  const rnd = rng(11), fill = sheet => { for (let l = 0; l < 5; l++) sheet.layers.push(pigments.map(() => Float32Array.from({ length: sheet.n }, () => rnd()))); return sheet; };
  const edits = {
    'layer version': sheet => { sheet.layers[1][0][2] += 1; sheet.layers[1]._cacheVersion = (sheet.layers[1]._cacheVersion ?? 0) + 1; },
    'sheet version': sheet => { sheet.layers[1][0][2] += 1; sheet._layerVer = (sheet._layerVer || 0) + 1; },
    'plane object': sheet => { sheet.layers[1][0] = sheet.layers[1][0].map(v => v * 2); },
    'layer object': sheet => { sheet.layers[1] = sheet.layers[1].map(p => p.map(v => v + 1)); },
    'fewer layers': sheet => { sheet.layers.length = 3; },
    // layers dropped until layer 2 is the liftable top, lifted in place as a top is, then two new layers laid over it
    'fewer layers, then more': sheet => { sheet.layers.length = 3; sheet.layers[2][0][2] += 1; sheet.layers.push(pigments.map(() => new Float32Array(sheet.n)), pigments.map(() => new Float32Array(sheet.n))); },
  };
  for (const [name, edit] of Object.entries(edits)) {
    const sheet = fill(newSheet());
    fixedBedLower(sheet, { skipEmpty: true });
    edit(sheet);
    same(fixedBedLower(sheet, { skipEmpty: true }), scratchBed(sheet, true), name);
    verifyFixedBed(sheet);
  }
});
