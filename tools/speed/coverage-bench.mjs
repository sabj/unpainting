import { sweepCount, sweepCover, setSweepIntervals } from '../../src/media/wash.mjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

for (const density of [1, 2]) {
  const w = 1086 * density, h = 1448 * density, mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x > w * .1 && x < w * .9 && y > h * .1 && y < h * .9) mask[y * w + x] = 1;
  const paths = Array.from({ length: 24 }, (_, lane) => Array.from({ length: 180 }, (_, j) => ({
    x: (120 + j * 4.1) * density,
    y: (140 + lane * 44 + Math.sin(j * .09 + lane) * 20) * density,
    r: (15 + Math.sin(j * .04) * 5) * density,
  })));
  const rows = [];
  for (const enabled of [false, true]) {
    setSweepIntervals(enabled);
    sweepCount(paths, w, h); sweepCover(paths, mask, w, h);
    const start = performance.now(); let count, cover;
    for (let i = 0; i < 5; i++) { count = sweepCount(paths, w, h); cover = sweepCover(paths, mask, w, h); }
    rows.push({ enabled, milliseconds: (performance.now() - start) / 5, cover,
      countHash: crypto.createHash('sha256').update(new Uint8Array(count.buffer)).digest('hex') });
  }
  assert.equal(rows[0].countHash, rows[1].countHash); assert.equal(rows[0].cover, rows[1].cover);
  console.log(JSON.stringify({ density, w, h, before: rows[0], after: rows[1], speedup: rows[0].milliseconds / rows[1].milliseconds }));
}
