// A touch too small for a wet bed. A stroke much shorter than its brush is wide never lays the brush down: the tuft
// lands on its tip and lifts again, and what it touches is a few cells however wide the brush (a 13 mm round drawn
// 0.6 mm touches about 0.4 mm2). The plan draws that stroke's footprint at the brush's pressed width, a hundred times
// what the tip touches, so it passed for a stroke worth its own wet bed. The bed could then never be made: it wants
// seven tenths of the stroke's footprint moist, the clean brush that wets it touches the same tip (four cells of
// six), and after sixteen tries the painter stopped the whole painting for a mark no one would see.
//
// So a touch under a small area (a setting in mm2, about the tip of the smallest brush of a kit) is laid as a plain
// touch on the paper as it stands, with no bed prepared and none waited on. It is never quiet: the plan lists every
// such stroke before anything is painted (a session's free plan check warns the author), and the painter lists every
// one it lays this way in its log and in tiny-touches.json, which the run's record carries. A bed that cannot be
// made on anything larger is still an error. Nothing here reads the subject.
import { createBrush, dip, candidateContact } from '../../media/brush.mjs';
import { makePaper } from '../../media/paper.mjs';
import { createSheet } from '../../media/sheet.mjs';

/** The least area a stroke must touch to be given a wet bed, mm2: about the tip of a 1.2 mm rigger (1.13 mm2). */
export const TOUCH_LEAST_MM2 = 1.2;

/** The paper a number of sheet cells covers, mm2. */
export const touchAreaMm2 = (cells, cellMm) => cells * cellMm * cellMm;

/** Whether a stroke that touches `cells` sheet cells of `cellMm` millimetres is a tiny touch. Touching nothing is not one. */
export function isTinyTouch(cells, cellMm, leastMm2 = TOUCH_LEAST_MM2) {
  if (!(cellMm > 0)) throw new RangeError(`tiny touch: the sheet has no millimetres a cell (${cellMm})`);
  if (!(leastMm2 >= 0)) throw new RangeError(`tiny touch: the least area must be 0 or more mm2, got ${leastMm2}`);
  return cells > 0 && touchAreaMm2(cells, cellMm) < leastMm2;
}

const lengthOf = P => { let s = 0; for (let k = 1; k < P.length; k++) s += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); return s; };

/**
 * What a planned stroke ({radiusMm, points: [[x, y, pressure], ...]} in mm) will touch, mm2, as the painter's own
 * contact prediction gives it for a wash round of that width on plain paper of `cellMm` cells. Only a stroke shorter
 * than its brush is wide (or than 3 mm) is tried: a longer one lays the brush down and is never tiny; for those the
 * answer is Infinity. The plan asks this before painting; the painter measures the real contact when it lays the stroke.
 */
export function predictedTouchMm2(stroke, cellMm) {
  const P = stroke?.points ?? [], r = stroke?.radiusMm;
  if (P.length < 2 || !(r > 0) || !(cellMm > 0)) return Infinity;
  const length = lengthOf(P);
  if (length >= Math.max(2 * r, 3)) return Infinity;
  const rc = r / cellMm, pad = Math.ceil(rc) + 6, x0 = Math.min(...P.map(q => q[0])), y0 = Math.min(...P.map(q => q[1]));
  const w = Math.ceil((Math.max(...P.map(q => q[0])) - x0) / cellMm) + 2 * pad, h = Math.ceil((Math.max(...P.map(q => q[1])) - y0) / cellMm) + 2 * pad;
  const sheet = createSheet(makePaper(w, h, { mmPerCell: cellMm, seed: 9 }), [{ K: [0.3, 0.3, 0.3], S: [0.02, 0.02, 0.02] }]);
  const path = P.map(q => ({ x: pad + (q[0] - x0) / cellMm, y: pad + (q[1] - y0) / cellMm, r: rc, p: q[2] ?? 1, round: true }));
  // the painter's wash round (tools/plate/paint.mjs), loaded as a wet-into-wet wash is
  const brush = createBrush({ model: 'section', flat: false, radius: rc, bristles: Math.max(12, Math.ceil(rc * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.06, stiffness: 8, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3, seed: 31 });
  dip(brush, { water: 0.88, conc: [1] });
  const c = candidateContact(brush, sheet, path, { upright: false, clip: null, neighborRadius: 0, includeTouched: false });
  let cells = 0; for (const i of c.cells) if (c.primaryMask[i]) cells++;
  return touchAreaMm2(cells, cellMm);
}

/** One tiny touch for the record: which passage, how many cells, how many mm2, where (mm), and how it was laid. */
export function tinyTouchRecord({ intent, cells, cellMm, points, leastMm2 = TOUCH_LEAST_MM2 }) {
  const xs = points.map(q => q.x * cellMm), ys = points.map(q => q.y * cellMm), mm = v => +v.toFixed(1);
  return {
    passage: intent?.script?.passage ?? intent?.id ?? null, intent: intent?.id ?? null, cells, mm2: +touchAreaMm2(cells, cellMm).toFixed(2), leastMm2,
    atMm: [mm(xs.reduce((a, v) => a + v, 0) / xs.length), mm(ys.reduce((a, v) => a + v, 0) / ys.length)],
    lengthMm: +(lengthOf(points.map(q => [q.x, q.y])) * cellMm).toFixed(2), brushMm: +(2 * Math.max(...points.map(q => q.r ?? 0)) * cellMm).toFixed(1),
    laid: 'a plain touch on the paper as it stood: no wet bed prepared, none waited on',
  };
}

/** The log's line for one tiny touch. */
export const tinyTouchLine = t => `TINY TOUCH: passage ${t.passage}: a stroke ${t.lengthMm} mm long with a ${t.brushMm} mm brush touches ${t.cells} cells (${t.mm2} mm2, under ${t.leastMm2} mm2) at ${t.atMm.join(', ')} mm; laid as a plain touch with no wet bed`;
