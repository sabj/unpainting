// A vocabulary of brush marks: each a way of handling the brush (its path, the pressure and the hand's speed along it,
// the brush and how a flat is held, the load), not a fill. A brush makes a great many shapes with the right handling: a
// round landed on its point, swelled and lifted is a tapered stroke; pressed and lifted it is a leaf; a flat drawn along
// its edge is a hairline and pulled sideways a wedge. `markFor` chooses the mark from the shape to be painted (its size,
// length, direction and what it is), so a small shape is ONE well-chosen mark and not a filled outline.
//
// A mark is a plan stroke (src/paint/methods/study-washes.mjs, laid by tools/plate/paint.mjs): { kind: 'sweep',
// radiusMm, points: [[x, y, pressure, speed mm/s, radius share]], flat, angle (a flat's blade to its heading, degrees),
// charge (its load against the wash's), mark (the vocabulary's name) }. Millimetres on the sheet. The section brush
// (src/media/tuft-section.mjs) reads pressure as how much of the tuft lies down, speed as the time each step's film has
// to level, and the radius share as the belly's width there.
// Plan time only.

/** The marks, with what each is for (the test sheet's labels and the crop sheet's legend). */
export const MARKS = Object.freeze({
  sweep: 'broad wash sweep: belly down, even pressure, slow, the bead carried',
  taper: 'tapered stroke: lands on the point, swells, lifts',
  leaf: 'leaf or petal: pressed and lifted',
  comma: 'comma: pressed and flicked off round a curve',
  line: 'long thin line: the point, light and quick',
  edge: 'flat on edge: a hairline drawn along the blade',
  wedge: 'wedge: a flat pulled sideways, lifting off one corner',
  push: 'pushed stroke: the hairs splay, slow and heavy',
  twist: 'twist: a flat turned in the hand, thin to thick to thin',
  drag: 'side drag: a nearly dry brush rolled on its side, fast, broken on the tooth',
  dot: 'dot: a touch of the point',
  contour: 'contour: follows an edge, crisp on its outer side',
  scumble: 'scumble: short overlapping strokes in turning directions',
});

/** A hash of integers, 0..1 (fixed: a mark's irregularity is its own, not random at each run). */
function hash(a, b = 0, c = 0) {
  let x = Math.imul((a | 0) * 73856093 ^ (b | 0) * 19349663 ^ (c | 0) * 83492791, 2654435761) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

const r3 = v => +v.toFixed(3);
const pt = (x, y, p, v, s = 1) => [r3(x), r3(y), r3(Math.max(0.02, p)), Math.round(v), r3(s)];
/** Points along a polyline [[x, y]] every `step` mm, with u (0..1 of its length) for each. */
function resample(path, step) {
  const seg = []; let total = 0;
  for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(l); total += l; }
  if (!(total > 0)) return [{ x: path[0][0], y: path[0][1], u: 0 }];
  const n = Math.max(2, Math.ceil(total / step)), out = [];
  let i = 0, acc = 0;
  for (let k = 0; k <= n; k++) {
    const d = total * k / n; while (i < seg.length - 1 && acc + seg[i] < d) { acc += seg[i]; i++; }
    const t = seg[i] > 0 ? (d - acc) / seg[i] : 0, a = path[i], b = path[i + 1] ?? a;
    out.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, u: k / n });
  }
  return out;
}
/** A slightly irregular path: the hand's own wobble, a share of the width across the heading (seeded). */
function wobble(pts, amp, seed) {
  if (!(amp > 0) || pts.length < 3) return pts;
  const ph = 6.283 * hash(seed, 1), f = 1 + 1.5 * hash(seed, 2);
  return pts.map((q, k) => {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], tl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const o = amp * Math.sin(ph + f * 3.14 * q.u) * Math.sin(3.14 * q.u);
    return { ...q, x: q.x - (b.y - a.y) / tl * o, y: q.y + (b.x - a.x) / tl * o };
  });
}
const mark = (name, radiusMm, points, extra = {}) => ({ kind: 'sweep', mark: name, radiusMm: r3(radiusMm), points, ...extra });
/** A straight path of length `len` through (cx, cy) at angle `a` (radians). */
const through = (cx, cy, a, len) => [[cx - Math.cos(a) * len / 2, cy - Math.sin(a) * len / 2], [cx + Math.cos(a) * len / 2, cy + Math.sin(a) * len / 2]];

/** A broad wash sweep from a to b: belly down, even pressure, slow, so the bead is carried. With `flat`, a flat held square. */
export function sweep(a, b, widthMm, { flat = false, seed = 0, pressure = 0.85 } = {}) {
  const r = widthMm / 2, pts = resample([a, b], Math.max(0.6, r / 2));
  return mark('sweep', r, pts.map(q => pt(q.x, q.y, (q.u < 0.08 ? 0.5 + 0.5 * q.u / 0.08 : 1) * pressure * (0.95 + 0.1 * hash(seed, Math.round(q.u * 8))), 35)), flat ? { flat: true, angle: 90 } : {});
}

/** A tapered stroke along `path` ([[x, y], ...]): lands on the point, swells to full width at `swell` of its length, lifts. */
export function taper(path, widthMm, { swell = 0.35, seed = 0, wob = 0.08 } = {}) {
  const r = widthMm / 2, pts = wobble(resample(path, Math.max(0.3, r / 2.5)), wob * widthMm, seed);
  return mark('taper', r, pts.map(q => pt(q.x, q.y, q.u < swell ? 0.12 + 0.88 * Math.sin(Math.PI / 2 * q.u / swell) : Math.cos(Math.PI / 2 * (q.u - swell) / (1 - swell)) ** 0.8, 70 + 80 * q.u)));
}

/** A leaf: pressed and lifted, about `len` long and `widthMm` wide at its belly, at angle `a` (radians). */
export function leaf(cx, cy, a, len, widthMm, { seed = 0 } = {}) {
  const r = widthMm / 2, bend = (hash(seed, 7) - 0.5) * 0.5 * widthMm, pts = resample(through(cx, cy, a, Math.max(len, 1.6 * widthMm)), Math.max(0.25, r / 3));
  return mark('leaf', r, pts.map(q => { const o = bend * Math.sin(Math.PI * q.u); return pt(q.x - Math.sin(a) * o, q.y + Math.cos(a) * o, Math.max(0.05, Math.sin(Math.PI * q.u) ** 0.6), 45); }));
}

/** A comma: pressed hard where it lands, flicked off round a curve (turning by `turn` radians). */
export function comma(cx, cy, a, len, widthMm, { turn = 1.2, seed = 0 } = {}) {
  const r = widthMm / 2, n = 10, out = [];
  let x = cx, y = cy, h = a; const dl = len / n;
  for (let k = 0; k <= n; k++) { const u = k / n; out.push(pt(x, y, u < 0.15 ? 0.6 + 0.4 * u / 0.15 : (1 - u) ** 1.3 + 0.03, 30 + 150 * u)); x += Math.cos(h) * dl; y += Math.sin(h) * dl; h += turn / n * (0.8 + 0.4 * hash(seed, k)); }
  return mark('comma', r, out);
}

/** A long thin line with the point: light pressure, quick, landing and lifting soft. */
export function line(path, widthMm, { seed = 0 } = {}) {
  const r = widthMm / 2, pts = wobble(resample(path, 0.4), 0.15 * widthMm, seed);
  return mark('line', r / 0.35, pts.map(q => pt(q.x, q.y, 0.35 * Math.min(1, 0.3 + q.u * 6, 0.3 + (1 - q.u) * 6), 120)));
}

/** A flat drawn along its own edge: a hairline the blade's thickness wide, as long as the path. */
export function edge(path, bladeMm, { seed = 0 } = {}) {
  const pts = wobble(resample(path, 0.4), 0.1, seed);
  return mark('edge', bladeMm / 2, pts.map(q => pt(q.x, q.y, 0.7 * Math.min(1, 0.4 + q.u * 8, 0.4 + (1 - q.u) * 8), 90)), { flat: true, angle: 0 });
}

/** A wedge: a flat of blade `widthMm` pulled sideways a short way along `a`, pressed at the start and lifting off one corner. */
export function wedge(cx, cy, a, len, widthMm, { seed = 0 } = {}) {
  const pts = resample(through(cx, cy, a, Math.max(0.6, len)), 0.3);
  return mark('wedge', widthMm / 2, pts.map(q => pt(q.x, q.y, 1 - 0.75 * q.u ** 1.5, 30, 1 - 0.55 * q.u * (0.8 + 0.4 * hash(seed, 3)))), { flat: true, angle: 90 });
}

/** A pushed stroke: the brush driven against its hairs, heavy and slow, so they splay and the end is ragged. */
export function push(path, widthMm, { seed = 0 } = {}) {
  const r = widthMm / 2, pts = wobble(resample(path, Math.max(0.3, r / 3)), 0.2 * widthMm, seed);
  return mark('push', r, pts.map(q => pt(q.x, q.y, 1.15 - 0.25 * q.u, 15, 1 + 0.35 * q.u * (0.7 + 0.6 * hash(seed, Math.round(q.u * 6))))));
}

/** A twist: a flat turned in the hand along the path, its blade thin at the ends and broad in the middle. */
export function twist(path, widthMm, { seed = 0 } = {}) {
  const pts = wobble(resample(path, 0.4), 0.06 * widthMm, seed);
  return mark('twist', widthMm / 2, pts.map(q => pt(q.x, q.y, 0.8, 60, 0.12 + 0.88 * Math.sin(Math.PI * q.u) ** 1.5)), { flat: true, angle: 90 });
}

/** A side drag: a nearly dry round laid on its side and pulled fast, so it catches only the tooth (broken texture). */
export function drag(path, widthMm, { seed = 0 } = {}) {
  const pts = wobble(resample(path, 0.5), 0.1 * widthMm, seed);
  return mark('drag', widthMm / 2, pts.map(q => pt(q.x, q.y, 0.45 * Math.min(1, 0.4 + q.u * 5), 220)), { charge: 0.45, dry: true });
}

/** A dot: the point touched down and lifted, the hand barely moving. */
export function dot(cx, cy, widthMm, { seed = 0 } = {}) {
  const a = 6.283 * hash(seed, 9), d = 0.15 * widthMm;
  return mark('dot', widthMm / 1.6, [pt(cx - Math.cos(a) * d, cy - Math.sin(a) * d, 0.05, 8), pt(cx, cy, 1, 8), pt(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.05, 8)]);
}

/** A contour stroke along an edge ([[x, y]] on the edge, the shape on the left of its direction): the brush runs a
 *  half-width inside, so its outer side is the edge, crisp, and its inner side is where it lifts into the shape. */
export function contour(path, widthMm, { seed = 0 } = {}) {
  const r = widthMm / 2, pts = resample(path, Math.max(0.3, r / 3)), inset = 0.8 * r;
  const out = pts.map((q, k) => { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], tl = Math.hypot(b.x - a.x, b.y - a.y) || 1; return pt(q.x + (b.y - a.y) / tl * inset, q.y - (b.x - a.x) / tl * inset, Math.min(1, 0.3 + q.u * 5, 0.25 + (1 - q.u) * 4) * 0.85, 50); });
  return mark('contour', r, out);
}

/** A scumble: `n` short strokes over a patch `sizeMm` across, each its own direction, overlapping unevenly. */
export function scumble(cx, cy, sizeMm, widthMm, { n = 5, seed = 0 } = {}) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = 6.283 * hash(seed, k, 1), d = 0.35 * sizeMm * hash(seed, k, 2), ox = cx + Math.cos(6.283 * hash(seed, k, 3)) * d, oy = cy + Math.sin(6.283 * hash(seed, k, 3)) * d;
    const s = taper(through(ox, oy, a, sizeMm * (0.35 + 0.3 * hash(seed, k, 4))), widthMm * (0.7 + 0.5 * hash(seed, k, 5)), { seed: seed * 31 + k, swell: 0.3 });
    out.push({ ...s, mark: 'scumble' });
  }
  return out;
}

/**
 * The geometry a mark is chosen by, from a shape's cells on a grid of `cellMm` cells: area (mm2), centre (mm), long axis
 * angle (radians, from the sheet's x), length and width along and across it (mm), elongation, the axis as a polyline
 * through the shape's middle (its spine: the mean across-position at each step along), and how much it bends.
 */
export function shapeGeometry(cells, gw, cellMm) {
  const n = cells.length; let mx = 0, my = 0;
  for (const q of cells) { mx += q % gw + 0.5; my += Math.floor(q / gw) + 0.5; } mx /= n; my /= n;
  let a = 0, b = 0, c = 0; for (const q of cells) { const dx = q % gw + 0.5 - mx, dy = Math.floor(q / gw) + 0.5 - my; a += dx * dx; b += dx * dy; c += dy * dy; }
  const th = 0.5 * Math.atan2(2 * b, a - c), ux = Math.cos(th), uy = Math.sin(th);
  let lo = Infinity, hi = -Infinity; const along = new Float64Array(n), across = new Float64Array(n);
  cells.forEach((q, i) => { const dx = q % gw + 0.5 - mx, dy = Math.floor(q / gw) + 0.5 - my; along[i] = dx * ux + dy * uy; across[i] = -dx * uy + dy * ux; if (along[i] < lo) lo = along[i]; if (along[i] > hi) hi = along[i]; });
  const length = (hi - lo + 1) * cellMm, areaMm2 = n * cellMm * cellMm, width = Math.max(cellMm, areaMm2 / length);
  // the spine: the middle of the shape across its axis, in bins along it
  const bins = Math.max(2, Math.min(12, Math.round(length / Math.max(width, 1)))), sum = new Float64Array(bins), cnt = new Float64Array(bins);
  for (let i = 0; i < n; i++) { const k = Math.min(bins - 1, Math.floor((along[i] - lo) / (hi - lo + 1e-9) * bins)); sum[k] += across[i]; cnt[k]++; }
  const spine = []; for (let k = 0; k < bins; k++) if (cnt[k]) { const t = lo + (k + 0.5) / bins * (hi - lo), s = sum[k] / cnt[k]; spine.push([(mx + ux * t - uy * s) * cellMm, (my + uy * t + ux * s) * cellMm]); }
  let bend = 0; if (spine.length > 2) { const [p0, p1] = [spine[0], spine[spine.length - 1]], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1; for (const p of spine) bend = Math.max(bend, Math.abs((p[0] - p0[0]) * (p1[1] - p0[1]) - (p[1] - p0[1]) * (p1[0] - p0[0])) / L); }
  // the spine runs down or to the right (a hand pulls a stroke towards itself)
  if (spine.length > 1 && (spine[0][1] > spine[spine.length - 1][1] + 0.5 * cellMm * 2 || (Math.abs(spine[0][1] - spine[spine.length - 1][1]) <= cellMm && spine[0][0] > spine[spine.length - 1][0]))) spine.reverse();
  return { areaMm2, cx: mx * cellMm, cy: my * cellMm, angle: th, length, width, elong: length / width, spine, bend };
}

/** Least sizes for the choice: a dot under this area (mm2); a stroke at least this long for its width; a leaf mass's leaf length (mm). */
const DOT_MM2 = 2.5, LONG = 2.6, THIN_MM = 1.1;

/**
 * The mark (or few marks) for one shape: `g` from shapeGeometry; `what` 'foliage', 'shadow' or ''; `kit` the round
 * widths available (mm, small to large); `seed` fixes its irregularity. Returns { name, strokes }.
 * - a speck: a dot;
 * - a long thin shape (a bar, a crack, a twig): a line with the point, or a flat on edge if very thin and straight;
 * - a long shape: one tapered stroke along its spine (a shadow streak, a mullion's shade), its brush its width;
 * - foliage: leaf marks at varied angles over the shape, about one for each leaf's area, turned round the shape's axis;
 * - a compact small shape (a pane, a stone): one pressed touch (a leaf of its own size), or a wedge if squarish and flat-edged;
 * - a larger compact shape: two or three broad strokes across it in its own direction.
 */
export function markFor(g, { what = '', kit = [1, 2, 4, 8], seed = 0 } = {}) {
  const fit = w => kit.reduce((best, k) => (Math.abs(k - w) < Math.abs(best - w) ? k : best), kit[0]);
  if (g.areaMm2 < DOT_MM2) return { name: 'dot', strokes: [dot(g.cx, g.cy, Math.max(0.6, Math.min(fit(g.width), 1.4 * Math.sqrt(g.areaMm2))), { seed })] };
  if (what === 'foliage' && g.areaMm2 > 12) {
    const leafW = Math.max(1.2, Math.min(4, 0.5 * Math.sqrt(g.areaMm2) / 1.5)), leafA = 1.6 * leafW * leafW, n = Math.max(2, Math.min(40, Math.round(g.areaMm2 / leafA))), out = [];
    for (let k = 0; k < n; k++) {
      const t = (hash(seed, k, 1) - 0.5) * 0.9 * g.length, s = (hash(seed, k, 2) - 0.5) * 0.9 * g.width, a = g.angle + (hash(seed, k, 3) - 0.5) * 2.2;
      const x = g.cx + Math.cos(g.angle) * t - Math.sin(g.angle) * s, y = g.cy + Math.sin(g.angle) * t + Math.cos(g.angle) * s, wk = leafW * (0.7 + 0.6 * hash(seed, k, 4));
      out.push(leaf(x, y, a, wk * (1.6 + 0.8 * hash(seed, k, 5)), wk, { seed: seed * 97 + k }));
    }
    return { name: 'leaf', strokes: out };
  }
  if (g.elong >= LONG) {
    if (g.width <= THIN_MM) return g.bend < 0.4 && g.length > 6 ? { name: 'edge', strokes: [edge(g.spine, g.width, { seed })] } : { name: 'line', strokes: [line(g.spine, g.width, { seed })] };
    // the stroke's belly a little wider than the shape's mean width (a taper is narrower than its belly over most of its length)
    return { name: 'taper', strokes: [taper(g.spine, Math.min(1.25 * g.width, kit[kit.length - 1]), { seed, swell: what === 'shadow' ? 0.25 : 0.35 })] };
  }
  if (g.areaMm2 <= 40) {
    if (g.elong < 1.4 && what !== 'shadow' && hash(seed, 11) < 0.35) return { name: 'wedge', strokes: [wedge(g.cx, g.cy, g.angle + Math.PI / 2, 0.8 * Math.min(g.length, g.width), Math.max(g.length, g.width), { seed })] };
    return { name: 'leaf', strokes: [leaf(g.cx, g.cy, g.angle, g.length, Math.max(0.8, g.width * 1.05), { seed })] };
  }
  // a larger compact shape: broad strokes along its axis, side by side across it, each tapered
  const wB = fit(Math.min(g.width / 1.6, 12)), n = Math.max(2, Math.min(5, Math.round(g.width / (0.8 * wB)))), out = [];
  for (let k = 0; k < n; k++) {
    const s = ((k + 0.5) / n - 0.5) * (g.width - 0.6 * wB), t = (hash(seed, k, 6) - 0.5) * 0.1 * g.length, len = g.length * (0.82 + 0.12 * hash(seed, k, 7));
    const x = g.cx - Math.sin(g.angle) * s + Math.cos(g.angle) * t, y = g.cy + Math.cos(g.angle) * s + Math.sin(g.angle) * t;
    out.push(taper(through(x, y, g.angle, Math.max(wB, len - wB)), wB, { seed: seed * 13 + k, swell: 0.2 }));
  }
  return { name: 'sweep', strokes: out };
}
