// The two row-banded passes of density.mjs gaussian, for the thread pool (sheet-par.mjs). Same arithmetic order as the
// serial call (taps from -r up, one double accumulator, one rounding) so results match bit for bit. No imports: workers load it.

/** Horizontal pass on rows y0..y1 - 1: src to tmp. `k` is the kernel (2r + 1 taps). */
export function blurRows(src, tmp, w, k, r, y0, y1) {
  const n2 = 2 * r + 1;
  for (let y = y0; y < y1; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let a = 0;
      if (x >= r && x + r < w) { const b = row + x - r; for (let i = 0; i < n2; i++) a += src[b + i] * k[i]; }
      else for (let i = -r; i <= r; i++) { const xx = Math.min(w - 1, Math.max(0, x + i)); a += src[row + xx] * k[i + r]; }
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
