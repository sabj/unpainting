import test from 'node:test';
import assert from 'node:assert/strict';
import { foliageMask } from './line-foliage.mjs';
import { decideLines } from './ink-decide.mjs';

const W = 120, H = 80, PX = 0.15;
function planes() {
  const L = new Float32Array(W * H).fill(85), A = new Float32Array(W * H), B = new Float32Array(W * H);
  // green, busy block on the left half of rows 10..60; plain paper elsewhere; a grey, busy block on the right
  for (let y = 10; y < 60; y++) for (let x = 0; x < 50; x++) { L[y * W + x] = 85 - ((x + y) % 4) * 12; A[y * W + x] = -0.06; B[y * W + x] = 0.08; }
  for (let y = 10; y < 60; y++) for (let x = 70; x < 120; x++) L[y * W + x] = 85 - ((x + y) % 4) * 12;
  return { L, A, B };
}

test('green and busy cells are foliage; plain paper and busy grey are not', () => {
  const { L, A, B } = planes(), m = foliageMask(L, A, B, W, H, PX);
  assert.equal(m[35 * W + 25], 1);
  assert.equal(m[35 * W + 95], 0, 'busy but not green');
  assert.equal(m[70 * W + 25], 0, 'paper');
});

test('a short mark in foliage cells is wash, a long smooth stroke through them is a branch', () => {
  const { L, A, B } = planes(), foliage = foliageMask(L, A, B, W, H, PX);
  for (let x = 0; x < W; x++) { L[30 * W + x] = 35; L[31 * W + x] = 35; }
  const cellLabel = () => 'architecture';
  const line = (x0, x1) => ({ points: Array.from({ length: 21 }, (_, k) => ({ x: x0 + (x1 - x0) * k / 20, y: 31 })) });
  const short = decideLines([line(5, 30)], { L, w: W, h: H, pxMm: PX, cellLabel, foliage });
  assert.equal(short.lines.length, 0);
  const long = decideLines([line(0, 119)], { L, w: W, h: H, pxMm: PX, cellLabel, foliage });
  assert.ok(long.stats.keptPx > 100);
});
