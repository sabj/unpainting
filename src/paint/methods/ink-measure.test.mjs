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
