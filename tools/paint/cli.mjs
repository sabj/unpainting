#!/usr/bin/env node
// Paint one picture, or several, by name: npm run paint -- <subject[,subject...]> plan|paint [options] (args.mjs).
// For each subject and author it reads the subject's record, checks every pinned input, prints what will run, runs
// the painter once, and writes run.json and one labelled sheet.jpg. Several runs also make one grid sheet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, USAGE } from './args.mjs';
import { loadRegistry, resolveSubject, checkInputs } from './subjects.mjs';
import { buildCommand, describeRun, shellLine, runFolder } from './command.mjs';
import { refuseExtraGpuPaint, gpuPaintCount, cacheDirFor, switchesOf, segEnvFor, runPainter, collectResults } from './run.mjs';
import { expandSubjects, pool, gpuPlace, throughput, jobsNow, DEFAULT_JOBS, PLAN_JOBS } from './queue.mjs';
import { writeRunSheet, writeGridSheet, runPictures, formsImage, drawingSvg } from './sheet.mjs';
import { toolsBase, resolveTools, writeTools, linesPictureDoc, allLinesDoc } from './session-tools.mjs';
import sharp from 'sharp';
import { authorOf, authorLabel, briefName, readScript, checkAuthored, preparePacket, formBoxes, gridImage, askAuthor, retryPrompt } from './author.mjs';
import { readChoice, choiceKey, choiceKind, withChoice, settingsList } from './choice.mjs';
import { checkPlanEdit, editLine } from '../../src/paint/methods/plan-edit.mjs';
import { planNumbers, planSummary, numbersText, washesText, planPicture, lookPicture, stagesPicture } from './plan-data.mjs';
import { lookSets, lookFault, lookSizeNote, LOOK_JOBS, HEAVY_JOBS } from './look.mjs';
import { DEFAULT_LOOKS, DEFAULT_WALL_MINUTES, DEFAULT_GRACE_MINUTES, safeRead, writeSession, sessionServer, finalChoice, sessionCall, readTranscript, reachedOutside, ownFolderOf, ownPictures, runSession } from './session.mjs';
import { DEFAULT_REVERTS } from './reverts.mjs';
import { levelOf, handedAt } from './levels.mjs';
import { usageOf, usageLine } from './usage.mjs';
import { shapesData, namesShapes, resolveNumbered } from './study-shapes.mjs';
import { paintThroughStage, stoppedText } from './stage-look.mjs';
import { lookCost, regionBox, scriptInRegion } from './look-cost.mjs';
import { preparedRoot, preparedKey, prepareCommand, readPrepared, writePrepared } from './prepared.mjs';
import { writeWorkSheets } from './work-sheets.mjs';
import { logReads } from './seen.mjs';
import { handedOverRecord, checkHandedOver, checkChoice } from './parity.mjs';
import { qwenRoute, studyRequestPrompt, parseStudyRequests, writeStudyRequest, makeStudies, withAuthorStudies } from './studies.mjs';
import { readSelfReview } from './self-review.mjs';
import { checkSessionFolder, drawingOfKept } from './kept-session.mjs';
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
const code = codeState(ROOT), switches = switchesOf(), jobs = req.jobs ?? DEFAULT_JOBS;
// the benchmark's resource budget for one try, the same for every model and told to it at the start (session.mjs)
const looksMost = req.looks ?? DEFAULT_LOOKS, wallMost = req.wallMinutes ?? DEFAULT_WALL_MINUTES, graceMost = req.graceMinutes ?? DEFAULT_GRACE_MINUTES, revertsMost = req.reverts ?? DEFAULT_REVERTS;
const budget = { looks: looksMost, wallMinutes: wallMost, graceMinutes: graceMost, reverts: revertsMost };
const BRIEF_FILE = process.env.UNPAINT_AUTHOR_BRIEF || path.join(HERE, 'AUTHOR-BRIEF.md');
const codeOf = c => ({ commit: c.commit, dirty: Boolean(c.dirty), tracked: c.tracked, untracked: c.untracked.map(u => u.file), diffSha256: c.diffSha256 });
// the painter's environment: where segmentation lives, and a cache folder keyed on the experiment switches
const segEnv = { ...segEnvFor(ROOT), W2_CACHE_DIR: cacheDirFor(process.env.W2_CACHE_DIR || path.join(ROOT, 'work', 'cache'), switches) };

// every subject and author is resolved and checked before anything runs
let registry, specs, authors, qwen = null, level, terms = null; const refused = [];
try {
  registry = loadRegistry();
  level = levelOf(req.level);
  if (process.env.UNPAINT_SESSION_PREVIOUS || process.env.UNPAINT_SESSION_TRY) throw new Error('UNPAINT_SESSION_PREVIOUS and UNPAINT_SESSION_TRY are gone: name the previous try on the command line (--level L3|L4 --previous <its run folder>)');
  // a model works as a session (the default) or answers in one reply; its column is named for what it does
  authors = req.authors.map(a => authorOf(a, ownAuthors, models)).map(a => (a.cli && !['script', 'edit', 'choice'].includes(a.cli) ? { ...a, work: req.work, brief: req.work === 'reply' ? briefName(BRIEF_FILE) : null } : a));
  if (req.work === 'session') for (const a of authors) if (a.work) sessionCall(a, { prompt: '', cwd: '' });
  if (req.from && !fs.existsSync(req.from)) throw new Error(`--from ${req.from}: no such folder`);
  // what a session of this level and try is handed; the level's terms and the command line must agree
  if (!req.prepare && !req.from && req.work === 'session' && authors.some(a => a.work === 'session')) {
    terms = handedAt(level, { tryNumber: req.tryNumber, retries: req.retries, previous: req.previous });
    if (req.previous && !fs.existsSync(req.previous)) throw new Error(`--previous ${req.previous}: no such folder`);
    if (req.previous && (authors.length !== 1 || req.subjects.length !== 1)) throw new Error('--previous names one model\'s previous try of one subject: give one subject and one author');
  } else if (req.previous || req.tryNumber > 1) throw new Error('--previous and --try belong to a model\'s working session (not to --from, a kept script, or the code planner)');
  if (req.lines && !authors.some(a => a.cli === 'script' || a.cli === 'edit')) throw new Error('--lines names the drawing of a kept script or plan edit (--author script:FILE or edit:FILE); a session, a kept choice and the code planner carry their own');
  if (req.studies === 'author') {
    // open tools: the author's own studies are made by the local image model; every piece of that route must be here
    qwen = qwenRoute(registry.base);
    if (!qwen.ready) throw new Error(`--studies author needs the local study route, and this machine lacks: ${qwen.missing.join('; ')}. Run with --studies locked.`);
    if (authors.some(a => !a.cli || ['script', 'edit', 'choice'].includes(a.cli))) throw new Error('--studies author: every author must be a model (auto and kept scripts make no studies)');
  }
  const asked = expandSubjects(req.subjects, registry.subjects.map(s => s.id));
  specs = asked.flatMap(({ id, variant }) => {
    try {
      const v = variant ? variants[id]?.[variant] : null;
      if (variant && !v) throw new Error(`subject ${id} has no variant "${variant}" in tools/paint/variants.json${variants[id] ? ` (it has: ${Object.keys(variants[id]).join(', ')})` : ''}`);
      return [checkInputs(resolveSubject(registry, id, { sets: req.sets, variant: v, variantName: variant }))];
    } catch (e) {
      // in a queue of several subjects one whose inputs are wrong is recorded as not run and the rest go on
      if (asked.length === 1) throw e;
      refused.push({ subject: variant ? `${id}:${variant}` : id, failure: e.message }); return [];
    }
  });
  if (!specs.length) throw new Error(`no subject can run\n${refused.map(x => x.failure).join('\n')}`);
} catch (e) { fail(e.message); }

const many = specs.length * authors.length > 1;
/** Where a subject's prepared inputs are kept for this code and these settings (prepared.mjs). */
const preparedAt = spec => path.join(preparedRoot(registry.base), preparedKey({ id: spec.id, variant: spec.variant, commit: code.commit, dirty: code.dirty, diffSha256: code.diffSha256, sets: req.sets }));
const prepareLine = spec => prepareCommand({ subject: spec.variant ? `${spec.id}:${spec.variant}` : spec.id, level: level.name, sets: req.sets });
const outRoot = path.resolve(req.out ?? path.join(ROOT, 'work', 'paint', `${stamp(now)}-${specs.map(s => s.id).join('+')}-${req.mode}`));
const runs = [];
for (const spec of specs) for (const author of authors) {
  const out = req.prepare ? path.join(preparedAt(spec), 'painting') : many ? path.join(outRoot, runFolder(spec, author.key === 'auto' ? 'auto' : author.name)) : outRoot;
  const scriptFile = author.key === 'auto' || author.work === 'session' || author.cli === 'edit' || author.cli === 'choice' ? null : path.join(out, 'author', 'script.json');
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
      author: { key: author.key, name: author.name, label: authorLabel(author), id: author.id ?? null, cli: author.cli ?? null, effort: author.effort ?? null, work: author.work ?? null, brief: author.brief ?? null, wrote: author.wrote ?? null,
        ...(author.work === 'session' ? { level: level.name, tryNumber: req.tryNumber, budget, looksMost, from: req.from ? path.join(path.resolve(req.from), many ? runFolder(spec, author.name) : '') : null } : {}) },
      settings: command.settings, switches, code: codeOf(code),
      environment: command.env, command: shellLine(command), argv: command.argv, results: null, exit: null, seconds: null, failure: null,
    },
  });
}

for (const r of runs) { console.log(''); for (const l of describeRun(r.record)) console.log(l); }
for (const x of refused) console.log(`\nNOT RUN: ${x.failure}`);
if (req.dryRun) { console.log('\ndry run: nothing was started'); process.exit(0); }
console.log('');

// Several runs go on together: model replies in parallel (agy one at a time: its sessions interrupt one another),
// CPU plans three at a time, GPU paintings --jobs at a time (queue.mjs). A session's look is a small GPU painting:
// LOOK_JOBS of them at once in this command, each waiting for a place among the machine's GPU paintings (--jobs).
// a queue's places can be changed while it runs: write the number into <out>/jobs
const readJobs = () => { try { return jobsNow(jobs, fs.readFileSync(path.join(outRoot, 'jobs'), 'utf8')); } catch { return jobs; } };
// Memory: a plan, a look's painting and a painting each hold 13 to 18 GB, so in plan mode one pool of HEAVY_JOBS places
// holds them all (a session's plans, its looks, and the plan of what it hands over); the models themselves mostly wait
// and all run at once (agy three at a time: three at once in separate folders did not interrupt one another).
const heavySlot = pool(HEAVY_JOBS);
const painterSlot = req.mode === 'plan' ? heavySlot : pool(many ? 16 : jobs), planSlot = req.mode === 'plan' ? heavySlot : pool(2 * PLAN_JOBS), startGate = pool(1), agySlot = pool(3), modelSlot = pool(12), qwenSlot = pool(1), lookSlot = req.mode === 'plan' ? heavySlot : pool(LOOK_JOBS), lookGate = pool(1);
const say = (r, text) => console.log(`[${r.spec.id} · ${r.record.author.name}] ${text}`);
const SHOWN = /^(study washes: \d|wash plan:|plan values|phases|!!!|UNUSED|IGNORED|named forms|painting script)/;

/**
 * The painter once, into a fresh folder. commandFor(dirty) builds the command when the run's turn comes, from the
 * code as it is then: in a long queue each run records the commit it painted with. {failure, results}; never throws.
 */
async function paintOnce(r, commandFor, plate, logFile) {
  const { record } = r; let failure = null, done = null;
  try {
    if (fs.existsSync(plate) && fs.readdirSync(plate).length) throw new Error(`${plate} already holds a painting; give a fresh --out`);
    done = await painterSlot(async () => {
      // the wait for a place and the start are one step at a time, so two runs never take the same free place
      const going = await startGate(async () => {
        if (req.mode === 'paint') {
          // one painting by itself is refused when the places are taken; a queue waits for one
          if (many) record.gpuPaintsAtStart = await gpuPlace({ most: readJobs, running: gpuPaintCount, onWait: n => say(r, `waiting: ${n} GPU paintings are running and --jobs is ${readJobs()}`) }), record.jobsAtStart = readJobs();
          else record.gpuPaintsAtStart = refuseExtraGpuPaint(jobs);
        }
        const now = codeState(ROOT), command = commandFor(now.dirty);
        Object.assign(record, { code: codeOf(now), command: shellLine(command), argv: command.argv, plate, startedMs: Date.now() });
        if (many) say(r, `started at ${new Date().toTimeString().slice(0, 8)} on ${now.commit?.slice(0, 8)}${now.dirty ? ' plus uncommitted changes (allow-dirty passed)' : ''}`);
        return { ended: runPainter(command, { cwd: ROOT, logFile, onLine: l => { if (SHOWN.test(l) || /^\s*(Error|TypeError|RangeError)/.test(l)) say(r, l.trim().slice(0, 300)); } }) };
      });
      try { return await going.ended; } finally { record.endedMs = Date.now(); }
    });
    record.exit = done.exit; record.seconds = (record.seconds ?? 0) + done.seconds;
    // exit 3: the painting is written but an option was read by nothing (unused-options.txt)
    if (done.exit !== 0 && done.exit !== 3) {
      const why = fs.readFileSync(logFile, 'utf8').split('\n').filter(l => /(^|\s)(Error|TypeError|RangeError)\b/.test(l)).pop()?.trim().slice(0, 400);
      failure = `the painter ended with exit ${done.exit ?? done.signal}${why ? `: ${why}` : ''}`;
    }
  } catch (e) { failure = e.message; }
  const results = collectResults(plate, req.mode);
  // no silent fallback: a painting that did not stay on the GPU is a failed cell
  if (!failure && req.mode === 'paint' && (results.backend?.backend !== 'gpu' || results.backend?.fallback !== false)) failure = `the painting did not stay on the GPU (backend.json: ${results.backend ? `backend ${results.backend.backend}, fallback ${results.backend.fallback}` : 'missing'})`;
  if (!failure && ['no plan', 'unfinished'].includes(results.state)) failure = `the painter ended without ${req.mode === 'plan' ? 'a plan' : 'a finished painting'}`;
  return { failure, results };
}

const tidy = text => String(text).replaceAll(ROOT, '<painter>').replaceAll(registry.base, '<subjects>').replaceAll(os.homedir(), '<home>');
/** What a run's tools work on (the record's drawing and reviewed forms), read once a run. */
const bases = new Map(), baseOf = r => { if (!bases.has(r)) bases.set(r, toolsBase(r.spec)); return bases.get(r); };
/**
 * A choice's tools (its lines, its forms, settings per form: session-tools.mjs) written out for this run, once for
 * each such choice: the files the painter takes and the run settings that name them. Null for a choice without tools.
 */
const toolsWritten = new Map();
function toolsOf(r, choice) {
  if (!choice.tools) return null;
  const key = choiceKey({ kind: 'tools', sets: [], tools: choice.tools }), k = `${r.spec.id}:${r.spec.variant ?? ''}:${r.record.out}:${key}`;
  if (!toolsWritten.has(k)) toolsWritten.set(k, (async () => writeTools(path.join(r.record.out, 'author', 'tools', key), choice.tools, await baseOf(r)))());
  return toolsWritten.get(k);
}
/**
 * The subject with a choice laid over this run's settings (its planner settings and its tools), checked as any run's
 * is. `sets`: the run's settings to lay it over when they are not the command's own (a look's smaller sheet).
 */
async function specWith(r, choice, sets = null) {
  const t = await toolsOf(r, choice);
  if (!choice.sets.length && !t && !sets) return r.spec;
  // (a setting the tools ask for only as a default gives way to the choice's or the command's own: inkfast)
  // (and where the choice names lines or a medium of its own, the drawing follows them: its drawing settings are not used; the plan answer says so)
  const all = sets ?? withChoice(req.sets, choice), drawn = new Set(t?.order ? ['drawing', 'drawingorder', 'drawinglast', 'drawinglastmin', 'outlinemedium'] : []), given = all.filter(([k]) => !drawn.has(k)), mine = (t?.sets ?? []).filter(([k]) => k !== 'inkfast' || !given.some(([g]) => g === 'inkfast'));
  return checkInputs(resolveSubject(registry, r.spec.id, { sets: [...given, ...mine], variant: r.spec.variant ? variants[r.spec.id]?.[r.spec.variant] : null, variantName: r.spec.variant }));
}
/** The run's record as a plan of this spec is measured: with the forms the choice made, when it made its own. */
const runOf = (record, mine) => (mine.masks?.receipt && mine.masks.receipt !== record.masks.receipt ? { ...record, masks: { ...record.masks, receipt: mine.masks.receipt, mask: mine.masks.mask, forms: mine.masks.forms } } : record);
/** A drawing document as a picture on the millimetre grid. A PNG buffer. */
const drawingPicture = async (doc, W) => gridImage(await sharp(Buffer.from(drawingSvg(doc, 1400).svg)).flatten({ background: '#ffffff' }).png().toBuffer(), W);
/** What a choice's tools made, as files of the author's own folder (mine/): its forms as a picture and data, its lines as a picture. */
async function toolFiles(r, choice) {
  const t = await toolsOf(r, choice); if (!t) return [];
  const W = r.spec.sheet.widthMm, out = [], strokes = stem => (stem ? JSON.parse(fs.readFileSync(`${stem}-vectors.json`, 'utf8')).strokes : []);
  if (t.mask) out.push({ rel: 'mine/forms.png', data: await gridImage(await formsImage(t.mask), W) }, { rel: 'mine/forms-ids.png', data: fs.readFileSync(t.mask) },
    { rel: 'mine/forms.json', data: JSON.stringify((await formBoxes(t.mask, t.formsNow, W)).map(f => ({ id: f.id, name: f.name, kind: f.kind, boxMm: f.boxMm ?? null })), null, 1) + '\n' });
  if (t.order) out.push({ rel: 'mine/drawing.png', data: await drawingPicture(linesPictureDoc((await baseOf(r)).vectors, strokes(t.opening), strokes(t.closing)), W) });
  return out;
}
/**
 * One choice planned on the CPU into `plate`, for a session: {ok, error, summary, rows, numbersText, picture, marked,
 * planPreview}. A choice the planner refuses is a result. Nothing of this machine's paths is in what the model reads.
 */
const planned = new Map();
function compileChoice(r, choice, script, plate, edit = null) {
  // the same choice of the same subject is planned once in a run, whoever asks (every session starts from the code planner's plan)
  const key = `${r.spec.id}:${r.spec.variant ?? ''}:${choiceKey(choice, script ? JSON.stringify(script) : edit ? JSON.stringify(edit) : '')}`;
  if (!planned.has(key)) planned.set(key, compileOnce(r, choice, script, plate, edit));
  return planned.get(key);
}
async function compileOnce(r, choice, script, plate, edit) {
  const { spec, record } = r, scriptFile = `${plate}.script.json`, editFile = `${plate}.plan-edit.json`;
  try {
    const mine = await specWith(r, choice);
    fs.mkdirSync(path.dirname(plate), { recursive: true });
    if (script) fs.writeFileSync(scriptFile, JSON.stringify(script, null, 1) + '\n');
    if (edit) fs.writeFileSync(editFile, JSON.stringify(edit, null, 1) + '\n');
    const command = buildCommand(mine, { mode: 'plan', out: plate, known, dirty: codeState(ROOT).dirty, segEnv, script: script ? { file: scriptFile, paints: script.palette } : null, edit: edit ? { file: editFile } : null });
    const done = await planSlot(() => runPainter(command, { cwd: ROOT, logFile: `${plate}.log` })), results = collectResults(plate, 'plan');
    if ((done.exit !== 0 && done.exit !== 3) || !results.planPreview || !fs.existsSync(path.join(plate, 'value-plan.json'))) {
      // an edited plan that cannot be laid as asked: every fault of it, as the painter wrote them out, not the first alone
      let faults = null; try { faults = JSON.parse(fs.readFileSync(path.join(plate, 'plan-edit-faults.json'), 'utf8')).message; } catch { /* another failure */ }
      const why = fs.readFileSync(`${plate}.log`, 'utf8').split('\n').filter(l => /(^|\s)(Error|TypeError|RangeError)\b/.test(l)).pop()?.trim().slice(0, 400);
      return { ok: false, error: tidy(faults ? faults.slice(0, 12000) : why ?? `the planner ended with exit ${done.exit ?? done.signal} and no plan`), seconds: done.seconds };
    }
    const numbers = await planNumbers({ plate, planPreview: results.planPreview, run: runOf(record, mine), script });
    // the painter's own count of an edit it applied, with its notes (a colour laid as the nearest that can be, a smaller brush)
    let editRecord = null; if (edit) { try { editRecord = JSON.parse(fs.readFileSync(path.join(plate, 'plan-edit-record.json'), 'utf8')); } catch { /* the session's own count stands */ } }
    return { ok: true, ...numbers, planPreview: results.planPreview, seconds: done.seconds, plate, editRecord, toolFiles: await toolFiles(r, choice) };
  } catch (e) { return { ok: false, error: tidy(e.message) }; }
}

/**
 * A look: one compiled choice painted for real on the GPU, small (look.mjs), through drying, into `plate`, for a
 * session. {ok: true, picture, stages, planPicture, numbersText, marked, painted} or {ok: false, error}: a painting
 * that failed or did not stay on the GPU is no look. The same choice of the same subject is painted once in a run,
 * whoever looks. Nothing of this machine's paths is in what the model reads.
 */
const lookedAt = new Map();
function paintLook(r, choice, script, plate, at, edit, compiled, ask = {}) {
  const key = `${r.spec.id}:${r.spec.variant ?? ''}:${choiceKey(choice, script ? JSON.stringify(script) : edit ? JSON.stringify(edit) : '')}:${ask.until ?? ''}:${ask.region ? ask.region.box.join(',') : ''}`;
  if (!lookedAt.has(key)) lookedAt.set(key, paintLookOnce(r, choice, script, plate, at, edit, compiled, ask).then(got => { if (!got.ok) lookedAt.delete(key); return got; }));
  return lookedAt.get(key);
}
async function paintLookOnce(r, choice, script, plate, at, edit, compiled, ask = {}) {
  // a look of a region: the script's passages that touch the box, painted by themselves (look-cost.mjs)
  const inRegion = ask.region ? scriptInRegion(script, ask.region.box) : null;
  if (ask.region && !script) return { ok: false, error: 'a look of a region is painted for an own script only' };
  if (inRegion && !inRegion.kept) return { ok: false, error: `no passage of the script touches the region ${ask.region.box.join(', ')} mm` };
  if (inRegion) script = inRegion.script;
  const { spec, record } = r, scriptFile = `${plate}.script.json`, editFile = `${plate}.plan-edit.json`;
  try {
    const full = await specWith(r, choice);
    const small = await specWith(r, choice, lookSets(withChoice(req.sets, choice), full.sheet.cells, choice.kind));
    fs.mkdirSync(path.dirname(plate), { recursive: true });
    if (script) fs.writeFileSync(scriptFile, JSON.stringify(script, null, 1) + '\n');
    if (edit) fs.writeFileSync(editFile, JSON.stringify(edit, null, 1) + '\n');
    const size = lookSizeNote({ cells: small.sheet.cells, fullCells: full.sheet.cells, cellMm: small.sheet.cellMm, kind: choice.kind }), asked = Date.now(); let started = null, stoppedAt = null;
    const done = await lookSlot(async () => {
      // the wait for a place among the machine's GPU paintings and the start are one step at a time
      const going = await lookGate(async () => {
        await gpuPlace({ most: readJobs, running: gpuPaintCount, onWait: n => say(r, `look ${at.look}: waiting, ${n} GPU paintings are running and --jobs is ${readJobs()}`) });
        const command = buildCommand(small, { mode: 'paint', out: plate, known, dirty: codeState(ROOT).dirty, segEnv, script: script ? { file: scriptFile, paints: script.palette } : null, edit: edit ? { file: editFile } : null });
        fs.writeFileSync(`${plate}.command.txt`, shellLine(command) + '\n'); started = Date.now();
        say(r, `look ${at.look} (plan ${at.plan}, ${choiceKind(choice)}): ${size}; started at ${new Date().toTimeString().slice(0, 8)}`);
        // stopped after a stage the author names: the painter's own stop at that boundary, dried (stage-look.mjs)
        if (ask.until != null) return { ended: paintThroughStage({ command, cwd: ROOT, logFile: `${plate}.log`, pauseDir: `${plate}.pause`, stage: ask.until, run: runPainter }).then(x => { stoppedAt = x.stopped; return { ...x.done, seconds: x.done?.seconds ?? Math.round((Date.now() - started) / 1000) }; }) };
        return { ended: runPainter(command, { cwd: ROOT, logFile: `${plate}.log` }) };
      });
      return going.ended;
    });
    // a look that stopped partway has no finished painting: the sheet as it stood, dried, is the look
    const results = collectResults(plate, 'paint'); if (stoppedAt) Object.assign(results, { state: 'finished', painting: stoppedAt.sheet });
    const fault = stoppedAt ? (results.backend?.backend !== 'gpu' || results.backend?.fallback !== false ? `the painting did not stay on the GPU (${results.backend ? `backend ${results.backend.backend}, fallback ${results.backend.fallback}` : 'no backend record'}), so it is not shown` : null) : lookFault(done, results);
    if (fault) {
      const why = fs.readFileSync(`${plate}.log`, 'utf8').split('\n').filter(l => /(^|\s)(Error|TypeError|RangeError)\b/.test(l)).pop()?.trim().slice(0, 400);
      say(r, `look ${at.look} NOT PAINTED: ${fault}${why ? ` (${why})` : ''}`);
      return { ok: false, error: tidy(`${fault}${why ? `: ${why}` : ''}`) };
    }
    const numbers = await planNumbers({ plate, planPreview: results.planPreview ?? compiled.planPreview, run: runOf(record, small), script, painting: results.painting });
    say(r, `look ${at.look} painted and dried in ${Math.round(done.seconds / 60)} min (${results.backend.backend}, no fallback); ${numbers.marked.forms} named forms marked`);
    return { ok: true, picture: await lookPicture({ planPreview: results.painting, run: record }), stages: results.strip ? await stagesPicture(results.strip) : null,
      planPicture: compiled.planPreview ? await planPicture({ planPreview: compiled.planPreview, run: record }) : null,
      numbersText: `${stoppedAt ? `${stoppedText(stoppedAt, ask.until)}\n\n` : ''}${numbersText(numbers, { script: Boolean(script), painted: size })}`, marked: numbers.marked, stoppedText: stoppedAt ? stoppedText(stoppedAt, ask.until) : null,
      painted: { until: ask.until ?? null, stopped: stoppedAt ? { passesDone: stoppedAt.passesDone, passesPlanned: stoppedAt.passesPlanned, strokes: stoppedAt.strokes } : null, region: ask.region?.box ?? null, regionPassages: inRegion ? `${inRegion.kept} of ${inRegion.of} passages` : null, cells: small.sheet.cells, fullCells: full.sheet.cells, size, seconds: done.seconds, waitedSeconds: Math.round((started - asked) / 1000), backend: results.backend, plate, painting: results.painting, strip: results.strip } };
  } catch (e) { return { ok: false, error: tidy(e.message) }; }
}

/**
 * What this session is handed beside the subject's inputs, by its level (levels.mjs), each a folder of its own with
 * a paragraph of the task (session.mjs writeSession). A retry (L3, L4): the result it starts from (--previous: the
 * dried full-size painting beside the subject, the replay sheet, the arrows sheet, and what was handed over, to start
 * from). Level 4 also: the code's finished painting with its sheets, and the studies' flat shapes with the plan's
 * wash geometry as data. Never a score, a verdict or anyone's critique: the model judges its own sheet.
 * `made`: a folder outside the model's folder where the files are made. Returns the list.
 */
async function handedTo(r, prepared, made) {
  const { spec, authorFull: author } = r, handed = [];
  if (terms.auto) handed.push({ folder: 'auto-painting', title: 'What the code alone made',
    words: 'This is what the code alone made of this subject: the automatic painter\'s painting from its own plan (the plan in `auto/`), dried, at full size. Improve on it, change it, or discard it and paint your own. You owe it nothing, and it is not the goal: the subject is.',
    files: prepared.painting.sheets.map(f => ({ ...f, picture: true, what: /beside/.test(f.name) ? 'the automatic painter\'s painting as it dried, at full size, on the left; the subject on the right' : /replay/.test(f.name) ? 'the replay of that painting: the sheet as the work went on, frames in order, numbered' : 'every stroke of that painting as an arrow from where the brush lands to where it lifts; first strokes blue, last strokes red' })) });
  if (terms.shapes) {
    const file = path.join(made, 'resources', 'shapes.json'); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(await shapesOf(r, prepared)) + '\n');
    handed.push({ folder: 'resources', title: 'The studies\' shapes, as data',
      words: 'The studies\' flat shapes and the geometry of the code planner\'s washes, as data you may select from: each shape\'s number, the study it came from, its outline in sheet millimetres, its colour, its area and the named forms it lies in. In your own script a passage may name shapes by number (`"shapes": [12, 13]` for its region, `"reserve": [40]` for paper it is laid round, and in a stroke `"along": 12`); the numbers are turned into millimetres for you. Use them, cut them up, or ignore them.',
      files: [{ from: file, name: 'shapes.json', what: 'every shape, in painting order: n, study, stage, kind, what, colour, areaMm2, boxMm, forms, polygons' }] });
  }
  if (terms.previous) {
    const from = path.resolve(req.previous); let earlier; try { earlier = JSON.parse(fs.readFileSync(path.join(from, 'run.json'), 'utf8')); } catch { throw new Error(`--previous ${from}: no finished run there (run.json)`); }
    const sub = earlier.author?.session?.submitted;
    if (earlier.subject?.id !== spec.id || earlier.author?.key !== author.key || !sub) throw new Error(`--previous ${from}: not a session of ${author.name} on ${spec.id} that handed over a choice`);
    const sheets = await writeWorkSheets(from, path.join(made, 'previous'), { whose: 'your previous' });
    // what it handed over, whole: choice.json and every file it names (its script or edited plan, its lines, its forms)
    const folder = path.join(from, 'author', 'folder'), names = ['choice.json', sub.script, sub.plan, sub.tools?.lines, sub.tools?.forms].filter(Boolean), missing = names.filter(n => !fs.existsSync(path.join(folder, n)));
    if (missing.length) throw new Error(`--previous ${from}: its kept folder lacks ${missing.join(', ')}; a retry is handed everything its previous result handed over, or it is not started`);
    handed.push({ folder: 'previous', title: 'Your own previous painting of this subject',
      words: 'You have painted this subject before. Here is your own previous result: the painting as it really dried at full size beside the subject, how it was painted, and what you handed over. Nobody has marked it and no critique comes with it: judge it yourself. Before you start, write `assessment.md`: what is weakest in that painting against the subject, where on the sheet, and what you will change. It is yours; nothing depends on it and it is kept with the session. You may start from what you handed over (copy it out of `previous/submitted/`) or start again.',
      files: [...sheets, ...names.map(n => ({ from: path.join(folder, n), name: `submitted/${n}`, what: n === 'choice.json' ? 'the choice you handed over' : 'a file that choice names' }))] });
  }
  return handed;
}
/** Level 4's shapes data for this run: the prepared plan's washes as shapes (study-shapes.mjs), read once. */
const shapesMade = new Map();
function shapesOf(r, prepared) {
  if (!shapesMade.has(r)) shapesMade.set(r, shapesData(JSON.parse(fs.readFileSync(path.join(prepared.plan, 'value-plan.json'), 'utf8')), { widthMm: r.spec.sheet.widthMm, heightMm: r.spec.sheet.heightMm }));
  return shapesMade.get(r);
}

/**
 * The code planner's plan of this run's subject, taken prepared (prepared.mjs): never made on a session's clock. The
 * same answer a plan of "nothing changed" gives. Throws, naming the prepare command, when it is not there.
 */
async function preparedPlan(r) {
  const folder = preparedAt(r.spec), prepared = readPrepared(folder, { painting: Boolean(terms?.auto), command: prepareLine(r.spec) });
  const results = collectResults(prepared.plan, 'plan');
  if (!results.planPreview) throw new Error(`the prepared plan in ${prepared.plan} has no picture; make it again:\n  ${prepareLine(r.spec)}`);
  const auto = { ok: true, ...await planNumbers({ plate: prepared.plan, planPreview: results.planPreview, run: r.record, script: null }), planPreview: results.planPreview, seconds: 0, plate: prepared.plan, editRecord: null, toolFiles: [], prepared: true };
  // a plan of the choice that changes nothing is answered from the prepared plan, whoever asks
  planned.set(`${r.spec.id}:${r.spec.variant ?? ''}:${choiceKey(readChoice({ kind: 'settings', settings: {} }), '')}`, Promise.resolve(auto));
  return { auto, prepared, folder };
}

/** What nothing of a session may read, besides the other sessions' folders (the comment where it is used says why). */
function sessionDeny(spec) {
  return [...new Set([ROOT, path.resolve(ROOT, '..', '..'), registry.base, path.dirname(spec.source.abs), ...(process.env.UNPAINT_SESSION_DENY ?? '').split(':').filter(Boolean).map(d => path.resolve(d))])].filter(d => d !== path.parse(d).root && d !== os.homedir());
}

/**
 * A model author's working session (session.mjs), then the painting of what it handed over. With --from, the choice
 * an earlier session of this subject and author handed over is painted and no model is called.
 */
async function sessionRun(r) {
  const { spec, record, authorFull: author } = r, dir = path.join(record.out, 'author'), W = spec.sheet.widthMm; fs.mkdirSync(dir, { recursive: true });
  // a script is checked as the painter will read it; at level 4 it may name the studies' shapes by number, and the
  // numbers are turned into millimetres first (study-shapes.mjs). At other levels numbered shapes stay refused.
  let numbered = null;
  const check = obj => checkAuthored(numbered && namesShapes(obj) ? resolveNumbered(obj, numbered) : obj, { sheetWidthMm: W }).script;
  // an edited plan is checked against the code planner's plan as the painter wrote it out for editing
  const toEdit = folder => JSON.parse(fs.readFileSync(path.join(folder, 'plan-to-edit.json'), 'utf8'));
  const checkEdit = (obj, listing) => { try { return { edit: obj, record: checkPlanEdit(obj, listing).record }; } catch (e) { throw new Error(tidy(e.message)); } };
  let fin, session;
  if (record.author.from) {
    let earlier; try { earlier = JSON.parse(fs.readFileSync(path.join(record.author.from, 'run.json'), 'utf8')); } catch { throw new Error(`--from: no finished run at ${record.author.from}`); }
    const sub = earlier.author?.session?.submitted;
    if (!sub || earlier.subject.id !== spec.id || earlier.author.key !== author.key) throw new Error(`--from: ${record.author.from} is not a session of ${author.name} on ${spec.id} that handed over a choice`);
    // a folder that lacks a file its choice names is refused, the file named: nothing else is painted in its place
    checkSessionFolder(record.author.from, sub);
    const choice = readChoice({ kind: sub.kind, settings: sub.settings, script: sub.script ?? undefined, plan: sub.plan ?? undefined, lines: sub.tools?.lines ?? undefined, forms: sub.tools?.forms ?? undefined, perForm: sub.tools?.perForm ?? undefined, medium: sub.tools?.medium ?? undefined, why: sub.why });
    // parity: the kept folder still holds exactly the files the session handed over, and the choice read back is that choice
    let handedOver = null; try { handedOver = JSON.parse(fs.readFileSync(path.join(record.author.from, 'author', 'handed-over.json'), 'utf8')); } catch { /* a session kept before the record was written */ }
    checkChoice(handedOver, choice);
    record.author.parity = { ...checkHandedOver(path.join(record.author.from, 'author', 'folder'), handedOver), of: path.join(record.author.from, 'author', 'handed-over.json') };
    say(r, record.author.parity.same ? `parity: the kept folder holds the files the session handed over (${record.author.parity.compared.join(', ') || 'no files: settings only'})` : `PARITY NOT CHECKED: ${record.author.parity.why}`);
    // its lines and forms as the session left them in its folder
    if (choice.tools) for (const [k, to] of [['lines', 'linesEdit'], ['forms', 'formsEdit']]) if (choice.tools[k]) choice.tools[to] = JSON.parse(fs.readFileSync(path.join(record.author.from, 'author', 'folder', choice.tools[k]), 'utf8'));
    // the kept commands are judged again by the present rule: a session that reached outside its folder is not painted,
    // and one an earlier rule failed wrongly is (the record says which)
    const from = record.author.from, commands = fs.readFileSync(path.join(from, 'author', 'S.commands.txt'), 'utf8').split('\n---\n').map(c => c.trim()).filter(Boolean), own = ownFolderOf(commands);
    const outside = reachedOutside(commands, sessionDeny(spec), own ? [own, own.replace(/^\/private/, '')] : []);
    session = { ...earlier.author.session, reusedFrom: from, routes: { ...earlier.author.session.routes, commandsNamingOutside: outside, judgedAgain: 'the kept commands were judged again when this was painted' } };
    if (outside.length) fin = { failure: `the look limit was not held: ${outside.length} of its commands name the painter or a place outside its folder (${path.join(from, 'author', 'S.commands.txt')}); nothing of this session is painted` };
    else {
      // its script as the session left it in its folder (kept whole in the earlier run), never one written since
      const scriptFile = choice.kind === 'script' ? path.join(from, 'author', 'folder', choice.script) : null;
      const edit = choice.kind === 'plan' ? checkEdit(JSON.parse(fs.readFileSync(path.join(from, 'author', 'folder', choice.plan), 'utf8')), toEdit(path.join(from, 'author', 'plans', 'auto'))).edit : null;
      fin = { choice, script: scriptFile ? check(JSON.parse(fs.readFileSync(scriptFile, 'utf8'))) : null, edit, submitted: sub };
    }
    for (const k of ['seconds', 'tokens', 'tokensIn', 'tokensOut', 'costUSD', 'level', 'tryNumber', 'budget']) record.author[k] = earlier.author[k] ?? null;
    record.author.prepared = earlier.author.prepared ?? null;
    if (!fin.failure) say(r, `painting what its earlier session handed over (${sub.what}); no model is called`);
  } else {
    const pics = await runPictures(record);
    const packet = await preparePacket({ dir, root: ROOT, run: { ...record, masks: record.masks.receipt ? { ...record.masks, formsPng: await formsImage(record.masks.mask) } : null }, drawingPng: pics.drawing, briefFile: BRIEF_FILE });
    // the code planner's plan is a prepared input: found, not made, and the session does not start without it
    const { auto, prepared, folder: preparedFolder } = await preparedPlan(r);
    if (terms.shapes) numbered = await shapesOf(r, prepared);
    record.author.prepared = { plan: true, painting: Boolean(prepared.painting), from: preparedFolder, commit: prepared.record.commit ?? null, madeAt: prepared.record.made ?? null, planSeconds: prepared.record.plan?.seconds ?? null, paintingSeconds: prepared.record.painting?.seconds ?? null };
    say(r, `the code planner's plan was taken prepared (${preparedFolder})${prepared.painting ? ', and its full-size painting with it' : ''}: nothing of it is made on the session's clock`);
    // the model's folder: a temporary one outside the repository; it is kept in the run folder when the session ends
    const cwd = r.sessionDir, real = fs.realpathSync(cwd), listing = toEdit(auto.plate), base = await baseOf(r);
    // a choice's tools are checked against the drawing and the forms of this run; nothing is written for a check
    const checkTools = t => { try { const g = resolveTools(t, base); return { record: g.record, said: g.said, warnings: g.warnings }; } catch (e) { throw new Error(tidy(e.message)); } };
    try {
      for (const f of packet.files) { fs.mkdirSync(path.dirname(path.join(cwd, f)), { recursive: true }); fs.copyFileSync(path.join(dir, f), path.join(cwd, f)); }
      const handed = await handedTo(r, prepared, path.join(dir, 'handed'));
      const { prompt, pictures: handedPictures } = writeSession({ dir: cwd, packet, sheet: spec.sheet, medium: record.drawing.medium, auto: { picture: await planPicture({ planPreview: auto.planPreview, run: record }), washesText: washesText(auto), plan: { summary: auto.summary, washes: auto.rows }, toEdit: listing }, settings: settingsList(spec),
        forms: record.masks.mask ? await formBoxes(record.masks.mask, record.masks.forms, W) : null, formsIds: record.masks.mask ?? null, looks: looksMost, wallMinutes: wallMost, graceMinutes: graceMost, reverts: revertsMost, briefFile: path.join(HERE, 'SESSION-BRIEF.md'), readmeFile: path.join(HERE, 'SESSION-README.md'), handed,
        drawing: base.listing ? { listing: base.listing, picture: await drawingPicture(allLinesDoc(base.vectors), W) } : null });
      if (terms.previous) record.author.previousTry = { tryNumber: req.tryNumber, retries: req.retries, from: path.resolve(req.previous) };
      record.author.handed = handed.map(h => ({ folder: h.folder, files: h.files.map(f => f.name) }));
      fs.writeFileSync(path.join(dir, 'session-prompt.txt'), prompt);
      const server = sessionServer({ dir: cwd, sheet: { widthMm: spec.sheet.widthMm, heightMm: spec.sheet.heightMm }, forms: record.masks.mask ? await formBoxes(record.masks.mask, record.masks.forms, W) : [], looks: looksMost, wallMinutes: wallMost, graceMinutes: graceMost, reverts: revertsMost, startKey: choiceKey(readChoice({ kind: 'settings', settings: {} }), ''), pictures: handedPictures, checkScript: check, checkPlan: obj => checkEdit(obj, listing), checkTools, ledger: path.join(dir, 'looks.jsonl'), keep: path.join(dir, 'looks'), compile: (choice, script, n, edit) => compileChoice(r, choice, script, path.join(dir, 'plans', String(n)), edit),
        look: (choice, script, at, edit, compiled, ask) => paintLook(r, choice, script, path.join(dir, 'look-paints', `${at.plan}-${at.look}`), at, edit, compiled, ask) });
      // what nothing of the session may read: this checkout, the checkout it is a worktree of (with every worktree, cache
      // and earlier run under it), the subject list with its inputs, and whatever UNPAINT_SESSION_DENY adds (a:b:c)
      const deny = [...sessionDeny(spec), ...runs.filter(o => o !== r && o.sessionDir).map(o => o.sessionDir)];
      const call = sessionCall(author, { prompt, cwd, deny, images: packet.files.filter(f => /source|study-2/.test(f)).map(f => path.join(cwd, f)) });
      // the profile is tried before the model is started: a file of the repository must not be readable under it
      if (call.probe) {
        const can = file => { const p = call.probe(file); try { execFileSync(p.cmd, p.args, { stdio: 'pipe' }); return true; } catch { return false; } };
        if (can(path.join(ROOT, 'package.json'))) throw new Error('the session\'s sandbox does not hold: a file of the repository can be read under it; the session is not started');
        if (!can(path.join(cwd, 'README.md'))) throw new Error('the session\'s sandbox cannot be started on this machine (its own folder is not readable under it); the session is not started');
      }
      say(r, `${author.name} starts its working session (${author.cli}; level ${level.name}, try ${req.tryNumber}; the benchmark's budget for this try: ${wallMost} min on the clock, ${looksMost} look units of rendering, ${revertsMost} returns to an earlier choice${handed.length ? `; handed: ${handed.map(h => h.folder).join(', ')}` : ''}): ${call.closed}`);
      server.start();
      // the clock starts when the model's command does: the wait for a place among the models at work is not on it
      const t0 = Date.now();
      const done = await modelSlot(() => (call.serial ? agySlot : f => f())(() => { server.begin(); return runSession(call, { cwd, outFile: path.join(dir, 'S.out.txt'), errFile: path.join(dir, 'S.err.txt'), over: server.over }); }));
      await server.tick();
      // its own review of its last sheet, when it wrote one: read and kept, never a gate (self-review.mjs)
      let reviewText = null; try { reviewText = safeRead(cwd, 'self-review.md').slice(0, 20000); } catch { /* none written, or not a plain file of its folder */ }
      const review = readSelfReview(reviewText, server.looksTaken()), reviews = [{ written: Boolean(reviewText), look: review.look, differences: review.items, major: review.major, text: reviewText }];
      if (reviewText) fs.writeFileSync(path.join(dir, 'self-review.md'), reviewText);
      // a retry's own assessment of its previous painting, written before it started: kept, never a gate
      let assessment = null; try { assessment = safeRead(cwd, 'assessment.md').slice(0, 20000); } catch { /* none written */ }
      if (assessment) fs.writeFileSync(path.join(dir, 'assessment.md'), assessment);
      await server.tick(); const kept = await server.stop();
      const seen = readTranscript(author.cli, fs.existsSync(path.join(dir, 'S.out.txt')) ? fs.readFileSync(path.join(dir, 'S.out.txt'), 'utf8') : '');
      fin = done.ended === 'not started' ? { failure: `the model could not be called: ${done.error}` } : finalChoice({ present: server.present, lastGood: kept.lastGood, good: kept.good, ended: done.ended, barred: server.barred });
      const outside = reachedOutside(seen.commands, deny, [cwd, real]), pictures = ownPictures(cwd);
      // a session ended by the budget is not a failure: it is marked, and what it had is painted
      const budgetReached = kept.budgetReached ?? (done.ended === 'budget reached' ? { what: `${wallMost} minutes of wall time` } : null);
      session = {
        ended: done.ended === 'budget reached' ? 'reached the benchmark\'s resource budget' : done.ended, exit: done.exit, error: done.ended === 'budget reached' ? null : done.error, level: level.name, tryNumber: req.tryNumber, budget, budgetReached, looksMost,
        ownMinutes: +(kept.ownSeconds / 60).toFixed(1), waitMinutes: +(kept.waitSeconds / 60).toFixed(1), wallMinutes: +((Date.now() - t0) / 60000).toFixed(1),
        lookUnits: kept.lookUnits, assessment: terms.previous ? { asked: true, written: Boolean(assessment), text: assessment } : null,
        looks: kept.looks, selfReviews: reviews, turns: 1, plans: kept.plans.map(({ key, ...p }) => p), reverts: kept.reverts, warningsGiven: kept.warningsGiven, toolCalls: seen.calls, toolCallsTotal: Object.values(seen.calls).reduce((a, b) => a + b, 0),
        // the pictures it was handed: its own line on each (seen.md), and what its command's log shows of a read (null: that log cannot show one)
        pictures: kept.pictures ? { ...kept.pictures, logShowsRead: logReads(author.cli, seen.commands, kept.pictures.handed) } : null,
        submitted: fin.submitted ?? null, lastMessage: seen.text.slice(0, 4000), routes: { closed: call.closed, commandsNamingOutside: outside, picturesItMade: pictures },
      };
      if (budgetReached) say(r, `REACHED THE BENCHMARK'S RESOURCE BUDGET (${budgetReached.what}): the session was asked to hand in what it had; recorded, not a failure`);
      Object.assign(record.author, { seconds: kept.ownSeconds, tokens: seen.tokens, tokensIn: seen.tokensIn, tokensOut: seen.tokensOut, costUSD: seen.costUSD });
      fs.writeFileSync(path.join(dir, 'S.commands.txt'), seen.commands.join('\n---\n') + '\n');
      fs.cpSync(cwd, path.join(dir, 'folder'), { recursive: true, verbatimSymlinks: true });
      // the record a parity check needs: what was handed over, with the hash of every file it names as it was kept
      if (fin.submitted) fs.writeFileSync(path.join(dir, 'handed-over.json'), JSON.stringify(handedOverRecord(path.join(dir, 'folder'), fin.submitted, { subject: { id: spec.id, variant: spec.variant ?? null, sourceSha256: spec.source.sha256 }, sheet: spec.sheet, commit: code.commit, dirty: Boolean(code.dirty) }), null, 1) + '\n');
      if (fin.submitted) record.author.parity = { ...checkHandedOver(path.join(dir, 'folder'), JSON.parse(fs.readFileSync(path.join(dir, 'handed-over.json'), 'utf8'))), of: path.join(dir, 'handed-over.json') };
      // a session that named the painter, the repository or another session in a command went round its looks: it is not painted
      if (outside.length && !fin.failure) fin = { failure: `the look limit was not held: ${outside.length} of its commands name the painter or a place outside its folder (author/S.commands.txt); nothing of this session is painted`, submitted: fin.submitted };
      say(r, `session ${session.ended === 'done' ? 'ended' : `ended (${session.ended})`}: ${session.wallMinutes} min on the clock (${session.ownMinutes} its own), ${kept.looks.length} looks for ${kept.lookUnits.spent} of ${looksMost} look units, ${kept.plans.length} plans, ${session.toolCallsTotal} tool calls, ${kept.reverts.count} returns to an earlier choice, ${kept.warningsGiven} warnings given; handed over: ${fin.submitted ? `${fin.submitted.what}${fin.submitted.note ? ` (${fin.submitted.note})` : ''}` : 'nothing'}${outside.length ? `; ${outside.length} COMMANDS NAME PLACES OUTSIDE ITS FOLDER (S.commands.txt)` : ''}${pictures.length ? `; it made ${pictures.length} pictures of its own` : ''}`);
    } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
  }
  record.author.session = session; record.author.label = authorLabel(record.author);
  if (fin.failure) throw new Error(fin.failure);
  await paintChoice(r, fin);
}

/**
 * A choice painted (or planned) as this run: the code planner under its settings (none: exactly the code planner),
 * its plan as edited, or a script, with the choice's tools (its lines, its forms, settings per form) laid over the
 * run. `fin`: {choice, script, edit, submitted}. The record gets what was chosen and what was painted.
 */
async function paintChoice(r, fin) {
  const { record } = r, dir = path.join(record.out, 'author');
  const mine = await specWith(r, fin.choice), kept = path.join(dir, 'script.json'), keptEdit = path.join(dir, 'plan-edit.json');
  // its tools: what it chose of the lines and the forms, and the settings it gave single forms, counted; the drawing and
  // the forms of the record are then its own (never the pinned drawing or the reviewed receipt)
  const tools = await toolsOf(r, fin.choice);
  if (tools) {
    record.author.tools = tools.record; say(r, `its tools: ${tools.said}`);
    record.subject.deviations = mine.deviations;
    if (tools.warnings?.length) { record.author.warnings = tools.warnings; say(r, `${tools.warnings.length} warnings it was given and may have ignored: ${tools.warnings.slice(0, 6).join(' | ')}`); }
    if (tools.order) record.drawing = { ...record.drawing, medium: tools.laidAs === 'ink' ? 'ink' : tools.laidAs === 'pencil' ? 'pencil (graphite)' : 'none', stem: mine.drawing.stem, pinned: false, files: mine.drawing.files.map(f => f.abs), sha256: mine.drawing.files.map(f => f.sha256 ?? f.unpinnedSha256), chosenBy: 'the author: its choice of the record\'s lines', order: tools.order, closing: tools.closing ?? null, of: r.spec.drawing.stem };
    if (tools.receipt) record.masks = { ...record.masks, receipt: mine.masks.receipt, from: 'the author\'s edit of the reviewed forms (not reviewed)', mask: mine.masks.mask, review: null, forms: mine.masks.forms, reviewedReceipt: r.spec.masks.receipt };
  }
  // an edited plan: the file is kept, and what it changed (washes changed, merged, left out, added; the share untouched) is in the record
  if (fin.edit) { fs.writeFileSync(keptEdit, JSON.stringify(fin.edit, null, 1) + '\n'); record.author.planEdit = fin.submitted?.edit ?? null; if (record.author.planEdit) say(r, `its edit: ${editLine(record.author.planEdit)}`); }
  if (fin.script) { fs.writeFileSync(kept, JSON.stringify(fin.script, null, 1) + '\n'); Object.assign(record.author, { passages: fin.script.passages.length, palette: fin.script.palette }); record.masks.read = false; }
  else { record.subject.deviations = mine.deviations; record.masks.read = Boolean(record.masks.receipt); record.masks.whyNotRead = null; record.studies = record.studies.map((s, i) => ({ ...s, floorMm2: mine.studies[i].floorMm2, read: mine.studies[i].read, ...(mine.studies[i].forms ? { forms: mine.studies[i].forms } : {}) })); }
  const commandFor = dirty => { const c = buildCommand(mine, { mode: req.mode, out: record.plate, known, dirty, segEnv, script: fin.script ? { file: kept, paints: fin.script.palette } : null, edit: fin.edit ? { file: keptEdit } : null }); record.settings = c.settings; return c; };
  const painted = await paintOnce(r, commandFor, record.plate, path.join(record.out, 'run.log'));
  record.failure = painted.failure; record.results = painted.results;
  // the painter's own count of the edit it applied (the same rule, on the plan it built again)
  if (fin.edit) { try { record.author.planEdit = JSON.parse(fs.readFileSync(path.join(record.plate, 'plan-edit-record.json'), 'utf8')); } catch { /* the plan failed; the session's count stands */ } }
}

/**
 * One look of a kept choice, painted for real, small, exactly as a session's look is (the word `look`): the whole
 * plan, or stopped after a stage (--until), or a script's passages in a region (--region). No model is called. The
 * run's folder gets look/ (the dried sheet beside the subject, the stages, the numbers) and the record says what the
 * look was estimated to cost in units and what the machine really spent on it.
 */
async function lookOfChoice(r, fin) {
  const { spec, record } = r, dir = path.join(record.out, 'author'), W = spec.sheet.widthMm;
  const tools = await toolsOf(r, fin.choice);
  if (tools) { record.author.tools = tools.record; say(r, `its tools: ${tools.said}`); if (tools.warnings?.length) { record.author.warnings = tools.warnings; for (const w of tools.warnings) say(r, `WARNING (laid as written): ${w}`); } }
  const compiled = await compileChoice(r, fin.choice, fin.script, path.join(dir, 'plans', 'look'), fin.edit);
  if (!compiled.ok) throw new Error(`the choice does not compile: ${compiled.error}`);
  const forms = record.masks.mask ? await formBoxes(record.masks.mask, record.masks.forms, W) : [], given = req.region ? (r => (r.length === 4 && r.every(Number.isFinite) ? r : req.region))(req.region.split(',').map(Number)) : null;
  const region = regionBox(given, { sheet: { widthMm: W, heightMm: spec.sheet.heightMm }, forms });
  if (region && !fin.script) throw new Error('--region: a look of a region is painted for an own script only');
  const estimate = lookCost(compiled.rows ?? [], { until: req.until, regionShare: region?.share ?? null });
  say(r, `this look is estimated at ${estimate.cost} units (${estimate.strokes} of ${estimate.of} strokes${region ? `, ${Math.round(100 * region.share)}% of the sheet` : ''}); painting it`);
  const got = await paintLook(r, fin.choice, fin.script, path.join(dir, 'look-paints', '1'), { plan: 1, look: 1 }, fin.edit, compiled, { until: req.until, region });
  if (!got.ok) throw new Error(`the look was not painted: ${got.error}`);
  const out = path.join(record.out, 'look'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'beside.png'), got.picture); if (got.stages) fs.writeFileSync(path.join(out, 'stages.png'), got.stages); fs.writeFileSync(path.join(out, 'numbers.txt'), got.numbersText);
  record.look = { until: req.until ?? null, region: region ? { box: region.box, name: region.name, share: +region.share.toFixed(4) } : null, estimate, painterSeconds: got.painted.seconds, stopped: got.painted.stopped, regionPassages: got.painted.regionPassages, cells: got.painted.cells, fullCells: got.painted.fullCells, backend: got.painted.backend, picture: path.join(out, 'beside.png'), plate: got.painted.plate };
  fs.writeFileSync(path.join(out, 'look.json'), JSON.stringify(record.look, null, 1) + '\n');
  record.results = collectResults(compiled.plate, 'plan'); record.plate = compiled.plate; record.seconds = got.painted.seconds;
  say(r, `look painted and dried in ${got.painted.seconds} s on the ${got.painted.backend?.backend}: ${path.join(out, 'beside.png')}${got.painted.stopped ? `; stopped after stage ${req.until}: ${got.painted.stopped.passesDone} of ${got.painted.stopped.passesPlanned} passes` : ''}${got.painted.regionPassages ? `; ${got.painted.regionPassages} in the region` : ''}`);
}

async function oneRun(r) {
  const { spec, record, authorFull: author } = r;
  fs.mkdirSync(record.out, { recursive: true });
  try {
    // a kept script or plan edit: the drawing it is painted with is its session's, or the one asked for by name; never unasked
    const keptKind = author.cli === 'edit' ? 'plan' : author.cli === 'script' ? 'script' : null, drawn = keptKind ? drawingOfKept(author.file, keptKind, req.lines) : null;
    if (drawn) { record.author.drawingBy = drawn.said; say(r, `its drawing: ${drawn.said}`); }
    if (author.key === 'auto') {
      const got = await paintOnce(r, dirty => buildCommand(spec, { mode: req.mode, out: record.plate, known, dirty, segEnv }), record.plate, path.join(record.out, 'run.log'));
      record.failure = got.failure; record.results = got.results;
    } else if (drawn?.linesFile) {
      // a kept script or plan edit with a choice of lines (its session's, or one named with --lines): painted with those
      // lines, as a session's choice is (kept-session.mjs refuses it when the lines file is missing or the file is not
      // what its session handed over; it is never painted with the standard drawing in their place)
      const kind = keptKind, tied = drawn, read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
      fs.mkdirSync(path.join(record.out, 'author'), { recursive: true });
      const choice = readChoice({ kind, [kind]: kind === 'script' ? 'script.json' : 'plan-edit.json', lines: tied.lines });
      choice.tools.linesEdit = read(tied.linesFile);
      const fin = { choice, script: kind === 'script' ? readScript(author.file, { sheetWidthMm: spec.sheet.widthMm }).script : null, edit: kind === 'plan' ? read(author.file) : null, submitted: { kind, what: tied.what } };
      Object.assign(record.author, { chose: tied.what, linesFrom: { session: tied.run, file: tied.linesFile } });
      await paintChoice(r, fin);
    } else if (author.cli === 'edit') {
      // a kept edit of the code planner's plan (plan-to-edit.json of a plan, as written or changed): no model is called
      const dir = path.join(record.out, 'author'), kept = path.join(dir, 'plan-edit.json'); fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(author.file, kept);
      const got = await paintOnce(r, dirty => buildCommand(spec, { mode: req.mode, out: record.plate, known, dirty, segEnv, edit: { file: kept } }), record.plate, path.join(record.out, 'run.log'));
      record.failure = got.failure; record.results = got.results;
      try { record.author.planEdit = JSON.parse(fs.readFileSync(path.join(record.plate, 'plan-edit-record.json'), 'utf8')); record.author.label = authorLabel(record.author); } catch { /* the plan failed */ }
    } else if (author.cli === 'choice') {
      // a kept choice (a folder holding choice.json and the files it names: a script, an edited plan, its lines, its
      // forms): painted as a session's choice is, no model called
      fs.mkdirSync(path.join(record.out, 'author'), { recursive: true });
      const read = f => JSON.parse(fs.readFileSync(path.join(author.dir, f), 'utf8')), choice = readChoice(read('choice.json'));
      if (choice.tools) for (const [k, to] of [['lines', 'linesEdit'], ['forms', 'formsEdit']]) if (choice.tools[k]) choice.tools[to] = read(choice.tools[k]);
      const fin = { choice, script: choice.kind === 'script' ? checkAuthored(read(choice.script), { sheetWidthMm: spec.sheet.widthMm }).script : null, edit: choice.kind === 'plan' ? read(choice.plan) : null, submitted: { kind: choice.kind, what: choiceKind(choice) } };
      record.author.chose = fin.submitted.what; record.author.label = authorLabel(record.author);
      if (req.look) await lookOfChoice(r, fin); else await paintChoice(r, fin);
    } else if (author.work === 'session') {
      await sessionRun(r);
    } else {
      // the author's script: a kept one, or one a model writes now from the locked inputs. A model whose answer is
      // refused, or whose script the painter cannot plan, is asked once more with the reason; then the result stands.
      const dir = path.join(record.out, 'author'), kept = path.join(dir, 'script.json'); fs.mkdirSync(dir, { recursive: true });
      const model = author.cli !== 'script', pics = model ? await runPictures(record) : null;
      const briefFile = BRIEF_FILE;
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
        const plate = attempt === 1 ? record.plate : `${record.plate}-retry`, commandFor = dirty => buildCommand(spec, { mode: req.mode, out: plate, known, dirty, segEnv, script: { file: kept, paints: got.paints } });
        const painted = await paintOnce(r, commandFor, plate, path.join(record.out, attempt === 1 ? 'run.log' : 'run-retry.log'));
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
  // what the session cost, measured: its looks, plans, minutes, tokens and cost, the machine's minutes for its looks and
  // for the full-size final (which is painted after the session, outside its clock), and what was taken prepared
  if (record.author.session) {
    let plan = null; try { plan = planSummary(JSON.parse(fs.readFileSync(path.join(record.plate, 'value-plan.json'), 'utf8'))); } catch { /* no plan was made */ }
    const s = record.author.session, usage = usageOf({ subject: record.subject.key, author: record.author, level: s.level ?? record.author.level ?? null, tryNumber: s.tryNumber ?? record.author.tryNumber ?? null, budget: s.budget ?? record.author.budget ?? null, session: s,
      final: { seconds: record.seconds, backend: record.results.backend?.backend ?? null, failure: record.failure, mode: req.mode }, plan, prepared: record.author.prepared ?? null, commit: record.code.commit });
    fs.writeFileSync(path.join(record.out, 'usage.json'), JSON.stringify(usage, null, 1) + '\n'); record.usage = path.join(record.out, 'usage.json');
    say(r, `usage: ${usageLine(usage)}`);
  }
  fs.writeFileSync(path.join(record.out, 'run.json'), JSON.stringify(record, null, 1) + '\n');
  const p = record.results.plan;
  say(r, `${record.results.state}${p ? `: ${p.shapes ?? '-'} shapes, ${p.washes} washes, ${p.strokes ?? '-'} strokes, widest wash brush ${p.widestBrushMm} mm` : ''}${record.results.cheatRisk?.level ? `; cheat-risk ${record.results.cheatRisk.level}` : ''}; painter ${record.seconds ?? 0} s; sheet ${record.sheetImage}`);
}
/**
 * A subject's prepared inputs made once for this code and these settings (prepared.mjs): the code planner's plan on
 * the CPU, and for level 4 its full-size painting on the GPU with the painting's three sheets. What is already there
 * is kept and said; nothing is made twice.
 */
async function prepareRun(r) {
  const { spec, record } = r, folder = preparedAt(spec), plan = path.join(folder, 'plan'), read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const was = read(path.join(folder, 'prepared.json')) ?? {}, out = { subject: { id: spec.id, variant: spec.variant ?? null, sourceSha256: spec.source.sha256 }, commit: code.commit, dirty: Boolean(code.dirty), diffSha256: code.dirty ? code.diffSha256 : null, sets: req.sets, plan: was.plan ?? null, painting: was.painting ?? null };
  try {
    if (out.plan && fs.existsSync(path.join(plan, 'value-plan.json'))) say(r, `the plan is already prepared (${plan})`);
    else {
      fs.rmSync(plan, { recursive: true, force: true });
      say(r, 'preparing the code planner\'s plan (CPU)');
      const got = await compileChoice(r, readChoice({ kind: 'settings', settings: {} }), null, plan);
      if (!got.ok) throw new Error(`the code planner's plan did not compile: ${got.error}`);
      out.plan = { seconds: got.seconds, made: new Date().toISOString(), washes: got.summary.washes, strokes: got.summary.strokes };
    }
    out.made = out.plan.made; writePrepared(folder, out);
    if (level.autoPainting) {
      if (out.painting && fs.existsSync(path.join(record.out, 'run.json'))) say(r, `the automatic painting is already prepared (${record.out})`);
      else {
        fs.rmSync(record.out, { recursive: true, force: true });
        say(r, 'preparing the automatic painter\'s full-size painting (GPU)');
        await oneRun(r);
        if (record.failure) throw new Error(`the automatic painting failed: ${record.failure}`);
        out.painting = { seconds: record.seconds, made: new Date().toISOString(), backend: record.results.backend?.backend ?? null };
      }
      const sheets = await writeWorkSheets(record.out, path.join(folder, 'sheets'), { whose: 'the automatic painter\'s' });
      out.painting.sheets = sheets.map(f => f.name); writePrepared(folder, out);
    }
    say(r, `prepared: ${folder} (the plan${level.autoPainting ? ', the painting and its sheets' : ''}). Sessions of this subject at this commit${req.sets.length ? ' and these settings' : ''} now start from it`);
  } catch (e) { record.failure = e.message; say(r, `NOT PREPARED: ${e.message}`); }
}
if (req.prepare) {
  for (const r of runs) await prepareRun(r);
  process.exit(runs.some(r => r.record.failure) || refused.length ? 1 : 0);
}
// every session's folder exists before any session starts, so each is shut out of the others'
for (const r of runs) if (r.authorFull.work === 'session' && !r.record.author.from) r.sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), `unpaint-session-${r.authorFull.key}-`));
await Promise.all(runs.map(oneRun));
for (const r of runs) if (r.sessionDir) fs.rmSync(r.sessionDir, { recursive: true, force: true });
const failed = runs.filter(r => r.record.failure).length + refused.length;

let show = runs[0].record.sheetImage;
if (many) {
  const grid = await writeGridSheet(runs.map(r => r.record), path.join(outRoot, 'sheet.jpg'), { title: `${specs.map(s => s.id).join(', ')} · ${req.mode}${refused.length ? ` · NOT RUN (inputs): ${refused.map(x => x.subject).join(', ')}` : ''}` });
  fs.writeFileSync(path.join(outRoot, 'run.json'), JSON.stringify({ schema: 'unpaint-paint/grid@1', started, mode: req.mode, sheet: grid.file, runs: runs.map(r => ({ subject: r.record.subject.id, author: r.record.author.key, model: r.record.author.id, effort: r.record.author.effort, out: r.record.out, state: r.record.results.state, plan: r.record.results.plan, work: r.record.author.work ?? null, submitted: r.record.author.session?.submitted?.what ?? null, looks: r.record.author.session?.looks?.length ?? null, ownMinutes: r.record.author.session?.ownMinutes ?? null, toolCalls: r.record.author.session?.toolCallsTotal ?? null, authorSeconds: r.record.author.seconds ?? null, tokens: r.record.author.tokens ?? null, costUSD: r.record.author.costUSD ?? null, painterSeconds: r.record.seconds, commit: r.record.code.commit, dirty: r.record.code.dirty, backend: r.record.results.backend ?? null, gpuPaintsAtStart: r.record.gpuPaintsAtStart ?? null, jobsAtStart: r.record.jobsAtStart ?? null, startedMs: r.record.startedMs ?? null, endedMs: r.record.endedMs ?? null, failure: r.record.failure })), refused, jobs: req.mode === 'paint' ? jobs : PLAN_JOBS, throughput: throughput(runs.map(r => r.record)) }, null, 1) + '\n');
  console.log(`\ngrid: ${grid.file}`); show = grid.file;
}
// Preview is opened without this session's variables, so nothing started from it inherits them
if (req.open && process.platform === 'darwin') { try { execFileSync('env', ['-i', `HOME=${process.env.HOME}`, `USER=${process.env.USER}`, 'PATH=/usr/bin:/bin', 'open', '-a', 'Preview', show]); } catch (e) { console.error(`paint: could not open the sheet (${e.message})`); } }
process.exit(failed ? 1 : 0);
