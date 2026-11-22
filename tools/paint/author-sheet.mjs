#!/usr/bin/env node
// One subject painted by several authors, side by side, large enough to judge a face:
//   node tools/paint/author-sheet.mjs <sheet.jpg> <run folder> [<run folder> ...] [--height PX]
// The first row is the source and then each run's painting in the order given; under it, each run's stage strip
// (the sheet at 10, 25, 50, 75 and 100% of the strokes). A run folder holds run.json (npm run paint). A run that is
// still painting, or failed, keeps its place with the reason in it.
import fs from 'node:fs';
import path from 'node:path';
import { composeSheet, wordsImage, wrap, riskLine, sessionLine } from './sheet.mjs';
import { authorLabel } from './author.mjs';

const args = process.argv.slice(2), at = args.indexOf('--height'), height = at < 0 ? 900 : Number(args.splice(at, 2)[1]);
const [file, ...dirs] = args;
if (!file || !dirs.length) { console.error('usage: node tools/paint/author-sheet.mjs <sheet.jpg> <run folder> [<run folder> ...] [--height PX]'); process.exit(2); }

const runs = dirs.map(d => { try { return JSON.parse(fs.readFileSync(path.join(d, 'run.json'), 'utf8')); } catch { return { missing: d }; } });
const first = runs.find(r => !r.missing);
if (!first) { console.error('author-sheet: no run.json in any of the folders'); process.exit(1); }
const blank = words => wordsImage(words, 700, Math.round(700 * (first.sheet.rows ?? 4) / (first.sheet.cells ?? 3)));
const panels = [{ title: 'Source', captions: [first.subject.source], image: first.subject.sourceAbs }], strips = [];
for (const run of runs) {
  if (run.missing) { panels.push({ title: path.basename(run.missing), alert: 'RUNNING OR NOT RUN', captions: ['no run.json yet'], image: await blank(['NOT PAINTED YET', path.basename(run.missing)]) }); continue; }
  const res = run.results ?? {}, name = authorLabel(run.author), done = res.state === 'finished' && res.painting && fs.existsSync(res.painting), p = res.plan;
  panels.push({
    title: `${name}${done ? '' : ': NOT FINISHED'}`, alert: done ? null : 'NOT FINISHED',
    captions: [`${p ? `${p.passages != null ? `${p.passages} passages` : `${p.shapes ?? '?'} shapes`}, ${p.washes ?? '?'} washes, ${p.strokes ?? '?'} strokes, widest brush ${p.widestBrushMm ?? '?'} mm` : 'no plan'}; ${Math.round((run.seconds ?? 0) / 60)} min`, ...(run.author.work === 'session' ? [sessionLine(run.author)] : []), riskLine(res.cheatRisk), `${run.code.commit?.slice(0, 8)}${run.code.dirty ? ' + uncommitted changes' : ''}${run.failure ? ` · FAILED: ${run.failure}` : ''}`],
    image: res.painting && fs.existsSync(res.painting) ? res.painting : await blank(['NOT PAINTED', ...wrap(run.failure ?? '', 50)]),
  });
  if (res.strip && fs.existsSync(res.strip)) strips.push({ label: `${name}: the source, then the sheet at 10, 25, 50, 75 and 100% of the strokes`, height: Math.round(height * 0.42), panels: [{ title: '', captions: [], image: res.strip }] });
}
const done = await composeSheet({ header: [`${first.subject.id} (${first.subject.name}) · one painter, several planners · locked inputs · ${first.sheet.widthMm} mm, ${first.sheet.cells} cells`, 'Code planner alone: the wash plan computed from the studies. A model\'s column: the same inputs and the code planner\'s plan, given to the model; what it handed over (planner settings, an edit of the code planner\'s plan, or its own script) is laid by the same painter.'], rows: [{ height, panels }, ...strips], file, quality: 86 });
console.log(`author sheet: ${done.file} (${done.width} x ${done.height})`);
