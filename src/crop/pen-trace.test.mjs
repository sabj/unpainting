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

test('a stroke is a smooth path between lifts, within half the reach of the trace', async () => {
  const { smoothPath } = await import('./pen-trace.mjs');
  const P = [[0, 0], [40, 0], [80, 30], [120, 30]], S = smoothPath(P, 4);
  assert.deepEqual(S[0], P[0]); assert.deepEqual(S.at(-1), P.at(-1));
  let maxTurn = 0;
  for (let j = 1; j < S.length - 1; j++) { const a = Math.atan2(S[j][1] - S[j - 1][1], S[j][0] - S[j - 1][0]), b = Math.atan2(S[j + 1][1] - S[j][1], S[j + 1][0] - S[j][0]); maxTurn = Math.max(maxTurn, Math.abs(b - a)); }
  assert.ok(maxTurn < 0.4, `largest turn ${maxTurn.toFixed(2)} rad`);
  const seg = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy); };
  for (const q of S) assert.ok(Math.min(...P.slice(1).map((p, k) => seg(q, P[k], p))) <= 2 + 1e-9);
});

test('a line\'s one width is its mark\'s equivalent width; a dark mass beside it does not widen it', async () => {
  const { markWidth } = await import('./pen-trace.mjs');
  const W = 60, H = 40;
  for (const wd of [1, 2, 3]) {
    const lum = new Float32Array(W * H).fill(0.95);
    for (let y = 0; y < H; y++) for (let x = 30; x < 30 + wd; x++) lum[y * W + x] = 0.2;
    for (let y = 0; y < H; y++) for (let x = 40; x < W; x++) lum[y * W + x] = Math.min(lum[y * W + x], 0.4);
    const got = markWidth([[30 + wd / 2, 5], [30 + wd / 2, 35]], lum, W, H, 4);
    assert.ok(Math.abs(got - wd) <= 0.6, `a ${wd} px line reads ${got.toFixed(2)}`);
  }
});

test('a pale line counts on a subject drawn in pen, and only there', () => {
  const W = 120, H = 80, lum = sheet(W, H);
  stroke(lum, W, 20, 40, 100, 40, 0.68); // 0.27 darker than paper, lighter than the middle of the scale
  assert.equal(tracePen(lum, W, H, BENCH).lines.length, 0, 'a painted subject: pale texture is not traced');
  const pen = tracePen(lum, W, H, { ...BENCH, pen: true });
  assert.equal(pen.lines.length, 1);
  assert.ok(pen.lines[0].length >= 70);
});
