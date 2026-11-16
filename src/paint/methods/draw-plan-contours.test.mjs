import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeContours, drawContours } from './draw-plan-contours.mjs';

const seg = (x0, y0, x1, y1, n = 10) => ({ points: Array.from({ length: n + 1 }, (_, k) => [x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]), widths: Array(n + 1).fill(0.3) });

test('pieces that continue one another become one numbered contour; short ones and the sheet edge are not proposed', () => {
  const pool = [seg(10, 50, 20, 50), seg(21, 50, 31, 50), seg(32, 50, 45, 50), // one rail in three pieces
    seg(60, 60, 65, 60), // a 5 mm tick
    seg(10, 1, 190, 1, 60), // the scan's edge
    seg(100, 20, 100, 40), seg(101, 41, 120, 41)]; // a corner: not one stroke
  const r = proposeContours(pool, { W: 200, H: 100 });
  assert.equal(r.leftOut.sheetEdge, 1);
  assert.ok(r.leftOut.short >= 1);
  const rail = r.contours.find(c => c.points.every(([, y]) => y === 50));
  assert.ok(rail && rail.length > 33, 'the rail joined');
  assert.equal(r.contours[0].id, 'c1');
  assert.ok(r.contours.every((c, i) => i === 0 || c.length <= r.contours[i - 1].length), 'longest first');
  assert.equal(proposeContours(pool, { W: 200, H: 100 }).sha256, r.sha256, 'the same numbering every run');
});

test('a line draws exactly its named contours, joined end to end into one stroke when they meet', () => {
  const C = [{ id: 'c1', points: [[10, 10], [30, 10]] }, { id: 'c2', points: [[50, 10], [32, 10]] }, { id: 'c3', points: [[80, 80], [90, 90]] }];
  const r = drawContours([{ id: 'rail', contours: ['c1', 'c2'] }, { id: 'apart', contours: ['c1', 'c3'] }, { id: 'p', path: [[0, 0], [1, 1]] }], C);
  const rail = r.strokes.get('rail');
  assert.equal(rail.length, 1);
  assert.deepEqual(rail[0].points.at(-1), [50, 10], 'c2 turned to continue c1');
  assert.equal(r.strokes.get('apart').length, 2, 'a gap longer than the reach lifts the pen');
  assert.equal(r.strokes.has('p'), false);
  assert.deepEqual(drawContours([{ id: 'x', contours: ['c9'] }], C).missing, [{ line: 'x', id: 'c9' }]);
});

test('the source\'s own pen lines: a thin mark darker than both flanks by a value step, not an edge between two tones', async () => {
  const { sourcePenLines } = await import('./draw-plan-contours.mjs');
  const W = 200, H = 100, lum = new Float32Array(W * H).fill(0.9);
  for (let x = 0; x < W; x++) { lum[30 * W + x] = 0.1; lum[31 * W + x] = 0.1; } // a pen line at y 30
  for (let y = 60; y < H; y++) for (let x = 0; x < W; x++) lum[y * W + x] = 0.3; // a dark mass below y 60: its edge is not a line
  lum[0] = 0; // the ink of the scale
  const mm = 0.5, C = [{ id: 'c1', points: [[10 * mm, 30.5 * mm], [190 * mm, 30.5 * mm]] }, { id: 'c2', points: [[10 * mm, 60 * mm], [190 * mm, 60 * mm]] }];
  assert.deepEqual(sourcePenLines(C, lum, W, H, mm), ['c1']);
});
