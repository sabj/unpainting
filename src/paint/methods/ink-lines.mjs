// Ink lines held to the target: a line file's paths smoothed (--linesmooth) and cut to where the target shows a line
// (--linesupport), with the target's own line darkness and pixel size measured for the pen (ink-lines-file.mjs).
//
// Support. At each point of a path the target is read across the path: the on-path value is the mean over the path
// and 0.35 target pixels either side (a line 0.7 pixels wide); each side is the mean from 1 to 2.25 target pixels out.
// Support is the mean of the two sides minus the on-path value, in L*. A dark line scores its contrast, and so does
// the dark side of a dark shape's outline; a path on a tonal edge itself, flat paper or a light line (a white whisker)
// scores near zero or below. Runs whose smoothed support reaches `threshold` are kept, extended while it stays
// above half of it, joined across short gaps; shorter runs are dropped.
//
// Smoothing. A traced line steps from pixel to pixel. Each path is resampled, split at corners sharper than `cornerDeg`
// (measured over two smoothing widths, so pixel steps never count), and each piece is smoothed with a Gaussian of
// `sigma` target pixels. Past each end a piece continues as its point reflection, so ends and corners stay put.
//
// Pure: arrays in, arrays out. Coordinates are the line file's image pixels; L is CIE L* (0..100) on that grid.

import { measureAlong, weightsFrom } from './ink-measure.mjs';

const SIDE_RADII = [1, 1.5, 2, 2.25], ON_HALF = 0.35;

/** Bilinear sample of a plane at (x, y), pixel centres at integer + 0.5, clamped to the edge. */
function sample(P, w, h, x, y) {
  const fx = Math.max(0, Math.min(w - 1, x - 0.5)), fy = Math.max(0, Math.min(h - 1, y - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), u = fx - x0, v = fy - y0;
  return (P[y0 * w + x0] * (1 - u) + P[y0 * w + x1] * u) * (1 - v) + (P[y1 * w + x0] * (1 - u) + P[y1 * w + x1] * u) * v;
}

const arcLengths = pts => { const d = [0]; for (let k = 1; k < pts.length; k++) d.push(d[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y)); return d; };

/** Points {x, y, width?, weight?} resampled every `step` along the path; width and weight interpolate. */
export function resample(pts, step) {
  if (pts.length < 2) return pts.map(p => ({ ...p }));
  const d = arcLengths(pts), L = d.at(-1), n = Math.max(1, Math.round(L / step)), out = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const s = L * i / n;
    while (k < pts.length - 2 && d[k + 1] < s) k++;
    const span = d[k + 1] - d[k], t = span > 0 ? Math.max(0, Math.min(1, (s - d[k]) / span)) : 0, a = pts[k], b = pts[k + 1];
    const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (a.width != null && b.width != null) q.width = a.width + (b.width - a.width) * t;
    if (a.weight != null && b.weight != null) q.weight = a.weight + (b.weight - a.weight) * t;
    out.push(q);
  }
  return out;
}

/** Mean turning of a path in degrees per unit length (the diagnosis's wobble measure). */
export function turning(pts) {
  let turn = 0, len = 0;
  for (let k = 1; k < pts.length; k++) {
    const dx = pts[k].x - pts[k - 1].x, dy = pts[k].y - pts[k - 1].y; len += Math.hypot(dx, dy);
    if (k < pts.length - 1) {
      const a1 = Math.atan2(dy, dx), a2 = Math.atan2(pts[k + 1].y - pts[k].y, pts[k + 1].x - pts[k].x);
      let da = Math.abs(a2 - a1); if (da > Math.PI) da = 2 * Math.PI - da; turn += da;
    }
  }
  return len > 0 ? turn * 180 / Math.PI / len : 0;
}

// Douglas-Peucker over indices, keeping every index in `pinned`.
function simplify(pts, tol, pinned = new Set()) {
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  for (const i of pinned) keep[i] = 1;
  const stack = []; let a = 0;
  for (let i = 1; i < pts.length; i++) if (keep[i]) { stack.push([a, i]); a = i; }
  while (stack.length) {
    const [i, j] = stack.pop(); if (j - i < 2) continue;
    const ax = pts[i].x, ay = pts[i].y, dx = pts[j].x - ax, dy = pts[j].y - ay, L = Math.hypot(dx, dy) || 1;
    let best = -1, far = tol;
    for (let k = i + 1; k < j; k++) { const e = Math.abs((pts[k].x - ax) * dy - (pts[k].y - ay) * dx) / L; if (e > far) { far = e; best = k; } }
    if (best > 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * A path smoothed at `sigma` (pixels), corners sharper than `cornerDeg` kept, then simplified to within `tol` pixels.
 * Returns new points; the input is not changed.
 */
export function smoothPath(pts, { sigma = 1.5, cornerDeg = 50, tol = 0.1 } = {}) {
  if (pts.length < 3 || !(sigma > 0)) return pts.map(p => ({ ...p }));
  const step = Math.min(0.5, sigma / 3), R = resample(pts, step), n = R.length;
  if (n < 5) return pts.map(p => ({ ...p }));
  // corners: the turn between the chords to points two sigmas back and ahead, local maxima above the limit
  const span = Math.max(1, Math.round(2 * sigma / step)), ang = new Float32Array(n);
  for (let i = span; i < n - span; i++) {
    const ux = R[i].x - R[i - span].x, uy = R[i].y - R[i - span].y, vx = R[i + span].x - R[i].x, vy = R[i + span].y - R[i].y;
    const c = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
    ang[i] = Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
  }
  const cuts = [0];
  for (let i = span; i < n - span; i++) {
    if (ang[i] < cornerDeg) continue;
    let peak = true; for (let j = Math.max(0, i - span); j <= Math.min(n - 1, i + span); j++) if (ang[j] > ang[i] || (ang[j] === ang[i] && j < i)) { peak = false; break; }
    if (peak && i - cuts.at(-1) > 1) cuts.push(i);
  }
  cuts.push(n - 1);
  const sg = sigma / step, half = Math.ceil(3 * sg), wts = Array.from({ length: half + 1 }, (_, k) => Math.exp(-k * k / (2 * sg * sg)));
  const out = R.map(p => ({ ...p }));
  for (let c = 0; c < cuts.length - 1; c++) {
    const a = cuts[c], b = cuts[c + 1];
    // beyond an end the piece continues as its point reflection through that end, so the end stays put and a
    // straight run near it stays straight
    const at = j => { if (j < a) { const q = R[Math.min(b, 2 * a - j)]; return [2 * R[a].x - q.x, 2 * R[a].y - q.y]; } if (j > b) { const q = R[Math.max(a, 2 * b - j)]; return [2 * R[b].x - q.x, 2 * R[b].y - q.y]; } return [R[j].x, R[j].y]; };
    for (let i = a + 1; i < b; i++) {
      let sx = 0, sy = 0, sw = 0;
      for (let k = -half; k <= half; k++) { const g = wts[Math.abs(k)], [x, y] = at(i + k); sx += g * x; sy += g * y; sw += g; }
      out[i].x = sx / sw; out[i].y = sy / sw;
    }
  }
  return simplify(out, tol, new Set(cuts));
}

/**
 * Support of a path in the target, per point of `pts` (L* units, positive where the target shows a darker line along
 * the path), plus the on-path and side L* per point.
 */
export function pathSupport(pts, L, w, h) {
  const n = pts.length, support = new Float32Array(n), on = new Float32Array(n), side = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl, ny = tx / tl, p = pts[k];
    const o = (sample(L, w, h, p.x, p.y) + sample(L, w, h, p.x + ON_HALF * nx, p.y + ON_HALF * ny) + sample(L, w, h, p.x - ON_HALF * nx, p.y - ON_HALF * ny)) / 3;
    let l = 0, r = 0; for (const d of SIDE_RADII) { l += sample(L, w, h, p.x + d * nx, p.y + d * ny); r += sample(L, w, h, p.x - d * nx, p.y - d * ny); }
    l /= SIDE_RADII.length; r /= SIDE_RADII.length;
    on[k] = o; side[k] = (l + r) / 2; support[k] = side[k] - o;
  }
  return { support, on, side };
}

/**
 * Index runs [a, b] of a path to keep: smoothed support (Gaussian over `window` points) at least `threshold`,
 * extended while it stays above half of it, gaps of up to `gap` points joined, runs under `minRun` points dropped.
 */
export function supportedRuns(support, { threshold, window = 4, gap = 4, minRun = 6 }) {
  const n = support.length, sm = new Float32Array(n), half = Math.ceil(2 * window);
  for (let i = 0; i < n; i++) { let s = 0, sw = 0; for (let k = -half; k <= half; k++) { const j = i + k; if (j < 0 || j >= n) continue; const g = Math.exp(-k * k / (2 * window * window)); s += g * support[j]; sw += g; } sm[i] = s / sw; }
  const keep = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (sm[i] >= threshold) keep[i] = 1;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
    const j = pass ? n - 1 - i : i, prev = pass ? j + 1 : j - 1;
    if (!keep[j] && prev >= 0 && prev < n && keep[prev] && sm[j] >= threshold / 2) keep[j] = 1;
  }
  let runs = []; for (let i = 0; i < n;) { if (!keep[i]) { i++; continue; } let j = i; while (j + 1 < n && keep[j + 1]) j++; runs.push([i, j]); i = j + 1; }
  const joined = [];
  for (const r of runs) { const last = joined.at(-1); if (last && r[0] - last[1] - 1 <= gap) last[1] = r[1]; else joined.push([...r]); }
  runs = joined.filter(([a, b]) => b - a + 1 >= minRun);
  return { runs, smoothed: sm };
}

const toPoints = g => (g.points || []).map(([x, y], k) => ({ x, y, ...(Array.isArray(g.widths) && g.widths.length === g.points.length ? { width: g.widths[k] } : {}), ...(Array.isArray(g.weights) && g.weights.length === g.points.length ? { weight: g.weights[k] } : {}) }));
const fromPoints = (g, pts) => {
  const r = v => Math.round(v * 100) / 100, out = { ...g, points: pts.map(p => [r(p.x), r(p.y)]) };
  if (Array.isArray(g.widths)) out.widths = pts.map(p => r(p.width ?? g.width ?? 0));
  if (Array.isArray(g.weights)) out.weights = pts.map(p => r(p.weight ?? g.weight ?? 1));
  return out;
};
const pathLen = pts => arcLengths(pts).at(-1) ?? 0;
function nearInk(mask, w, h, x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = cx + dx, yy = cy + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx]) return true; }
  return false;
}
const quantile = (v, q) => { if (!v.length) return null; const s = Float64Array.from(v).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const Y = Lstar => (Lstar > 8 ? ((Lstar + 16) / 116) ** 3 : Lstar / 903.3);

/**
 * A line file's lines smoothed and filtered against the target's L* plane (on the file's image grid).
 * `sigma` smoothing in pixels (0 off); `threshold` support in L* (0: measure only, keep every line); `contour`: the lines
 * are a lineart map's contours, none is marked soft.
 * @returns { lines, stats } with stats { lines, kept, pieces, lengthPx, keptPx, turnBefore, turnAfter,
 *   supportedShare, lineL, sideL, absorbance } where absorbance is the median -ln(Y on-path / Y sides) over supported points
 */
export function holdLinesToTarget(lines, L, w, h, { sigma = 0, cornerDeg = 50, threshold = 0, minRunPx = 3, gapPx = 2, measure = false, inkMask = null, contour = false, reach = undefined, widthPx = null } = {}) {
  const out = [], abs = [], onL = [], sideL = []; let lengthPx = 0, keptPx = 0, tb = 0, ta = 0, supportedPx = 0, kept = 0;
  const measured = []; // with `measure`: [line, points carrying width and absorbance]
  const step = 0.5;
  for (const g of lines) {
    const raw = toPoints(g); if (raw.length < 2) continue;
    const len0 = pathLen(raw); lengthPx += len0; tb += turning(raw) * len0;
    const smooth = sigma > 0 ? smoothPath(raw, { sigma, cornerDeg }) : raw;
    ta += turning(smooth) * pathLen(smooth);
    const R = resample(smooth, step), { support, on, side } = pathSupport(R, L, w, h);
    // `inkMask` (0/1 on the grid): a point with no ink cell within a pixel has no support, so a trace along a wash
    // edge or a coloured brush mark is cut where the separator does not read pen line
    if (inkMask) R.forEach((q, k) => { if (!nearInk(inkMask, w, h, q.x, q.y)) support[k] = Math.min(support[k], 0); });
    if (measure) { const m = measureAlong(R, L, w, h, on, side, { spacing: step, reach }); R.forEach((q, k) => { q.mapWidth = q.width; q.width = m.width[k]; q.absorb = m.absorbance[k]; }); }
    const { runs } = supportedRuns(support, { threshold: Math.max(threshold, 1e-6), window: 1 / step, gap: Math.round(gapPx / step), minRun: Math.round(minRunPx / step) });
    for (const [a, b] of runs) { supportedPx += (b - a) * step; for (let k = a; k <= b; k++) { abs.push(-Math.log(Math.max(1e-4, Y(on[k])) / Math.max(1e-4, Y(side[k])))); onL.push(on[k]); sideL.push(side[k]); } }
    if (!(threshold > 0)) {
      if (measure) measured.push([g, simplify(R, 0.1)]); else out.push(sigma > 0 ? fromPoints(g, smooth) : g);
      keptPx += len0; kept++; continue;
    }
    if (runs.length) kept++;
    for (const [a, b] of runs) {
      const piece = measure || sigma > 0 || runs.length > 1 || a > 0 || b < R.length - 1 ? simplify(R.slice(a, b + 1), 0.1) : raw;
      if (piece.length < 2) continue;
      keptPx += pathLen(piece);
      if (measure) measured.push([g, piece]); else out.push(fromPoints(g, piece));
    }
  }
  if (measure) out.push(...measuredLines(measured, { soft: !contour, widthPx: contour ? widthPx : null }));
  return { lines: out, stats: { lines: lines.length, kept, pieces: out.length, lengthPx, keptPx, turnBefore: lengthPx ? tb / lengthPx : 0, turnAfter: lengthPx ? ta / lengthPx : 0,
    supportedShare: lengthPx ? supportedPx / lengthPx : 0, lineL: quantile(onL, 0.5), sideL: quantile(sideL, 0.5), absorbance: quantile(abs, 0.5) } };
}

/**
 * Measured pieces as line-file lines with per-point `widths` (pixels) and `weights` (0.45..1, each point's absorbance
 * over the 85th percentile of the file's, from a floor of 0.45). A point with no width reading takes its piece's median, else the file's.
 * A width is held to 1.6 times its piece's median, so a line crossing a dark wash does not swell into a blot.
 * `widthPx` { min, max, detail, shortPx, curvedDegPerPx } (a lineart map's contours): a width is also held to the map's own
 * width (`mapWidth`) and to min..max, or min..detail on a short or tightly curved piece.
 * A piece spread wide and pale is marked `soft` (--inkbleed draws it on damp paper), unless `soft` is off: a contour
 * line of a lineart map is always drawn dry.
 */
function measuredLines(measured, { soft: allowSoft = true, widthPx = null } = {}) {
  const r = v => Math.round(v * 100) / 100, all = [], allW = [];
  for (const [, pts] of measured) for (const q of pts) { if (q.absorb > 0) all.push(q.absorb); if (Number.isFinite(q.width)) allW.push(q.width); }
  const ref = quantile(all, 0.85) ?? 0, fileW = quantile(allW, 0.5) ?? 1;
  return measured.map(([g, pts]) => {
    const own = pts.map(q => q.width).filter(Number.isFinite), pieceW = quantile(own, 0.5) ?? fileW;
    const weights = weightsFrom(pts.map(q => q.absorb ?? 0), ref);
    // soft: spread at least half again as wide as the file's typical line and no darker than 60% of its strong line,
    // as a line drawn into a wet wash
    const pieceA = quantile(pts.map(q => q.absorb ?? 0), 0.5) ?? 0, soft = allowSoft && pieceW >= 1.5 * fileW && pieceA <= 0.6 * ref;
    const { widths: _w, weights: _g, soft: _s, ...rest } = g;
    let widths = pts.map(q => (Number.isFinite(q.width) ? Math.min(q.width, 1.6 * pieceW) : pieceW)), kept = weights;
    if (widthPx) {
      // a lineart map's contour: the source's width, held to the map's own width where the map gives one, and to the
      // pen's range; a short or tightly curved piece (an eye, a pupil, a nostril) is held to the detail width
      const detail = pathLen(pts) < widthPx.shortPx || turning(pts) > widthPx.curvedDegPerPx, hi = detail ? widthPx.detail : widthPx.max;
      widths = pts.map((q, k) => Math.max(widthPx.min, Math.min(hi, Number.isFinite(q.mapWidth) ? Math.min(widths[k], q.mapWidth) : widths[k])));
      // the map's confidence adds to the source's darkness: a line both agree on is drawn firmest
      kept = weights.map((v, k) => (pts[k].weight != null ? (v + pts[k].weight) / 2 : v));
    }
    return { ...rest, points: pts.map(p => [r(p.x), r(p.y)]), widths: widths.map(r), weights: kept.map(r), ...(soft ? { soft: true } : {}) };
  });
}

/** The share (0..1] the ink load is scaled by so the pen's line absorbance on blank paper is `cap` times the target's. */
export function inkCapFactor(penAbsorbance, targetAbsorbance, cap = 1) {
  if (!(penAbsorbance > 0) || !(targetAbsorbance > 0) || !(cap > 0)) return 1;
  return Math.min(1, cap * targetAbsorbance / penAbsorbance);
}
