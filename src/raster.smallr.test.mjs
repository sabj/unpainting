// dilate and erode by a small radius (the capped transform in raster.js) give the transform's cells.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceToOne, distanceToZero, dilate, erode } from './raster.js';

const refDilate = (m, w, h, r) => { const d = distanceToOne(m, w, h); return Uint8Array.from(d, v => (v <= r ? 1 : 0)); };
const refErode = (m, w, h, r) => { const d = distanceToZero(m, w, h); return Uint8Array.from(d, v => (v > r ? 1 : 0)); };
test('small-radius dilate and erode equal the transform', () => {
  let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let c = 0; c < 400; c++) {
    const w = 5 + Math.floor(rnd() * 70), h = 5 + Math.floor(rnd() * 70), m = new Uint8Array(w * h);
    const kind = c % 4;
    for (let i = 0; i < m.length; i++) m[i] = kind === 0 ? (rnd() < 0.5 ? 1 : 0) : kind === 1 ? (rnd() < 0.03 ? 1 : 0) : kind === 2 ? (rnd() < 0.97 ? 1 : 0) : 0;
    if (kind === 3) { const cx = rnd() * w, cy = rnd() * h, R = 2 + rnd() * 20; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - cx, y - cy) < R) m[y * w + x] = rnd() < 0.02 ? 255 : 1; }
    const r = [0, 0.5, 1, 1.5, 2, 2.3, 3, 4, 4.7, 5, 6, 7, 7.9, 9.5, 12, 15.9][c % 16];
    assert.deepEqual(dilate(m, w, h, r), refDilate(m, w, h, r), `dilate case ${c} r ${r}`);
    assert.deepEqual(erode(m, w, h, r), refErode(m, w, h, r), `erode case ${c} r ${r}`);
  }
  for (const v of [0, 1]) { const m = new Uint8Array(30 * 20).fill(v); for (const r of [1, 3, 6]) { assert.deepEqual(dilate(m, 30, 20, r), refDilate(m, 30, 20, r)); assert.deepEqual(erode(m, 30, 20, r), refErode(m, 30, 20, r)); } }
});
