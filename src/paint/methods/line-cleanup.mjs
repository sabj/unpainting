// Line selection and cleanup for the linework stage (linework-stage.mjs), the same for every source and style:
//
//   1. Specks under `minMm` go.
//   2. Shadow and value edges go. Across a traced line the stage reads the target on both sides: a dark ridge (darker
//      than both sides) is a drawn or structural line; a step whose sides differ in lightness while every channel
//      scales alike (a shadow darkens a surface, it does not change its colour) is a shadow or value edge, and a line
//      that is mostly such steps is dropped. Colour only tells where there is colour: a step whose lit side is near
//      grey (a monochrome photograph, a grey wall) is left undecided and kept. Long straight lines stay whatever their
//      profile (corners, sills, eaves).
//   3. Dense traces keep their structure (the structure filter of technique/paint-colour 919ef52c at its Yale quantile, 0.65):
//      a line stays when it is long and nearly straight or lies mostly in a detail region, where the trace is dense and
//      the target's local value contrast high. A crack mesh on a flat wall is dense but low in contrast; a shadow edge
//      has contrast but a sparse trace.
//   4. Repeated small marks are pruned into a simplified rhythm and the weight hierarchy is set (pen-wash-lines.mjs,
//      on a three-value map of the target): lit areas lose most small marks, long shadow-side structure stays full.
// A pen source's own lines (an ink-and-wash target) are an artist's selection already: they keep everything but
// specks, shadow outlines and near repeats. Points are kept as they are, with their own widths, weights and hand
// wobble. Pure, planning only.
import { prunePenLines } from './pen-wash-lines.mjs';

const CLEANUP = Object.freeze({
  minMm: 0.8, penMinMm: 0.4, sideMm: 0.6, ridge: 0.025, step: 0.07, scaleSpread: 1.3, minChroma: 0.06, shadowShare: 0.6, ridgeShare: 0.25, straightMm: 10, straight: 0.92,
  detailQuantile: 0.65, detailRadiusMm: 1.7, structMm: 3.4, structStraight: 0.85, lightShare: 0.55, darkShare: 0.15,
  prune: Object.freeze({ tileInkMm: 9, keepAbove: 0, minMm: 0.8, vary: 0.5, structMm: 15 }),
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pathLength = pts => { let d = 0; for (let k = 1; k < pts.length; k++) d += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return d; };
const chordShare = pts => { const L = pathLength(pts); return L > 0 ? Math.hypot(pts.at(-1).x - pts[0].x, pts.at(-1).y - pts[0].y) / L : 0; };
const at = (F, w, h, x, y) => F[clamp(Math.round(y), 0, h - 1) * w + clamp(Math.round(x), 0, w - 1)];

/** Three-value map of the target (0 light, 1 mid, 2 dark) from its smoothed lightness, by share of the sheet. */
export function valueGroups(L, { lightShare = CLEANUP.lightShare, darkShare = CLEANUP.darkShare } = {}) {
  const s = Float32Array.from(L).sort(), hi = s[Math.floor((1 - lightShare) * (s.length - 1))], lo = s[Math.floor(darkShare * (s.length - 1))];
  return Uint8Array.from(L, v => (v >= hi ? 0 : v <= lo ? 2 : 1));
}

/**
 * Each line's profile across itself: the share of its points that are dark ridges and the share that are shadow-like
 * steps. `rgb` is three smoothed linear-light planes [R, G, B], `L` smoothed lightness 0..1, `A`, `B` smoothed Lab chroma
 * axes (units of 100).
 */
export function lineProfile(g, { L, A, B, rgb, w, h }, { side, ridge = CLEANUP.ridge, step = CLEANUP.step, scaleSpread = CLEANUP.scaleSpread, minChroma = CLEANUP.minChroma } = {}) {
  const p = g.points; let n = 0, ridges = 0, shadows = 0;
  for (let k = 0; k < p.length; k++) {
    const a = p[Math.max(0, k - 1)], b = p[Math.min(p.length - 1, k + 1)], d = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(d > 0)) continue;
    const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d, q = p[k];
    const x1 = q.x + side * nx, y1 = q.y + side * ny, x2 = q.x - side * nx, y2 = q.y - side * ny;
    const l0 = at(L, w, h, q.x, q.y), l1 = at(L, w, h, x1, y1), l2 = at(L, w, h, x2, y2);
    n++;
    if (Math.min(l1, l2) - l0 >= ridge && Math.min(l1, l2) - l0 >= 0.5 * Math.abs(l1 - l2)) { ridges++; continue; }
    if (Math.abs(l1 - l2) < step) continue;
    // a shadow scales every channel alike: the spread of the dark side's per-channel ratio to the light side is small
    const [lx, ly, dx, dy] = l1 > l2 ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
    if (A && B && Math.hypot(at(A, w, h, lx, ly), at(B, w, h, lx, ly)) < minChroma) continue;
    const r = rgb.map(P => at(P, w, h, dx, dy) / Math.max(1e-3, at(P, w, h, lx, ly)));
    if (Math.max(...r) / Math.max(1e-3, Math.min(...r)) <= scaleSpread) shadows++;
  }
  return { ridge: n ? ridges / n : 0, shadow: n ? shadows / n : 0 };
}

// Box mean over a (2r+1)^2 window by an integral image.
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

/** Detail cells: trace density and local lightness spread both at or above their sheet quantile q (919ef52c). */
export function detailRegion(lines, L, w, h, { radius = 6, quantile = 0.8 } = {}) {
  const ink = new Float32Array(w * h);
  for (const g of lines) for (let k = 0; k < g.points.length; k++) {
    const p = g.points[k], q = g.points[Math.min(k + 1, g.points.length - 1)], steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y)));
    for (let s = 0; s < steps; s++) { const X = Math.round(p.x + (q.x - p.x) * s / steps), Y = Math.round(p.y + (q.y - p.y) * s / steps); if (X >= 0 && Y >= 0 && X < w && Y < h) ink[Y * w + X] = 1; }
  }
  const density = boxMean(ink, w, h, radius), mean = boxMean(L, w, h, radius), sq = boxMean(Float32Array.from(L, v => v * v), w, h, radius);
  const spread = Float32Array.from(mean, (m, i) => Math.sqrt(Math.max(0, sq[i] - m * m)));
  const qv = F => { const s = Float32Array.from(F).sort(); return s[Math.min(s.length - 1, Math.floor(quantile * s.length))]; };
  const dq = qv(density), cq = qv(spread);
  return Uint8Array.from(density, (d, i) => (d > 0 && d >= dq && spread[i] > 1e-6 && spread[i] >= cq ? 1 : 0));
}

/**
 * Clean a line set. `lines` plan-grid polylines; `target` { L, A, B, rgb, w, h } from the stage. `kind`:
 *   'drawing'  a selective drawing (a checked sketch, the sketch planner): shadow outlines go, small marks are pruned
 *   'trace'    a dense trace of a photograph: also the structure filter
 *   'pen'      a pen source's own lines, already an artist's selection: only specks, shadow outlines and near repeats
 *              go, every other line stays (no structure filter, no omission, no density cap)
 * @returns { lines, stats }
 */
export function cleanLines(lines, target, { mmPerCell, kind = 'trace', seed = 1, options = {} } = {}) {
  if (!['drawing', 'trace', 'pen'].includes(kind)) throw new Error(`cleanLines: drawing, trace or pen, not ${kind}`);
  const trace = kind === 'trace';
  if (kind === 'pen') options = { ...options, minMm: options.minMm ?? CLEANUP.penMinMm, prune: { keepAbove: -Infinity, tileInkMm: Infinity, minMm: CLEANUP.penMinMm, vary: 0, litWeight: 1, ...(options.prune ?? {}) } };
  const o = { ...CLEANUP, ...options, prune: { ...CLEANUP.prune, ...(options.prune ?? {}) } }, cells = mm => mm / mmPerCell, { w, h } = target;
  const stats = { in: lines.length, specks: 0, shadow: 0, structure: 0 };
  let kept = lines.filter(g => { if (pathLength(g.points) * mmPerCell < o.minMm) { stats.specks++; return false; } return true; });
  const longStraight = g => pathLength(g.points) >= cells(o.straightMm) && chordShare(g.points) >= o.straight;
  kept = kept.filter(g => {
    if (g.role === 'hatch' || longStraight(g)) return true;
    const pr = lineProfile(g, target, { side: Math.max(1, cells(o.sideMm)) });
    if (pr.shadow >= o.shadowShare && pr.ridge < o.ridgeShare) { stats.shadow++; return false; }
    return true;
  });
  if (trace) {
    const detail = detailRegion(kept, target.L, w, h, { radius: Math.max(2, Math.round(cells(o.detailRadiusMm))), quantile: o.detailQuantile });
    const inDetail = g => g.points.filter(q => at(detail, w, h, q.x, q.y)).length > g.points.length / 2;
    kept = kept.filter(g => { if (inDetail(g) || (pathLength(g.points) >= cells(o.structMm) && chordShare(g.points) >= o.structStraight)) return true; stats.structure++; return false; });
  }
  const groups = valueGroups(target.L, o);
  const withLength = kept.map(g => ({ ...g, length: pathLength(g.points) }));
  const r = prunePenLines(withLength, { w, h, mmPerCell, groups, seed, options: o.prune });
  return { lines: r.lines, stats: { ...stats, ...r.stats, kept: r.lines.length }, groups };
}
