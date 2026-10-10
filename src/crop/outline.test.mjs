// The outline of a shape goes round it in a few long chains, not in fragments.
import test from 'node:test';
import assert from 'node:assert/strict';
import { silhouette, traceOutlines } from './outline.mjs';

const W = 120, H = 120, N = W * H;
const blur = (F, w, h, s) => {
  const r = Math.max(1, Math.round(s)), o = new Float32Array(F.length), t = new Float32Array(F.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < w) { a += F[y * w + xx]; k++; } } t[y * w + x] = a / k; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < h) { a += t[yy * w + x]; k++; } } o[y * w + x] = a / k; }
  return o;
};
const disk = Float32Array.from({ length: N }, (_, i) => (Math.hypot((i % W) - 60, ((i / W) | 0) - 60) < 30 ? 1 : 0.05));

test('the silhouette of a dark disk is the disk', () => {
  const m = silhouette(disk, W, H, blur, { scale: 2 });
  let inside = 0, outside = 0;
  for (let i = 0; i < N; i++) { const r = Math.hypot((i % W) - 60, ((i / W) | 0) - 60); if (r < 26 && m[i]) inside++; if (r > 34 && m[i]) outside++; }
  assert.ok(inside > 0.95 * Math.PI * 26 * 26, `inside ${inside}`);
  assert.equal(outside, 0);
});

test('its outline is traced in long chains that go most of the way round', () => {
  const chains = traceOutlines(silhouette(disk, W, H, blur, { scale: 2 }), W, H, { minLength: 10 });
  const total = chains.reduce((a, c) => a + c.points.length, 0), longest = Math.max(...chains.map(c => c.points.length));
  assert.ok(chains.length <= 3, `${chains.length} chains`);
  assert.ok(total > 0.8 * 2 * Math.PI * 30 / 2, `total ${total} points`); // points every two cells
  assert.ok(longest > 0.6 * total, `longest ${longest} of ${total}`);
  for (const c of chains) for (const p of c.points) assert.ok(Math.abs(Math.hypot(p.x - 60, p.y - 60) - 30) < 3, `point off the edge at ${p.x},${p.y}`);
});

test('specks smaller than the minimum area are not outlined', () => {
  const F = Float32Array.from(disk); for (let y = 10; y < 13; y++) for (let x = 10; x < 13; x++) F[y * W + x] = 1;
  const chains = traceOutlines(silhouette(F, W, H, blur, { scale: 1, minArea: 0.01 }), W, H, { minLength: 4 });
  assert.ok(chains.every(c => c.points.every(p => Math.hypot(p.x - 11, p.y - 11) > 6)));
});
