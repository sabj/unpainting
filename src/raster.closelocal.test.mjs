// closeLocal must set exactly the cells close() sets: random blobs, edge-touching masks, fractional and whole radii,
// empty masks.   node src/raster.closelocal.test.mjs
import assert from 'node:assert/strict';
import { close, closeLocal } from './raster.js';

let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
let cases = 0;
for (let t = 0; t < 300; t++) {
  const w = 20 + Math.floor(rnd() * 180), h = 20 + Math.floor(rnd() * 180), m = new Uint8Array(w * h);
  const blobs = Math.floor(rnd() * 5);
  for (let b = 0; b < blobs; b++) {
    const cx = rnd() * w, cy = rnd() * h, rx = 1 + rnd() * 25, ry = 1 + rnd() * 25;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1 && rnd() > 0.1) m[y * w + x] = 1;
  }
  if (t % 7 === 0) for (let x = 0; x < w; x++) m[x] = 1;              // touches the top edge
  if (t % 11 === 0) for (let y = 0; y < h; y++) m[y * w + w - 1] = 1;
  const r = [0.5, 1, 1.5, 2.2, 3, 4.8, 7, 12.5][t % 8];
  assert.deepEqual(closeLocal(m, w, h, r), close(m, w, h, r), `case ${t} (${w}x${h}, r ${r})`);
  cases++;
}
console.log(`closeLocal: ${cases} cases identical to close`);
