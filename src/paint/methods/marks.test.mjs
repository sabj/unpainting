import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from './marks.mjs';

const maxP = st => Math.max(...st.points.map(q => q[2]));
test('every mark of the vocabulary is a plan stroke in millimetres with pressure, speed and its name', () => {
  const marks = [M.sweep([0, 0], [20, 0], 6), M.taper([[0, 0], [10, 2], [20, 0]], 3), M.leaf(5, 5, 0.3, 6, 2), M.comma(5, 5, 0, 8, 2), M.line([[0, 0], [20, 5]], 0.5),
    M.edge([[0, 0], [20, 5]], 0.4), M.wedge(5, 5, 0, 3, 6), M.push([[0, 0], [10, 0]], 3), M.twist([[0, 0], [20, 0]], 5), M.drag([[0, 0], [20, 0]], 4), M.dot(5, 5, 1.5), M.contour([[0, 0], [10, 3], [20, 0]], 2), ...M.scumble(10, 10, 12, 2)];
  for (const st of marks) {
    assert.ok(M.MARKS[st.mark], st.mark); assert.equal(st.kind, 'sweep'); assert.ok(st.radiusMm > 0);
    for (const q of st.points) { assert.equal(q.length, 5); assert.ok(q.every(Number.isFinite)); assert.ok(q[2] > 0 && q[3] > 0); }
  }
  assert.equal(new Set(marks.map(m => m.mark)).size, Object.keys(M.MARKS).length);
});
test('a taper lands on its point, swells and lifts; a leaf presses in the middle; a flat on edge is held along its path', () => {
  const t = M.taper([[0, 0], [30, 0]], 3), p = t.points.map(q => q[2]);
  assert.ok(p[0] < 0.2 && p[p.length - 1] < 0.2 && maxP(t) > 0.95);
  const l = M.leaf(0, 0, 0, 8, 3), lp = l.points.map(q => q[2]), mid = lp[lp.length >> 1];
  assert.ok(mid > 0.9 && lp[0] < 0.2);
  const e = M.edge([[0, 0], [20, 0]], 0.4); assert.equal(e.flat, true); assert.equal(e.angle, 0);
  const w = M.wedge(0, 0, 0, 3, 6); assert.equal(w.angle, 90); assert.ok(w.points[0][4] > w.points[w.points.length - 1][4]);
});
test('markFor: a speck is a dot, a long streak one taper along it, a compact small shape one pressed touch, foliage several leaves', () => {
  const gw = 100, cellMm = 0.5, cells = (x0, y0, x1, y1) => { const out = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push(y * gw + x); return out; };
  assert.equal(M.markFor(M.shapeGeometry(cells(10, 10, 12, 12), gw, cellMm)).name, 'dot');
  const streak = M.markFor(M.shapeGeometry(cells(10, 10, 50, 14), gw, cellMm), { what: 'shadow' });
  assert.equal(streak.name, 'taper'); assert.equal(streak.strokes.length, 1);
  const g = M.shapeGeometry(cells(10, 10, 50, 14), gw, cellMm); assert.ok(Math.abs(g.angle) < 0.05 && Math.abs(g.length - 20) < 1);
  assert.equal(M.markFor(M.shapeGeometry(cells(10, 10, 18, 16), gw, cellMm), { seed: 1 }).strokes.length, 1);
  const f = M.markFor(M.shapeGeometry(cells(10, 10, 40, 30), gw, cellMm), { what: 'foliage' });
  assert.equal(f.name, 'leaf'); assert.ok(f.strokes.length > 5);
});
