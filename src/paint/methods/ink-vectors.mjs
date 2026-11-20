// Pipeline: inking, stage 4 (the pen's ink laid exactly as the drawing's vector strokes). DOM free, no file IO.
// A prepared drawing fitted as vector strokes (tools/seg/ink-vectors.py: each stroke a closed outline in sheet mm, its
// path, widths and darkness) is laid stroke by stroke in its order: each outline is rasterised on the pen's sheet at that
// sheet's own resolution (antialiased by supersampling, so a finer sheet renders it crisper, never enlarged), and the ink
// put down there is the amount that renders the stroke's darkness on white paper. Where two strokes abut the darker one
// holds (ink is not piled twice on a shared edge).

/** Coverage (0..1) of a stroke's outline rings (even-odd) on a grid `w` x `h` cells of `mm` mm, by `ss` x `ss` samples a cell. */
export function rasterizeRings(rings, w, h, mm, ss = 4) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const R = rings.map(r => r.map(([x, y]) => [x / mm, y / mm]));
  for (const r of R) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cx0 = Math.max(0, Math.floor(x0)), cy0 = Math.max(0, Math.floor(y0)), cx1 = Math.min(w, Math.ceil(x1) + 1), cy1 = Math.min(h, Math.ceil(y1) + 1);
  const bw = cx1 - cx0, bh = cy1 - cy0;
  if (bw <= 0 || bh <= 0) return { x0: cx0, y0: cy0, w: 0, h: 0, cov: new Float32Array(0) };
  const cov = new Float32Array(bw * bh), inv = 1 / (ss * ss), xs = [];
  for (let sy = 0; sy < bh * ss; sy++) {
    const y = cy0 + (sy + 0.5) / ss; xs.length = 0;
    for (const r of R) for (let k = 0, n = r.length; k < n; k++) {
      const a = r[k], b = r[(k + 1) % n];
      if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    const row = ((sy / ss) | 0) * bw;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // samples at cell x + (i + 0.5) / ss inside [xs[k], xs[k + 1])
      const s0 = Math.max(0, Math.ceil((xs[k] - cx0) * ss - 0.5)), s1 = Math.min(bw * ss, Math.ceil((xs[k + 1] - cx0) * ss - 0.5));
      for (let s = s0; s < s1; s++) cov[row + ((s / ss) | 0)] += inv;
    }
  }
  return { x0: cx0, y0: cy0, w: bw, h: bh, cov };
}

/**
 * The ink amount that renders each darkness (0 paper .. 1 black) on white: `darkOf(t)` the darkness of ink amount t, read
 * once over a ramp. Returns d -> t (clamped at the darkest the ink reaches).
 */
export function inkForDarkness(darkOf, tMax = 64, n = 400) {
  const T = [0], D = [0];
  for (let k = 1; k <= n; k++) { const t = tMax * Math.pow(k / n, 3); T.push(t); D.push(darkOf(t)); }
  for (let k = 1; k < D.length; k++) if (D[k] < D[k - 1]) D[k] = D[k - 1];
  return d => {
    if (!(d > 0)) return 0;
    if (d >= D[n]) return T[n];
    let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m; else hi = m; }
    const f = (d - D[lo]) / Math.max(1e-9, D[hi] - D[lo]); return T[lo] + f * (T[hi] - T[lo]);
  };
}

/**
 * Lays the strokes on `field` (an ink amount per cell, w x h cells of `mm` mm) in seq order; the darker holds where two meet.
 * `inkOf` maps darkness to ink amount (inkForDarkness). `each(stroke, cells)` is told each stroke's area as it is laid.
 * Returns { strokes, cells }.
 */
export function layVectors(doc, field, w, h, mm, inkOf, { ss = 4, each = null } = {}) {
  const S = [...doc.strokes].sort((a, b) => a.seq - b.seq), dark = new Float32Array(w * h);
  let cells = 0;
  for (const s of S) {
    const r = rasterizeRings(s.outline, w, h, mm, ss); let n = 0;
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
      const c = r.cov[j * r.w + i]; if (!(c > 0)) continue;
      const k = (r.y0 + j) * w + r.x0 + i, d = Math.min(1, c * s.dark);
      if (d > dark[k]) { dark[k] = d; field[k] = inkOf(d); n++; }
    }
    cells += n; each?.(s, n);
  }
  return { strokes: S.length, cells };
}
