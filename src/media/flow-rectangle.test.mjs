import test from 'node:test';
import assert from 'node:assert/strict';
import { flowField, setFlowRectangle } from './wash.mjs';
import { setThreads } from './sheet.mjs';

const bits = a => new Uint32Array(a.buffer, a.byteOffset, a.length);
function compare(field, w, h) {
  setFlowRectangle(false); const before = flowField(field, w, h);
  setFlowRectangle(true); const after = flowField(field, w, h);
  for (const key of ['fx', 'fy', 'coh']) assert.deepEqual(bits(after[key]), bits(before[key]), key);
}

test('rectangle-limited fields preserve all direction and coherence bits at edges and holes', () => {
  let seed = 7;
  const rnd = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296;
  try {
    for (let trial = 0; trial < 100; trial++) {
      const w = 3 + trial % 47, h = 3 + trial % 41, field = new Float32Array(w * h);
      const x0 = Math.floor(rnd() * w), x1 = Math.floor(rnd() * w), y0 = Math.floor(rnd() * h), y1 = Math.floor(rnd() * h);
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        field[y * w + x] = rnd() < .2 ? -0 : (rnd() - .4) * 4;
      }
      compare(field, w, h);
    }
    for (const value of [0, -0, NaN, Infinity, -Infinity]) {
      const field = new Float32Array(29 * 31); field[6 * 29 + 11] = value;
      compare(field, 29, 31);
    }
  } finally { setFlowRectangle(false); }
});

test('thread-pool rectangle bounds produce the same fields as the serial full-row calculation', async () => {
  const w = 300, h = 240, field = new Float32Array(w * h);
  for (let y = 31; y < 190; y++) for (let x = 130; x < 151; x++) field[y * w + x] = Math.sin(x * .2 + y * .1) + 2;
  try {
    await setThreads(1); setFlowRectangle(false); const before = flowField(field, w, h);
    await setThreads(4); const par = await import('./sheet-par.mjs'), calls = par.stats().flow;
    setFlowRectangle(true); const after = flowField(field, w, h);
    assert.equal(par.stats().flow, calls + 1, 'the rectangle field ran on the thread pool');
    for (const key of ['fx', 'fy', 'coh']) assert.deepEqual(bits(after[key]), bits(before[key]), key);
  } finally { setFlowRectangle(false); await setThreads(1); }
});
