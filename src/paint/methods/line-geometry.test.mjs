import test from 'node:test';
import assert from 'node:assert/strict';
import { geometrise, joinCollinear, fitPrimitives, curvatureEnergy } from './line-geometry.mjs';

const W = 300, H = 200, PX = 0.15;
const line = pts => ({ points: pts.map(([x, y]) => ({ x, y })) });
// paper 90; pen lines (L 40, 2 px) along row 40 and along a half circle of radius 50 about (150, 140); nothing elsewhere
function plane() {
  const L = new Float32Array(W * H).fill(90);
  const dot = (x, y) => { for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const xi = Math.round(x) + dx - 1, yi = Math.round(y) + dy - 1; if (xi >= 0 && yi >= 0 && xi < W && yi < H) L[yi * W + xi] = 40; } };
  for (let x = 10; x < 290; x += 0.5) dot(x, 40);
  for (let a = Math.PI; a < 2 * Math.PI; a += 0.004) dot(150 + 50 * Math.cos(a), 140 + 50 * Math.sin(a));
  return L;
}
const ctx = () => ({ L: plane(), w: W, h: H, pxMm: PX, isFeature: () => false });

test('a pixel-stepped straight pen line becomes a straight run, and its energy falls', () => {
  const stepped = line(Array.from({ length: 140 }, (_, k) => [10 + 2 * k, 40 + (k % 7 < 3 ? 0 : 0.6)]));
  const r = geometrise([stepped], ctx());
  assert.equal(r.stats.geometry, 1);
  assert.ok(r.stats.energyAfter < r.stats.energyBefore, `${r.stats.energyBefore} -> ${r.stats.energyAfter}`);
});

test('a trace along an arc of the source is replaced by the arc', () => {
  const pts = Array.from({ length: 120 }, (_, k) => { const a = Math.PI + (Math.PI * k) / 119; return [150 + 50 * Math.cos(a) + (k % 2 ? 0.3 : -0.3), 140 + 50 * Math.sin(a)]; });
  const prims = fitPrimitives(pts.map(([x, y]) => ({ x, y })), 1, undefined, PX);
  assert.equal(prims.length, 1);
  assert.equal(prims[0].kind, 'arc');
  assert.equal(geometrise([line(pts)], ctx()).stats.geometry, 1);
});

test('a squiggle that is not a form is dropped, not joined; a smooth trace off the source is a form, not geometry', () => {
  const squig = line(Array.from({ length: 40 }, (_, k) => [100 + 1.5 * k, 100 + (k % 2 ? 4 : -4)]));
  const r = geometrise([squig], ctx());
  assert.equal(r.lines.length, 0);
  assert.equal(r.stats.droppedSquiggle, 1);
  const off = line(Array.from({ length: 80 }, (_, k) => [20 + 3 * k, 120]));
  const o = geometrise([off], ctx());
  assert.equal(o.stats.geometry, 0, 'a straight run the source does not show is not rewritten as geometry');
  assert.equal(o.stats.kept, 1, 'it is long and smooth, so it stays as a form contour');
});

test('a squiggle inside a face or hand is kept as the feature it is', () => {
  const squig = line(Array.from({ length: 40 }, (_, k) => [100 + 1.5 * k, 100 + (k % 2 ? 4 : -4)]));
  assert.equal(geometrise([squig], { ...ctx(), isFeature: () => true }).lines.length, 1);
});

test('only collinear pieces across a short gap join', () => {
  const a = line([[10, 40], [60, 40]]), b = line([[64, 40], [120, 40]]), c = line([[64, 60], [120, 60]]), d = line([[64, 40], [64, 90]]);
  assert.equal(joinCollinear([a, b], { pxMm: PX }).length, 1);
  assert.equal(joinCollinear([a, c], { pxMm: PX }).length, 2, 'not on the same line');
  assert.equal(joinCollinear([a, d], { pxMm: PX }).length, 2, 'a corner is not a continuation');
  assert.equal(joinCollinear([a, line([[100, 40], [160, 40]])], { pxMm: PX }).length, 2, 'a long gap');
});

test('curvature energy is zero for a straight line and grows with the wiggle', () => {
  const s = Array.from({ length: 100 }, (_, k) => ({ x: k * 2, y: 0 })), w = s.map((p, k) => ({ x: p.x, y: k % 4 < 2 ? 0 : 3 }));
  assert.equal(curvatureEnergy(s, PX), 0);
  assert.ok(curvatureEnergy(w, PX) > 0.01);
});

test('at a junction the pair that turns least continues, and a squiggle is never chained', () => {
  const a = line([[10, 40], [60, 40]]), b = line([[60, 40], [120, 40]]), c = line([[60, 40], [60, 90]]);
  const r = joinCollinear([a, b, c], { pxMm: PX });
  assert.equal(r.length, 2, 'a and b run on; c stays a branch');
  assert.ok(r.some(g => g.points.length >= 4 && Math.abs(g.points.at(-1).x - g.points[0].x) > 100));
  const squig = line(Array.from({ length: 30 }, (_, k) => [120 + 1.5 * k, 40 + (k % 2 ? 4 : -4)]));
  assert.equal(joinCollinear([line([[60, 40], [120, 40]]), squig], { pxMm: PX }).length, 2);
});
