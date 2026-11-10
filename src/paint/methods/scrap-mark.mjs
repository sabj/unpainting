// One straight stroke on scrap, dried and read as a mark: how wide it is, how its two ends are shaped and how much
// paint its body holds. A painter knows a brush by the mark it leaves; a stroke planner that lays marks side by side
// and end to end has to know the same things. The brush, the dip, the stroke and the drying are the caller's own
// (as in scrap-swatch.mjs). Nothing here reads a sheet being painted, or a target.
//
// The pass marks for a round brush, fixed before any run (~/wt/final/design-0.3.2-strokes.md, sections 6 and 8):
//   width: at each pressure the mark is as wide as the planner takes it to be, 2 x half, give or take the brush's own
//     stated side wander and one cell;
//   ends: a round brush leaves a rounded or pointed end, not a square one. Over the last half-width of the mark the
//     paint fills no more of the end's box than midway between a half-disc (pi / 4) and a square (1);
//   delivery: the body holds the paint per cell that the reference brush lays from the same dip, within the scrap
//     swatch's own band of 0.9 to 1.1.
// The pass mark for any brush's stroke ends, fixed before any run (033 item 4, after the wet-fusion fix left dark dots
// at the ends of thin strokes):
//   ends: no end dries darker than the body's own range. The darkest cell within one mark-width of either end (the
//     end's box, out to the margin) holds no more pigment than the darkest cell of the body (every row, over the
//     middle half of the length), so a bead that dries as a dot at the lift or the landing fails, while the body's own
//     grain and rims set the range.
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness } from '../../media/sheet.mjs';

/** The largest share of its box an end may fill and still be nearer a half-disc than a square. */
export const ROUND_END_FILL = (1 + Math.PI / 4) / 2;

/**
 * @param {object} env half: the half-width the planner expects at this pressure, in cells. length: the stroke's length.
 *   pigment, physics, paperOptions: the scrap. brush(): a brush maker; dipBrush(brush); path(x0, x1, y); stroke, step,
 *   dry: the caller's instruments. flowEvery, settle: as in scrap-join.mjs.
 * @returns {{ width: number, body: number, startFill: number, endFill: number, extent: [number, number],
 *   pathX: [number, number], bodyPeak: number, startPeak: number, endPeak: number }} width: mean painted cells across the stroke over the middle half of its length. body:
 *   dried pigment per cell on the stroke's centre line there. startFill, endFill: the share of its box each end fills
 *   over the last half-width. bodyPeak, startPeak, endPeak: the darkest cell of the body and of each end's box (one
 *   mark-width in from the end, out to the sheet's edge). A cell is painted where it holds at least half the body's pigment, and the mark ends
 *   where it is first a tenth of its width across, so a stray speck beyond the end is not taken for the end.
 */
export function scrapMark({ half, length, pigment, physics, paperOptions, brush, dipBrush, path, stroke, step, dry, flowEvery = 24, settle = 60, dryOptions = { levelMax: 400, dt: 4 } }) {
  if (!(half > 0) || !(length >= 4 * half)) throw new RangeError('scrap mark: the stroke must be at least four half-widths long');
  const margin = Math.ceil(3 * half + 8), w = Math.ceil(length + 2 * margin), h = 2 * margin + 1, x0 = margin, x1 = margin + length, y = margin + 0.5;
  const sheet = createSheet(makePaper(w, h, paperOptions), [pigment]);
  const b = brush(); dipBrush(b);
  stroke(b, sheet, path(x0, x1, y), { between: st => { if (flowEvery > 0 && st % flowEvery === 0) step(sheet, physics); } });
  for (let q = 0; q < settle; q++) step(sheet, physics);
  dry(sheet, 20000, physics, dryOptions);
  const th = thickness(sheet)[0], c0 = Math.ceil(x0 + length / 4), c1 = Math.floor(x1 - length / 4), row = Math.floor(y);
  let body = 0, nb = 0; for (let x = c0; x <= c1; x++) for (let yy = row - 1; yy <= row + 1; yy++) { body += th[yy * w + x]; nb++; }
  body /= nb;
  const column = new Int32Array(w);
  for (let x = 0; x < w; x++) { let c = 0; for (let yy = 0; yy < h; yy++) if (th[yy * w + x] >= 0.5 * body) c++; column[x] = c; }
  let width = 0; for (let x = c0; x <= c1; x++) width += column[x]; width /= c1 - c0 + 1;
  if (!(width > 0)) throw new Error('scrap mark: the stroke left no paint');
  let lo = 0, hi = w - 1; while (lo < w && column[lo] < 0.1 * width) lo++; while (hi >= 0 && column[hi] < 0.1 * width) hi--;
  const cap = Math.max(1, Math.round(width / 2));
  const fill = from => { let c = 0; for (let x = from; x < from + cap; x++) c += column[x]; return c / (cap * width); };
  const peak = (xa, xb) => { let m = 0; for (let x = Math.max(0, xa); x <= Math.min(w - 1, xb); x++) for (let yy = 0; yy < h; yy++) m = Math.max(m, th[yy * w + x]); return m; };
  const reach = Math.ceil(width);
  return { width, body, startFill: fill(lo), endFill: fill(hi + 1 - cap), extent: [lo, hi], pathX: [x0, x1],
    bodyPeak: peak(c0, c1), startPeak: peak(0, lo + reach), endPeak: peak(hi - reach, w - 1) };
}
