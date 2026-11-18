// The drawing medium for one run (methods/medium-decision.mjs), applied to the command line before the recipe expands it.
// Reads the plan the command line names and, only when an ink request has no plan behind it, the source's pen share.
import path from 'node:path';
import { readPlan, styleAlias } from './recipe.mjs';
import { decideMedium, planDeclaration, inkRequestedBy, argvWithoutInk } from './methods/medium-decision.mjs';

const PEN_FIRST_PCT = 0.5;
const last = (argv, name) => { const at = argv.lastIndexOf(name); return at >= 0 ? argv[at + 1] : undefined; };

/**
 * @param {{ argv: string[], root: string, penShareOf: (image: string) => Promise<number>, log?: (line: string) => void }} input
 *   penShareOf gives the source's pen-line share from 0 to 1 (pen-share.mjs sourcePenShare).
 * @returns {Promise<{ argv: string[], decision: object }>} the command line to expand, and the decision with its evidence
 */
export async function mediumForRun({ argv, root, penShareOf, log = () => {} }) {
  const plan = readPlan(styleAlias(argv), root);
  const penFirstPct = Number(last(argv, '--penfirst') ?? PEN_FIRST_PCT);
  if (!(penFirstPct >= 0)) throw new Error(`--penfirst: a share in per cent, not ${last(argv, '--penfirst')}`);
  const needShare = inkRequestedBy(argv).length > 0 && planDeclaration(plan).medium === null && last(argv, '--subjectmedium') === undefined;
  let penSharePct = null;
  if (needShare) {
    const image = last(argv, '--image');
    if (!image) throw new Error('medium decision: an ink request with no plan declaring it needs --image to measure the pen share');
    penSharePct = 100 * await penShareOf(path.resolve(root, image));
  }
  const decision = decideMedium({ argv, plan, penSharePct, penFirstPct });
  log(decision.note);
  if (decision.vetoed) {
    // graphite stays as the drawing unless the plan declares no drawing at all; the pen-only options go with the subject medium
    const base = planDeclaration(plan).medium === 'none' ? argv : argvWithoutInk(argv);
    return { argv: [...base, '--subjectmedium', 'pencil'], decision };
  }
  return { argv: [...argv, ...decision.addArgs], decision };
}
