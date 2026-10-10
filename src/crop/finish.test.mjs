// The finish field carries the busy subject to the end and lets a quiet background stop early.
import test from 'node:test';
import assert from 'node:assert/strict';
import { finishField, clipToFinish } from './finish.mjs';

const W = 100, H = 100, N = W * H;
const blur = (F, w, h, s) => {
  const r = Math.max(1, Math.round(s)), o = new Float32Array(F.length), t = new Float32Array(F.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < w) { a += F[y * w + xx]; k++; } } t[y * w + x] = a / k; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < h) { a += t[yy * w + x]; k++; } } o[y * w + x] = a / k; }
  return o;
};
// a checkered, busy subject in the middle on a flat, pale ground
const source = Float32Array.from({ length: N }, (_, i) => { const x = i % W, y = (i / W) | 0; return x > 35 && x < 65 && y > 35 && y < 65 ? ((x + y) % 4 < 2 ? 1 : 0.2) : 0.15; });

test('the busy middle is finished and the flat ground is not', () => {
  const F = finishField(source, W, H, blur, { background: 0.2 });
  assert.ok(F[50 * W + 50] > 0.9, `middle ${F[50 * W + 50]}`);
  assert.ok(F[5 * W + 5] < 0.3, `corner ${F[5 * W + 5]}`);
  for (const v of F) assert.ok(v >= 0.2 - 1e-6 && v <= 1 + 1e-6);
});

test('a late passage is clipped to the subject, an early one is not', () => {
  // the subject share is the part of the sheet carried to the end: a sixth here
  const F = finishField(source, W, H, blur, { background: 0.2, subject: 0.15 });
  const all = new Uint8Array(N).fill(1);
  assert.equal(clipToFinish(all, F, 0).area, N);
  const late = clipToFinish(all, F, 0.9);
  assert.ok(late.area < N * 0.3 && late.mask[50 * W + 50] === 1 && late.mask[5 * W + 5] === 0, `late area ${late.area}`);
});
