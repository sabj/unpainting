// The pen tracer (pen-trace.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { tracePen, TRACE_MM } from './pen-trace.mjs';

const BENCH = { pixelMm: 280 / 300 }; // a bench subject: 300 px on its 280 mm sheet

test('the tolerances are millimetres on the sheet: on a bench subject they are the old whole pixels', () => {
  const r = tracePen(new Float32Array(100).fill(0.9), 10, 10, BENCH);
  assert.deepEqual(r.px, { flank: [2, 4], side: [4, 14], reach: 4, minLength: 14, wiggle: 40 });
  assert.ok(Math.abs(TRACE_MM.minLength - 13.07) < 0.01 && Math.abs(TRACE_MM.reach - 3.73) < 0.01);
  const small = tracePen(new Float32Array(100).fill(0.9), 10, 10, { pixelMm: 158 / 306 }); // hills: 306 px on 158 mm
  assert.ok(small.px.minLength > 25 && small.px.flank[1] === 7, JSON.stringify(small.px));
  const coarse = tracePen(new Float32Array(100).fill(0.9), 10, 10, { pixelMm: 3.5 });
  assert.deepEqual(coarse.px.flank, [1, 2], 'a tolerance is never under one pixel');
  assert.throws(() => tracePen(new Float32Array(4), 2, 2, {}), /millimetres/);
});

// a sheet of paper (0.95) with a near-black corner patch, so the subject's value scale runs from ink to paper
const sheet = (W, H) => { const lum = new Float32Array(W * H).fill(0.95); for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) lum[y * W + x] = 0.05; return lum; };
const stroke = (lum, W, x0, y0, x1, y1, v) => {
  const L = Math.hypot(x1 - x0, y1 - y0);
  for (let s = 0; s <= L; s += 0.25) { const i = Math.round(y0 + (y1 - y0) * s / L) * W + Math.round(x0 + (x1 - x0) * s / L); lum[i] = v > 0.5 ? v : Math.min(lum[i], v); }
};

test('ticks beside white sheen streaks inside a dark coat are texture, not contours; the coat\'s edge is a contour', () => {
  const W = 120, H = 120, lum = sheet(W, H);
  for (let y = 20; y < 110; y++) for (let x = 20; x < 110; x++) lum[y * W + x] = 0.3;
  for (let k = 0; k < 6; k++) { for (const o of [0, 1, 2]) stroke(lum, W, 36 + o + k * 12, 40, 36 + o + k * 12, 60, 0.92); stroke(lum, W, 39 + k * 12, 38, 39 + k * 12, 62, 0.06); }
  stroke(lum, W, 18, 30, 18, 100, 0.06); // a pen line on the coat's outer edge, paper beside it
  const r = tracePen(lum, W, H, BENCH);
  const inside = r.lines.filter(l => l.points.every(([x, y]) => x > 28 && x < 102 && y > 28 && y < 102));
  assert.equal(inside.length, 0, `${inside.length} ticks drawn inside the coat`);
  assert.ok(r.lines.some(l => l.points.every(([x]) => x < 22)), 'the edge line stays');
});
