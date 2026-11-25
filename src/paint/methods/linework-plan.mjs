// Pipeline: inking, stage 3 (stages).
// How the plan's linked stages are cut from the drawing file (--stages, drawing-stages.mjs). The plan's drawing section
// writes these flags (src/paint/drawing-plan.mjs). The drawing file is the only line set (src/paint/line-source.mjs): the
// line sources that traced the subject (--linesource, copy-lines, the photo sketch, the line models, edge chains) were
// removed in 0.4 and last exist at commit 49447027.
//
//   --stages prep,prepink,finishink   the stages drawn, any subset; options --prepamount, --prepinkfrom, --prepinkkeep,
//       --prepinkadd, --prepinkamount, --prepinkdeviate, --finishfrom, --finishselect, --finishrestate, --finishmethod,
//       --finishdeviate. Without --stages the pens are planned as before.
import fs from 'node:fs';
import path from 'node:path';
import { linePaths, readLineText } from '../../crop/lines.mjs';
import { planStages, stageDoc, STAGE_DEFAULTS } from './drawing-stages.mjs';
import { stageVectors } from './ink-vectors.mjs';

const STAGE_KEYS = Object.freeze({ prep: 'prep', prepink: 'prepInk', finishink: 'finishInk' });

/** The --stages flag as { prep?, prepInk?, finishInk? } with each stage's options, or null. */
export function stagesFromFlags(opt, num) {
  const raw = opt('stages', '');
  if (!raw || raw === 'none') return null;
  const names = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  for (const s of names) if (!STAGE_KEYS[s]) throw new Error(`--stages: prep, prepink or finishink, not ${s}`);
  const has = new Set(names.map(s => STAGE_KEYS[s]));
  const d = STAGE_DEFAULTS, out = {};
  if (has.has('prep')) out.prep = { amount: num('prepamount', d.prep.amount) };
  if (has.has('prepInk')) out.prepInk = { keep: num('prepinkkeep', d.prepInk.keep), add: num('prepinkadd', d.prepInk.add), amount: num('prepinkamount', d.prepInk.amount),
    ...(opt('prepinkdeviate', '') !== '' ? { deviate: num('prepinkdeviate', d.prepInk.deviate) } : {}), ...(opt('prepinkfrom', '') ? { from: opt('prepinkfrom', '') } : {}) };
  if (has.has('finishInk')) out.finishInk = { restate: num('finishrestate', d.finishInk.restate), select: opt('finishselect', d.finishInk.select),
    method: opt('finishmethod', d.finishInk.method), deviate: num('finishdeviate', d.finishInk.deviate), ...(opt('finishfrom', '') ? { from: opt('finishfrom', '') } : {}) };
  return out;
}

/**
 * The plan's stages, before painting. Pushes the stage files as --drawingfile and --drawinglast, --drawing and the stage
 * neutralising flags onto argv.
 * @returns { source, stages, files } for the run's linework.json
 */
export async function planLinework({ opt, num, argv, out, grid, density, log, planLines, drawingOverride = null }) {
  const stages = stagesFromFlags(opt, num);
  if (stages && drawingOverride) {
    if (drawingOverride === 'first') delete stages.finishInk;
    if (drawingOverride === 'last') {delete stages.prep; delete stages.prepInk; if(stages.finishInk) stages.finishInk.from='lines';}
  }
  const info = { source: opt('drawingfile', '') ? 'file' : 'none', stages: null, files: {} };
  if (opt('drawing', 'first') === 'none') return info;
  if (!stages) return info;
  // the one line set the stages share, in its own source pixels: the drawing file (src/paint/line-source.mjs). The target's
  // own lines are never traced here (removed in 0.4, last at commit 49447027).
  const file = opt('drawingfile', '');
  if (!file) throw new Error('drawing stages need a drawing file (--drawingfile): the painter no longer traces the subject\'s lines');
  const doc = JSON.parse(readLineText(linePaths(file).lines)), setName = linePaths(file).lines;
  const vecFile = setName.replace(/-lines\.json$/, '-vectors.json'), vec = fs.existsSync(vecFile) ? JSON.parse(fs.readFileSync(vecFile, 'utf8')) : null;
  const imageSize = doc.image ?? { w: grid.w, h: grid.h };
  // the plan's line choice (amount, lines, maxLines) applies to the set once, before the stages are cut from it
  const lines = planLines ? planLines(doc.lines.filter(g => g.points?.length >= 2), imageSize) : doc.lines;
  const r = planStages(lines, { image: imageSize, stages, density });
  for (const [key, name] of [['prep', 'prep'], ['prepInk', 'prepink'], ['finishInk', 'finishink']]) {
    if (!r[key] && !(key === 'prepInk' && r.prep)) continue;
    const stem = path.join(out, `stage-${name}`);
    // a prep pencil with no prepInk stage: an empty opening file, marked so the opening pen knows it is meant
    // (drawing-file.mjs), while every other reader of the opening file sees no lines, as before
    const empty = r[key] ? null : 'the plan has a prep pencil and no prepInk stage; the pencil is the opening drawing';
    fs.writeFileSync(`${stem}-lines.json`, JSON.stringify({ ...stageDoc(r[key] ?? [], { image: imageSize, stage: key, source: setName }), ...(empty ? { empty } : {}), ...(doc.inputKind ? { inputKind: doc.inputKind } : {}), ...(doc.inkDecided ? { inkDecided: true } : {}) }) + '\n');
    // the pen lays a drawing only as its vector strokes: the stage carries the same strokes for the lines it holds
    if (vec && key !== 'prep') { const v = stageVectors(vec, r[key] ?? []); fs.writeFileSync(`${stem}-vectors.json`, JSON.stringify({ ...v, stage: key, source: `${v.source ?? ''}; stage ${key} of ${path.basename(vecFile)}` })); info.vectors = { ...(info.vectors ?? {}), [key]: v.strokes.length }; }
    info.files[key] = stem;
  }
  if (info.files.prepInk) argv.push('--drawingfile', info.files.prepInk);
  if (info.files.finishInk) argv.push('--drawinglast', info.files.finishInk, '--drawinglastmin', '0', '--drawinglastlogic', '0');
  // the stage files are the drawing: the line choice is spent, and the pens draw what the stages hold.
  // A prepared or plan drawing carries one weight per line, so it takes the source-ink caps like any prepared pen drawing.
  argv.push('--drawshare', '1', '--drawregions', '0', '--drawmax', 'Infinity', '--drawingskip', '', '--sourceink', '1');
  const first = !!(r.prep || r.prepInk), last = !!r.finishInk;
  argv.push('--drawing', first && last ? 'both' : first ? 'first' : 'last');
  if (r.prepInk || r.finishInk) argv.push('--outlinemedium', 'ink');
  info.stages = r.summary;
  log(`linked stages from ${setName}: ${Object.entries(r.summary).map(([k, s]) => `${k} ${s.lines} lines${s.from ? ` from ${s.from}` : ''}`).join(', ')}`);
  return info;
}
