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
import { writeRunSheet, writeGridSheet, runPictures, formsImage } from './sheet.mjs';
import { authorOf, authorLabel, briefName, readScript, checkAuthored, preparePacket, formBoxes, askAuthor, retryPrompt } from './author.mjs';
import { readChoice, choiceKey, withChoice, settingsList } from './choice.mjs';
import { checkPlanEdit, editLine } from '../../src/paint/methods/plan-edit.mjs';
import { planNumbers, numbersText, washesText, planPicture, lookPicture } from './plan-data.mjs';
import { DEFAULT_LOOKS, DEFAULT_MINUTES, writeSession, sessionServer, finalChoice, sessionCall, readTranscript, reachedOutside, ownFolderOf, ownPictures, runSession } from './session.mjs';
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
const code = codeState(ROOT), switches = switchesOf(), jobs = req.jobs ?? DEFAULT_JOBS, looksMost = req.looks ?? DEFAULT_LOOKS, minutesMost = req.minutes ?? DEFAULT_MINUTES;
const BRIEF_FILE = process.env.UNPAINT_AUTHOR_BRIEF || path.join(HERE, 'AUTHOR-BRIEF.md');
const codeOf = c => ({ commit: c.commit, dirty: Boolean(c.dirty), tracked: c.tracked, untracked: c.untracked.map(u => u.file), diffSha256: c.diffSha256 });
// the painter's environment: where segmentation lives, and a cache folder keyed on the experiment switches
const segEnv = { ...segEnvFor(ROOT), W2_CACHE_DIR: cacheDirFor(process.env.W2_CACHE_DIR || path.join(ROOT, 'work', 'cache'), switches) };

// every subject and author is resolved and checked before anything runs
let registry, specs, authors, qwen = null; const refused = [];
try {
  registry = loadRegistry();
  // a model works as a session (the default) or answers in one reply; its column is named for what it does
  authors = req.authors.map(a => authorOf(a, ownAuthors, models)).map(a => (a.cli && !['script', 'edit'].includes(a.cli) ? { ...a, work: req.work, brief: req.work === 'reply' ? briefName(BRIEF_FILE) : null } : a));
  if (req.work === 'session') for (const a of authors) if (a.work) sessionCall(a, { prompt: '', cwd: '' });
  if (req.from && !fs.existsSync(req.from)) throw new Error(`--from ${req.from}: no such folder`);
  if (req.studies === 'author') {
    // open tools: the author's own studies are made by the local image model; every piece of that route must be here
    qwen = qwenRoute(registry.base);
    if (!qwen.ready) throw new Error(`--studies author needs the local study route, and this machine lacks: ${qwen.missing.join('; ')}. Run with --studies locked.`);
    if (authors.some(a => !a.cli || ['script', 'edit'].includes(a.cli))) throw new Error('--studies author: every author must be a model (auto and kept scripts make no studies)');
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
const outRoot = path.resolve(req.out ?? path.join(ROOT, 'work', 'paint', `${stamp(now)}-${specs.map(s => s.id).join('+')}-${req.mode}`));
const runs = [];
for (const spec of specs) for (const author of authors) {
  const out = many ? path.join(outRoot, runFolder(spec, author.key === 'auto' ? 'auto' : author.name)) : outRoot;
  const scriptFile = author.key === 'auto' || author.work === 'session' || author.cli === 'edit' ? null : path.join(out, 'author', 'script.json');
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
        ...(author.work === 'session' ? { looksMost, minutesMost, from: req.from ? path.join(path.resolve(req.from), many ? runFolder(spec, author.name) : '') : null } : {}) },
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
// CPU plans three at a time, GPU paintings --jobs at a time (queue.mjs).
// a queue's places can be changed while it runs: write the number into <out>/jobs
const readJobs = () => { try { return jobsNow(jobs, fs.readFileSync(path.join(outRoot, 'jobs'), 'utf8')); } catch { return jobs; } };
const painterSlot = pool(req.mode === 'plan' ? PLAN_JOBS : many ? 16 : jobs), planSlot = pool(2 * PLAN_JOBS), startGate = pool(1), agySlot = pool(1), modelSlot = pool(6), qwenSlot = pool(1);
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
/** The subject with a session's choice laid over this run's settings (a settings choice), checked as any run's is. */
function specWith(spec, choice) {
  if (!choice.sets.length) return spec;
  return checkInputs(resolveSubject(registry, spec.id, { sets: withChoice(req.sets, choice), variant: spec.variant ? variants[spec.id]?.[spec.variant] : null, variantName: spec.variant }));
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
    const mine = specWith(spec, choice);
    fs.mkdirSync(path.dirname(plate), { recursive: true });
    if (script) fs.writeFileSync(scriptFile, JSON.stringify(script, null, 1) + '\n');
    if (edit) fs.writeFileSync(editFile, JSON.stringify(edit, null, 1) + '\n');
    const command = buildCommand(mine, { mode: 'plan', out: plate, known, dirty: codeState(ROOT).dirty, segEnv, script: script ? { file: scriptFile, paints: script.palette } : null, edit: edit ? { file: editFile } : null });
    const done = await planSlot(() => runPainter(command, { cwd: ROOT, logFile: `${plate}.log` })), results = collectResults(plate, 'plan');
    if ((done.exit !== 0 && done.exit !== 3) || !results.planPreview || !fs.existsSync(path.join(plate, 'value-plan.json'))) {
      const why = fs.readFileSync(`${plate}.log`, 'utf8').split('\n').filter(l => /(^|\s)(Error|TypeError|RangeError)\b/.test(l)).pop()?.trim().slice(0, 400);
      return { ok: false, error: tidy(why ?? `the planner ended with exit ${done.exit ?? done.signal} and no plan`) };
    }
    const numbers = await planNumbers({ plate, planPreview: results.planPreview, run: record, script });
    return { ok: true, ...numbers, numbersText: numbersText(numbers, { script: Boolean(script) }), picture: await lookPicture({ planPreview: results.planPreview, run: record }), planPreview: results.planPreview, seconds: done.seconds, plate };
  } catch (e) { return { ok: false, error: tidy(e.message) }; }
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
  const check = obj => checkAuthored(obj, { sheetWidthMm: W }).script;
  // an edited plan is checked against the code planner's plan as the painter wrote it out for editing
  const toEdit = folder => JSON.parse(fs.readFileSync(path.join(folder, 'plan-to-edit.json'), 'utf8'));
  const checkEdit = (obj, listing) => { try { return { edit: obj, record: checkPlanEdit(obj, listing).record }; } catch (e) { throw new Error(tidy(e.message)); } };
  let fin, session;
  if (record.author.from) {
    let earlier; try { earlier = JSON.parse(fs.readFileSync(path.join(record.author.from, 'run.json'), 'utf8')); } catch { throw new Error(`--from: no finished run at ${record.author.from}`); }
    const sub = earlier.author?.session?.submitted;
    if (!sub || earlier.subject.id !== spec.id || earlier.author.key !== author.key) throw new Error(`--from: ${record.author.from} is not a session of ${author.name} on ${spec.id} that handed over a choice`);
    const choice = readChoice({ kind: sub.kind, settings: sub.settings, script: sub.script ?? undefined, plan: sub.plan ?? undefined, why: sub.why });
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
    for (const k of ['seconds', 'tokens', 'costUSD']) record.author[k] = earlier.author[k] ?? null;
    if (!fin.failure) say(r, `painting what its earlier session handed over (${sub.what}); no model is called`);
  } else {
    const pics = await runPictures(record);
    const packet = await preparePacket({ dir, root: ROOT, run: { ...record, masks: record.masks.receipt ? { ...record.masks, formsPng: await formsImage(record.masks.mask) } : null }, drawingPng: pics.drawing, briefFile: BRIEF_FILE });
    say(r, 'the code planner\'s own plan first (CPU): the session\'s starting point');
    const auto = await compileChoice(r, readChoice({ kind: 'settings', settings: {} }), null, path.join(dir, 'plans', 'auto'));
    if (!auto.ok) throw new Error(`the code planner's own plan did not compile, so the session has no starting point: ${auto.error}`);
    // the model's folder: a temporary one outside the repository; it is kept in the run folder when the session ends
    const cwd = r.sessionDir, real = fs.realpathSync(cwd), listing = toEdit(auto.plate);
    try {
      for (const f of packet.files) { fs.mkdirSync(path.dirname(path.join(cwd, f)), { recursive: true }); fs.copyFileSync(path.join(dir, f), path.join(cwd, f)); }
      const { prompt } = writeSession({ dir: cwd, packet, sheet: spec.sheet, medium: record.drawing.medium, auto: { picture: await planPicture({ planPreview: auto.planPreview, run: record }), washesText: washesText(auto), plan: { summary: auto.summary, washes: auto.rows }, toEdit: listing }, settings: settingsList(spec),
        forms: record.masks.mask ? await formBoxes(record.masks.mask, record.masks.forms, W) : null, formsIds: record.masks.mask ?? null, looks: looksMost, minutes: minutesMost, briefFile: path.join(HERE, 'SESSION-BRIEF.md'), readmeFile: path.join(HERE, 'SESSION-README.md') });
      fs.writeFileSync(path.join(dir, 'session-prompt.txt'), prompt);
      const server = sessionServer({ dir: cwd, looks: looksMost, minutes: minutesMost, checkScript: check, checkPlan: obj => checkEdit(obj, listing), ledger: path.join(dir, 'looks.jsonl'), compile: (choice, script, n, edit) => compileChoice(r, choice, script, path.join(dir, 'plans', String(n)), edit) });
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
      say(r, `${author.name} starts its working session (${author.cli}; ${minutesMost} min of its own time, ${looksMost} looks): ${call.closed}`);
      server.start();
      const t0 = Date.now(), done = await modelSlot(() => (call.serial ? agySlot : f => f())(() => runSession(call, { cwd, outFile: path.join(dir, 'S.out.txt'), errFile: path.join(dir, 'S.err.txt'), over: server.over })));
      await server.tick(); const kept = await server.stop(), seen = readTranscript(author.cli, fs.readFileSync(path.join(dir, 'S.out.txt'), 'utf8'));
      fin = done.ended === 'not started' ? { failure: `the model could not be called: ${done.error}` } : finalChoice({ present: server.present, lastGood: kept.lastGood, good: kept.good, ended: done.ended });
      const outside = reachedOutside(seen.commands, deny, [cwd, real]), pictures = ownPictures(cwd);
      session = {
        ended: done.ended, exit: done.exit, error: done.error, looksMost, minutesMost, ownMinutes: +(kept.ownSeconds / 60).toFixed(1), waitMinutes: +(kept.waitSeconds / 60).toFixed(1), wallMinutes: +((Date.now() - t0) / 60000).toFixed(1),
        looks: kept.looks, plans: kept.plans.map(({ key, ...p }) => p), toolCalls: seen.calls, toolCallsTotal: Object.values(seen.calls).reduce((a, b) => a + b, 0),
        submitted: fin.submitted ?? null, lastMessage: seen.text.slice(0, 4000), routes: { closed: call.closed, commandsNamingOutside: outside, picturesItMade: pictures },
      };
      Object.assign(record.author, { seconds: kept.ownSeconds, tokens: seen.tokens, costUSD: seen.costUSD });
      fs.writeFileSync(path.join(dir, 'S.commands.txt'), seen.commands.join('\n---\n') + '\n');
      fs.cpSync(cwd, path.join(dir, 'folder'), { recursive: true, verbatimSymlinks: true });
      // a session that named the painter, the repository or another session in a command went round its looks: it is not painted
      if (outside.length && !fin.failure) fin = { failure: `the look limit was not held: ${outside.length} of its commands name the painter or a place outside its folder (author/S.commands.txt); nothing of this session is painted`, submitted: fin.submitted };
      say(r, `session ${done.ended === 'done' ? 'ended' : `ended (${done.ended})`}: ${session.ownMinutes} min of its own time, ${kept.looks.length} of ${looksMost} looks, ${kept.plans.length} plans, ${session.toolCallsTotal} tool calls; handed over: ${fin.submitted ? `${fin.submitted.what}${fin.submitted.note ? ` (${fin.submitted.note})` : ''}` : 'nothing'}${outside.length ? `; ${outside.length} COMMANDS NAME PLACES OUTSIDE ITS FOLDER (S.commands.txt)` : ''}${pictures.length ? `; it made ${pictures.length} pictures of its own` : ''}`);
    } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
  }
  record.author.session = session; record.author.label = authorLabel(record.author);
  if (fin.failure) throw new Error(fin.failure);
  // what it handed over is painted: the code planner under its settings (none: exactly the code planner), or its script
  const mine = specWith(spec, fin.choice), kept = path.join(dir, 'script.json'), keptEdit = path.join(dir, 'plan-edit.json');
  // an edited plan: the file is kept, and what it changed (washes changed, merged, left out, added; the share untouched) is in the record
  if (fin.edit) { fs.writeFileSync(keptEdit, JSON.stringify(fin.edit, null, 1) + '\n'); record.author.planEdit = fin.submitted?.edit ?? null; if (record.author.planEdit) say(r, `its edit: ${editLine(record.author.planEdit)}`); }
  if (fin.script) { fs.writeFileSync(kept, JSON.stringify(fin.script, null, 1) + '\n'); Object.assign(record.author, { passages: fin.script.passages.length, palette: fin.script.palette }); record.masks.read = false; }
  else { record.subject.deviations = mine.deviations; record.masks.read = Boolean(record.masks.receipt); record.masks.whyNotRead = null; record.studies = record.studies.map((s, i) => ({ ...s, floorMm2: mine.studies[i].floorMm2, read: mine.studies[i].read })); }
  const commandFor = dirty => { const c = buildCommand(mine, { mode: req.mode, out: record.plate, known, dirty, segEnv, script: fin.script ? { file: kept, paints: fin.script.palette } : null, edit: fin.edit ? { file: keptEdit } : null }); record.settings = c.settings; return c; };
  const painted = await paintOnce(r, commandFor, record.plate, path.join(record.out, 'run.log'));
  record.failure = painted.failure; record.results = painted.results;
  // the painter's own count of the edit it applied (the same rule, on the plan it built again)
  if (fin.edit) { try { record.author.planEdit = JSON.parse(fs.readFileSync(path.join(record.plate, 'plan-edit-record.json'), 'utf8')); } catch { /* the plan failed; the session's count stands */ } }
}

async function oneRun(r) {
  const { spec, record, authorFull: author } = r;
  fs.mkdirSync(record.out, { recursive: true });
  try {
    if (author.key === 'auto') {
      const got = await paintOnce(r, dirty => buildCommand(spec, { mode: req.mode, out: record.plate, known, dirty, segEnv }), record.plate, path.join(record.out, 'run.log'));
      record.failure = got.failure; record.results = got.results;
    } else if (author.cli === 'edit') {
      // a kept edit of the code planner's plan (plan-to-edit.json of a plan, as written or changed): no model is called
      const dir = path.join(record.out, 'author'), kept = path.join(dir, 'plan-edit.json'); fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(author.file, kept);
      const got = await paintOnce(r, dirty => buildCommand(spec, { mode: req.mode, out: record.plate, known, dirty, segEnv, edit: { file: kept } }), record.plate, path.join(record.out, 'run.log'));
      record.failure = got.failure; record.results = got.results;
      try { record.author.planEdit = JSON.parse(fs.readFileSync(path.join(record.plate, 'plan-edit-record.json'), 'utf8')); record.author.label = authorLabel(record.author); } catch { /* the plan failed */ }
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
  fs.writeFileSync(path.join(record.out, 'run.json'), JSON.stringify(record, null, 1) + '\n');
  const p = record.results.plan;
  say(r, `${record.results.state}${p ? `: ${p.shapes ?? '-'} shapes, ${p.washes} washes, ${p.strokes ?? '-'} strokes, widest wash brush ${p.widestBrushMm} mm` : ''}${record.results.cheatRisk?.level ? `; cheat-risk ${record.results.cheatRisk.level}` : ''}; painter ${record.seconds ?? 0} s; sheet ${record.sheetImage}`);
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
