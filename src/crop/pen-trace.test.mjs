// The pen tracer (pen-trace.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { tracePen, TRACE_MM } from './pen-trace.mjs';

const BENCH = { pixelMm: 280 / 300 }; // a bench subject: 300 px on its 280 mm sheet

test('the tolerances are millimetres on the sheet: on a bench subject they are the old whole pixels', () => {
  const r = tracePen(new Float32Array(100).fill(0.9), 10, 10, BENCH);
  assert.deepEqual(r.px, { flank: [2, 4], side: [3, 4], reach: 4, minLength: 14, wiggle: 40 });
  assert.ok(Math.abs(TRACE_MM.minLength - 13.07) < 0.01 && Math.abs(TRACE_MM.reach - 3.73) < 0.01);
  const small = tracePen(new Float32Array(100).fill(0.9), 10, 10, { pixelMm: 158 / 306 }); // hills: 306 px on 158 mm
  assert.ok(small.px.minLength > 25 && small.px.flank[1] === 7, JSON.stringify(small.px));
  const coarse = tracePen(new Float32Array(100).fill(0.9), 10, 10, { pixelMm: 3.5 });
  assert.deepEqual(coarse.px.flank, [1, 2], 'a tolerance is never under one pixel');
  assert.throws(() => tracePen(new Float32Array(4), 2, 2, {}), /millimetres/);
});
