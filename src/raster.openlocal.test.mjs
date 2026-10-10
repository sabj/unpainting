// openLocal gives the same cells as open (src/raster.js), on random blobs, edge-touching ones and empty masks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open, openLocal } from './raster.js';

test('openLocal equals open', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let c = 0; c < 300; c++) {
    const w = 20 + Math.floor(rnd() * 60), h = 20 + Math.floor(rnd() * 60), m = new Uint8Array(w * h);
    const blobs = Math.floor(rnd() * 5);
    for (let b = 0; b < blobs; b++) {
      const cx = rnd() * w, cy = rnd() * h, rx = 1 + rnd() * 12, ry = 1 + rnd() * 12;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1 || rnd() < 0.01) m[y * w + x] = 1;
    }
    const r = [1, 1.5, 2, 3, 4.7][c % 5];
    assert.deepEqual(openLocal(m, w, h, r), open(m, w, h, r), `case ${c} (${w}x${h}, r ${r})`);
  }
});
