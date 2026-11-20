import test from 'node:test';
import assert from 'node:assert/strict';
import { strokeWeight, splitAtCorners, trimHooks } from './stroke-weight.mjs';
import { shapeGesture, handDrawing } from './drawing-hand.mjs';

const line = (pts, extra = {}) => ({ points: pts.map(([x, y, width, weight]) => ({ x, y, ...(width == null ? {} : { width }), ...(weight == null ? {} : { weight }) })), ...extra });

test('a stroke has one width and one darkness: the medians of its readings', () => {
  const g = line([[0, 0, 1, 0.2], [10, 0, 3, 0.9], [20, 0, 2, 0.6], [30, 0, 9, 0.5]]);
  assert.deepEqual(strokeWeight(g.points), { width: 2.5, weight: 0.55 });
});

test('a gesture with no readings has no weight of its own', () => {
  assert.deepEqual(strokeWeight(line([[0, 0], [5, 0]]).points), { width: null, weight: null });
});

test('the nib does not replay the subject\'s darkness point by point: only the hand\'s envelope varies along a stroke', () => {
  const dark = [0.2, 1, 0.3, 0.9, 0.4, 1, 0.2, 0.8, 0.5];
  const g = line(dark.map((d, k) => [k * 10, 0, 2 + (k % 3), d]));
  const shaped = shapeGesture(g, { base: 1, inLen: 5, outLen: 5, gain: 1, margin: 0, minNib: 0 });
  const mid = shaped.points.filter(q => q.x >= 10 && q.x <= 70);
  assert.ok(mid.length >= 7);
  assert.ok(mid.every(q => Math.abs(q.s - mid[0].s) < 1e-9), 'pressure is level between the landing and the lift');
  assert.ok(mid.every(q => Math.abs(q.nw - mid[0].nw) < 1e-9), 'so is the contact width');
  assert.ok(shaped.points[0].s < mid[0].s && shaped.points.at(-1).s < mid[0].s, 'and both ends are lighter');
  // a heavier subject line makes a heavier stroke
  const heavy = shapeGesture(line(dark.map((d, k) => [k * 10, 0, 6, 1])), { base: 1, inLen: 5, outLen: 5, gain: 1, margin: 0, minNib: 0 });
  assert.ok(heavy.points[4].nw > mid[0].nw && heavy.points[4].s > mid[0].s);
});

test('an L is two strokes, and a hook at the end of a line is not drawn', () => {
  const L = line([[0, 0, 2, 1], [20, 0, 2, 1], [20, 20, 2, 1]]);
  const two = splitAtCorners(L, { span: 3, deg: 60, spur: 4 });
  assert.equal(two.length, 2);
  assert.deepEqual([two[0].points.at(-1).x, two[0].points.at(-1).y], [20, 0]);
  assert.deepEqual([two[1].points[0].x, two[1].points[0].y], [20, 0]);
  const hook = line([[0, 0], [20, 0], [20, 2.5]]);
  const one = splitAtCorners(hook, { span: 3, deg: 60, spur: 4 });
  assert.equal(one.length, 1);
  assert.equal(one[0].points.at(-1).x, 20);
  assert.equal(one[0].points.at(-1).y, 0);
});

test('a straight line and a gentle curve are not cut', () => {
  const straight = line([[0, 0], [10, 0], [30, 0]]);
  assert.equal(splitAtCorners(straight, { span: 3 })[0], straight);
  const arc = line(Array.from({ length: 40 }, (_, k) => [30 * Math.cos(k / 39 * Math.PI), 30 * Math.sin(k / 39 * Math.PI)]));
  assert.equal(splitAtCorners(arc, { span: 3 }).length, 1);
});

test('the hand drops a hook and keeps a cornered line as one stroke', () => {
  const L = [line([[0, 0, 2, 1], [20, 0, 2, 1], [20, 20, 2, 1]], { role: 'pen stroke' })], corner = { span: 3, deg: 60, spur: 4 };
  const r = handDrawing(L, { gap: 0, corner });
  assert.equal(r.strokes.length, 1);
  assert.deepEqual([r.strokes[0].points.at(-1).x, r.strokes[0].points.at(-1).y], [20, 20]);
  const hooked = handDrawing([line([[0, 0, 2, 1], [20, 0, 2, 1], [20, 2.5, 2, 1]], { role: 'pen stroke' })], { gap: 0, corner });
  assert.equal(hooked.strokes.length, 1);
  assert.deepEqual([hooked.strokes[0].points.at(-1).x, hooked.strokes[0].points.at(-1).y], [20, 0]);
  assert.deepEqual(trimHooks(L[0], corner).points.map(q => [q.x, q.y]), [[0, 0], [20, 0], [20, 20]]);
});
