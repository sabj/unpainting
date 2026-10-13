// The linework gate: per image, with no subject id and no hand-placed region, whether to draw lines at all, in what
// medium and how much. Styles then choose only how the lines are used (linework-stage.mjs).
//
// It reads two things about the target and one about the cleaned line set:
//   straight  the share of the target's edge length that runs in straight pieces of `straightMm` or more. Built
//             structure (facades, gates, masts, furniture) is drawn in pen; clouds, water, fur and skin are not.
//   penLine   the share of the target the separator reads as pen line (the old --outlinemedium auto signal). On a
//             photograph it also counts thin dark texture, so it only confirms a pen source, it never decides alone.
//   density   the cleaned set's ink, mm per cm2 of sheet. Too little left after cleanup means there is no drawing to make.
// The decision:
//   none      when the cleaned set holds under `minDensity`, or the target has little straight structure and no pen line
//   ink       when the target is built structure (straight >= inkStraight), or it shows its own pen line, or an image
//             model's sketch of it passed the geometry check
//   graphite  otherwise: a light pencil construction that the washes cover
// An explicit medium (plan drawing.medium, --linemedium, or --outlinemedium) always wins; the gate still records what it
// would have chosen. Amount: the ink budget rises with structure, and the line weight follows the medium.
import { tracePaths } from '../../crop/ink-lines.mjs';
import { simplify } from '../../crop/simplify.mjs';

export const GATE = Object.freeze({ straightMm: 5, chainMm: 2, tolCells: 0.8, inkStraight: 0.3, drawStraight: 0.12, penLine: 0.02, minDensity: 2,
  budget: Object.freeze([60, 220]), weight: Object.freeze({ ink: 1, graphite: 0.8 }) });

/** The share of edge length in straight pieces at least `straightMm` long. `edge` a w*h thinned edge mask. */
export function straightShare(edge, w, h, { mmPerCell, straightMm = GATE.straightMm, chainMm = GATE.chainMm, tolCells = GATE.tolCells } = {}) {
  let total = 0, straight = 0;
  for (const path of tracePaths(edge, w, h)) {
    if (path.length * mmPerCell < chainMm) continue;
    const pts = path.map(i => [i % w, Math.floor(i / w)]), keep = simplify(pts, tolCells);
    for (let k = 1; k < keep.length; k++) {
      const L = Math.hypot(keep[k][0] - keep[k - 1][0], keep[k][1] - keep[k - 1][1]);
      total += L; if (L * mmPerCell >= straightMm) straight += L;
    }
  }
  return total ? straight / total : 0;
}

/**
 * The gate's decision. `features` { straight, penLine, density, sketch (accepted boolean) }; `requested` an explicit
 * medium ('ink' | 'graphite' | 'none') or null for the gate's own choice.
 * @returns { draw, medium, chosen, budget (mm of ink per cm2), weight, why }
 */
export function decideLinework(features, { requested = null, options = {} } = {}) {
  const o = { ...GATE, ...options }, f = features, why = [];
  const structure = f.straight >= o.inkStraight, pen = f.penLine >= o.penLine;
  let medium;
  if (f.density < o.minDensity) { medium = 'none'; why.push(`${f.density.toFixed(1)} mm/cm2 of line left after cleanup (needs ${o.minDensity})`); }
  else if (structure || pen || f.sketch) {
    medium = 'ink';
    why.push(structure ? `${(100 * f.straight).toFixed(0)}% of the edges are straight structure` : pen ? `the target shows ${(100 * f.penLine).toFixed(1)}% pen line` : 'a checked sketch carries the structure');
  } else if (f.straight >= o.drawStraight) { medium = 'graphite'; why.push(`${(100 * f.straight).toFixed(0)}% straight structure: a light construction`); }
  else { medium = 'none'; why.push(`only ${(100 * f.straight).toFixed(0)}% straight structure and no pen line`); }
  const gate = medium;
  if (requested) { medium = requested; why.push(`medium ${requested} set by the plan or command line (the gate chose ${gate})`); }
  const t = Math.max(0, Math.min(1, (f.straight - o.drawStraight) / Math.max(1e-6, 0.6 - o.drawStraight)));
  const budget = o.budget[0] + (o.budget[1] - o.budget[0]) * t;
  return { draw: medium !== 'none', medium, gate, chosen: !requested, budget: +budget.toFixed(1), weight: o.weight[medium] ?? 0, why };
}
