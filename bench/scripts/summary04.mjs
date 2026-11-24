// 0.4's summary: every model's levels against Auto, from what `npm run bench:score04` wrote.
//   npm run bench:summary04 -- DIR/results.json [--set core|extended] [--out FILE.md]
// Reads the scored paintings (results.json: Auto, level 1 and levels 2 to 4 in one file, failed runs among them) and
// sums them by model and level (levels.mjs). --set names the schedule (bench/run-sets.json): which pictures run at
// which level, so a scheduled picture with no painting, or whose run failed, is counted as a failure and never
// dropped; without it, every picture Auto painted is expected at every level a model entered. The figure summed is
// the combined figure (0 to 100); human-ness, quality and likeness stay in SCORES.md beside it. Nothing is judged here.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarize, subjectTable, headerFor, LEVEL_NOTE } from './levels.mjs';
import { loadRunSets, picturesAt } from '../../tools/paint/run-sets.mjs';

const SCALE = Object.freeze({ id: 'combined100', min: 0, max: 100 });
const MODEL_LEVELS = ['L1', 'L2', 'L3', 'L4'];

/** The schedule of a run set: {level: [picture ids]} for Auto and levels 1 to 4. */
export function scheduleOf(setName, runSets = loadRunSets()) {
  if (!runSets.sets[setName]) throw new Error(`summary04: no run set "${setName}" in bench/run-sets.json (${runSets.names.join(', ')})`);
  return Object.fromEntries(['Auto', ...MODEL_LEVELS].map(l => [l, picturesAt(setName, l, runSets).map(p => p.id)]));
}

/**
 * results.json's paintings as the flat records levels.mjs sums: one a painting, with its level, model, subject, the
 * combined figure as its score, and `failed` for a run that left no painting. A painting that was judged but has no
 * combined figure (a judge short of its readings) is left without a score, so the summary refuses it by name rather
 * than count it as a failure or as zero.
 */
export function recordsOf(results) {
  const judge = { judgeVersion: results.judge?.label ?? null, judgeProfile: results.snapshotScheme?.name ?? null };
  return (results.paintings ?? []).map(p => {
    const level = p.auto ? 'Auto' : p.level;
    if (!level) throw new Error(`summary04: ${p.id} does not say its level (Auto, L1 to L4): a painter run says it in usage.json, a manifest entry in "level"`);
    return { level, subject: p.subject, model: p.auto ? undefined : p.author ?? p.label, id: p.id, score: p.failed ? null : p.combined, failed: Boolean(p.failed), why: p.failed ?? null,
      commit: p.commit ?? null, ...judge, likeness: p.likeness?.score ?? null, likenessFlagged: Boolean(p.likeness?.flagged), cheatRisk: p.cheat?.risk ?? null, progression: p.cheat?.parts?.progression ?? null };
  });
}

/** Every model's summary, and what was scheduled and never painted. {models: [summary], schedule, failed: [..]} */
export function summarizeResults(results, { schedule = null } = {}) {
  const records = recordsOf(results);
  // Auto of a scheduled picture that is not among the results: named, since nothing can be measured against it
  if (schedule) {
    const have = new Set(records.filter(r => r.level === 'Auto').map(r => r.subject));
    const gone = schedule.Auto.filter(s => !have.has(s));
    if (gone.length) throw new Error(`summary04: Auto is scheduled and not among the results for ${gone.join(', ')}. Every scheduled picture needs its Auto painting scored in the same results (a failed Auto run is listed there as failed)`);
  }
  // Auto paints only the scheduled pictures; a picture outside the schedule is not averaged in
  const inSchedule = r => !schedule || (schedule[r.level] ?? []).includes(r.subject);
  const outside = records.filter(r => !inSchedule(r));
  const autos = records.filter(r => r.level === 'Auto' && inSchedule(r));
  const models = [...new Set(records.filter(r => r.level !== 'Auto').map(r => r.model))];
  const out = models.map(model => summarize([...autos, ...records.filter(r => r.model === model && inSchedule(r))], { scale: SCALE, model, scheduled: schedule ? Object.fromEntries(MODEL_LEVELS.map(l => [l, schedule[l]])) : null }));
  return { models: out, schedule, outside: outside.map(r => `${r.id} (${r.level}, ${r.subject})`), failed: records.filter(r => r.failed).map(r => ({ id: r.id, model: r.model ?? 'Auto', level: r.level, subject: r.subject, why: r.why })),
    flagged: records.filter(r => r.likenessFlagged).map(r => `${r.id} (likeness ${r.likeness} of 5)`) };
}

const num = v => (v == null ? 'n/a' : (+v.toFixed(2)).toString());
const signed = v => (v == null ? 'n/a' : `${v > 0 ? '+' : ''}${num(v)}`);

/** SUMMARY.md: the headline table of every model, then each model's pictures. */
export function summaryMarkdown(results, sum, { setName = null } = {}) {
  const j = results.judge ?? {};
  const L = ['# 0.4 summary', '',
    `From results written ${results.written ?? '(no date)'} by \`npm run bench:score04\`. Judges: **${j.label ?? 'not named'}** (panel ${j.panelName ?? 'not named'}, reasoning ${j.reasoning ?? 'not recorded'}); human-ness scheme ${results.snapshotScheme?.name ?? 'not named'}. The figure summed is the combined figure, 0 to 100 (${results.weights?.humanness ?? '?'} parts human-ness to ${results.weights?.quality ?? '?'} part quality; likeness is not in it).`,
    setName ? `Schedule: the run set \`${setName}\` (bench/run-sets.json). A scheduled picture with no painting, or whose run failed, counts as 0.` : 'No schedule was named: every picture Auto painted is expected at every level a model entered, and one with no painting counts as 0.', ''];
  L.push('## Every model', '', `| Model | ${MODEL_LEVELS.map(l => `${l}: adjusted for Auto (interval) | raw mean | pictures, failed`).join(' | ')} |`, `|---|${MODEL_LEVELS.map(() => '---:|---:|---:|').join('')}`);
  for (const s of sum.models) {
    const cell = l => { const v = s.levels[l]; return v ? [`${signed(v.adjusted)}${v.interval ? ` (${signed(v.interval[0])} to ${signed(v.interval[1])})` : ''}`, `${num(v.rawMean)} (Auto ${num(v.autoRawMean)})`, `${v.subjects}, ${v.failed} failed`] : ['not run', 'not run', 'not run']; };
    L.push(`| ${s.model} | ${MODEL_LEVELS.flatMap(cell).join(' | ')} |`);
  }
  L.push('', 'Adjusted for Auto: (painting - Auto) / max(100 - Auto, 20), averaged over the pictures scheduled at the level; 0 is level with Auto. The interval is a bootstrap over pictures.', '',
    `What each level is: ${MODEL_LEVELS.map(l => `${l}, ${headerFor(l).toLowerCase()}`).join('; ')}. ${LEVEL_NOTE}`, '');
  L.push('## Failed runs', '', ...(sum.failed.length ? [`${sum.failed.length} scheduled run${sum.failed.length === 1 ? '' : 's'} failed. Each counts as 0 above; none is dropped.`, '', ...sum.failed.map(f => `- ${f.model} ${f.level}, ${f.subject}: ${f.why}`)] : ['- None among the results. (A scheduled picture with no entry at all is shown as "no painting" in its model\'s table.)']), '');
  if (sum.flagged.length) L.push('## Likeness at the bottom of the scale', '', 'These paintings may not be paintings of their pictures at all; their scores above stand as judged and are for a person to look at.', '', ...sum.flagged.map(f => `- ${f}`), '');
  if (sum.outside.length) L.push('## Outside the schedule, not summed', '', ...sum.outside.map(f => `- ${f}`), '');
  for (const s of sum.models) L.push(`## ${s.model}`, '', subjectTable(s), '');
  return L.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), opt = k => { const i = args.indexOf(`--${k}`); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const setName = opt('set'), out = opt('out');
  try {
    if (args.length !== 1) throw new Error('usage: npm run bench:summary04 -- DIR/results.json [--set core|extended] [--out FILE.md]');
    const results = JSON.parse(fs.readFileSync(args[0], 'utf8'));
    const sum = summarizeResults(results, { schedule: setName ? scheduleOf(setName) : null });
    const md = summaryMarkdown(results, sum, { setName });
    const file = out ?? path.join(path.dirname(args[0]), 'SUMMARY.md');
    fs.writeFileSync(file, md);
    console.log(`bench:summary04: wrote ${file}: ${sum.models.length} model${sum.models.length === 1 ? '' : 's'}, ${sum.failed.length} failed run${sum.failed.length === 1 ? '' : 's'} counted`);
  } catch (e) { console.error(`bench:summary04: ${e.message}`); process.exit(2); }
}
