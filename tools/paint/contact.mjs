#!/usr/bin/env node
// The contact sheet and the table of a queue of paintings:
//   node tools/paint/contact.mjs <queue folder> <sheet.jpg> [--first N] [--table RESULTS.md] [--height PX]
// One row a subject, in the order the runs started: source | wash plan | painting, large enough to judge a face.
// A run that failed keeps its row with the reason in it; a run folder with no run.json yet (still painting, or
// waiting its turn) gets a short row that says so.
import fs from 'node:fs';
import path from 'node:path';
import { composeSheet, wordsImage, wrap, riskLine } from './sheet.mjs';
import { resultRow, resultsTable } from './results.mjs';

const [dir, file, ...rest] = process.argv.slice(2);
const opt = k => { const i = rest.indexOf(k); return i < 0 ? null : rest[i + 1]; };
if (!dir || !file) { console.error('usage: node tools/paint/contact.mjs <queue folder> <sheet.jpg> [--first N] [--table RESULTS.md] [--height PX]'); process.exit(2); }
const first = Number(opt('--first')) || Infinity, height = Number(opt('--height')) || 760, table = opt('--table');

const runs = fs.readdirSync(dir).map(d => path.join(dir, d, 'run.json')).filter(f => fs.existsSync(f)).map(f => JSON.parse(fs.readFileSync(f, 'utf8')))
  .filter(r => r.schema === 'unpaint-paint/run@1').sort((a, b) => (a.startedMs ?? Infinity) - (b.startedMs ?? Infinity)).slice(0, first);
if (!runs.length) { console.error(`contact: no finished run.json under ${dir}`); process.exit(1); }

const rows = [], results = [];
for (const run of runs) {
  const res = run.results ?? {}, plan = (() => { try { return JSON.parse(fs.readFileSync(path.join(run.plate, 'value-plan.json'), 'utf8')); } catch { return null; } })();
  const log = ['run.log', 'run-retry.log'].map(f => { try { return fs.readFileSync(path.join(run.out, f), 'utf8'); } catch { return ''; } }).join('\n');
  const row = resultRow(run, plan, log); results.push(row);
  const blank = async words => wordsImage(words, 700, Math.round(700 * (run.sheet.rows ?? 3) / (run.sheet.cells ?? 4)));
  const painted = res.state === 'finished' && res.painting && fs.existsSync(res.painting);
  rows.push({
    label: `${row.subject} (${run.subject.name}) · ${run.author.label ?? run.author.name} · ${row.minutes ?? '?'} min · ${run.sheet.widthMm} mm, ${run.sheet.cells} cells${run.failure ? ` · FAILED: ${run.failure}` : ''}`,
    height,
    panels: [
      { title: 'Source', captions: [run.subject.source], image: run.subject.sourceAbs },
      { title: 'Wash plan', alert: res.planPreview ? null : 'NO PLAN', captions: [`${row.shapes ?? '?'} shapes, ${row.washes ?? '?'} washes, ${row.strokes ?? '?'} strokes; soft joins ${row.softJoins ?? '?'}`, `widest wash brush ${row.widestMm ?? '?'} mm; in face/figure/animal/fur ${row.widestLivingMm ?? '-'} mm`],
        image: res.planPreview && fs.existsSync(res.planPreview) ? res.planPreview : await blank(['NO PLAN', ...wrap(run.failure ?? '', 50)]) },
      { title: painted ? 'Painting' : 'Painting: NOT FINISHED', alert: painted ? null : 'NOT FINISHED', captions: [riskLine(res.cheatRisk), `backend ${row.backend ?? '?'}`],
        image: painted ? res.painting : res.painting && fs.existsSync(res.painting) ? res.painting : await blank(['NOT PAINTED', ...wrap(run.failure ?? '', 50)]) },
    ],
  });
}
const pending = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && !fs.existsSync(path.join(dir, e.name, 'run.json'))).map(e => e.name);
if (first === Infinity) for (const name of pending) {
  const started = fs.existsSync(path.join(dir, name, 'run.log'));
  rows.push({ label: `${name} · ${started ? 'RUNNING' : 'WAITING ITS TURN'} when this sheet was made`, height: 90, panels: [{ title: '', captions: [], image: await wordsImage([started ? 'RUNNING' : 'NOT STARTED'], 700, 90) }] });
}
const done = await composeSheet({ header: [`${runs.length} paintings from ${dir}: source | wash plan | painting`, 'author auto (the code planner) unless a row says otherwise · full registered size · named forms resolved from the named-forms folder · target guard gentle'], rows, file, quality: 86 });
console.log(`contact sheet: ${done.file} (${done.width} x ${done.height})`);
if (pending.length && first === Infinity) console.log(`not finished: ${pending.join(', ')}`);
if (table) { fs.writeFileSync(table, resultsTable(results) + '\n'); console.log(`table: ${table}`); }
