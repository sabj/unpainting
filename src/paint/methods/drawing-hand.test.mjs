import test from 'node:test';
import assert from 'node:assert/strict';
import { handDrawing } from './drawing-hand.mjs';

const line = (x0, y0, x1, y1, tier) => ({ points: Array.from({ length: 11 }, (_, k) => ({ x: x0 + (x1 - x0) * k / 10, y: y0 + (y1 - y0) * k / 10, width: 2, weight: 1 })), tier, role: 'map contour' });

test('tier 1 contours are drawn before tier 2 detail, and continuing lines are chained into one gesture', () => {
  const lines = [line(50, 5, 60, 5, 2), line(0, 0, 10, 0, 1), line(10.5, 0, 20, 0, 1)];
  const r = handDrawing(lines, { gap: 2, cos: 0.8, aim: 0.7, w: 100, h: 100, strokeLength: 1000 });
  assert.equal(r.joined, 1);
  assert.equal(r.strokes.length, 2);
  assert.ok(r.strokes[0].points.at(-1).x <= 21 && r.strokes[0].points[0].x <= 1 || r.strokes[0].points[0].x >= 19, 'the chained contour first');
  assert.ok(r.strokes[1].points[0].x >= 49, 'the detail after');
});

test('a gesture shorter than the stroke length is one stroke, so it is dipped once', () => {
  const r = handDrawing([line(0, 0, 40, 0, 1)], { gap: 0, w: 100, h: 100, strokeLength: 60 });
  assert.equal(r.strokes.length, 1);
});

test('a flick is set down and lifted in one motion and drawn finer, and a detail stroke is narrower than a structural one', () => {
  const mk = (n, tier) => ({ tier, points: Array.from({ length: n }, (_, k) => ({ x: k, y: 0, width: 2, weight: 1 })) });
  const flick = handDrawing([mk(4, 1)], { gap: 0, w: 100, h: 100, strokeLength: 1000, flickCells: 10, inLen: 3, start: 0.2 }).strokes[0];
  const long = handDrawing([mk(40, 1)], { gap: 0, w: 100, h: 100, strokeLength: 1000, flickCells: 10, inLen: 3, start: 0.2 }).strokes[0];
  assert.ok(flick.points[0].nw / flick.points[1].nw > 0.95, 'no landing taper on a flick');
  assert.ok(long.points[0].nw / long.points[20].nw < 0.7, 'a long stroke lands light');
  assert.ok(flick.points[1].nw < long.points[20].nw, 'and finer than a full stroke');
  const detail = handDrawing([mk(40, 2)], { gap: 0, w: 100, h: 100, strokeLength: 1000, detailScale: 0.75, detailWidth: 0.75 }).strokes[0];
  assert.ok(detail.points[20].nw < long.points[20].nw);
});
