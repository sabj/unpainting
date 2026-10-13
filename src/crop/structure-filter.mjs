// Structural opening drawing: a dense traced line file with its short crack fragments and wandering shadow edges
// dropped. A line stays if it is long and nearly straight (coursing, sills, jambs, mullions), or if most of its points
// lie in a detail region. Detail regions are not placed by hand: they are cells where the trace is dense and the
// target's local value contrast is high, both above a sheet quantile (ironwork, tracery, an arch's mouldings), so the
// rule runs unchanged on any subject. A crack mesh on a flat wall is dense but low in contrast; a shadow edge has
// contrast but a sparse trace.
// Pure: points in sheet cells, lum a w*h array of target lightness 0..100.

const pathLength = pts => { let d = 0; for (let k = 1; k < pts.length; k++) d += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return d; };
const chordShare = pts => { const L = pathLength(pts); return L > 0 ? Math.hypot(pts.at(-1)[0] - pts[0][0], pts.at(-1)[1] - pts[0][1]) / L : 0; };

// Box sums over a (2r+1)^2 window by an integral image.
function boxMean(v, w, h, r) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += v[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
    out[y * w + x] = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  }
  return out;
}
const quantile = (v, q) => { const s = Float32Array.from(v).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

/** Detail cells: trace density and local lightness spread both above their sheet quantile q, over a radius-r window. */
export function detailRegion(lines, lum, w, h, { radius = 6, quantile: q = 0.8 } = {}) {
  const ink = new Float32Array(w * h);
  for (const pts of lines) for (let k = 0; k < pts.length; k++) {
    const p = pts[k], n = pts[Math.min(k + 1, pts.length - 1)], steps = Math.max(1, Math.ceil(Math.hypot(n[0] - p[0], n[1] - p[1])));
    for (let s = 0; s < steps; s++) { const X = Math.round(p[0] + (n[0] - p[0]) * s / steps), Y = Math.round(p[1] + (n[1] - p[1]) * s / steps); if (X >= 0 && Y >= 0 && X < w && Y < h) ink[Y * w + X] = 1; }
  }
  const density = boxMean(ink, w, h, radius), mean = boxMean(lum, w, h, radius), sq = boxMean(Float32Array.from(lum, v => v * v), w, h, radius);
  const spread = Float32Array.from(mean, (m, i) => Math.sqrt(Math.max(0, sq[i] - m * m)));
  const dq = quantile(density, q), cq = quantile(spread, q);
  return Uint8Array.from(density, (d, i) => d > 0 && d >= dq && spread[i] > 1e-6 && spread[i] >= cq ? 1 : 0);
}

/** Indices of lines kept. lines: arrays of [x,y] in sheet cells; detail: optional w*h mask from detailRegion. */
export function structuralLines(lines, { w, h, minLength = 12, minStraight = 0.85, detail = null } = {}) {
  if (!(w > 0 && h > 0)) throw new Error('structuralLines: sheet w and h are required');
  const inDetail = pts => detail && pts.filter(([x, y]) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < w && Y < h && detail[Y * w + X]; }).length > pts.length / 2;
  const kept = [];
  lines.forEach((pts, i) => {
    if (pts.length < 2) return;
    if (inDetail(pts) || (pathLength(pts) >= minLength && chordShare(pts) >= minStraight)) kept.push(i);
  });
  return kept;
}
