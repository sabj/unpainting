import test from 'node:test';
import assert from 'node:assert/strict';
import { measureAlong, weightsFrom } from './ink-measure.mjs';
import { pathSupport, resample, holdLinesToTarget } from './ink-lines.mjs';

// An L* plane of paper (90) with a horizontal line at row y whose width and depth change along x.
function plane(w, h, y, { width = x => 2, depth = x => 40 } = {}) {
  const L = new Float32Array(w * h).fill(90);
  for (let x = 0; x < w; x++) for (let yy = 0; yy < h; yy++) if (Math.abs(yy + 0.5 - y) <= width(x) / 2) L[yy * w + x] = 90 - depth(x);
  return L;
}

test('the measured width follows the target line as it swells', () => {
  const w = 80, h = 30, L = plane(w, h, 15, { width: x => (x < 40 ? 1 : 3) });
  const R = resample([{ x: 4, y: 15 }, { x: 76, y: 15 }], 0.5), { on, side } = pathSupport(R, L, w, h);
  const m = measureAlong(R, L, w, h, on, side);
  const at = x => m.width[R.findIndex(q => q.x >= x)];
  assert.ok(at(60) > at(20) + 1, `thin ${at(20)} wide ${at(60)}`);
});

test('a paler stretch of line reads as less absorbance, and weights keep a floor', () => {
  const w = 80, h = 30, L = plane(w, h, 15, { depth: x => (x < 40 ? 50 : 15) });
  const R = resample([{ x: 4, y: 15 }, { x: 76, y: 15 }], 0.5), { on, side } = pathSupport(R, L, w, h);
  const m = measureAlong(R, L, w, h, on, side);
  const dark = m.absorbance[R.findIndex(q => q.x >= 20)], pale = m.absorbance[R.findIndex(q => q.x >= 60)];
  assert.ok(dark > 2 * pale);
  const wts = weightsFrom([dark, pale, 0], dark);
  assert.equal(wts[0], 1);
  assert.ok(wts[1] > 0.45 && wts[1] < 1);
  assert.equal(wts[2], 0.45);
});

test('holding with measure writes per-point widths and weights, and marks a wide pale piece soft', () => {
  const w = 100, h = 60;
  const L = new Float32Array(w * h).fill(90);
  for (let x = 0; x < w; x++) { L[15 * w + x] = 40; for (let y = 42; y < 45; y++) L[y * w + x] = 74; }
  const line = y => ({ points: [[5, y], [95, y]] });
  const r = holdLinesToTarget([line(15.5), line(15.5), line(15.5), line(43.5)], L, w, h, { threshold: 3, measure: true });
  assert.ok(r.lines.length >= 4);
  for (const g of r.lines) { assert.equal(g.widths.length, g.points.length); assert.equal(g.weights.length, g.points.length); }
  const pale = r.lines.find(g => g.points[0][1] > 30), crisp = r.lines.find(g => g.points[0][1] < 30);
  assert.equal(pale.soft, true);
  assert.equal(crisp.soft, undefined);
});

test('a shorter probe stops at its reach, so a wash beside a line does not widen it', () => {
  // a 2 px line with a dark wash on one side: the wash is darker than the line's half-contrast level, so a long probe walks into it
  const w = 80, h = 40, L = new Float32Array(w * h).fill(90);
  for (let x = 0; x < w; x++) { for (let y = 20; y <= 21; y++) L[y * w + x] = 40; for (let y = 22; y < 34; y++) L[y * w + x] = 45; }
  const R = resample([{ x: 4, y: 21 }, { x: 76, y: 21 }], 0.5), { on, side } = pathSupport(R, L, w, h);
  const long = measureAlong(R, L, w, h, on, side), short = measureAlong(R, L, w, h, on, side, { reach: 1.5 });
  const mid = R.findIndex(q => q.x >= 40);
  assert.ok(long.width[mid] > 4, `default probe ${long.width[mid]}`);
  assert.ok(short.width[mid] <= 2 * 1.5 + 0.25 + 1e-6, `short probe ${short.width[mid]}`);
});

test('a lineart map contour is held to the map width, the pen range and the detail width, and is never soft', () => {
  const w = 120, h = 80, L = new Float32Array(w * h).fill(90);
  for (let x = 0; x < w; x++) for (let y = 14; y <= 17; y++) L[y * w + x] = 40; // a 4 px line
  for (let x = 20; x < 30; x++) for (let y = 54; y <= 57; y++) L[y * w + x] = 40; // a 4 px mark, short
  const long = { points: [[5, 16], [115, 16]], widths: [1, 1], weights: [0.6, 0.6] };
  const mark = { points: [[20, 56], [30, 56]], widths: [3, 3], weights: [1, 1] };
  const widthPx = { min: 0.5, max: 3, detail: 0.5, shortPx: 15, curvedDegPerPx: 3 };
  const r = holdLinesToTarget([long, mark], L, w, h, { threshold: 0, measure: true, contour: true, reach: 2.5, widthPx });
  const lineW = r.lines.find(g => g.points[0][1] < 30).widths, markW = r.lines.find(g => g.points[0][1] > 30).widths;
  assert.ok(lineW.every(v => v <= 2 + 1e-9), `held to twice the map's 1 px, got ${lineW}`);
  assert.ok(markW.every(v => v <= 1.5 + 1e-9), `a short mark is drawn half as wide (of at most 3 px), got ${markW}`);
  assert.ok(r.lines.every(g => g.soft === undefined && g.widths.every(v => v >= 0.5 - 1e-9)));
  assert.ok(r.lines[0].weights.every(v => v > 0.6 && v <= 1), 'map confidence and source darkness are combined');
});

test('a traced stroke weighs by its own darkness against the paper, not against what is beside it', () => {
  const w = 120, h = 80, L = new Float32Array(w * h).fill(90);
  for (let y = 40; y < 80; y++) for (let x = 0; x < w; x++) L[y * w + x] = 32;            // a dark wash
  for (let x = 0; x < w; x++) { L[60 * w + x] = 15; L[61 * w + x] = 15; L[20 * w + x] = 60; L[21 * w + x] = 60; }
  const line = y => ({ points: [[5, y], [115, y]], widths: [2, 2], weights: [1, 1] });
  const widthPx = { min: 0.5, max: 4, detail: 1, shortPx: 1, curvedDegPerPx: 99, darkWidth: false, paperWeight: true, paperL: 90 };
  const r = holdLinesToTarget([line(61), line(21)], L, w, h, { threshold: 0, measure: true, contour: true, reach: 2.5, widthPx });
  const mean = g => g.weights.reduce((a, v) => a + v, 0) / g.weights.length;
  const onDark = r.lines.find(g => g.points[0][1] > 40), onPaper = r.lines.find(g => g.points[0][1] < 40);
  assert.ok(mean(onDark) > mean(onPaper), `black stroke on a dark wash ${mean(onDark)} against a grey stroke on paper ${mean(onPaper)}`);
});
