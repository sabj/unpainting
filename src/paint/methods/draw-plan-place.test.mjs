import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPlanned, samplePath, runsOf, WEIGHT_SHARE } from './draw-plan-place.mjs';

const line = (x0, y0, x1, y1, n = 20, extra = {}) => ({ points: Array.from({ length: n + 1 }, (_, k) => [x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]), width: 0.5, ...extra });
const plan = (lines, reachMm = 4) => ({ reachMm, lines: lines.map((g, i) => ({ id: `l${i}`, what: `line ${i}`, role: 'contour', stage: 'opening', weight: 'medium', ...g })) });

test('a planned line claims the model line along it and leaves the rest out', () => {
  const cands = [line(10, 52, 110, 52), line(10, 80, 110, 80), line(60, 0, 60, 100)];
  const r = selectPlanned(plan([{ path: [[10, 50], [110, 50]], stage: 'closing', weight: 'heavy' }]), cands);
  assert.equal(r.record[0].drawn, true);
  assert.equal(r.lines.opening.length, 0);
  assert.equal(r.lines.closing.length, 1);
  const L = r.lines.closing[0];
  assert.ok(L.points.every(([, y]) => y === 52), 'keeps the model line\'s own geometry');
  assert.equal(L.weight, WEIGHT_SHARE.heavy);
  assert.equal(L.planId, 'l0');
  assert.ok(Math.abs(r.claimedMm - 100) < 1, `${r.claimedMm}`);
  assert.ok(r.pool.mm > 290);
});

test('a model line crossing the planned path is not claimed, and a path with no line under it is not found', () => {
  const r = selectPlanned(plan([{ path: [[10, 50], [110, 50]] }]), [line(60, 0, 60, 100)]);
  assert.equal(r.record[0].drawn, false);
  assert.equal(r.claimedMm, 0);
});

test('only the claimed stretch of a long model line is drawn', () => {
  const r = selectPlanned(plan([{ path: [[40, 50], [80, 50]] }]), [line(0, 51, 200, 51, 100)]);
  const L = r.lines.opening[0];
  assert.ok(L.length > 38 && L.length < 50, `${L.length}`);
});

test('two sides of one thick mark: one stroke per edge', () => {
  const r = selectPlanned(plan([{ path: [[10, 50], [110, 50]] }]), [line(10, 51, 110, 51), line(10, 53, 110, 53)]);
  assert.equal(r.lines.opening.length, 1);
  assert.ok(r.lines.opening[0].points.every(([, y]) => y === 51));
});

test('specks under a planned line are not strokes', () => {
  const specks = Array.from({ length: 10 }, (_, k) => line(10 + 10 * k, 51, 13 + 10 * k, 51, 3));
  assert.equal(selectPlanned(plan([{ path: [[10, 50], [110, 50]] }]), specks).record[0].drawn, false);
  // but a short planned feature (a nostril) is drawn from a short model line
  assert.equal(selectPlanned(plan([{ path: [[10, 50], [16, 50]], role: 'accent' }]), [line(10, 51, 16, 51, 3)]).record[0].drawn, true);
});

test('samplePath and runsOf', () => {
  assert.equal(samplePath([[0, 0], [10, 0]], 1).length, 11);
  assert.deepEqual(runsOf([1, 1, 0, 1, 0, 0, 0, 1].map(Boolean), 1), [[0, 3], [7, 7]]);
});

test('the pieces of one named contour are drawn as one stroke; a gap longer than the tracer\'s reach lifts the pen', () => {
  // a model skeleton broken every 2.5 mm by 1 mm gaps: one gesture
  const pieces = Array.from({ length: 30 }, (_, k) => line(10 + 3.5 * k, 51, 12.5 + 3.5 * k, 51, 5));
  const r = selectPlanned(plan([{ path: [[10, 50], [115, 50]] }]), pieces);
  assert.equal(r.record[0].drawn, true);
  assert.equal(r.lines.opening.length, 1, 'one stroke');
  assert.ok(r.lines.opening[0].length > 95, `${r.lines.opening[0].length}`);
  assert.ok(r.lines.opening[0].points.every(([, y]) => y === 51), 'the model\'s geometry');
  // two halves 10 mm apart: lost and found, two strokes
  const two = selectPlanned(plan([{ path: [[10, 50], [110, 50]] }]), [line(10, 51, 55, 51), line(65, 51, 110, 51)]);
  assert.equal(two.lines.opening.length, 2);
});

test('pieces are put in order along the planned line whatever their order and direction in the pool', () => {
  const r = selectPlanned(plan([{ path: [[10, 50], [110, 50]] }]), [line(62, 51, 110, 51), line(60, 51, 10, 51)]);
  assert.equal(r.lines.opening.length, 1);
  const xs = r.lines.opening[0].points.map(([x]) => x);
  assert.ok(xs.every((x, k) => k === 0 || x >= xs[k - 1]) || xs.every((x, k) => k === 0 || x <= xs[k - 1]), 'runs one way');
});

test('the sheet edge is never claimed', () => {
  const sheet = { widthMm: 200, heightMm: 100 };
  const p = { ...plan([{ path: [[20, 5], [180, 5]] }]), sheet };
  const r = selectPlanned(p, [line(10, 1, 190, 1, 60)]);
  assert.equal(r.record[0].drawn, false);
  assert.ok(r.edgeMm > 150);
  // a line meeting the edge across it is not along it
  assert.equal(selectPlanned({ ...plan([{ path: [[50, 0.5], [50, 60]] }]), sheet }, [line(51, 0, 51, 60, 30)]).record[0].drawn, true);
});

test('pieces offset across the line do not join: the stroke never zig-zags between them', () => {
  const zig = Array.from({ length: 8 }, (_, k) => line(10 + 12 * k, k % 2 ? 52.5 : 50.5, 21 + 12 * k, k % 2 ? 52.5 : 50.5, 10));
  const r = selectPlanned(plan([{ path: [[10, 51.5], [105, 51.5]] }], 2.5), zig);
  assert.ok(r.lines.opening.every(L => L.points.every(([, y]) => y === L.points[0][1])), 'each stroke stays on its own piece');
});
