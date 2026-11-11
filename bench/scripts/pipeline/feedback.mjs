// V5 feedback for try n > 1: bench/feedback/ in the model's worktree, built from the previous try's record of the same
// target. FEEDBACK.md holds the outcome, the progression judges' words and the tells they named, and the render record.
// Beside it: the previous painting, target | painting, the stage strip the judge saw, the plan as it was painted at the
// end, and the stops, looks and revisions of that try. No score goes back to the model: no composite, judge score,
// stage score, metric, J1, hfCorr or ceiling result. A number to beat between tries turns tries into a hill climb on
// the score; the painting and the judges' words are what a painter learns from.
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
const OUTCOME = {
  scored: 'The plan was admitted, painted and judged. The judges\' words follow; no score is given back.',
  'dry-run': 'The plan was admitted and painted. This is a dry run, so no judges were called.',
  unscored: 'The plan was admitted and painted, but the painting was not judged.',
  'plan-refused': 'The harness refused your plan even after one repair turn, so nothing was painted.',
  'no-plan': 'You finished without writing a plan (no config.json), so nothing was painted.',
  'render-failed': 'The plan was admitted but the painting failed, so there is no finished painting.',
};

// a judge's note may quote its own score ("3/5", "4 out of 5", "score: 2"): those numbers are cut, the words kept
export const scrubScores = text => String(text)
  .replace(/\b\d+(?:\.\d+)?\s*(?:\/|out of)\s*\d+(?:\.\d+)?\b/gi, '')
  .replace(/\b(score[ds]?|rated?|rating|composite|mean|j1|hfcorr|ceiling)\b\s*(?:of|:|=|is)?\s*\d+(?:\.\d+)?\b/gi, '$1')
  .replace(/\s{2,}/g, ' ').trim();

/** The progression judges' words: the tells they named (no counts) and their notes (no scores). */
export function describeProgression(prog) {
  if (!prog) return ['(the progression judges said nothing about this painting)'];
  const out = [];
  const tl = Object.entries(prog.tells || {}).sort((a, b) => b[1] - a[1]);
  if (tl.length) out.push('- Tells the judges named, most often first: ' + tl.map(([t]) => TELLS[t] || t).join('; '));
  for (const n of Object.values(prog.judgeNotes || {})) if (scrubScores(n)) out.push('- judge note: ' + scrubScores(n));
  return out.length ? out : ['(the progression judges named no tells and left no notes)'];
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
  if (pipe.notes?.length) L.push('Kept against your plan (the painting still counts):', ...pipe.notes.map(f => `- ${f.reason}`), '');
  if (prev.outcome === 'scored') {
    L.push('## How the painting developed (progression judges)', '',
      'A panel of vision judges saw one strip: your target, then the painting at 10, 25, 50, 75 and 100 percent of its strokes. They did not know how it was made. They looked for signs that it was not painted by a person. Their words follow; their scores are not given back.', '',
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
