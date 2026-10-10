// The edges of forms as long chains a pencil can follow: gradient, thinning and hysteresis, then linking.
// Chains shorter than minLength are texture and are dropped. DOM free: callers pass the blur.

/**
 * @param D       Float32Array density (or any tone field), w*h
 * @param blur    (F, w, h, sigma) => Float32Array
 * @param opts.sigma      the blur the gradient is read at, in cells
 * @param opts.high, low  hysteresis, as quantiles of the nonzero thinned gradient
 * @param opts.minLength  cells a chain must run to be kept
 * @param opts.margin     share of each side left out (a scan's mount and ruled border)
 * @param opts.minContrast the weakest gradient, in density per cell, that can start an edge
 * @returns [{ points: [{x, y}] }] longest first
 */
export function edgeChains(D, w, h, blur, { sigma = 1.5, high = 0.85, low = 0.6, minLength = 20, margin = 0, step = 2, minContrast = 0.03 } = {}) {
  const n = w * h, B = blur(D, w, h, sigma), gx = new Float32Array(n), gy = new Float32Array(n), mag = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; gx[i] = (B[i + 1] - B[i - 1]) / 2; gy[i] = (B[i + w] - B[i - w]) / 2; mag[i] = Math.hypot(gx[i], gy[i]); }
  // thin to the ridge across the edge
  const thin = new Float32Array(n);
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x, m = mag[i]; if (m <= 1e-6) continue;
    const ux = gx[i] / m, uy = gy[i] / m;
    const a = mag[Math.round(y + uy) * w + Math.round(x + ux)], b = mag[Math.round(y - uy) * w + Math.round(x - ux)];
    if (m >= a && m >= b) thin[i] = m;
  }
  const mx = Math.round(margin * w), my = Math.round(margin * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < mx || y < my || x >= w - mx || y >= h - my) thin[y * w + x] = 0;
  const vals = []; for (let i = 0; i < n; i++) if (thin[i] > 0) vals.push(thin[i]);
  if (!vals.length) return [];
  vals.sort((a, b) => a - b);
  // thresholds are quantiles of this sheet's edges, floored by a peak share and minContrast so noise is not promoted
  const peak = vals[vals.length - 1], hi = Math.max(vals[Math.floor(vals.length * high)], peak * 0.25, minContrast), lo = Math.max(vals[Math.floor(vals.length * low)], hi * 0.4);
  // hysteresis: strong edges, and weaker ones connected to them
  const keep = new Uint8Array(n), stack = [];
  for (let i = 0; i < n; i++) if (thin[i] >= hi) { keep[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const q = yy * w + xx; if (!keep[q] && thin[q] >= lo) { keep[q] = 1; stack.push(q); }
    }
  }
  // link into chains, preferring to continue straight
  const seen = new Uint8Array(n), N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]], chains = [];
  const walk = (start, dir0) => {
    const path = [start]; let cur = start, dir = dir0;
    for (;;) {
      const x = cur % w, y = (cur / w) | 0; let best = -1, bestTurn = 9, bestDir = dir;
      for (let k = 0; k < 8; k++) {
        const xx = x + N8[k][0], yy = y + N8[k][1]; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx; if (!keep[q] || seen[q]) continue;
        const turn = dir < 0 ? 0 : Math.min((k - dir + 8) % 8, (dir - k + 8) % 8);
        if (turn < bestTurn && turn <= 2) { bestTurn = turn; best = q; bestDir = k; }
      }
      if (best < 0) return path;
      seen[best] = 1; path.push(best); cur = best; dir = bestDir;
    }
  };
  for (let i = 0; i < n; i++) if (keep[i] && !seen[i]) {
    seen[i] = 1;
    const a = walk(i, -1), b = walk(i, -1);
    const cells = [...b.slice(1).reverse(), ...a];
    if (cells.length < minLength) continue;
    const pts = cells.map(c => ({ x: c % w, y: (c / w) | 0 }));
    const smooth = pts.map((p, k) => { const lo2 = Math.max(0, k - 1), hi2 = Math.min(pts.length - 1, k + 1); let sx = 0, sy = 0; for (let j = lo2; j <= hi2; j++) { sx += pts[j].x; sy += pts[j].y; } return { x: sx / (hi2 - lo2 + 1), y: sy / (hi2 - lo2 + 1) }; });
    chains.push({ points: smooth.filter((_, k) => k % step === 0 || k === smooth.length - 1) });
  }
  return chains.sort((p, q) => q.points.length - p.points.length);
}
