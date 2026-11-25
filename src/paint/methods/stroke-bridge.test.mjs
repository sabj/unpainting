import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeGaps } from './stroke-bridge.mjs';

const seg = (x0, y0, x1, y1, n = 10) => Array.from({ length: n + 1 }, (_, k) => [x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);

test('a line drawn as dashes along one course is one stroke, pulled through the gaps', () => {
  const r = bridgeGaps([seg(0, 0, 8, 0), seg(11, 0.1, 20, 0.1), seg(30, 0, 23, 0.05)]);
  assert.equal(r.strokes.length, 1);
  assert.deepEqual([...r.strokes[0].parts].sort(), [0, 1, 2]);
  assert.equal(r.bridges, 2);
  const xs = r.strokes[0].points.map(p => p[0]), up = xs.every((x, k) => !k || x >= xs[k - 1]), down = xs.every((x, k) => !k || x <= xs[k - 1]);
  assert.ok(up || down, 'one way along the line');
});

test('not bridged: a corner, a parallel offset, a wide gap between crumbs, a dense stream, a light piece against a dark one', () => {
  assert.equal(bridgeGaps([seg(0, 0, 10, 0), seg(12, 0, 12, 10)]).strokes.length, 2, 'a corner');
  assert.equal(bridgeGaps([seg(0, 0, 10, 0), seg(12, 2, 22, 2)]).strokes.length, 2, 'beside, not on, the line');
  assert.equal(bridgeGaps([seg(0, 0, 2, 0), seg(9, 0, 11, 0)]).strokes.length, 2, 'two crumbs far apart');
  assert.equal(bridgeGaps([seg(0, 0, 10, 0), seg(12, 0, 22, 0)], { skip: [false, true] }).strokes.length, 2, 'dense');
  assert.equal(bridgeGaps([seg(0, 0, 10, 0), seg(12, 0, 22, 0)], { weights: [1, 0.2] }).strokes.length, 2, 'weight');
});

test('pieces that overlap end to end are joined without a step back', () => {
  const r = bridgeGaps([seg(0, 0, 10, 0), seg(9, 0.2, 20, 0.2)]);
  assert.equal(r.strokes.length, 1);
  const xs = r.strokes[0].points.map(p => p[0]);
  assert.ok(xs.every((x, k) => !k || x >= xs[k - 1]));
});
