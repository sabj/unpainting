import test from 'node:test';
import assert from 'node:assert/strict';
import { inkHand } from './drawing-file.mjs';

const line = pts => ({ weight: 1, points: pts.map(([x, y]) => ({ x, y, s: 0.6, nw: 2 })) });

test('a stroke sets down with a pooled drop, presses in and lifts off', () => {
  const g = inkHand(line(Array.from({ length: 41 }, (_, k) => [k, 0])));
  const P = g.points;
  assert.ok(P[0].dwell > 0 && P.slice(1).every(q => !q.dwell));
  assert.ok(P[0].s < P[20].s && P[40].s < P[20].s, 'pressure is lower at both ends');
  assert.ok(P[0].nw < P[20].nw && P[40].nw < P[20].nw, 'and so is the contact width');
  assert.equal(P[20].s, 0.6);
  assert.deepEqual(P.map(q => [q.x, q.y]), line(Array.from({ length: 41 }, (_, k) => [k, 0])).points.map(q => [q.x, q.y]));
});

test('the hand slows on a curve and runs faster along a straight', () => {
  const corner = [...Array.from({ length: 21 }, (_, k) => [k, 0]), ...Array.from({ length: 20 }, (_, k) => [20, k + 1])];
  const g = inkHand(line(corner));
  const atCorner = g.points[20].v, straight = g.points[10].v;
  assert.ok(atCorner < straight, `${atCorner} at the corner, ${straight} on the straight`);
  assert.ok(straight > 1.9 - 1.1 * 0.6, 'a straight run is faster than the plain pen');
});
