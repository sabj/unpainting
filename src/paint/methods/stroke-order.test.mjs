import test from 'node:test';
import assert from 'node:assert/strict';
import { orderStrokes, orderStats, pullDirection, turningPerMm, joinContinuations, findObjects } from './stroke-order.mjs';

const seg = (x0, y0, x1, y1, n = 10) => Array.from({ length: n + 1 }, (_, k) => [x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
const box = (x0, y0, x1, y1) => [seg(x0, y0, x1, y0), seg(x1, y0, x1, y1), seg(x1, y1, x0, y1), seg(x0, y1, x0, y0)];
const zig = (x, y, n, a = 0.4) => Array.from({ length: n }, (_, k) => [x + k * 0.5, y + (k % 2 ? a : -a)]);

test('turning: a straight line does not turn, a zigzag turns a lot, a big arc a little', () => {
  assert.equal(turningPerMm(seg(0, 0, 50, 0)), 0);
  assert.ok(turningPerMm(zig(0, 0, 20)) > 60);
  const arc = Array.from({ length: 61 }, (_, k) => [50 * Math.cos(Math.PI * k / 60), -50 * Math.sin(Math.PI * k / 60)]);
  assert.ok(Math.abs(turningPerMm(arc) - 180 / (50 * Math.PI)) < 0.2);
});

test('pull direction: downward for steep strokes, left to right otherwise', () => {
  assert.deepEqual(pullDirection(seg(0, 10, 0, 0))[0], [0, 0]);
  assert.equal(pullDirection(seg(10, 0, 0, 1))[0][0], 0);
});

test('a line that runs on through a junction is one stroke; a corner is not joined', () => {
  const r = joinContinuations([seg(0, 0, 10, 0), seg(20, 0, 10.3, 0), seg(10, 0, 10, 10)]);
  assert.equal(r.length, 2);
  assert.deepEqual(r.find(s => s.parts.length === 2).parts.sort(), [0, 1]);
});

test('objects: a window face inside a wall face is its child', () => {
  const S = [...box(10, 10, 90, 60), ...box(30, 20, 45, 40)];
  const { objects } = findObjects(S, 100, 70);
  // the sheet itself (closed by its edge), the wall in it, the window in the wall; areas less the lines' thickness
  assert.equal(objects.length, 3);
  const [sheet, wall, win] = [...objects].sort((a, b) => b.area - a.area);
  assert.ok(Math.abs(wall.area - 80 * 50) < 0.1 * 4000 && Math.abs(win.area - 15 * 20) < 0.25 * 300);
  assert.equal(sheet.parent, null); assert.equal(wall.parent, sheet.id); assert.equal(win.parent, wall.id);
});

test('order: the largest form first, its outline before its inside, a container before its contents, texture then small things last', () => {
  // a wall with two windows (one with a bar), a scribble against the wall's edge, a far small mark
  const S = [...box(10, 10, 90, 60), ...box(20, 20, 35, 40), seg(27.5, 20, 27.5, 40), ...box(60, 20, 75, 40), zig(10.5, 50, 12), seg(96, 66, 97, 66.5)];
  const r = orderStrokes(S, 100, 70), st = orderStats(r, 100, 70);
  assert.equal(r.reduce((n, x) => n + x.parts.length, 0), S.length, 'every stroke once');
  const at = i => r.findIndex(x => x.parts.includes(i));
  // the wall's outline (0..3) before both windows' strokes, each window's outline before its bar
  for (const w of [0, 1, 2, 3]) for (const k of [4, 5, 6, 7, 8, 9, 10, 11, 12]) assert.ok(at(w) < at(k));
  for (const k of [4, 5, 6, 7]) assert.ok(at(k) < at(8));
  assert.deepEqual([r.at(-1).parts[0], r.at(-1).role], [14, 'small'], 'the small isolated mark last');
  assert.deepEqual([r.at(-2).parts[0], r.at(-2).role, r.at(-2).pass], [13, 'texture', 2], 'texture in the second pass');
  assert.ok(r.find(x => x.parts.includes(8)).role === 'inner', 'the bar divides the window: one object, the bar inside it');
  assert.equal(st.innerBeforeOutline, 0);
  for (const x of r) { const a = x.points[0], b = x.points.at(-1); assert.ok(Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]) ? b[1] >= a[1] : b[0] >= a[0]); }
});
