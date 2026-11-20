// The chooser: the mark for a shape. A small or slender shape is painted as ONE mark made by the brush's handling (a
// tapered stroke along a streak, a leaf for a leaf, a dot for a speck), not as an outline filled with lanes. Plan time
// only; a shape is cells of the plan's grid, never the target's pixels.
import { makeMark } from './kinds.mjs';
import { hash } from './hand.mjs';

/**
 * The geometry a mark is chosen by, from a shape's cells on a grid `gw` wide of `cellMm` cells: area (mm2), centre
 * (mm), the long axis's angle (radians from the sheet's x), length and mean width (mm), elongation, the spine (the
 * middle of the shape across its axis, in bins along it, running down or to the right as a hand pulls), how far the
 * spine bows from its chord (`bend`, mm, signed: + to the right of its direction), whether it bends both ways (`sBend`),
 * `taper` (-1..1: + when the shape is wider at the spine's start than at its end) and `ends` (the ends' width
 * against the widest: near 1 for a bar).
 */
export function shapeGeometry(cells, gw, cellMm) {
  const n = cells.length; let mx = 0, my = 0;
  for (const q of cells) { mx += q % gw + 0.5; my += Math.floor(q / gw) + 0.5; } mx /= n; my /= n;
  let a = 0, b = 0, c = 0; for (const q of cells) { const dx = q % gw + 0.5 - mx, dy = Math.floor(q / gw) + 0.5 - my; a += dx * dx; b += dx * dy; c += dy * dy; }
  const th = 0.5 * Math.atan2(2 * b, a - c), ux = Math.cos(th), uy = Math.sin(th);
  let lo = Infinity, hi = -Infinity; const along = new Float64Array(n), across = new Float64Array(n);
  cells.forEach((q, i) => { const dx = q % gw + 0.5 - mx, dy = Math.floor(q / gw) + 0.5 - my; along[i] = dx * ux + dy * uy; across[i] = -dx * uy + dy * ux; if (along[i] < lo) lo = along[i]; if (along[i] > hi) hi = along[i]; });
  const length = (hi - lo + 1) * cellMm, areaMm2 = n * cellMm * cellMm, width = Math.max(cellMm, areaMm2 / length);
  const bins = Math.max(2, Math.min(16, Math.round(length / Math.max(width, 1)))), sum = new Float64Array(bins), cnt = new Float64Array(bins);
  for (let i = 0; i < n; i++) { const k = Math.min(bins - 1, Math.floor((along[i] - lo) / (hi - lo + 1e-9) * bins)); sum[k] += across[i]; cnt[k]++; }
  let spine = [], wid = [];
  for (let k = 0; k < bins; k++) if (cnt[k]) { const t = lo + (k + 0.5) / bins * (hi - lo), s = sum[k] / cnt[k]; spine.push([(mx + ux * t - uy * s) * cellMm, (my + uy * t + ux * s) * cellMm]); wid.push(cnt[k] / Math.max(1, (hi - lo + 1) / bins)); }
  // the spine runs down or to the right (a hand pulls a stroke towards itself)
  if (spine.length > 1 && (spine[0][1] > spine[spine.length - 1][1] + cellMm || (Math.abs(spine[0][1] - spine[spine.length - 1][1]) <= cellMm && spine[0][0] > spine[spine.length - 1][0]))) { spine.reverse(); wid.reverse(); }
  let bend = 0, pos = 0, neg = 0;
  if (spine.length > 2) {
    const [p0, p1] = [spine[0], spine[spine.length - 1]], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
    for (const p of spine) { const d = ((p[0] - p0[0]) * (p1[1] - p0[1]) - (p[1] - p0[1]) * (p1[0] - p0[0])) / L; if (Math.abs(d) > Math.abs(bend)) bend = -d; if (-d > 0.5 * cellMm) pos = Math.max(pos, -d); if (-d < -0.5 * cellMm) neg = Math.max(neg, d); }
  }
  const third = Math.max(1, Math.floor(wid.length / 3)), mean = v => v.reduce((s, x) => s + x, 0) / v.length;
  const w0 = mean(wid.slice(0, third)), w1 = mean(wid.slice(-third)), taper = wid.length > 2 ? (w0 - w1) / Math.max(w0, w1, 1e-9) : 0;
  // how full the ends are: the end bins' width against the widest (1 for a bar, small for a shape pointed at both ends)
  const ends = wid.length > 2 ? (wid[0] + wid[wid.length - 1]) / 2 / Math.max(...wid) : 0.5;
  return { areaMm2, cx: mx * cellMm, cy: my * cellMm, angle: th, length, width, elong: length / width, spine, bend, sBend: pos > 0.15 * width && neg > 0.15 * width, taper, ends };
}

/** Least sizes for the choice: a dot under this area (mm2); a stroke at least this long for its width; a fine line under this width (mm). */
const DOT_MM2 = 2.5, LONG = 2.6, THIN_MM = 1.1;

const headingOf = spine => Math.atan2(spine[spine.length - 1][1] - spine[0][1], spine[spine.length - 1][0] - spine[0][0]);
const midOf = spine => { const a = spine[0], b = spine[spine.length - 1]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };

/**
 * The mark for one shape. `g` is shapeGeometry's result, or the same fields given directly ({ cx, cy, length, width,
 * angle, areaMm2?, spine?, bend?, sBend?, taper?, ends?, edge? }). Options: `what` (what the shape is: 'foliage', 'leaf',
 * 'grass', 'branch', 'twig', 'shadow', 'edge' or ''), `edge` ('crisp' or 'soft'), `kit` (the round widths at hand, mm),
 * `seed`, `load`. Returns { name, params, strokes } with params the maker's options (makeMark(name, params) remakes it).
 */
export function markFor(g, { what = '', edge = g.edge ?? '', kit = [1, 2, 4, 8], seed = 0, load } = {}) {
  const fit = w => kit.reduce((best, k) => (Math.abs(k - w) < Math.abs(best - w) ? k : best), kit[0]);
  const area = g.areaMm2 ?? g.length * g.width, elong = g.elong ?? g.length / Math.max(1e-6, g.width);
  const spine = g.spine?.length > 1 ? g.spine : [[g.cx - Math.cos(g.angle) * g.length / 2, g.cy - Math.sin(g.angle) * g.length / 2], [g.cx + Math.cos(g.angle) * g.length / 2, g.cy + Math.sin(g.angle) * g.length / 2]];
  const [mx, my] = midOf(spine), heading = headingOf(spine), bendShare = (g.bend ?? 0) / Math.max(1e-6, g.length), taper = g.taper ?? 0;
  const bend = Math.max(-1, Math.min(1, bendShare * 4)) || 0;
  const out = (name, params) => ({ name, params, strokes: makeMark(name, params) });
  const base = { x: mx, y: my, angle: heading, seed, ...(load != null ? { load } : {}) };

  if (area < DOT_MM2) return out('dot', { ...base, x: g.cx, y: g.cy, length: 0.9 * Math.sqrt(area), width: Math.max(0.6, Math.min(fit(g.width), 1.3 * Math.sqrt(area))) });
  if ((what === 'foliage' || what === 'leaf') && area > 12) {
    // a leaf mass: one leaf touch for about each leaf's area, turned round the shape's axis
    const leafW = Math.max(1.2, Math.min(4, Math.sqrt(area) / 3)), n = Math.max(2, Math.min(40, Math.round(area / (2 * leafW * leafW)))), strokes = [];
    for (let k = 0; k < n; k++) {
      const t = (hash(seed, k, 1) - 0.5) * 0.9 * g.length, s = (hash(seed, k, 2) - 0.5) * 0.9 * g.width, a = g.angle + (hash(seed, k, 3) - 0.5) * 2.2;
      const x = g.cx + Math.cos(g.angle) * t - Math.sin(g.angle) * s, y = g.cy + Math.sin(g.angle) * t + Math.cos(g.angle) * s, wk = leafW * (0.7 + 0.6 * hash(seed, k, 4));
      strokes.push(...makeMark(hash(seed, k, 5) < 0.6 ? 'leaf' : 'touch', { x, y, angle: a, length: wk * (2 + 0.8 * hash(seed, k, 6)), width: wk, seed: seed * 97 + k, ...(load != null ? { load } : {}) }));
    }
    return { name: 'leaf', params: { ...base, x: g.cx, y: g.cy, length: g.length, width: leafW, count: n }, strokes };
  }
  if (elong >= LONG) {
    const len = g.length, ends = (wideFirst) => (wideFirst ? { x: mx, y: my, angle: heading } : { x: mx, y: my, angle: heading + Math.PI });
    if (what === 'grass') return out('grass', { ...base, ...ends(taper >= 0), length: len, width: fit(1.4 * g.width), bend: taper >= 0 ? bend : -bend });
    if (what === 'branch' || what === 'twig') return g.width <= THIN_MM ? out('line', { ...base, length: len, width: g.width, bend }) : out('branch', { ...base, ...ends(taper >= 0), length: len, width: fit(1.3 * g.width), bend: taper >= 0 ? bend : -bend });
    if (g.width <= THIN_MM) return Math.abs(bendShare) < 0.03 && len > 6 && (what === 'edge' || edge === 'crisp') ? out('edge', { ...base, length: len, width: g.width }) : out('line', { ...base, length: len, width: g.width, bend });
    const w = Math.min(1.25 * g.width, kit[kit.length - 1]);
    if (g.sBend) return out('s-stroke', { ...base, length: len, width: w, bend: bend || 0.6 });
    // one end clearly wider: land pressed on it and draw out to the point (a belly-first stroke)
    if (Math.abs(taper) > 0.3) return out('reverse', { ...base, ...ends(taper > 0), length: len, width: w, bend: taper > 0 ? bend : -bend });
    if (Math.abs(bendShare) > 0.12 && (edge === 'crisp' || what === 'edge')) return out('contour', { ...base, length: len * 1.05, width: w, bend });
    // full to both ends (a bar of shadow, a stalk): pressed at each end, the tip hidden
    if ((g.ends ?? 0) > 0.75) return out('bar', { ...base, length: len, width: Math.min(g.width, kit[kit.length - 1]), bend });
    if (elong >= 7) return out('swell', { ...base, length: len, width: w, bend });
    if (elong < 4) return out('leaf', { ...base, length: len, width: w * 1.05, bend });
    return out('taper', { ...base, length: len, width: w, bend });
  }
  if (area <= 40) {
    if (elong < 1.4 && edge === 'crisp') return out('wedge', { ...base, x: g.cx, y: g.cy, angle: g.angle, length: 0.8 * Math.min(g.length, g.width), width: Math.max(g.length, g.width) });
    return out(elong < 2 ? 'touch' : 'leaf', { ...base, x: g.cx, y: g.cy, angle: g.angle, length: Math.max(g.length, 1.2 * g.width), width: Math.max(0.8, g.width * 1.05), bend });
  }
  // a larger compact shape: broad strokes along its axis, side by side across it, each landing and lifting
  const wB = fit(Math.min(g.width / 1.6, 12)), n = Math.max(2, Math.min(6, Math.round(g.width / (0.8 * wB)))), strokes = [];
  for (let k = 0; k < n; k++) {
    const s = ((k + 0.5) / n - 0.5) * (g.width - 0.6 * wB), t = (hash(seed, k, 6) - 0.5) * 0.1 * g.length, len = g.length * (0.82 + 0.12 * hash(seed, k, 7));
    strokes.push(...makeMark(edge === 'soft' ? 'taper' : 'sweep', { x: g.cx - Math.sin(g.angle) * s + Math.cos(g.angle) * t, y: g.cy + Math.cos(g.angle) * s + Math.sin(g.angle) * t, angle: g.angle, length: Math.max(wB, len - wB), width: wB, seed: seed * 13 + k, ...(load != null ? { load } : {}) }));
  }
  return { name: 'sweep', params: { ...base, x: g.cx, y: g.cy, angle: g.angle, length: g.length, width: wB, count: n }, strokes };
}
