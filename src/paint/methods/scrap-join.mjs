// The scrap test a painter makes before trusting a wash to more than one stroke: two strokes of one charge laid side
// by side without drying between them, left to dry, and read across the join. If the join shows as a pale slit or a
// dark stripe, a passage of many strokes dries as a mosaic of bars; if it cannot be found, the strokes have fused.
// The brush, the dip, the stroke and the drying are the caller's own (as in scrap-swatch.mjs), so the join is laid with
// exactly the instruments a sheet is painted with. Nothing here reads a sheet being painted, or a target.
//
// The pass mark, fixed before any run (~/wt/final/design-0.3.2-strokes.md, section 8):
//   1. every row of the join lies inside the range the two strokes' own bodies span (the join is no lighter than the
//      lightest row of a body and no darker than the darkest), and
//   2. the pigment that left the two brushes is the pigment on the paper.
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness, totals } from '../../media/sheet.mjs';

/**
 * The rows of a two-stroke scrap, all in cells across the strokes. Stroke A lies above stroke B.
 * `half`: the half-width the brush lays at this pressure. `edge`: how far in from its side a stroke's paint is ragged
 * (the brush's own fringe and wander). `overlap`: the share of a stroke's width the second stroke lays over the
 * first (0 butts them side to side).
 * The join is every row either stroke's ragged inner edge reaches, with all the overlap between. A body is the
 * middle half of what is left of a stroke between the join and its outer side, so neither the join nor the outer
 * edge, where any wash dries a little darker, is counted as body.
 */
export function joinRows({ half, edge, overlap = 0, margin }) {
  if (!(half > 0) || !(edge >= 0) || !(overlap >= 0 && overlap < 1) || !(margin >= 0)) throw new RangeError('scrap join: half, edge, overlap and margin must be a brush, its fringe, a share under 1 and a border');
  const pitch = 2 * half * (1 - overlap), yA = margin + half, yB = yA + pitch;
  const j0 = Math.floor(yB - half - edge), j1 = Math.ceil(yA + half + edge);   // the join: first and last row
  const a0 = yA - half, a1 = j0, b0 = j1 + 1, b1 = yB + half;                  // what is left of each stroke
  const middle = (lo, hi) => [Math.ceil(lo + (hi - lo) / 4), Math.floor(hi - (hi - lo) / 4)];
  const bodyA = middle(a0, a1), bodyB = middle(b0, b1);
  if (bodyA[1] - bodyA[0] < 2 || bodyB[1] - bodyB[0] < 2) throw new RangeError('scrap join: the strokes are too narrow to have a body beside the join');
  return { pitch, yA, yB, join: [j0, j1], bodyA, bodyB, height: Math.ceil(yB + half + margin) };
}

/**
 * Lay the two strokes and read the join.
 * @param {object} env half, edge, overlap: see joinRows. length: the strokes' length in cells. pigment, physics,
 *   paperOptions: the scrap. brush(seed): a loaded-brush maker; loaded(brush): the pigment a brush holds;
 *   dipBrush(brush): the caller's dip. path(x0, x1, y): the caller's stroke path. stroke, step, dry: the caller's
 *   instruments. flowEvery: brush steps between flows while a stroke is laid; settle: flows before the drying starts.
 * @returns {{ profile: Float64Array, rows: object, body: { min: number, max: number, mean: number },
 *   join: { min: number, max: number }, given: number, onSheet: number, fused: boolean, conserved: boolean }}
 *   profile: dried pigment per cell, row by row, averaged along the middle half of the strokes' length.
 */
export function scrapJoin({ half, edge, overlap = 0, length, pigment, physics, paperOptions, brush, loaded, dipBrush, path, stroke, step, dry, flowEvery = 24, settle = 60, dryOptions = { levelMax: 400, dt: 4 } }) {
  const margin = Math.ceil(half + edge + 8), rows = joinRows({ half, edge, overlap, margin });
  const w = Math.ceil(length + 2 * margin), h = rows.height, x0 = margin, x1 = margin + length;
  const sheet = createSheet(makePaper(w, h, paperOptions), [pigment]);
  let given = 0;
  for (const [y, seed] of [[rows.yA, 1], [rows.yB, 2]]) {
    const b = brush(seed); dipBrush(b);
    const before = loaded(b);
    stroke(b, sheet, path(x0, x1, y), { between: st => { if (flowEvery > 0 && st % flowEvery === 0) step(sheet, physics); } });
    given += before - loaded(b);
  }
  for (let q = 0; q < settle; q++) step(sheet, physics);
  dry(sheet, 20000, physics, dryOptions);
  const th = thickness(sheet)[0], c0 = Math.ceil(x0 + length / 4), c1 = Math.floor(x1 - length / 4), profile = new Float64Array(h);
  for (let y = 0; y < h; y++) { let s = 0; for (let x = c0; x <= c1; x++) s += th[y * w + x]; profile[y] = s / (c1 - c0 + 1); }
  const span = (lo, hi, into = { min: Infinity, max: -Infinity, sum: 0, n: 0 }) => { for (let y = lo; y <= hi; y++) { into.min = Math.min(into.min, profile[y]); into.max = Math.max(into.max, profile[y]); into.sum += profile[y]; into.n++; } return into; };
  const b = span(...rows.bodyB, span(...rows.bodyA)), j = span(...rows.join);
  const body = { min: b.min, max: b.max, mean: b.sum / b.n }, join = { min: j.min, max: j.max };
  const onSheet = totals(sheet).pig[0];
  return { profile, rows, body, join, given, onSheet, fused: join.min >= body.min && join.max <= body.max, conserved: Math.abs(onSheet - given) <= 1e-4 * Math.max(1e-9, given) };
}
