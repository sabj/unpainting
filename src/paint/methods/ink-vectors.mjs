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

const ringArea = r => { let a = 0; for (let k = 0, n = r.length; k < n; k++) { const p = r[k], q = r[(k + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const ringLength = r => { let L = 0; for (let k = 0, n = r.length; k < n; k++) { const p = r[k], q = r[(k + 1) % n]; L += Math.hypot(q[0] - p[0], q[1] - p[1]); } return L; };

/**
 * A FILL (a leaf mass, a dark pane, a blot), not a LINE: its ink (outer rings less holes) is wider than `widthMm` (twice its
 * area over its perimeter, the width of a strip) and hardly longer than four widths, or covers over `areaMm2` and is over
 * 0.8 of that wide. Contours, bars, branches and hatching are lines. Same rule as tools/seg/ink-vectors.py is_fill.
 */
export function isFill(stroke, widthMm = 0.5, areaMm2 = 1.5) {
  const a = Math.abs(stroke.outline.reduce((t, r) => t + ringArea(r), 0)), per = stroke.outline.reduce((t, r) => t + ringLength(r), 0);
  const w = 2 * a / Math.max(per, 1e-9), L = per / 2;
  return (w > widthMm && L < 4 * w) || (a > areaMm2 && w > 0.8 * widthMm);
}

const pathLength = P => P.reduce((t, q, k) => (k ? t + Math.hypot(q[0] - P[k - 1][0], q[1] - P[k - 1][1]) : 0), 0);
/** A fill's width: twice its area over its perimeter. */
function fillWidth(stroke) { const a = Math.abs(stroke.outline.reduce((t, r) => t + ringArea(r), 0)), per = stroke.outline.reduce((t, r) => t + ringLength(r), 0); return 2 * a / Math.max(per, 1e-9); }
/** Distance from (x, y) to a polyline. */
function polylineDistance(P, x, y) { return edgeDistance([P.slice(0, -1).concat([P[P.length - 1]])].map(r => r), x, y, false); }

/** Distance from (x, y) to the nearest edge of the rings (same unit). */
function edgeDistance(R, x, y, closed = true) {
  let best = Infinity;
  for (const r of R) for (let k = 0, n = r.length; k < (closed ? n : n - 1); k++) {
    const a = r[k], b = r[(k + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0, ex = a[0] + t * dx - x, ey = a[1] + t * dy - y, d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Lays the strokes on `field` (an ink amount per cell, w x h cells of `mm` mm) in seq order; the darker holds where two meet.
 * `inkOf` maps darkness to ink amount (inkForDarkness). `each(stroke, cells)` is told each stroke's area as it is laid.
 * `fill` (0..1): a FILL stroke (isFill) is laid as one pale shape of diluted ink at `fill` of its darkness, its edge soft
 * over `softMm` (like ink laid with a brush), no rim; where the fill is a thickened part of a line (its path at least
 * three times as long as the fill is wide: a branch swelling, a leaf on a twig) the line through it, `coreMm` wide, stays at
 * full darkness. Lines are exact (1: everything exact). Returns { strokes, cells, fills }.
 */
export function layVectors(doc, field, w, h, mm, inkOf, { ss = 4, each = null, fill = 1, softMm = 0.2, coreMm = 0.3 } = {}) {
  const S = [...doc.strokes].sort((a, b) => a.seq - b.seq), dark = new Float32Array(w * h);
  let cells = 0, fills = 0;
  for (const s of S) {
    const r = rasterizeRings(s.outline, w, h, mm, ss); let n = 0;
    const thin = fill < 1 && isFill(s); if (thin) fills++;
    const P = s.path ?? [], core = thin && P.length > 1 && pathLength(P) >= 3 * fillWidth(s);
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
      const c = r.cov[j * r.w + i]; if (!(c > 0)) continue;
      let f = 1;
      if (thin) {
        const x = (r.x0 + i + 0.5) * mm, y = (r.y0 + j + 0.5) * mm;
        f = fill * Math.min(1, edgeDistance(s.outline, x, y) / softMm + 0.35);
        if (core && polylineDistance(P, x, y) <= coreMm / 2) f = 1;
      }
      const k = (r.y0 + j) * w + r.x0 + i, d = Math.min(1, c * s.dark * f);
      // the darker holds, against ink already on the sheet too (a closing pen over the opening's ink adds none twice)
      if (d > dark[k]) { dark[k] = d; const t = inkOf(d); if (t > field[k]) field[k] = t; n++; }
    }
    cells += n; each?.(s, n);
  }
  return { strokes: S.length, cells, fills };
}

/**
 * A derived line file's vector strokes (a stage, or the lines the ink hold kept): the drawing's own vectors (ink-vectors.py) of the lines the stage holds, matched by the line each
 * stroke came from (`line` = the line's seq). Never re-traced. A stage of lines without seq, or vectors without `line`,
 * takes the whole set (the stage is then the whole drawing). Returns the vectors document.
 */
export function stageVectors(vec, stageLines) {
  const seqs = stageLines.map(g => g.seq);
  if (seqs.some(q => q == null) || vec.strokes.some(s => s.line == null)) return vec;
  const keep = new Set(seqs.map(Math.floor));
  return { ...vec, strokes: vec.strokes.filter(s => keep.has(Math.floor(s.line))) };
}


/** The vectors file beside a line file (`<stem>-lines.json` -> `<stem>-vectors.json`). */
export const vectorsBeside = linesFile => linesFile.replace(/-lines\.json(\.gz)?$/, '-vectors.json');
