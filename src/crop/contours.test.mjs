// Source edges become long chains along the edges of forms; texture does not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeChains } from './contours.mjs';

const W = 120, H = 120, N = W * H;
const blur = (F, w, h, s) => {
  const r = Math.max(1, Math.round(s * 1.5)), o = new Float32Array(F.length), t = new Float32Array(F.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < w) { a += F[y * w + xx]; k++; } } t[y * w + x] = a / k; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < h) { a += t[yy * w + x]; k++; } } o[y * w + x] = a / k; }
  return o;
};
// a pale sheet with a dark rectangle (a building) and a column beside it
const scene = () => Float32Array.from({ length: N }, (_, i) => { const x = i % W, y = (i / W) | 0; return (x >= 20 && x < 70 && y >= 30 && y < 100) || (x >= 85 && x < 92 && y >= 20 && y < 110) ? 1 : 0.1; });

test('the edges of a rectangle and a column come back as long chains on those edges', () => {
  const chains = edgeChains(scene(), W, H, blur, { sigma: 1.2, minLength: 15 });
  const total = chains.reduce((a, c) => a + c.points.length, 0);
  assert.ok(chains.length >= 2 && chains.length <= 12, `${chains.length} chains`);
  assert.ok(total > 150, `${total} points`);
  const onEdge = p => {
    const x = p.x, y = p.y;
    const rect = (Math.abs(x - 20) < 3 || Math.abs(x - 69) < 3) && y > 27 && y < 103 || (Math.abs(y - 30) < 3 || Math.abs(y - 99) < 3) && x > 17 && x < 73;
    const col = (Math.abs(x - 85) < 3 || Math.abs(x - 91) < 3) && y > 17 && y < 113 || (Math.abs(y - 20) < 3 || Math.abs(y - 109) < 3) && x > 82 && x < 95;
    return rect || col;
  };
  let on = 0; for (const c of chains) for (const p of c.points) if (onEdge(p)) on++;
  assert.ok(on / total > 0.9, `${on} of ${total} on the edges`);
});

test('fine noise gives no long chains', () => {
  let s = 5; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const noise = Float32Array.from({ length: N }, () => 0.3 + 0.2 * rnd());
  const chains = edgeChains(noise, W, H, blur, { sigma: 1.2, minLength: 15 });
  assert.ok(chains.length <= 2, `${chains.length} chains from noise`);
});

test('a margin keeps the sheet border out', () => {
  const F = scene(); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (x < 4 || y < 4 || x >= W - 4 || y >= H - 4) F[i] = 1; }
  const chains = edgeChains(F, W, H, blur, { sigma: 1.2, minLength: 15, margin: 0.06 });
  for (const c of chains) for (const p of c.points) assert.ok(p.x >= 7 && p.y >= 7 && p.x < W - 7 && p.y < H - 7, `point at ${p.x},${p.y}`);
});
