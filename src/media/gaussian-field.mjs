// Separable Gaussian convolution in the field's own units. Interior taps are already
// in bounds; border rows share their clamped offsets. The kernel, tap order, double
// intermediate and float output match the clamped reference at every pixel.
export function gaussianField(a, w, h, sigma) {
  if (!(sigma > 0)) return Float32Array.from(a);
  const r = Math.max(1, Math.ceil(3 * sigma)), k = new Float64Array(2 * r + 1);
  let t = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); t += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= t;
  const tmp = new Float64Array(w * h), out = new Float32Array(w * h);
  const left = Math.min(w, r), right = Math.max(left, w - r);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < left; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += k[i + r] * a[row + Math.min(w - 1, Math.max(0, x + i))];
      tmp[row + x] = v;
    }
    for (let x = left; x < right; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += k[i + r] * a[row + x + i];
      tmp[row + x] = v;
    }
    for (let x = right; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += k[i + r] * a[row + Math.min(w - 1, Math.max(0, x + i))];
      tmp[row + x] = v;
    }
  }
  const rows = new Float64Array(k.length);
  for (let y = 0; y < h; y++) {
    // These offsets depend only on y, not on the pixel or its value.
    for (let i = -r; i <= r; i++) rows[i + r] = Math.min(h - 1, Math.max(0, y + i)) * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let j = 0; j < k.length; j++) v += k[j] * tmp[rows[j] + x];
      out[y * w + x] = v;
    }
  }
  return out;
}
