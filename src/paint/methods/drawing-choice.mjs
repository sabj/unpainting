// The drawing's stages for one image, chosen at paint time: a graphite prep (none, light or full), an ink prep over it
// before the washes (none or ink) and an ink finish after them (none or ink), in any combination. A planner model
// proposes (drawing-planner.mjs), a rule reads the image, and the gate here decides; the linked stages
// (drawing-stages.mjs, drawn by paint-plate) then carry each stage in its own medium, line set, weight and amount.
//
// The rule, from image measures only (no subject id):
//   graphite prep  full on built structure (two or more vanishing points carrying 12% of the long edges, as the linework
//                  gate reads it), else light; none only when the image has almost no edges (under EDGE_NONE of cells)
//   ink prep       ink on a pen source (the separator reads PEN_SOURCE of cells as pen line) or built structure
//   ink finish     ink when the image has enough edges for accents (EDGE_FINISH of cells), else none
// The gate:
//   graphite prep  the model's choice, except that none stands only when the rule also says none
//   ink prep       the model's ink stands only where the rule allows ink; the model's none always stands
//   ink finish     the same
//   a style's own stages win over both (pen and wash inks its drawing first and has no closing pen)
// Without a model choice the rule's choice is final. Every refusal and fallback is recorded with its reason. Pure.

const CHOICES = Object.freeze({ graphitePrep: Object.freeze(['none', 'light', 'full']), inkPrep: Object.freeze(['none', 'ink']), inkFinish: Object.freeze(['none', 'ink']) });
const STAGES = Object.keys(CHOICES);
const RULE = Object.freeze({ edgeNone: 0.005, edgeFinish: 0.02, penSource: 0.025, builtPoints: 2, builtShare: 0.12 });
// What each choice draws (drawing-stages.mjs options): a light prep places the main shapes, a full one the features too.
const PREP = Object.freeze({ light: Object.freeze({ amount: 0.3, weight: 0.45 }), full: Object.freeze({ amount: 0.6, weight: 0.6 }) });
// Styles whose recipe fixes a stage: pen and wash is an ink drawing first and has no closing pen.
const STYLE_STAGES = Object.freeze({ penwash: Object.freeze({ inkPrep: 'ink', inkFinish: 'none' }) });

/** A stage choice checked against CHOICES; throws on anything else. */
export function validChoice(c) {
  if (!c || typeof c !== 'object') throw new Error('drawing choice: an object with graphitePrep, inkPrep and inkFinish');
  for (const k of STAGES) if (!CHOICES[k].includes(c[k])) throw new Error(`drawing choice: ${k} is one of ${CHOICES[k].join(', ')}, not ${JSON.stringify(c[k])}`);
  return { graphitePrep: c.graphitePrep, inkPrep: c.inkPrep, inkFinish: c.inkFinish };
}

/**
 * The rule's choice from image measures: { edgeShare, penLine, perspective: { vanishingPoints, share } | null }.
 * @returns { choice, why: { stage: reason } }
 */
export function ruleChoice(f, o = RULE) {
  const p = f.perspective, built = !!p && p.vanishingPoints >= o.builtPoints && p.share >= o.builtShare, pen = f.penLine >= o.penSource;
  const flat = f.edgeShare < o.edgeNone, why = {};
  const graphitePrep = flat ? 'none' : built ? 'full' : 'light';
  why.graphitePrep = flat ? `${(100 * f.edgeShare).toFixed(2)}% of cells on an edge: nothing to place` : built ? `built structure (${p.vanishingPoints} vanishing points, ${(100 * p.share).toFixed(0)}% of long edges)` : `a light placement (${p ? `${p.vanishingPoints} vanishing points` : 'perspective unknown'})`;
  const inkPrep = pen || built ? 'ink' : 'none';
  why.inkPrep = pen ? `a pen source (${(100 * f.penLine).toFixed(1)}% pen line)` : built ? 'built structure takes ink before the washes' : 'no pen source or built structure to ink';
  const inkFinish = f.edgeShare >= o.edgeFinish ? 'ink' : 'none';
  why.inkFinish = `${(100 * f.edgeShare).toFixed(1)}% of cells on an edge (${inkFinish === 'ink' ? 'enough' : 'too few'} for accents)`;
  return { choice: { graphitePrep, inkPrep, inkFinish }, why };
}

/**
 * The gate: the final stages from the model's choice (or null), the rule's and the style's.
 * @returns { final, verdicts: { stage: { model, rule, final, why } } }
 */
export function gateChoice(model, rule, { style = null } = {}) {
  const fixed = STYLE_STAGES[style] ?? {}, final = {}, verdicts = {};
  for (const k of STAGES) {
    const m = model?.[k] ?? null, r = rule.choice[k];
    let f, why;
    if (fixed[k]) { f = fixed[k]; why = `the ${style} style fixes it`; }
    else if (m == null) { f = r; why = 'no model choice: the rule decides'; }
    else if (k === 'graphitePrep') { f = m === 'none' && r !== 'none' ? r : m; why = m === 'none' && r !== 'none' ? `the model said none, the rule did not (${rule.why[k]}): pencil kept` : 'the model decides'; }
    else { f = m === 'ink' && r === 'none' ? 'none' : m; why = m === 'ink' && r === 'none' ? `the model asked for ink, the rule refused (${rule.why[k]})` : 'the model decides'; }
    final[k] = f; verdicts[k] = { model: m, rule: r, final: f, why };
  }
  return { final, verdicts };
}

/** Painter flags (linework-plan.mjs --stages) for the final stages, or --drawing none when nothing is drawn. */
export function stageFlags(final, { style = null } = {}) {
  const names = [], flags = [];
  const prep = PREP[final.graphitePrep];
  if (prep) { names.push('prep'); flags.push('--prepamount', String(prep.amount), '--preppressure', String(prep.weight)); }
  // pen and wash inks its whole drawing (its own economy prune follows); otherwise the pen goes over the pencil
  if (final.inkPrep === 'ink') { names.push('prepink'); flags.push(...(style === 'penwash' || !prep ? ['--prepinkfrom', 'lines', '--prepinkamount', '1', '--prepinkdeviate', '0'] : ['--prepinkfrom', 'prep'])); }
  if (final.inkFinish === 'ink') names.push('finishink');
  return names.length ? ['--stages', names.join(','), ...flags] : ['--drawing', 'none'];
}
