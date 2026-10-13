// The linework gate: per image, with no subject id and no hand-placed region, whether to draw lines at all, in what
// medium and how much. Styles then choose only how the lines are used (linework-stage.mjs).
//
// It reads:
//   perspective  how much of the target's long straight edges converge on vanishing points (tools/seg/perspective.py,
//                the structure-lines construction). Built scenes (facades, streets, gates, interiors) find two or three
//                points and a share of 0.15 or more; faces, animals, water, foliage none. Null when python lacks OpenCV.
//   penLine      the share of the target the separator reads as pen line (the old --outlinemedium auto signal). On a
//                photograph it also counts thin dark texture, so it is recorded, not decisive.
//   sketch       whether an image model's sketch passed the geometry check (sketch-check.mjs)
//   density      the cleaned set's ink, mm per cm2 of sheet
// The decision:
//   none      when the cleaned set holds under `minDensity`
//   ink       when the target is built structure, or a checked sketch carries the drawing
//   graphite  otherwise: a light pencil construction under the washes, at a smaller budget
// An explicit medium (plan drawing.medium, --linemedium or --outlinemedium) always wins; the gate still records what it
// would have chosen. Amount: a line budget in mm per cm2: a pen source keeps all its own lines, built structure up
// to 40, a soft subject up to 12.
const GATE = Object.freeze({ builtPoints: 2, builtShare: 0.12, minDensity: 2,
  budget: Object.freeze({ built: 40, soft: 12 }), weight: Object.freeze({ ink: 1, graphite: 0.8 }) });

/**
 * The gate's decision. `features` { perspective: { vanishingPoints, share } | null, penLine, density, sketch, pen };
 * `requested` an explicit medium ('ink' | 'graphite' | 'none') or null for the gate's own choice.
 * @returns { draw, medium, gate, chosen, built, budget (mm of line per cm2), weight, why }
 */
export function decideLinework(features, { requested = null, options = {} } = {}) {
  const o = { ...GATE, ...options }, f = features, why = [], p = f.perspective;
  const built = !!p && p.vanishingPoints >= o.builtPoints && p.share >= o.builtShare;
  let medium;
  if (f.density < o.minDensity) { medium = 'none'; why.push(`${f.density.toFixed(1)} mm/cm2 of line left after cleanup (needs ${o.minDensity})`); }
  else if (built) { medium = 'ink'; why.push(`built structure: ${p.vanishingPoints} vanishing points carry ${(100 * p.share).toFixed(0)}% of the long edges`); }
  else if (f.sketch) { medium = 'ink'; why.push('a checked sketch carries the drawing'); }
  else { medium = 'graphite'; why.push(p ? `no perspective structure (${p.vanishingPoints} vanishing points): a light construction` : 'perspective unknown (no OpenCV): a light construction'); }
  const gate = medium;
  if (requested) { medium = requested; why.push(`medium ${requested} set by the plan or command line (the gate chose ${gate})`); }
  // a pen source's own lines are the artist's: no budget
  const budget = f.pen ? Infinity : built || f.sketch ? o.budget.built : o.budget.soft;
  return { draw: medium !== 'none', medium, gate, chosen: !requested, built, budget, weight: o.weight[medium] ?? 0, why };
}
