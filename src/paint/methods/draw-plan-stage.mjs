// Pipeline: inking, stage 1 (the drawing plan selects from the model lines). --drawplan <file> (value plan route,
// opt-in, off by default) runs after the line source (the model-line path, docs/ink.md: --linesource source-ink
// --linemodel 1) and before the lines are held to the target: of the line files that source wrote, the pens draw only
// the lines the plan claims (draw-plan-file.mjs), each with the plan's pen and weight; candidate lines no planned line
// claims are left out. A line file, linked stages or the linework stage typed beside it stops the run (the plan says
// which pen draws each line), and so do an area plan (its areas' drawingRole owns its lines) and a value plan family
// that states a drawingRole (it would keep or drop the plan's lines a second time). A stage the plan gives no line is
// not drawn; a plan with no line found, a --drawing none beside it, or a subject with no pen (--subjectmedium
// none|pencil) stops the run: never a conversion to graphite, never a silent empty drawing. Planning only.
import fs from 'node:fs';
import path from 'node:path';
import { readDrawPlan } from './draw-plan-file.mjs';

/** Options the drawing plan replaces when typed: name and why. */
const REPLACED = Object.freeze([
  ['drawingfile', 'the drawing plan selects the opening lines from the line source'],
  ['drawinglast', 'the drawing plan selects the closing lines from the line source'],
  ['linework', 'the drawing plan chooses the lines'],
  ['stages', 'the drawing plan says which pen draws each line'],
]);

const typedValue = (argv0, k) => { const i = argv0.lastIndexOf(`--${k}`); return i < 0 ? '' : argv0[i + 1] ?? ''; };

/** Semantic drawing plans are read automatically beside the value plan. An explicit path overrides
 *  discovery; none disables it. The benchmark also carries the plan in config.drawing.meaning. */
export function drawPlanPath(opt, root = '.') {
  const named = opt('drawplan', 'auto');
  if (!named || named === 'none' || named === 'off') return null;
  if (named !== 'auto') return path.resolve(root, named);
  const valuePlan = opt('valueplan', '');
  if (!valuePlan) return null;
  const file = path.join(path.dirname(path.resolve(root, valuePlan)), 'drawing-plan.json');
  return fs.existsSync(file) ? file : null;
}

/** Refuse what --drawplan cannot run beside, before any line source runs. `argv0` is the typed command line. */
export function checkDrawPlan({ opt, argv0, root }) {
  if (!drawPlanPath(opt, root)) return false;
  const typed = REPLACED.filter(([k]) => { const v = typedValue(argv0, k); return v !== '' && !(k === 'linework' && v === 'off'); });
  if (typed.length) throw new Error(`--drawplan replaces ${typed.map(([k, why]) => `--${k} (${why})`).join(', ')}; drop ${typed.length > 1 ? 'them' : 'it'}`);
  if (opt('areaplan', '')) throw new Error('--drawplan is a value plan (token route) option; an area plan\'s areas say their lines by drawingRole');
  const vp = opt('valueplan', '');
  if (vp) {
    const roles = (JSON.parse(fs.readFileSync(path.resolve(root, vp), 'utf8')).families ?? []).filter(f => f?.drawingRole != null).map(f => f.id);
    if (roles.length) throw new Error(`--drawplan names every line; the value plan's families ${roles.join(', ')} state a drawingRole that would keep or drop them again: remove it`);
  }
  return true;
}

/**
 * --drawplan after the line source (INK-SPEC.md): the plan is the planning model's reading of the subject, the named
 * structures and landmarks at their rough place. It gives meaning to the line model's pool; it does not decide what
 * exists (ink-lines-file.mjs reads it when the pool is decided by meaning). Here it is validated against the target and
 * the sheet, and refused on a subject with no pen (never drawn in graphite instead) or beside --drawing none.
 * Returns the validated plan, or null without --drawplan.
 */
export async function applyDrawPlan({ opt, root, sheetMm, noPenSubject, log = () => {} }) {
  const file = drawPlanPath(opt, root);
  if (!file) return null;
  if (noPenSubject) throw new Error(`--drawplan plans a pen drawing, and the subject's medium is ${opt('subjectmedium', 'pen')} (no pen): drop the drawing plan, the source decides the medium`);
  if (opt('drawing', 'first') === 'none') throw new Error('--drawplan names pen lines, and --drawing is none (asked, or the line source found no pen line): the plan cannot be drawn');
  const plan = await readDrawPlan({ file: path.resolve(root, file), image: path.resolve(root, opt('image', '')), sheetMm });
  log(`drawing plan: ${plan.lines.length} named lines (${plan.lines.filter(g => g.role === 'landmark').length} landmarks) give meaning to the line model's lines along them; the pool decides what exists`);
  return plan;
}
