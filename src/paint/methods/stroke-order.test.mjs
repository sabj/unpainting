import test from 'node:test';
import assert from 'node:assert/strict';
import { orderStrokes, strokeLevels, pullDirection, turningPerMm, handTravel } from './stroke-order.mjs';

const seg = (x0, y0, x1, y1, n = 10) => Array.from({ length: n + 1 }, (_, k) => [x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
const zig = (x, y, n, a = 0.4) => Array.from({ length: n }, (_, k) => [x + k * 0.5, y + (k % 2 ? a : -a)]);

test('turning: a straight line does not turn, a zigzag turns a lot, a big arc a little', () => {
  assert.equal(turningPerMm(seg(0, 0, 50, 0)), 0);
  assert.ok(turningPerMm(zig(0, 0, 20)) > 60);
  const arc = Array.from({ length: 61 }, (_, k) => [50 * Math.cos(Math.PI * k / 60), -50 * Math.sin(Math.PI * k / 60)]);
  assert.ok(Math.abs(turningPerMm(arc) - 180 / (50 * Math.PI)) < 0.2);
});

test('levels: long smooth lines first, attached middling lines second, short or jagged marks last', () => {
  const frame = seg(0, 0, 0, 100), sill = seg(0, 50, 20, 50), loose = seg(60, 60, 70, 60), jag = zig(80, 10, 100), dot = seg(5, 5, 5.8, 5);
  assert.deepEqual(strokeLevels([frame, sill, loose, jag, dot], 280), [1, 2, 3, 3, 3]);
  const ring = Array.from({ length: 41 }, (_, k) => [100 + 5 * Math.cos(2 * Math.PI * k / 40), 100 + 5 * Math.sin(2 * Math.PI * k / 40)]);
  assert.deepEqual(strokeLevels([ring], 280), [2], 'a closed opening is level 2');
});

test('pull direction: downward for steep strokes, left to right otherwise', () => {
  assert.deepEqual(pullDirection(seg(0, 10, 0, 0))[0], [0, 0]);
  assert.equal(pullDirection(seg(0, 10, 1, 0))[0][1], 0);
  assert.equal(pullDirection(seg(10, 0, 0, 1))[0][0], 0);
  assert.equal(pullDirection(seg(0, 0, 10, 1))[0][0], 0);
});

test('order: level by level, nearest next start, every stroke once, each pulled its way', () => {
  const S = [seg(0, 100, 0, 0), seg(250, 0, 250, 100), seg(10, 20, 0, 20), seg(0, 80, 10, 80), seg(240, 90, 250, 90), seg(100, 50, 100.5, 50)];
  const r = orderStrokes(S, 280);
  assert.deepEqual(r.map(x => x.level), [1, 1, 2, 2, 2, 3]);
  // the pen starts at the top left; after the right-hand frame the opening beside it, then back across, the nearer first
  assert.deepEqual(r.map(x => x.index), [0, 1, 4, 3, 2, 5]);
  for (const x of r) { const a = x.points[0], b = x.points.at(-1); assert.ok(Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]) ? b[1] >= a[1] : b[0] >= a[0]); }
  assert.deepEqual(r[0].points[0], [0, 0]);
  assert.ok(Math.abs(handTravel(r)[0] - Math.hypot(250, 100)) < 1e-9);
});
