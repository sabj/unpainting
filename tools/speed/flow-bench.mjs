import { flowField, setFlowRectangle } from '../../src/media/wash.mjs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

for (const density of [1, 2]) {
  const w = 1086 * density, h = 1448 * density, field = new Float32Array(w * h);
  for (let y = Math.floor(h * .2); y < Math.floor(h * .8); y++) for (let x = Math.floor(w * .4); x < Math.floor(w * .6); x++) {
    field[y * w + x] = 2 + Math.sin(x / density * .013) * Math.cos(y / density * .017);
  }
  const rows = [];
  for (const rectangle of [false, true]) {
    setFlowRectangle(rectangle); flowField(field, w, h);
    const times = []; let result;
    for (let i = 0; i < 5; i++) { const start = performance.now(); result = flowField(field, w, h); times.push(performance.now() - start); }
    const hash = crypto.createHash('sha256');
    for (const key of ['fx', 'fy', 'coh']) hash.update(new Uint8Array(result[key].buffer));
    rows.push({ rectangle, milliseconds: times.sort((a, b) => a - b)[2], sha256: hash.digest('hex') });
  }
  assert.equal(rows[0].sha256, rows[1].sha256);
  console.log(JSON.stringify({ density, w, h, before: rows[0], after: rows[1], speedup: rows[0].milliseconds / rows[1].milliseconds }));
}
setFlowRectangle(false);
