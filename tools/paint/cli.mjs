#!/usr/bin/env node
// Paint one picture, or several, by name: npm run paint -- <subject[,subject...]> plan|paint [options] (args.mjs).
// For each subject and author it reads the subject's record, checks every pinned input, prints what will run, runs
// the painter once, and writes run.json and one labelled sheet.jpg. Several runs also make one grid sheet.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, USAGE } from './args.mjs';
import { loadRegistry, resolveSubject, checkInputs } from './subjects.mjs';
import { buildCommand, describeRun, shellLine, runFolder } from './command.mjs';
import { refuseThirdGpuPaint, cacheDirFor, switchesOf, segEnvFor, runPainter, collectResults } from './run.mjs';
import { writeRunSheet, writeGridSheet, runPictures } from './sheet.mjs';
import { authorOf, readScript, prepareWorkspace, authorWithModel, runnerNeeds } from './author.mjs';
import { codeState } from '../../src/paint/code-state.mjs';
import { scanOptions } from '../../src/paint/option-ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..');
const fail = (msg, code = 2) => { console.error(`paint: ${msg}`); process.exit(code); };

let req;
try { req = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`paint: ${e.message}\n\n${USAGE}`); process.exit(2); }

const stamp = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
const now = new Date(), started = (s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(9, 11)}:${s.slice(11, 13)}`)(stamp(now));
const variants = JSON.parse(fs.readFileSync(path.join(HERE, 'variants.json'), 'utf8'));
const models = JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', 'models.json'), 'utf8')).models;
const known = new Set(scanOptions(ROOT).keys());
const code = codeState(ROOT), switches = switchesOf();
// the painter's environment: where segmentation lives, and a cache folder keyed on the experiment switches
const segEnv = { ...segEnvFor(ROOT), W2_CACHE_DIR: cacheDirFor(process.env.W2_CACHE_DIR || path.join(ROOT, 'work', 'cache'), switches) };

// every subject and author is resolved and checked before anything runs
let registry, specs, authors;
try {
  registry = loadRegistry();
  authors = req.authors.map(a => authorOf(a, models));
  if (req.studies === 'author') {
    throw new Error('--studies author is not available on this base: the tools an author briefs and reviews its own Qwen studies with (tools/assisted-studies.py, tools/assisted-paint.py and the local Qwen driver, on branch codex/04-recovery) are not here. Run with --studies locked.');
  }
  specs = req.subjects.map(({ id, variant }) => {
    const v = variant ? variants[id]?.[variant] : null;
    if (variant && !v) throw new Error(`subject ${id} has no variant "${variant}" in tools/paint/variants.json${variants[id] ? ` (it has: ${Object.keys(variants[id]).join(', ')})` : ''}`);
    return checkInputs(resolveSubject(registry, id, { sets: req.sets, variant: v, variantName: variant }));
  });
} catch (e) { fail(e.message); }

const many = specs.length * authors.length > 1;
const outRoot = path.resolve(req.out ?? path.join(ROOT, 'work', 'paint', `${stamp(now)}-${specs.map(s => s.id).join('+')}-${req.mode}`));
const runs = [];
for (const spec of specs) for (const author of authors) {
  const out = many ? path.join(outRoot, runFolder(spec, author.key === 'auto' ? 'auto' : author.name)) : outRoot;
  const scriptFile = author.key === 'auto' ? null : path.join(out, 'author', 'script.json');
  let command;
  try { command = buildCommand(spec, { mode: req.mode, out: path.join(out, 'plate'), known, dirty: code.dirty, segEnv, script: scriptFile ? { file: scriptFile, paints: ['(the script\'s palette)'] } : null }); } catch (e) { fail(e.message); }
  const pinned = spec.drawing.files.every(f => f.sha256);
  runs.push({
    spec, authorFull: author,
    record: {
      schema: 'unpaint-paint/run@1', started, mode: req.mode, studiesMode: req.studies, out, plate: path.join(out, 'plate'),
      subject: { key: `${spec.id}:${spec.variant ?? ''}`, id: spec.id, name: spec.name, variant: spec.variant, variantWhy: spec.variantWhy, registry: spec.registry,
        source: spec.source.path, sourceAbs: spec.source.abs, sourcePx: spec.source.px, sourceSha256: spec.source.sha256,
        labels: spec.labels?.path ?? null, labelCount: spec.labels?.count ?? null, deviations: spec.deviations },
      sheet: spec.sheet,
      drawing: { stem: spec.drawing.stem, medium: command.medium, pinned, files: spec.drawing.files.map(f => f.abs), sha256: spec.drawing.files.map(f => f.sha256 ?? f.unpinnedSha256) },
      studies: spec.studies.map(s => ({ path: s.path, abs: s.abs, sha256: s.sha256, role: s.role, floorMm2: s.floorMm2, read: s.read })),
      masks: spec.masks ? { receipt: spec.masks.receipt, mask: spec.masks.mask, forms: spec.masks.forms, read: command.masksRead,
        whyNotRead: command.masksRead ? null : scriptFile ? 'an authored script is laid as written' : 'this painter has no --thingmasks option yet' } : null,
      author: { key: author.key, name: author.name, id: author.id ?? null, runner: author.runner ?? null },
      settings: command.settings, switches, code: { commit: code.commit, dirty: Boolean(code.dirty), tracked: code.tracked, untracked: code.untracked.map(u => u.file), diffSha256: code.diffSha256 },
      environment: command.env, command: shellLine(command), argv: command.argv, results: null, exit: null, seconds: null, failure: null,
    },
  });
}

for (const r of runs) { console.log(''); for (const l of describeRun(r.record)) console.log(l); }
if (req.dryRun) { console.log('\ndry run: nothing was started'); process.exit(0); }

let failed = 0;
for (const r of runs) {
  const { spec, record, authorFull: author } = r;
  console.log(`\n=== ${spec.id}, ${req.mode}, author ${author.name} ===`);
  try {
    if (req.mode === 'paint') refuseThirdGpuPaint();
    // the painter writes into plate/, which it wants empty; the log, the sheet and run.json sit beside it
    if (fs.existsSync(record.plate) && fs.readdirSync(record.plate).length) throw new Error(`${record.plate} already holds a painting; give a fresh --out`);
    fs.mkdirSync(record.out, { recursive: true });
    let command = null;
    if (author.key !== 'auto') {
      // the author's script: a kept one, or one a model writes now from the locked inputs
      const dir = path.join(record.out, 'author'), kept = path.join(dir, 'script.json'); fs.mkdirSync(dir, { recursive: true });
      if (author.runner === 'script') fs.copyFileSync(author.file, kept);
      else {
        const work = await prepareWorkspace({ dir, root: ROOT, run: record, pics: await runPictures(record), briefFile: process.env.UNPAINT_AUTHOR_BRIEF || path.join(HERE, 'AUTHOR-BRIEF.md') });
        console.log(`author: launching ${author.name} in ${work.ws} with its permission prompts off (needs ${runnerNeeds(author.runner)})`);
        const got = await authorWithModel(author, { dir, work });
        fs.copyFileSync(got.file, kept); record.author.tokens = got.tokens; record.author.seconds = got.seconds;
        console.log(`author: script written in ${got.seconds} s${got.tokens ? `, ${got.tokens} tokens` : ''}`);
      }
      const { paints, script } = readScript(kept, { sheetWidthMm: spec.sheet.widthMm });
      record.author.passages = script.passages.length; record.author.palette = paints;
      command = buildCommand(spec, { mode: req.mode, out: record.plate, known, dirty: code.dirty, segEnv, script: { file: kept, paints } });
      record.command = shellLine(command); record.argv = command.argv;
      console.log(`author: ${script.passages.length} passages, palette ${paints.join(', ')}\ncommand:  ${record.command}`);
    } else command = buildCommand(spec, { mode: req.mode, out: record.plate, known, dirty: code.dirty, segEnv });
    const done = await runPainter(command, { cwd: ROOT, logFile: path.join(record.out, 'run.log'), onLine: l => { if (/^(study washes|wash plan|plan values|phases|!!!|UNUSED|IGNORED|cache:|code:|segments:)/.test(l) || /Error/.test(l)) console.log(`  ${l.slice(0, 400)}`); } });
    record.exit = done.exit; record.seconds = done.seconds;
    // exit 3: the painting is written but an option was read by nothing (unused-options.txt)
    if (done.exit !== 0 && done.exit !== 3) record.failure = `the painter ended with exit ${done.exit ?? done.signal}; see ${path.join(record.out, 'run.log')}`;
  } catch (e) { record.failure = e.message; }
  record.results = collectResults(record.plate, req.mode);
  if (!record.failure && ['no plan', 'unfinished'].includes(record.results.state)) record.failure = `the painter ended without ${req.mode === 'plan' ? 'a plan' : 'a finished painting'}`;
  if (record.failure) { failed++; console.error(`paint: ${spec.id}: ${record.failure}`); }
  fs.mkdirSync(record.out, { recursive: true });
  const sheet = await writeRunSheet(record, path.join(record.out, 'sheet.jpg'));
  record.sheetImage = sheet.file;
  fs.writeFileSync(path.join(record.out, 'run.json'), JSON.stringify(record, null, 1) + '\n');
  const p = record.results.plan;
  console.log(`${record.results.state}${p ? `: ${p.shapes} shapes, ${p.washes} washes, ${p.strokes} strokes, widest wash brush ${p.widestBrushMm} mm` : ''}${record.results.cheatRisk?.level ? `; cheat-risk ${record.results.cheatRisk.level}` : ''}; ${record.seconds ?? 0} s\nsheet: ${sheet.file}`);
}

let show = runs[0].record.sheetImage;
if (many) {
  const grid = await writeGridSheet(runs.map(r => r.record), path.join(outRoot, 'sheet.jpg'), { title: `${specs.map(s => s.id).join(', ')} · ${req.mode}` });
  fs.writeFileSync(path.join(outRoot, 'run.json'), JSON.stringify({ schema: 'unpaint-paint/grid@1', started, mode: req.mode, sheet: grid.file, runs: runs.map(r => ({ subject: r.record.subject.id, author: r.record.author.key, out: r.record.out, state: r.record.results.state, failure: r.record.failure })) }, null, 1) + '\n');
  console.log(`\ngrid: ${grid.file}`); show = grid.file;
}
// Preview is opened without this session's variables, so nothing started from it inherits them
if (req.open && process.platform === 'darwin') { try { execFileSync('env', ['-i', `HOME=${process.env.HOME}`, `USER=${process.env.USER}`, 'PATH=/usr/bin:/bin', 'open', '-a', 'Preview', show]); } catch (e) { console.error(`paint: could not open the sheet (${e.message})`); } }
process.exit(failed ? 1 : 0);
