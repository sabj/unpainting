import test from 'node:test';
import assert from 'node:assert/strict';
import { gaussianField } from './gaussian-field.mjs';

// The unoptimized convolution: exercise clamping independently of the production
// interior and shared-row paths, including kernels wider than the entire field.
function reference(a, w, h, sigma) {
  if (!(sigma > 0)) return Float32Array.from(a);
  const r = Math.max(1, Math.ceil(3 * sigma)), k = new Float64Array(2 * r + 1);
  let t = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); t += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= t;
  const tmp = new Float64Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let i = -r; i <= r; i++) v += k[i + r] * a[y * w + Math.min(w - 1, Math.max(0, x + i))];
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let i = -r; i <= r; i++) v += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
    out[y * w + x] = v;
  }
  return out;
}

test('Gaussian convolution preserves reference float bits at borders and in the interior', () => {
  for (const [w, h] of [[1, 1], [1, 17], [19, 1], [2, 3], [7, 5], [32, 29], [85, 46]]) {
    const field = Float32Array.from({ length: w * h }, (_, i) => Math.sin(i * 1.739) * 200 + (i % 5) * 0.001);
    field[0] = -1250; field[field.length - 1] = 2400;
    const before = field.slice();
    for (const sigma of [-1, 0, 0.2, 0.75, 1, 2.5, 8, 10]) {
      const actual = gaussianField(field, w, h, sigma), expected = reference(field, w, h, sigma);
      assert.deepEqual(new Uint32Array(actual.buffer), new Uint32Array(expected.buffer), `${w} x ${h}, sigma ${sigma}`);
    }
    assert.deepEqual(field, before, 'the sampled relief is not modified');
  }
});
