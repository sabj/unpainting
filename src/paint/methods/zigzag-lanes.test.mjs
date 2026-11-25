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

test('the cover of a wash laid in long lanes of a wide round is counted along the lanes, not only at their sparse points', async () => {
  const { sweptPath } = await import('./zigzag-lanes.mjs'); const { sweepCover } = await import('../../media/wash.mjs');
  // a 300 x 60 cell band laid in two lanes of a round of radius 20, a third overlapped; each lane two points
  const w = 340, h = 100, mask = new Uint8Array(w * h); for (let y = 20; y < 80; y++) for (let x = 20; x < 320; x++) mask[y * w + x] = 1;
  const lanes = [[{ x: 20, y: 38, r: 20 }, { x: 320, y: 38, r: 20 }], [{ x: 320, y: 62, r: 20 }, { x: 20, y: 62, r: 20 }]];
  const sparse = sweepCover(lanes, mask, w, h), swept = sweepCover(lanes.map(sweptPath), mask, w, h);
  assert.ok(sparse < 0.2, `discs at four points: ${sparse}`);
  // 2 lanes x 40 cells over a 60 cell band: 1.33 sweeps a cell, less the rounded ends
  assert.ok(swept > 1.2 && swept < 1.4, `along the lanes: ${swept}`);
  assert.ok(sweptPath(lanes[0]).every((q, k, a) => !k || Math.hypot(q.x - a[k - 1].x, q.y - a[k - 1].y) <= 10 + 1e-9));
  assert.deepEqual(sweptPath([{ x: 1, y: 1, r: 4 }]), [{ x: 1, y: 1, r: 4 }]);
});
