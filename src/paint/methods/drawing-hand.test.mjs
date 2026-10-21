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
