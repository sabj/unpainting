// Generated from src/media/pixel-coverage.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Integrate a clamped maximum of two bilinear fields over a finite pixel.
// The caller splits at field knots. Horizontal pieces are affine and integrate
// exactly; adaptive Simpson integration controls the remaining vertical error.
export function pixelCoverage(sample, x0, y0, x1, y1, tolerance = 1e-6) {
  const a = sample(x0, y0), b = sample(x1, y0), c = sample(x0, y1), d = sample(x1, y1);
  const roots = (points, u, v, level) => {
    if (u === v) return;
    const t = (level - u) / (v - u);
    if (t > 0 && t < 1) points.push(t);
  };
  const horizontal = y => {
    const p0 = a[0] * (1 - y) + c[0] * y, p1 = b[0] * (1 - y) + d[0] * y;
    const q0 = a[1] * (1 - y) + c[1] * y, q1 = b[1] * (1 - y) + d[1] * y;
    const points = [0, 1];
    for (const level of [0, 1]) { roots(points, p0, p1, level); roots(points, q0, q1, level); }
    roots(points, p0 - q0, p1 - q1, 0);
    points.sort((a, b) => a - b);
    const value = x => Math.min(1, Math.max(0, p0 * (1 - x) + p1 * x, q0 * (1 - x) + q1 * x));
    let total = 0;
    for (let i = 1; i < points.length; i++) total += (points[i] - points[i - 1]) * (value(points[i - 1]) + value(points[i])) / 2;
    return total;
  };
  const integrate = (lo, hi, f0, fm, f1, whole, tol) => {
    const mid = (lo + hi) / 2, l = horizontal((lo + mid) / 2), r = horizontal((mid + hi) / 2);
    const left = (mid - lo) * (f0 + 4 * l + fm) / 6, right = (hi - mid) * (fm + 4 * r + f1) / 6;
    const error = left + right - whole;
    if (Math.abs(error) <= 15 * tol || mid === lo || mid === hi) return left + right + error / 15;
    return integrate(lo, mid, f0, l, fm, left, tol / 2) + integrate(mid, hi, fm, r, f1, right, tol / 2);
  };
  // Split where clipping or the dominant branch changes at a vertical edge.
  const ys = [0, 1];
  for (const level of [0, 1]) for (let k = 0; k < 2; k++) { roots(ys, a[k], c[k], level); roots(ys, b[k], d[k], level); }
  roots(ys, a[0] - a[1], c[0] - c[1], 0); roots(ys, b[0] - b[1], d[0] - d[1], 0);
  ys.sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < ys.length; i++) {
    const lo = ys[i - 1], hi = ys[i];
    if (lo === hi) continue;
    const f0 = horizontal(lo), fm = horizontal((lo + hi) / 2), f1 = horizontal(hi);
    total += integrate(lo, hi, f0, fm, f1, (hi - lo) * (f0 + 4 * fm + f1) / 6, tolerance * (hi - lo));
  }
  return Math.max(0, Math.min(1, total));
}
