// How a wet-into-wet bed is wetted before its paint goes in, shared by the sheet's stroke wrapper (tools/plate/sheet.mjs)
// and the scrap swatch that charges the passage, so the swatch is laid on the bed the sheet lays: a clean brush made like
// the painting brush (its own load, metered or not) wets the planned contact at 0.55, a thirsty clean brush picks up
// standing water, and the paper is let absorb, until the bed is moist and its typical cell has lost its shine
// (src/paint/techniques/passage-plan.mjs preparePassageBed).
import { preparePassageBed } from '../../src/paint/techniques/passage-plan.mjs';

/**
 * @param {object} o settings: the painting brush's settings (a clean brush is made from them); bristles, seed;
 *   pigments: how many pigments a clean dip carries (all zero); target, points, prepOpts: where and how the clean
 *   brushes go; observe(): the bed as measured now (full statistics); gate(): the planned contact's gate statistics;
 *   advance(): one step of the paper; createBrush, dip, thirsty, stroke: the caller's instruments.
 * @returns what preparePassageBed returns: { paper, actions }
 */
export function prepareWetBed({ settings, bristles, seed, pigments, target, points, prepOpts, observe, gate, advance, createBrush, dip, thirsty, stroke }) {
  const zeros = () => new Array(pigments).fill(0);
  const clean = depositDepth => createBrush({ ...settings, bristles, bridge: 0, breakup: .05, streak: 0, depositDepth, seed });
  // Start with a moderate 0.55 load; if cold-press pits remain dry after a pass (toothReach scales as sat^3),
  // load more clean water on retries so the liquid bridges the hollows instead of repeating the same dry skip.
  let wets = 0;
  const wet = () => { const p = gate(); const b = clean(p.saturationMax >= .5 ? .1 : 0); const water = Math.min(.95, .55 + .15 * wets++); dip(b, { water, conc: zeros() }); stroke(b, target, points, prepOpts); };
  const pickup = () => { const b = clean(0); dip(b, { water: .08, conc: zeros() }); thirsty(b, { water: .08 }); stroke(b, target, points, prepOpts); };
  return preparePassageBed({ observe, maxActions: 16, wet, pickup, advance });
}
