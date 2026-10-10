// An outline round the shape scores well; the same amount of line as squiggles scores near nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { legibility } from './legibility.mjs';

const W = 160, H = 160, N = W * H;
const blur = (F, w, h, s) => {
  const r = Math.max(1, Math.round(s * 2)), o = new Float32Array(F.length), t = new Float32Array(F.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < w) { a += F[y * w + xx]; k++; } } t[y * w + x] = a / k; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < h) { a += t[yy * w + x]; k++; } } o[y * w + x] = a / k; }
  return o;
};
// the source: a dark figure (a tall ellipse) and a dark dog (a smaller one) on pale ground
const inside = (x, y) => ((x - 60) / 22) ** 2 + ((y - 70) / 50) ** 2 < 1 || ((x - 115) / 18) ** 2 + ((y - 125) / 14) ** 2 < 1;
const source = Float32Array.from({ length: N }, (_, i) => (inside(i % W, (i / W) | 0) ? 1.2 : 0.1));
const plot = (m, x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi >= 0 && yi >= 0 && xi < W && yi < H) m[yi * W + xi] = 1; };
const outline = () => {
  const m = new Uint8Array(N);
  for (let a = 0; a < Math.PI * 2; a += 0.01) { plot(m, 60 + 22 * Math.cos(a), 70 + 50 * Math.sin(a)); plot(m, 115 + 18 * Math.cos(a), 125 + 14 * Math.sin(a)); }
  return m;
};
const squiggles = count => {
  let s = 11; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const m = new Uint8Array(N); let drawn = 0;
  while (drawn < count) {
    let x = 30 + rnd() * 100, y = 20 + rnd() * 130, a = rnd() * Math.PI * 2;
    for (let t = 0; t < 25; t++) { a += (rnd() - 0.5) * 1.6; x += Math.cos(a); y += Math.sin(a); plot(m, x, y); drawn++; }
  }
  return m;
};
const cells = m => m.reduce((a, v) => a + v, 0);

test('an outline of the shapes is legible', () => {
  const r = legibility(outline(), source, W, H, blur);
  assert.ok(r.onContour > 0.7, `on contour ${r.onContour}`);
  assert.ok(r.contoursDrawn > 0.6, `contours drawn ${r.contoursDrawn}`);
  assert.ok(r.along > 0.6, `along ${r.along}`);
  assert.ok(r.silhouette > 0.6, `silhouette ${r.silhouette}`);
  assert.ok(Math.abs(r.score - Math.sqrt(r.silhouette * r.formEdges)) < 1e-9);
});

test('the same amount of line as squiggles is not', () => {
  const o = outline(), r = legibility(squiggles(cells(o)), source, W, H, blur);
  assert.ok(r.score < 0.3, `score ${r.score} (silhouette ${r.silhouette}, on ${r.onContour}, drawn ${r.contoursDrawn}, along ${r.along})`);
});

test('an empty drawing scores nothing', () => {
  const r = legibility(new Uint8Array(N), source, W, H, blur);
  assert.equal(r.score, 0);
});
