import { measurePaper } from '../../src/paint/methods/wetdry.mjs';
import assert from 'node:assert/strict';

for (const density of [1, 2]) {
  const w = 1086 * density, h = 1448 * density, n = w * h;
  const sheet = { w, h, W: new Float32Array(n), s: new Float32Array(n), paper: { capacity: new Float32Array(n).fill(1) } };
  const cells = Int32Array.from({ length: n }, (_, i) => i), rows = [];
  for (const uniform of [false, true]) {
    measurePaper(sheet, cells, false, { uniform });
    const samples = []; let result;
    for (let j = 0; j < 5; j++) { const start = performance.now(); result = measurePaper(sheet, cells, false, { uniform }); samples.push(performance.now() - start); }
    rows.push({ uniform, milliseconds: samples.sort((a, b) => a - b)[2], result });
  }
  assert.deepEqual(rows[0].result, rows[1].result);
  console.log(JSON.stringify({ density, w, h, before: rows[0], after: rows[1], speedup: rows[0].milliseconds / rows[1].milliseconds }));
}
