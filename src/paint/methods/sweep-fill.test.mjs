import test from 'node:test';
import assert from 'node:assert/strict';
import { sweepFill, sweepAngle } from './sweep-fill.mjs';

const KIT = [38, 25.4, 7, 5];

test('a rectangle is laid back and forth in one run of loads, top down, its lanes level and overlapping, nothing left bare', () => {
  const r = sweepFill([{ points: [[0, 0], [200, 0], [200, 120], [0, 120]] }], { kitMm: KIT });
  assert.equal(r.brushMm, 38);
  assert.ok(r.uncovered < 0.01);
  // one zigzag, recharged every two lanes: each load starts where the last ended
  for (let q = 1; q < r.strokes.length; q++) assert.deepEqual(r.strokes[q].points[0], r.strokes[q - 1].points.at(-1));
  const ys = r.strokes.flatMap(s => s.points.map(p => p[1]));
  for (let q = 1; q < ys.length; q++) assert.ok(ys[q] >= ys[q - 1] - 1e-6, 'never goes back up');
  const levels = [...new Set(ys.map(y => y.toFixed(2)))].map(Number);
  for (let q = 1; q < levels.length; q++) assert.ok(levels[q] - levels[q - 1] < 38, 'lanes overlap');
});

test('no stroke of a fill is a ring: sweeps run one way, an edge stroke runs along the outline once', () => {
  const r = sweepFill([{ points: [[10, 0], [50, 5], [60, 40], [30, 55], [0, 35]] }], { kitMm: KIT });
  assert.ok(r.uncovered < 0.05);
  const edges = r.strokes.filter(s => s.radiusMm < r.brushMm / 2);
  assert.ok(r.strokes.filter(s => s.radiusMm < r.brushMm / 2).length <= 4, `${r.strokes.length} strokes`);
  for (const e of edges) { const a = e.points[0], b = e.points[e.points.length - 1]; assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > 5, 'an edge stroke is not a closed ring'); }
});

test('a long slanting shape is swept along its length; a round one level', () => {
  const post = [[0, 0], [8, 0], [40, 70], [32, 70]];
  const d = (((sweepAngle(post) - Math.atan2(70, 32)) % Math.PI) + Math.PI) % Math.PI;
  assert.ok(Math.min(d, Math.PI - d) < 0.2);
  assert.equal(sweepAngle([[0, 0], [50, 0], [50, 40], [0, 40]]), 0);
});

test('every stroke stays inside the outline by the brush\'s own radius, so the brush edge meets it', () => {
  const r = sweepFill([{ points: [[0, 0], [100, 0], [100, 75], [0, 75]] }], { kitMm: KIT });
  for (const s of r.strokes) for (const [x, y] of s.points) assert.ok(y >= s.radiusMm - 0.6 && y <= 75 - s.radiusMm + 0.6 && x >= -0.6 && x <= 100.6);
});
