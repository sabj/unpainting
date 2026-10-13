import test from 'node:test';
import assert from 'node:assert/strict';
import { registerLines, applyRegistration, samplePoints, chamfer } from './register-lines.mjs';
import { nearestEdge } from '../paint/methods/line-evidence.mjs';

// A target with a rectangle's outline and a diagonal, and a drawing of it made on a taller page, scaled and offset.
function scene(w, h) {
  const mask = new Uint8Array(w * h), set = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) mask[y * w + x] = 1; };
  for (let x = 40; x <= 160; x++) { set(x, 30); set(x, 120); }
  for (let y = 30; y <= 120; y++) { set(40, y); set(160, y); }
  for (let t = 0; t <= 100; t++) set(Math.round(60 + t * 0.8), Math.round(40 + t * 0.7));
  return { edge: mask, ...nearestEdge(mask, w, h), w, h };
}
const W = 200, H = 150, edges = scene(W, H);
// the drawing's page is 300 x 300 (another aspect); target point (x, y) sits at ((x - 6) / 0.62, (y + 4) / 0.47)
const to = ([x, y]) => [(x - 6) / 0.62, (y + 4) / 0.47];
const drawing = { image: { w: 300, h: 300 }, lines: [
  { points: [[40, 30], [160, 30], [160, 120], [40, 120], [40, 30]].map(to), widths: [2, 2, 2, 2, 2] },
  { points: [[60, 40], [140, 110]].map(to) },
] };

test('registration finds the scale and shift that put a drawing from another page on the target edges', () => {
  const r = registerLines(drawing.lines, drawing.image, edges);
  assert.ok(r.naive.score > 2 * r.best.score, `naive ${r.naive.score} against registered ${r.best.score}`);
  assert.ok(r.best.near > 0.95, `share near an edge ${r.best.near}`);
  // every corner of the rectangle lands within two cells of where the target has it
  for (const c of [[40, 30], [160, 30], [160, 120], [40, 120]]) {
    const [x, y] = to(c), X = x * r.best.sx + r.best.tx, Y = y * r.best.sy + r.best.ty;
    assert.ok(Math.hypot(X - c[0], Y - c[1]) < 2, `corner ${c} lands at ${X.toFixed(1)}, ${Y.toFixed(1)}`);
  }
});

test('a registered file sits on the target grid and keeps its other fields', () => {
  const r = registerLines(drawing.lines, drawing.image, edges);
  const doc = applyRegistration({ ...drawing, source: 'test' }, r.best, { w: W, h: H }, { score: r.best.score });
  assert.deepEqual(doc.image, { w: W, h: H });
  assert.equal(doc.source, 'test');
  assert.equal(doc.registration.from.w, 300);
  const [x, y] = doc.lines[0].points[1];
  assert.ok(Math.abs(x - 160) < 1.5 && Math.abs(y - 30) < 1.5, `corner at ${x}, ${y}`);
  assert.ok(Math.abs(doc.lines[0].widths[0] - 2 * Math.sqrt(r.best.sx * r.best.sy)) < 1e-3);
  assert.equal(drawing.lines[0].points[1][0], to([160, 30])[0], 'the input is not changed');
});

test('chamfer caps a point off the grid or far from every edge', () => {
  const pts = samplePoints([{ points: [[-50, -50], [-40, -50]] }]);
  assert.equal(chamfer(pts, { sx: 1, sy: 1, tx: 0, ty: 0 }, edges.dist, W, H, 4), 4);
});

test('a line that leaves the target grid is cut at its edge', () => {
  const doc = applyRegistration({ image: { w: 10, h: 10 }, lines: [{ points: [[1, 1], [5, 1], [12, 1], [14, 1]], weights: [1, 0.5, 0.2, 0.1] }, { points: [[20, 20], [30, 30]] }] },
    { sx: 1, sy: 1, tx: 0, ty: 0 }, { w: 10, h: 10 });
  assert.equal(doc.lines.length, 1);
  assert.deepEqual(doc.lines[0].points, [[1, 1], [5, 1]]);
  assert.deepEqual(doc.lines[0].weights, [1, 0.5]);
  assert.equal(doc.registration.cutAtEdge, 1);
});
