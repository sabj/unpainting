#!/usr/bin/env node
// One subject's plans side by side, a row an author: the source, the middle study, the code planner's plan, the
// author's plan under the first brief, its first script under the present brief, and that script after the step back.
//   node tools/paint/step-back-sheet.mjs <sheet.jpg> <auto run> <author label>=<v1 run>,<v2 run> [...] [--height PX]
// A run is a folder of `npm run paint` (run.json); the v2 run holds step-back/ (tools/paint/step-back.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { composeSheet, wordsImage, wrap } from './sheet.mjs';

const args = process.argv.slice(2), at = args.indexOf('--height'), height = at < 0 ? 620 : Number(args.splice(at, 2)[1]);
const [file, autoDir, ...rest] = args;
if (!file || !autoDir || !rest.length) { console.error('usage: node tools/paint/step-back-sheet.mjs <sheet.jpg> <auto run> <author label>=<v1 run>,<v2 run> [...] [--height PX]'); process.exit(2); }
const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
// the painter's own line on a plan's values against the subject's, from the run's log
const values = d => { try { return /plan values:?\s*(.*)$/m.exec(fs.readFileSync(path.join(d, 'run.log'), 'utf8'))?.[1]?.trim().slice(0, 110) ?? ''; } catch { return ''; } };
const blank = words => wordsImage(words, 600, 600);
async function cell(title, dir, extra = []) {
  const run = read(path.join(dir, 'run.json')), res = run?.results, p = res?.plan;
  if (!res?.planPreview || !fs.existsSync(res.planPreview)) return { title, alert: 'NO PLAN', captions: [run?.failure ?? 'not run'], image: await blank(['NO PLAN', ...wrap(run?.failure ?? path.basename(dir), 40)]) };
  return { title, captions: [`${p.passages != null ? `${p.passages} passages` : `${p.shapes ?? '?'} shapes`}, ${p.strokes ?? '?'} strokes, widest brush ${p.widestBrushMm ?? '?'} mm`, values(dir), ...extra], image: res.planPreview };
}
const auto = read(path.join(autoDir, 'run.json')), study = auto.studies[Math.min(1, auto.studies.length - 1)], rows = [];
for (const word of rest) {
  const [label, dirs] = word.split('='), [v1, v2] = dirs.split(','), sb = read(path.join(v2, 'step-back', 'step-back.json')), r2 = read(path.join(v2, 'run.json'));
  const cost = [r2?.author, sb].filter(Boolean).map(x => `${x.seconds ?? '?'} s, ${x.tokens ?? '?'} tokens${x.costUSD != null ? `, $${Number(x.costUSD).toFixed(2)}` : ''}`);
  const after = !sb ? { title: 'After the step back: NOT RUN', alert: 'NOT RUN', captions: [], image: await blank(['NO STEP BACK YET']) }
    : sb.kept ? { title: 'After the step back: KEPT AS IT WAS', alert: sb.error ? 'REVISION NOT USABLE' : null, captions: [sb.error ?? sb.why ?? '', `look: ${cost[1]}`], image: (await cell('', v2)).image }
      : await cell('Present brief, after the step back', path.join(v2, 'step-back', 'revised'), [`${sb.diff.changed.length} passages changed, ${sb.diff.added.length} added, ${sb.diff.removed.length} removed; look: ${cost[1]}`, ...wrap((sb.changed ?? []).join(' / '), 95, 4)]);
  rows.push({ label, height, panels: [
    { title: 'Source', captions: [auto.subject.source], image: auto.subject.sourceAbs }, { title: 'Middle study', captions: [study.path.split('/').pop()], image: study.abs },
    await cell('auto (code planner)', autoDir), await cell('First brief (v1)', v1), await cell('Present brief (v2), first script', v2, [`author: ${cost[0]}`]), after] });
}
const done = await composeSheet({ header: [`${auto.subject.id} (${auto.subject.name}) · PLAN ONLY (CPU) · locked inputs · what the author's brief and one step back change in the plan`, 'a plan preview shows intended shapes and values, not wet edges or brush marks; "plan values" is the painter\'s own line: the plan\'s number, then the subject\'s in brackets'], rows, file, quality: 86 });
console.log(`step-back sheet: ${done.file} (${done.width} x ${done.height})`);
