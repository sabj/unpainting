import test from 'node:test';
import assert from 'node:assert/strict';
import { organicOutline, edgeWanderMm, EDGE_HAND } from './wash-edge.mjs';
import { areaOf } from './script-marks.mjs';

const square = [[10, 10], [60, 10], [60, 60], [10, 60]];

test('the outline is seeded, rounded and wanders within its bound', () => {
  const a = organicOutline(square, { seed: 3 }), b = organicOutline(square, { seed: 3 }), c = organicOutline(square, { seed: 4 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.length > 40);
  const amp = edgeWanderMm(square);
  assert.ok(amp >= EDGE_HAND.least && amp <= EDGE_HAND.most);
  // no point at the sharp corner: it is rounded off
  assert.ok(Math.min(...a.map(([x, y]) => Math.hypot(x - 10, y - 10))) > 1);
  // area kept near the guide's
  assert.ok(Math.abs(areaOf([a]) - areaOf([square])) / areaOf([square]) < 0.12);
  // every point within the wander (plus the corner rounding) of the square's edge
  for (const [x, y] of a) { const d = Math.min(Math.abs(x - 10), Math.abs(x - 60), Math.abs(y - 10), Math.abs(y - 60)); assert.ok(d <= amp + 0.1 || (x > 10 && x < 60 && y > 10 && y < 60)); }
});

test('a wetter wash wanders more than a drier one', () => {
  assert.ok(edgeWanderMm(square, 'wet') > edgeWanderMm(square, 'dry'));
});
