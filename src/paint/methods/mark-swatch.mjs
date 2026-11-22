// The scrap swatch for a passage of separate marks (touches, strokes, lines with the point). The wash swatch
// (scrap-swatch.mjs) is overlapping lanes of the plan's main brush across a square, and says what a wash delivers; a
// short mark of another brush lands on its tip, bears down and lifts within a few millimetres, and what it leaves is not
// what a lane leaves (touches read 0.5 of their planned pigment charged from the lane swatch). So a mark passage is tried
// on scrap as itself: its own brush, a stroke of its own length and pressures, laid apart with no neighbour, dried, and
// read where the mark laid its paint (its core: the darker half of its planned footprint), so the body of a mark
// lands at the mix's planned film. Nothing here reads the sheet or the subject.
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness } from '../../media/sheet.mjs';
import { SWATCH } from './scrap-swatch.mjs';

/** The passage kinds laid as separate marks (a painting script's strokes, touches and lines with the point). */
const MARK_KINDS = new Set(['strokes', 'touches', 'lines']);
/** Whether a planned shape is a passage of separate marks, charged from a swatch of its own mark. */
export const isMarkPassage = sh => MARK_KINDS.has(sh?._valuePlan?.kind) && Array.isArray(sh._valuePlan.strokes);
/** The half-width a round lays at pressure p, as the plan draws its footprint: r (0.25 + 0.75 p). */
export const pressedRadius = (r, p) => r * (0.25 + 0.75 * Math.min(1, Math.max(0, p ?? 1)));

const lengthOf = P => { let s = 0; for (let k = 1; k < P.length; k++) s += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); return s; };

/**
 * The mark that stands for a passage's strokes ({radiusMm, points: [[x, y, pressure], ...]} in mm): the stroke of median
 * length, moved to start at the origin. `null` when the passage has no stroke of two points.
 */
export function representativeMark(strokes) {
  const list = (strokes ?? []).filter(st => st?.points?.length >= 2 && st.radiusMm > 0).map(st => ({ st, len: lengthOf(st.points) })).sort((a, b) => a.len - b.len);
  if (!list.length) return null;
  const { st, len } = list[list.length >> 1], [x0, y0] = st.points[0];
  const points = st.points.map(q => [q[0] - x0, q[1] - y0, Math.max(0.05, Math.min(1.2, q[2] ?? 1))]);
  return { radiusMm: st.radiusMm, lengthMm: len, pressure: points.reduce((a, q) => a + q[2], 0) / points.length, points };
}

/** A mark's key for a kept reading: brush width to half a millimetre, length to a step of a third, pressure to 0.2. */
export function markKey(mark) {
  const step = (v, by) => Math.round(v / by) * by;
  return `mark|r${step(mark.radiusMm, 0.25).toFixed(2)}|l${(1.33 ** Math.round(Math.log(Math.max(0.2, mark.lengthMm)) / Math.log(1.33))).toFixed(1)}|p${step(mark.pressure, 0.2).toFixed(1)}|d${swatchDepth(mark.depth).toFixed(1)}`;
}
/** How deep a passage's marks overlap, as its swatch is laid: apart (1) under 1.25, else to the nearest half, at most 4. */
const swatchDepth = depth => (!(depth >= 1.25) ? 1 : Math.min(4, Math.round(depth * 2) / 2));

/** The planned footprint of a path on a grid: each point's round, r (0.25 + 0.75 p), joined along the stroke (script-washes.mjs footprint). */
function footprintCells(path, w, h) {
  const m = new Uint8Array(w * h);
  for (let k = 0; k < path.length; k++) {
    const a = path[k], b = path[Math.min(path.length - 1, k + 1)], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.75));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, R = Math.max(0.5, pressedRadius(a.r, a.p + (b.p - a.p) * t));
      for (let yy = Math.max(0, Math.floor(y - R)); yy <= Math.min(h - 1, Math.ceil(y + R)); yy++) for (let xx = Math.max(0, Math.floor(x - R)); xx <= Math.min(w - 1, Math.ceil(x + R)); xx++) if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= R * R) m[yy * w + xx] = 1;
    }
  }
  return m;
}

/**
 * The mark set out on the scrap, each copy with the mark's own points and pressures, on scrap cells `mm` millimetres
 * wide (the sheet's, or larger when the mark would not fit: the brush lays the same paint a millimetre at any cell
 * size). A passage whose marks lie apart (mark.depth about 1) is laid as copies apart, a brush's width of dry paper
 * between them, at most four. A passage whose marks overlap into a mass (depth above 1.25: that many marks deep over
 * its footprint) is laid as copies stepped across one another so they overlap as deep, each into the last while it is
 * wet, since paint laid into a wet mark does not add as dry layers do. Returns {paths, mask, mm, copies, cover}; paths
 * are in scrap cells; cover is the copies' own depth over their joint footprint (what the charge is divided by).
 */
export function markLayout(mark, sheetMm) {
  const { width: SW, height: SH, x0, y0, x1, y1 } = SWATCH, span = Math.min(x1 - x0, y1 - y0);
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const [x, y] of mark.points) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
  const r = mark.radiusMm, wMm = bx1 - bx0 + 2 * r, hMm = by1 - by0 + 2 * r;
  if (!(sheetMm > 0)) throw new RangeError('mark swatch: the sheet has no millimetres a cell');
  const depth = swatchDepth(mark.depth), mm = Math.max(sheetMm, Math.max(wMm, hMm) / span), wC = wMm / mm, hC = hMm / mm, tall = wC >= hC, narrow = tall ? hC : wC;
  // the mark's own pressed width across its narrow way (its footprint is narrower than the brush where it is pressed lightly)
  const pressed = 2 * pressedRadius(r, mark.pressure) / mm;
  const pitch = depth > 1 ? Math.max(0.5, pressed / depth) : narrow + r / mm;
  const copies = depth > 1 ? Math.max(2, Math.min(10, Math.floor((span - narrow) / pitch) + 1)) : Math.max(1, Math.min(4, Math.floor((span + r / mm) / pitch)));
  const run = (copies - 1) * pitch + narrow, paths = [], mask = new Uint8Array(SW * SH);
  let sum = 0;
  for (let c = 0; c < copies; c++) {
    const ox = x0 + (tall ? (span - wC) / 2 : (span - run) / 2 + c * pitch) + (r - bx0) / mm, oy = y0 + (tall ? (span - run) / 2 + c * pitch : (span - hC) / 2) + (r - by0) / mm;
    const path = mark.points.map(([x, y, p]) => ({ x: ox + x / mm, y: oy + y / mm, r: Math.max(0.5, r / mm), p, round: true }));
    const m = footprintCells(path, SW, SH); for (let i = 0; i < m.length; i++) if (m[i]) { mask[i] = 1; sum++; }
    paths.push(path);
  }
  const union = mask.reduce((a, v) => a + v, 0);
  return { paths, mask, mm, copies, cover: union ? sum / union : 1 };
}

/**
 * Lay a mark's swatch and read it. `T`: the passage's technique (its water, passes, whether it goes into wet); `env`:
 * paths and mask (markLayout), pigment, physics, paperOptions, charge (the concentration that should lay SWATCH.want),
 * upright, water(T), paintBrush(r, T), dip, stroke, step, dry, and prepareBed/settle for a mark laid into wet (as
 * scrap-swatch.mjs). Returns {delivered, whole, coverage, covered}: the core's thickness over want (the darker half of the
 * planned footprint), the whole footprint's, the share of the footprint the mark's paint covers (cells holding at
 * least a quarter of the core's film), and the mean film over those covered cells, over want. The caller charges a passage so its
 * planned footprint holds the planned paint, reckoning the footprint as no less covered than a floor (tools/plate/sheet.mjs).
 */
export function markDelivery(T, { mask, paths, pigment, physics, paperOptions, charge, upright, water, paintBrush, dip, stroke, step, dry, prepareBed = null, settle = null }) {
  if (!Number.isInteger(T.passes) || T.passes < 1) throw new RangeError(`mark swatch: ${T.name} needs a whole number of passes, got ${T.passes}`);
  const { width: SW, height: SH, want } = SWATCH;
  const scrap = createSheet(makePaper(SW, SH, paperOptions), [pigment]);
  for (const pts of paths) {
    const r = Math.max(0.5, ...pts.map(p => p.r));
    if (T.intoWet) {
      if (!prepareBed) throw new Error(`mark swatch: ${T.name} is laid into wet and no bed can be prepared on the scrap`);
      const before = settle ? Float32Array.from(scrap.W) : null;
      prepareBed(scrap, pts, r, T);
      if (settle) { const cells = []; for (let i = 0; i < scrap.W.length; i++) if (scrap.W[i] > before[i]) cells.push(i); if (cells.length) settle(scrap, cells); }
    }
    const b = paintBrush(r, T);
    dip(b, { water: water(T), conc: [charge] });
    for (let q = 0; q < T.passes; q++) stroke(b, scrap, pts, { upright, between: st => { if (st % 24 === 0) step(scrap, physics); } });
  }
  for (let q = 0; q < 60; q++) step(scrap, physics);
  dry(scrap, 20000, physics, { levelMax: 400, dt: 4 });
  return readMark(thickness(scrap)[0], mask, want);
}

/** A dried mark swatch read over its planned footprint: see markDelivery. */
export function readMark(th, mask, want) {
  const v = []; for (let i = 0; i < mask.length; i++) if (mask[i]) v.push(th[i]);
  if (!v.length) throw new Error('mark swatch: the mark has no footprint on the scrap');
  v.sort((a, b) => b - a);
  const half = Math.max(1, v.length >> 1), core = v.slice(0, half).reduce((a, x) => a + x, 0) / half, whole = v.reduce((a, x) => a + x, 0) / v.length;
  const lies = core > 0 ? v.filter(x => x >= 0.25 * core) : [];
  return { delivered: core / want, whole: whole / want, coverage: lies.length / v.length, covered: lies.length ? lies.reduce((a, x) => a + x, 0) / lies.length / want : 0 };
}
