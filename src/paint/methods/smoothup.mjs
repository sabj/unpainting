// A plan-grid 0/1 mask brought to the sheet's finer grid with smooth edges: blurred on the plan grid (gaussian of
// `sigma` cells), sampled bilinearly at the sheet's cells and cut at one half, so diagonals do not step in plan cells.
export function smoothUp(mask, w, h, SC, sigma, gaussian) {
  const f = Float32Array.from(mask, v => (v ? 1 : 0));
  const g = sigma > 0 && gaussian ? gaussian(f, w, h, sigma) : f;
  const W2 = w * SC, H2 = h * SC, out = new Uint8Array(W2 * H2);
  for (let y = 0; y < H2; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) / SC - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W2; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) / SC - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const v = (g[y0 * w + x0] * (1 - tx) + g[y0 * w + x1] * tx) * (1 - ty) + (g[y1 * w + x0] * (1 - tx) + g[y1 * w + x1] * tx) * ty;
      out[y * W2 + x] = v >= 0.5 ? 1 : 0;
    }
  }
  return out;
}
