// The two row-banded passes of density.mjs gaussian, for the thread pool (sheet-par.mjs). Same arithmetic order as the
// serial call (taps from -r up, one double accumulator, one rounding) so results match bit for bit. No imports: workers load it.

/** Horizontal pass on rows y0..y1 - 1: src to tmp. `k` is the kernel (2r + 1 taps). */
export function blurRows(src, tmp, w, k, r, y0, y1) {
  const n2 = 2 * r + 1, padded = new Float64Array(w + 2 * r);
  for (let y = y0; y < y1; y++) {
    const row = y * w;
    padded.fill(src[row], 0, r);
    for (let x = 0; x < w; x++) padded[r + x] = src[row + x];
    padded.fill(src[row + w - 1], r + w);
    // Independent double accumulators share tap loads. Padding moves edge
    // clamping out of the convolution without changing any tap or sum order.
    let x = 0;
    for (; x + 3 < w; x += 4) {
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
      for (let i = 0; i < n2; i++) {
        const kk = k[i], j = x + i;
        a0 += padded[j] * kk; a1 += padded[j + 1] * kk;
        a2 += padded[j + 2] * kk; a3 += padded[j + 3] * kk;
      }
      tmp[row+x] = a0; tmp[row+x+1] = a1;
      tmp[row+x+2] = a2; tmp[row+x+3] = a3;
    }
    for (; x < w; x++) {
      let a = 0;
      for (let i = 0; i < n2; i++) a += padded[x + i] * k[i];
      tmp[row + x] = a;
    }
  }
}

/** Vertical pass on rows y0..y1 - 1: tmp to out (reads any row of tmp, so the horizontal pass must be done). */
export function blurCols(tmp, out, w, h, k, r, y0, y1) {
  const acc = new Float64Array(w);
  for (let y = y0; y < y1; y++) {
    acc.fill(0);
    for (let i = -r; i <= r; i++) {
      const b = Math.min(h - 1, Math.max(0, y + i)) * w, kk = k[i + r];
      for (let x = 0; x < w; x++) acc[x] += tmp[b + x] * kk;
    }
    const row = y * w;
    for (let x = 0; x < w; x++) out[row + x] = acc[x];
  }
}
