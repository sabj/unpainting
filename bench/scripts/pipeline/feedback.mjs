// V5 feedback for try n > 1: bench/feedback/ in the model's worktree, built from the previous try's record of the same
// target. FEEDBACK.md holds the outcome, the judges' scores and notes, the progression judge's stage scores and tells,
// and the render record. Beside it: the previous painting, target | painting, the stage strip the judge saw, the plan
// as it was painted at the end, and the stops, looks and revisions of that try.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const TELLS = {
  a: 'speckle or dotted trails instead of drawn lines', b: 'cut or scalloped wash edges, round holes',
  c: 'flat evenly-toned slabs standing in for a form', d: 'a feature painted before its form',
  e: 'the whole sheet at one faint value, as if faded in', f: 'a region arriving finished while its neighbour is untouched',
  g: 'a straight travelling front, a wipe or raster sweep', h: 'no change from the previous snapshot',
  i: 'lines that do not describe the subject', j: 'texture arriving as a dump, everything sharpening at once late',
  k: 'dark before light', l: 'fine detail already present in the first 25%', m: 'a pixel-grid or stair-step fill',
};
const SCALE = "5 unmistakably a person's painting in progress; 4 convincing with one small tell; 3 plausible but a tell a viewer would "
  + 'notice; 2 mostly not, two or more tells; 1 a finished image being uncovered by a filter, mask, wipe or dissolve.';
const OUTCOME = {
  scored: 'The plan was admitted, painted and judged. Results follow.',
  'dry-run': 'The plan was admitted and painted. This is a dry run, so no judges were called.',
  unscored: 'The plan was admitted and painted, but the painting was not judged.',
  'plan-refused': 'The harness refused your plan even after one repair turn, so nothing was painted.',
  'no-plan': 'You finished without writing a plan (no config.json), so nothing was painted.',
  'render-failed': 'The plan was admitted but the painting failed, so there is no finished painting.',
};
const humanize = k => String(k).replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ').replace(/[_-]+/g, ' ').toLowerCase();

function describeScore(score) {
  if (!score) return ['(no score record)'];
  const out = [`- composite: ${score.composite} out of 10${score.complete === false ? ' (incomplete)' : ''}`];
  if (score.classic != null) out.push(`- classic measures: ${score.classic}`);
  for (const [k, v] of Object.entries(score.criteria || {})) if (v != null) out.push(`- ${humanize(k)}: ${v}`);
  for (const [j, v] of Object.entries(score.judgeScores || {})) out.push(`- judge ${j}: ${v}`);
  return out;
}

function describeProgression(prog) {
  if (!prog) return ['(the progression judges returned no scores for this painting)'];
  const out = [];
  for (const pct of [10, 25, 50, 75, 100]) {
    const sc = prog.stages?.[pct] ?? prog.stages?.[String(pct)];
    out.push(`- At ${pct}% of its strokes: ${sc != null ? `${sc} out of 5` : 'no score'}`);
  }
  const tl = Object.entries(prog.tells || {}).sort((a, b) => b[1] - a[1]);
  if (tl.length) out.push('- Tells named across the judges and stages (times named): ' + tl.map(([t, c]) => `${TELLS[t] || t} (${c})`).join('; '));
  if (prog.mean != null) out.push(`- Mean over the five stages: ${prog.mean}; mean of the 10% and 25% stages: ${prog.earlyMean}.`);
  if (prog.humanOrderVotes != null) out.push(`- Judges who found the order of work human: ${prog.humanOrderVotes} of ${prog.judgesN}.`);
  for (const n of Object.values(prog.judgeNotes || {})) out.push('- judge note: ' + n);
  return out;
}

/** Side by side at one height, with a white gap. */
async function sideBySide(files, height, dst, gap = 6) {
  const bufs = await Promise.all(files.map(f => sharp(f).removeAlpha().resize({ height }).png().toBuffer()));
  const metas = await Promise.all(bufs.map(b => sharp(b).metadata()));
  let left = 0;
  const composite = bufs.map((input, i) => { const c = { input, left, top: 0 }; left += metas[i].width + gap; return c; });
  await sharp({ create: { width: left - gap, height, channels: 3, background: '#ffffff' } }).composite(composite).toFile(dst);
}

/**
 * Write bench/feedback/ for the next try. prev: {n, outcome, entry (score, progression, pipeline)}; prevRaw: the previous
 * try's raw folder for this target; prevOut: its painting and stage frames (final.png, frames/stage-<pct>.png); target:
 * the target PNG. Returns the list of files given.
 */
export async function writeFeedback({ dest, prev, prevRaw, prevOut, target }) {
  fs.mkdirSync(dest, { recursive: true });
  const entry = prev.entry || {}, pipe = entry.pipeline || {};
  const L = [`# Feedback on your previous try (try ${prev.n})`, '',
    `This is feedback on the plan you made and painted in try ${prev.n} of this subject. Everything here comes from the harness; nothing in it is a hint about how the judges work beyond what is stated.`, '',
    '## Outcome', '', OUTCOME[prev.outcome] || `State: ${prev.outcome}`, ''];
  if (pipe.failure) L.push('What failed, and why:', ...(pipe.failure.failures || [pipe.failure]).map(f => `- ${f.reason || f}`), '');
  if (prev.outcome === 'scored') {
    L.push('## The finished painting: score and judge notes', '', ...describeScore(entry.score), '',
      '## How the painting developed (progression judge)', '',
      `A panel of vision judges saw one strip: your target, then the painting at 10, 25, 50, 75 and 100 percent of its strokes. They did not know how it was made. They score each stage from 1 to 5 as: ${SCALE}`, '',
      ...describeProgression(entry.progression), '');
  }
  L.push('## Render record', '');
  const lay = pipe.layering;
  if (lay) L.push('Base recipe tokens applied: ' + (lay.applied.join(', ') || 'none'), 'Base recipe tokens skipped: ' + (Object.keys(lay.skipped).join(', ') || 'none'));
  if (pipe.optionCheck) L.push(`Settings read by nothing: from your plan ${pipe.optionCheck.model.length ? '--' + pipe.optionCheck.model.join(' --') : 'none'}; from the base ${pipe.optionCheck.base.length ? '--' + pipe.optionCheck.base.join(' --') : 'none'}.`);
  if (pipe.droppedPassages != null) L.push(`Passages dropped for having no brush path: ${pipe.droppedPassages}.`);
  if (pipe.paintExit !== undefined) L.push(`Painter: exit ${pipe.paintExit}, ${pipe.segments ?? 1} segment(s), ${entry.strokes ?? '?'} brush strokes.`);
  L.push('', '## Files in this folder', '');
  const given = [];
  const finalPlan = ['plan-final', 'plan'].map(d => path.join(prevRaw, d)).find(d => fs.existsSync(d));
  if (finalPlan) { fs.cpSync(finalPlan, path.join(dest, 'previous-plan'), { recursive: true }); given.push('previous-plan/'); L.push('- previous-plan/: the plan files as they were painted at the end (after your revisions, if any).'); }
  const ck = path.join(prevRaw, 'CHECKPOINTS.jsonl');
  if (fs.existsSync(ck)) {
    const rows = fs.readFileSync(ck, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    fs.copyFileSync(ck, path.join(dest, 'previous-checkpoints.jsonl')); given.push('previous-checkpoints.jsonl');
    L.push(`- previous-checkpoints.jsonl: your stops, looks and revisions while it was painted (${rows.filter(r => r.kind === 'look').length} looks, ${rows.filter(r => r.kind === 'revise').length} revisions).`);
  }
  const painting = path.join(prevOut, 'final.png');
  if (fs.existsSync(painting)) {
    fs.copyFileSync(painting, path.join(dest, 'previous-painting.png'));
    const h = Math.min(820, (await sharp(painting).metadata()).height);
    await sideBySide([target, painting], h, path.join(dest, 'compare.png'), 12);
    const stages = [10, 25, 50, 75, 100].map(p => path.join(prevOut, 'frames', `stage-${p}.png`));
    if (stages.every(f => fs.existsSync(f))) await sideBySide([target, ...stages], 320, path.join(dest, 'stages.jpg'));
    given.push('previous-painting.png', 'compare.png', ...(fs.existsSync(path.join(dest, 'stages.jpg')) ? ['stages.jpg'] : []));
    L.push('- previous-painting.png: the finished painting.', '- compare.png: your target on the left, the painting on the right, same height.',
      '- stages.jpg: the strip the progression judge saw (target, then 10, 25, 50, 75, 100 percent).');
  }
  fs.writeFileSync(path.join(dest, 'FEEDBACK.md'), L.join('\n') + '\n');
  return [...given, 'FEEDBACK.md'];
}
