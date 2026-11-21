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
import { writeRunSheet, writeGridSheet, runPictures, formsImage } from './sheet.mjs';
import { authorOf, authorLabel, readScript, preparePacket, askAuthor, retryPrompt } from './author.mjs';
import { qwenRoute, studyRequestPrompt, parseStudyRequests, writeStudyRequest, makeStudies, withAuthorStudies } from './studies.mjs';
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
const ownAuthors = JSON.parse(fs.readFileSync(path.join(HERE, 'authors.json'), 'utf8')).authors;
const known = new Set(scanOptions(ROOT).keys());
const code = codeState(ROOT), switches = switchesOf();
// the painter's environment: where segmentation lives, and a cache folder keyed on the experiment switches
const segEnv = { ...segEnvFor(ROOT), W2_CACHE_DIR: cacheDirFor(process.env.W2_CACHE_DIR || path.join(ROOT, 'work', 'cache'), switches) };

// every subject and author is resolved and checked before anything runs
let registry, specs, authors, qwen = null;
try {
  registry = loadRegistry();
  authors = req.authors.map(a => authorOf(a, ownAuthors, models));
  if (req.studies === 'author') {
    // open tools: the author's own studies are made by the local image model; every piece of that route must be here
    qwen = qwenRoute(registry.base);
    if (!qwen.ready) throw new Error(`--studies author needs the local study route, and this machine lacks: ${qwen.missing.join('; ')}. Run with --studies locked.`);
    if (authors.some(a => !a.cli || a.cli === 'script')) throw new Error('--studies author: every author must be a model (auto and kept scripts make no studies)');
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
      masks: spec.masks.receipt ? { receipt: spec.masks.receipt, from: spec.masks.from, mask: spec.masks.mask, review: spec.masks.review, forms: spec.masks.forms, read: command.masksRead,
        whyNotRead: command.masksRead ? null : 'an authored script is laid as written' } : { receipt: null, none: spec.masks.none },
      author: { key: author.key, name: author.name, label: authorLabel(author), id: author.id ?? null, cli: author.cli ?? null, effort: author.effort ?? null },
      settings: command.settings, switches, code: { commit: code.commit, dirty: Boolean(code.dirty), tracked: code.tracked, untracked: code.untracked.map(u => u.file), diffSha256: code.diffSha256 },
      environment: command.env, command: shellLine(command), argv: command.argv, results: null, exit: null, seconds: null, failure: null,
    },
  });
}

for (const r of runs) { console.log(''); for (const l of describeRun(r.record)) console.log(l); }
if (req.dryRun) { console.log('\ndry run: nothing was started'); process.exit(0); }
console.log('');

// Several runs go on together: model replies in parallel (agy one at a time: its sessions interrupt one another),
// CPU plans three at a time, GPU paintings one after another.
const pool = n => { let free = n; const wait = []; return async fn => { if (free > 0) free--; else await new Promise(r => wait.push(r)); try { return await fn(); } finally { const next = wait.shift(); if (next) next(); else free++; } }; };
const painterSlot = pool(req.mode === 'plan' ? 3 : 1), agySlot = pool(1), modelSlot = pool(6), qwenSlot = pool(1);
const say = (r, text) => console.log(`[${r.spec.id} · ${r.record.author.name}] ${text}`);
const SHOWN = /^(study washes: \d|wash plan:|plan values|phases|!!!|UNUSED|IGNORED|named forms|painting script)/;

/** The painter once, into a fresh folder. {failure, results}; never throws. */
async function paintOnce(r, command, plate, logFile) {
  const { record } = r; let failure = null, done = null;
  try {
    if (fs.existsSync(plate) && fs.readdirSync(plate).length) throw new Error(`${plate} already holds a painting; give a fresh --out`);
    done = await painterSlot(async () => {
      if (req.mode === 'paint') refuseThirdGpuPaint();
      return runPainter(command, { cwd: ROOT, logFile, onLine: l => { if (SHOWN.test(l) || /^\s*(Error|TypeError|RangeError)/.test(l)) say(r, l.trim().slice(0, 300)); } });
    });
    record.exit = done.exit; record.seconds = (record.seconds ?? 0) + done.seconds;
    // exit 3: the painting is written but an option was read by nothing (unused-options.txt)
    if (done.exit !== 0 && done.exit !== 3) {
      const why = fs.readFileSync(logFile, 'utf8').split('\n').filter(l => /(^|\s)(Error|TypeError|RangeError)\b/.test(l)).pop()?.trim().slice(0, 400);
      failure = `the painter ended with exit ${done.exit ?? done.signal}${why ? `: ${why}` : ''}`;
    }
  } catch (e) { failure = e.message; }
  const results = collectResults(plate, req.mode);
  if (!failure && ['no plan', 'unfinished'].includes(results.state)) failure = `the painter ended without ${req.mode === 'plan' ? 'a plan' : 'a finished painting'}`;
  return { failure, results };
}

async function oneRun(r) {
  const { spec, record, authorFull: author } = r;
  fs.mkdirSync(record.out, { recursive: true });
  try {
    if (author.key === 'auto') {
      const got = await paintOnce(r, buildCommand(spec, { mode: req.mode, out: record.plate, known, dirty: code.dirty, segEnv }), record.plate, path.join(record.out, 'run.log'));
      record.failure = got.failure; record.results = got.results;
    } else {
      // the author's script: a kept one, or one a model writes now from the locked inputs. A model whose answer is
      // refused, or whose script the painter cannot plan, is asked once more with the reason; then the result stands.
      const dir = path.join(record.out, 'author'), kept = path.join(dir, 'script.json'); fs.mkdirSync(dir, { recursive: true });
      const model = author.cli !== 'script', pics = model ? await runPictures(record) : null;
      const briefFile = process.env.UNPAINT_AUTHOR_BRIEF || path.join(HERE, 'AUTHOR-BRIEF.md');
      const packetOf = async () => preparePacket({ dir, root: ROOT, run: { ...record, masks: record.masks.receipt ? { ...record.masks, formsPng: await formsImage(record.masks.mask) } : null }, drawingPng: pics.drawing, briefFile });
      const call = (a, fn) => modelSlot(() => (a.cli === 'agy' ? agySlot(fn) : fn()));
      let packet = model ? await packetOf() : null;
      record.author.calls = [];
      if (model && qwen) {
        // open tools: the author briefs its own studies, the local image model makes them, and they take the place of
        // the registered studies of those roles in what the author sees. A failure here is recorded and the registered
        // studies stand.
        try {
          say(r, `asking ${authorLabel(author)} which studies it wants to brief itself`);
          const asked = await call(author, () => askAuthor(author, packet, { stem: 'S', prompt: studyRequestPrompt(packet.brief, packet.files), want: 'studies' }));
          record.author.calls.push({ attempt: 'studies', seconds: asked.seconds, tokens: asked.tokens, costUSD: asked.costUSD, ok: asked.ok, error: asked.error });
          if (!asked.ok) throw new Error(asked.error);
          const requests = parseStudyRequests(asked.answer);
          record.author.studyRequests = { seen: asked.answer.seen ?? null, requests };
          if (requests.length) {
            const request = writeStudyRequest({ dir: path.join(dir, 'studies'), authorKey: author.key, source: { abs: spec.source.abs, sha256: spec.source.sha256 }, route: qwen, seed: spec.studySeed ?? 42, requests });
            say(r, `making ${requests.length} studies to its briefs with the local image model (one at a time on this machine)`);
            const made = await qwenSlot(() => makeStudies({ root: ROOT, request, requests, route: qwen }));
            record.studies = withAuthorStudies(record.studies, made); record.author.studiesMade = made;
            packet = await packetOf();
          } else say(r, 'it asked for no studies of its own');
        } catch (e) { record.author.studiesNote = `its own studies were not made: ${e.message}`; say(r, record.author.studiesNote); }
      }
      let prompt = packet?.prompt, why = null;
      for (let attempt = 1; attempt <= (model ? 2 : 1); attempt++) {
        let got;
        if (model) {
          say(r, `asking ${authorLabel(author)} (${author.cli}, read-only), attempt ${attempt}`);
          got = await call(author, () => askAuthor(author, packet, { stem: attempt === 1 ? 'A' : 'A-retry', prompt, sheetWidthMm: spec.sheet.widthMm }));
          record.author.calls.push({ attempt, seconds: got.seconds, tokens: got.tokens, costUSD: got.costUSD, ok: got.ok, error: got.error });
          say(r, got.ok ? `script accepted: ${got.script.passages.length} passages, ${got.seconds} s${got.tokens ? `, ${got.tokens} tokens` : ''}` : `answer refused after ${got.seconds} s: ${got.error}`);
          // a model that could not be called at all is not asked again
          if (!got.ok && /could not be called|ended with exit/.test(got.error) && !got.raw.trim()) { why = got.error; break; }
        } else { try { got = { ok: true, ...readScript(author.file, { sheetWidthMm: spec.sheet.widthMm }) }; } catch (e) { got = { ok: false, error: e.message, raw: '' }; } }
        if (!got.ok) { why = got.error; prompt = model ? retryPrompt(packet.prompt, got.raw, got.error) : null; continue; }
        fs.writeFileSync(kept, JSON.stringify(got.script, null, 1) + '\n');
        Object.assign(record.author, { passages: got.script.passages.length, palette: got.paints, brushes: Object.fromEntries(Object.entries(got.script.brushes).map(([k, b]) => [k, b.widthMm])) });
        const plate = attempt === 1 ? record.plate : `${record.plate}-retry`, command = buildCommand(spec, { mode: req.mode, out: plate, known, dirty: code.dirty, segEnv, script: { file: kept, paints: got.paints } });
        record.command = shellLine(command); record.argv = command.argv; record.plate = plate;
        const painted = await paintOnce(r, command, plate, path.join(record.out, attempt === 1 ? 'run.log' : 'run-retry.log'));
        record.results = painted.results; why = painted.failure;
        if (!why) break;
        say(r, `the painter refused the script: ${why}`);
        prompt = model ? retryPrompt(packet.prompt, JSON.stringify(got.script), `The painter could not plan the script. ${why}`) : null;
      }
      record.failure = why;
      const calls = record.author.calls;
      if (calls.length) Object.assign(record.author, { seconds: calls.reduce((a, c) => a + (c.seconds || 0), 0), tokens: calls.some(c => c.tokens) ? calls.reduce((a, c) => a + (c.tokens || 0), 0) : null, costUSD: calls.some(c => c.costUSD != null) ? +calls.reduce((a, c) => a + (c.costUSD || 0), 0).toFixed(4) : null });
    }
  } catch (e) { record.failure = e.message; }
  record.results ??= collectResults(record.plate, req.mode);
  if (record.failure) say(r, `FAILED: ${record.failure}`);
  try { record.sheetImage = (await writeRunSheet(record, path.join(record.out, 'sheet.jpg'))).file; } catch (e) { say(r, `no sheet: ${e.message}`); }
  fs.writeFileSync(path.join(record.out, 'run.json'), JSON.stringify(record, null, 1) + '\n');
  const p = record.results.plan;
  say(r, `${record.results.state}${p ? `: ${p.shapes ?? '-'} shapes, ${p.washes} washes, ${p.strokes ?? '-'} strokes, widest wash brush ${p.widestBrushMm} mm` : ''}${record.results.cheatRisk?.level ? `; cheat-risk ${record.results.cheatRisk.level}` : ''}; painter ${record.seconds ?? 0} s; sheet ${record.sheetImage}`);
}
await Promise.all(runs.map(oneRun));
const failed = runs.filter(r => r.record.failure).length;

let show = runs[0].record.sheetImage;
if (many) {
  const grid = await writeGridSheet(runs.map(r => r.record), path.join(outRoot, 'sheet.jpg'), { title: `${specs.map(s => s.id).join(', ')} · ${req.mode}` });
  fs.writeFileSync(path.join(outRoot, 'run.json'), JSON.stringify({ schema: 'unpaint-paint/grid@1', started, mode: req.mode, sheet: grid.file, runs: runs.map(r => ({ subject: r.record.subject.id, author: r.record.author.key, model: r.record.author.id, effort: r.record.author.effort, out: r.record.out, state: r.record.results.state, plan: r.record.results.plan, authorSeconds: r.record.author.seconds ?? null, tokens: r.record.author.tokens ?? null, costUSD: r.record.author.costUSD ?? null, painterSeconds: r.record.seconds, failure: r.record.failure })) }, null, 1) + '\n');
  console.log(`\ngrid: ${grid.file}`); show = grid.file;
}
// Preview is opened without this session's variables, so nothing started from it inherits them
if (req.open && process.platform === 'darwin') { try { execFileSync('env', ['-i', `HOME=${process.env.HOME}`, `USER=${process.env.USER}`, 'PATH=/usr/bin:/bin', 'open', '-a', 'Preview', show]); } catch (e) { console.error(`paint: could not open the sheet (${e.message})`); } }
process.exit(failed ? 1 : 0);
