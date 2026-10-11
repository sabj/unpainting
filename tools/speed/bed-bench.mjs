import { fixedBedLower } from '../../src/media/fixed-bed.mjs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

for (const density of [1, 2]) {
  const w = 1086 * density, h = 1448 * density, n = w * h, zero = new Float32Array(n);
  const sheet = { n, _zeroLayer: zero, layers: Array.from({ length: 20 }, (_, j) => Array.from({ length: 8 }, (_, k) => k === j % 8 ? new Float32Array(n).fill(.01 * (j + 1)) : zero)) };
  const rows = [];
  for (const skipEmpty of [false, true]) {
    fixedBedLower(sheet, { skipEmpty }); const samples = []; let bed;
    for (let j = 0; j < 5; j++) { const start = performance.now(); bed = fixedBedLower(sheet, { skipEmpty }); samples.push(performance.now() - start); }
    rows.push({ skipEmpty, milliseconds: samples.sort((a, b) => a - b)[2], sha256: crypto.createHash('sha256').update(new Uint8Array(bed.buffer)).digest('hex') });
  }
  assert.equal(rows[0].sha256, rows[1].sha256);
  console.log(JSON.stringify({ density, w, h, before: rows[0], after: rows[1], speedup: rows[0].milliseconds / rows[1].milliseconds }));
}
