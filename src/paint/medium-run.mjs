// The drawing medium for one run (methods/medium-decision.mjs), applied to the command line before the recipe expands it.
// Reads the plan the command line names and, only when an ink request has no plan behind it, the source's pen share.
// The plan is the value plan (--valueplan).
import fs from 'node:fs';
import path from 'node:path';
import { readPlan, styleAlias } from './recipe.mjs';
import { linePaths, readLineText } from '../crop/lines.mjs';
import { decideMedium, planDeclaration, inkRequestedBy, argvWithoutInk } from './methods/medium-decision.mjs';

const PEN_FIRST_PCT = 0.5;
const last = (argv, name) => { const at = argv.lastIndexOf(name); return at >= 0 ? argv[at + 1] : undefined; };

/**
 * @param {{ argv: string[], root: string, penShareOf: (image: string) => Promise<number>, log?: (line: string) => void }} input
 *   penShareOf gives the source's pen-line share from 0 to 1 (pen-share.mjs sourcePenShare).
 * @returns {Promise<{ argv: string[], decision: object }>} the command line to expand, and the decision with its evidence
 */
/**
 * The prepared drawing the command line names and the medium it declares ({ file, medium, from }), or null when no
 * --drawingfile is given or it is not a prepared drawing (inputKind drawing). The file's own `medium` wins over
 * --outlinemedium; with neither, medium is null and the decision stops.
 */
function preparedDrawing(argv, root) {
  const stem = last(argv, '--drawingfile');
  if (!stem) return null;
  let doc;
  try { doc = JSON.parse(readLineText(linePaths(path.isAbsolute(stem) ? stem : stem).lines)); } catch { return null; }
  if (doc?.inputKind !== 'drawing') return null;
  const flag = last(argv, '--outlinemedium'), file = path.basename(linePaths(stem).lines);
  if (typeof doc.medium === 'string') return { file, medium: doc.medium, from: 'the drawing file' };
  if (flag && flag !== 'auto' && flag !== 'none') return { file, medium: flag, from: '--outlinemedium' };
  return { file, medium: null, from: 'nothing' };
}

export async function mediumForRun({ argv, root, penShareOf, log = () => {} }) {
  const drawing = preparedDrawing(argv, root);
  if (drawing) {
    const decision = decideMedium({ argv, plan: readPlan(styleAlias(argv), root), penFirstPct: PEN_FIRST_PCT, drawing });
    log(decision.note);
    return { argv: decision.subjectMedium ? [...argv, '--subjectmedium', decision.subjectMedium] : [...argv, ...(decision.medium === 'pen' && !argv.includes('--outlinemedium') ? ['--outlinemedium', 'ink'] : [])], decision };
  }
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
  if (decision.subjectMedium) {
    // a graphite subject: an ink request becomes the graphite drawing (unless the plan declares no drawing at all), and the
    // pen-only options, closing file and wash-side ink options go with the subject medium (subject-medium.mjs)
    const base = decision.vetoed && planDeclaration(plan).medium !== 'none' ? argvWithoutInk(argv) : argv;
    return { argv: [...base, '--subjectmedium', decision.subjectMedium], decision };
  }
  return { argv: [...argv, ...decision.addArgs], decision };
}
