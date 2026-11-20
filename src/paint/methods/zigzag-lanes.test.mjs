import test from 'node:test';
import assert from 'node:assert/strict';
import { lanesOfPath } from './zigzag-lanes.mjs';

const line = (x0, x1, y, n = 10) => Array.from({ length: n + 1 }, (_, k) => ({ x: x0 + (x1 - x0) * k / n, y, r: 5 }));

test('a zigzag is cut into its lanes where it turns back; the turn stays with the lane it ends', () => {
  const pts = [...line(0, 100, 0), ...line(100, 0, 12).map(q => ({ ...q })), ...line(0, 100, 24)];
  const lanes = lanesOfPath(pts);
  assert.equal(lanes.length, 3);
  assert.equal(lanes[0].at(-1).y, 12, 'the turn down the outline belongs to the first lane');
  assert.ok(lanes[1].slice(0, -1).every(q => q.y === 12) && lanes[2].every(q => q.y === 24));
  assert.equal(lanes.reduce((a, l) => a + l.length, 0), pts.length + 2, 'each cut shares one point');
});

test('a straight pull, a ring round a shape and a short jab are not cut', () => {
  assert.equal(lanesOfPath(line(0, 100, 0)).length, 1);
  const ring = Array.from({ length: 25 }, (_, k) => ({ x: 50 * Math.cos(k / 24 * 2 * Math.PI * 0.6), y: 50 * Math.sin(k / 24 * 2 * Math.PI * 0.6), r: 5 }));
  assert.equal(lanesOfPath(ring).length, 1);
  assert.equal(lanesOfPath([{ x: 0, y: 0, r: 5 }, { x: 4, y: 0, r: 5 }, { x: 0, y: 0, r: 5 }]).length, 1, 'a back and forth shorter than the brush is one touch');
});
