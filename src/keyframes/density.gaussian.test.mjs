// gaussian() walks the image differently from the plain clamped loops but must give the same floats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gaussian } from './density.mjs';

function plain(src, w, h, sigma) {
  const r = Math.ceil(sigma * 3), k = new Float32Array(2 * r + 1);
  let s = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) { const xx = Math.min(w - 1, Math.max(0, x + i)); a += src[y * w + xx] * k[i + r]; } tmp[y * w + x] = a; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) { const yy = Math.min(h - 1, Math.max(0, y + i)); a += tmp[yy * w + x] * k[i + r]; } out[y * w + x] = a; }
  return out;
}

test('gaussian equals the plain clamped blur bit for bit', () => {
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const [w, h, sigma] of [[37, 29, 1.5], [64, 50, 6], [20, 18, 20], [5, 4, 1], [90, 70, 0.7]]) {
    const src = Float32Array.from({ length: w * h }, () => rnd() * 3);
    const a = gaussian(src, w, h, sigma), b = plain(src, w, h, sigma);
    for (let i = 0; i < a.length; i++) assert.ok(Object.is(a[i], b[i]), `cell ${i} at ${w}x${h} sigma ${sigma}`);
  }
});
