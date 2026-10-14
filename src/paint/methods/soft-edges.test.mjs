import test from 'node:test';
import assert from 'node:assert/strict';
import { softRing } from './soft-edges.mjs';

// A 10x10 passage in a 30x30 sheet; its left side is a soft boundary, its right side hard.
const W = 30, H = 30, N = W * H;
const mask = new Uint8Array(N);
for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) mask[y * W + x] = 1;
const soft = [], hard = [];
for (let y = 10; y < 20; y++) { soft.push(y * W + 10); hard.push(y * W + 19); }

test('clean water goes past the soft edge only, never inside the passage', () => {
  const ring = softRing(mask, soft, hard, W, H, 3);
  assert.equal(ring[15 * W + 9], 1, 'just outside the soft edge');
  assert.equal(ring[15 * W + 7], 1, 'three cells out');
  assert.equal(ring[15 * W + 6], 0, 'past the radius');
  assert.equal(ring[15 * W + 20], 0, 'the hard edge stays dry');
  for (let i = 0; i < N; i++) if (mask[i]) assert.equal(ring[i], 0);
});

test('reserved lights stay dry and a passage with no soft edge gets no water', () => {
  const protect = new Uint8Array(N); protect[15 * W + 8] = 1;
  assert.equal(softRing(mask, soft, hard, W, H, 3, protect)[15 * W + 8], 0);
  assert.equal(softRing(mask, [], hard, W, H, 3).reduce((a, v) => a + v, 0), 0);
});
