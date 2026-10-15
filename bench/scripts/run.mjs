#!/usr/bin/env node
// Run one model through a round under protocol v2, gentle mode, and write its try folders.
//   npm run bench:run -- --model opus --round V1 --try 1 [--crops <crop,crop>] [--out bench/runs]
//   npm run bench:run -- --model opus --round V3|V4|V5 [--tries 3] [--crops <crop,crop>] [--out bench/runs] [--strict-verdict]
//   npm run bench:run -- --dry-run [--round V3|V4|V5]   (no model, no keys: a scripted stand-in exercises the whole path)
// V1 and V2 write one try per run; V3, V4 and V5 write tries 1 to --tries (v3.mjs, pipeline/round45.mjs).
// A try folder (<out>/<round dir>/<model>/<try>/) gets run.json, <crop>.webp and <crop>-stages.webp. Raw outputs
// (full-size PNGs, stage frames, the model's scripts and logs) go to bench/work/raw/..., which git ignores.
// Score a try afterwards with `npm run bench:score -- <try folder>`. V5 scores each try itself before the next.
// The model runs code with permission prompts turned off. Run real trials in a disposable machine or container.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import {
  BENCH, REPO, RUNS, V2, RUN_SCHEMA, VERSION_STAMP, BUDGET, PUBLIC_CROPS, CROP_ORDER, roundById, loadCrops, loadModels, writeJson, readJson, validateRun, posix, auditScripts,
} from './lib.mjs';
import { brief, prompt, command, usage, KEYS, installSkills } from './runners.mjs';
import { thumb, stageStrip } from './images.mjs';
import { profileForRound } from './profiles.mjs';

const argv = process.argv.slice(2);
const has = n => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const fail = msg => { console.error(`bench:run: ${msg}`); process.exit(2); };

const DRY = has('dry-run');
const round = roundById(opt('round', 'V1'));
if (!round) fail('--round must be one of V1 to V5');
let profile;
try { profile = profileForRound(round.id, opt('profile')); } catch (e) { fail(e.message); }
const MULTI = ['V3', 'V4', 'V5'].includes(round.id);
const mode = opt('mode', 'gentle');
if (mode !== 'gentle') fail('only gentle mode is implemented; hard mode needs a look counter per runner (see docs/anti-cheat.md)');
const tryNo = Number(opt('try', 1));
if (!Number.isInteger(tryNo) || tryNo < 1) fail('--try must be an integer from 1');

const models = loadModels();
const dryKey = opt('dry-key', 'dry-run');
if (opt('dry-key') && (!DRY || !models.some(m => m.key === dryKey))) fail('--dry-key requires --dry-run and a registered model key');
const model = DRY ? { key: dryKey, name: 'Scripted dry run', id: 'scripts/dry-painter.mjs', effort: 'n/a', runner: 'dry-run' }
  : models.find(m => m.key === opt('model')) || fail(`--model must be one of ${models.map(m => m.key).join(', ')}`);

const cropSpecs = Object.fromEntries(loadCrops().map(c => [c.task, c]));
const crops = (opt('crops') ? opt('crops').split(',') : round.targets ?? PUBLIC_CROPS).map(s => s.trim()).filter(Boolean);
const PRIVATE = process.env.BENCH_PRIVATE_CROPS ? path.resolve(process.env.BENCH_PRIVATE_CROPS) : null;
for (const c of crops) {
  if (!CROP_ORDER.includes(c)) fail(`unknown crop ${c}`);
  if (!cropSpecs[c].distributed && !PRIVATE) fail(`crop ${c} is not distributed; set BENCH_PRIVATE_CROPS to a folder with ${c}.png and ${c}-coarse.json`);
}
crops.sort((a, b) => CROP_ORDER.indexOf(a) - CROP_ORDER.indexOf(b));
const targetOf = c => (cropSpecs[c].distributed ? path.join(V2, cropSpecs[c].file) : path.join(PRIVATE, `${c}.png`));
const coarseOf = c => (cropSpecs[c].distributed ? path.join(V2, cropSpecs[c].coarseFile) : path.join(PRIVATE, `${c}-coarse.json`));
for (const c of crops) for (const f of [targetOf(c), coarseOf(c)]) if (!fs.existsSync(f)) fail(`missing ${f}`);

if (!DRY) {
  const k = KEYS[model.runner];
  try { execFileSync('which', [k.cli], { stdio: 'ignore' }); } catch { fail(`${model.runner} runner needs \`${k.cli}\` on PATH`); }
  if (model.runner === 'together' && !process.env.TOGETHER_API_KEY) fail('the together runner needs TOGETHER_API_KEY in the environment');
}

const outRoot = path.resolve(opt('out', ['V4', 'V5'].includes(round.id) ? path.join(BENCH, 'work', DRY ? 'dry-run' : 'profile-runs', profile.id, 'runs') : DRY ? path.join(BENCH, 'work', 'dry-run', 'runs') : RUNS));
if (MULTI) {
  const tries = Number(opt('tries', profile.planOnly ? 1 : DRY ? (round.id === 'V4' ? 1 : 2) : 3));
  if (profile.planOnly && tries !== 1) fail('lite uses one try; select --profile full for repeated trials');
  if (!Number.isInteger(tries) || tries < 1 || tries > 9) fail('--tries must be an integer from 1 to 9');
  if (!DRY && round.id === 'V5' && !process.env.TOGETHER_API_KEY) fail('V5 scores each try for the next one\'s feedback: set TOGETHER_API_KEY (the judges run on Together)');
  // --dry-width: the painting width of a dry run (default 96 px; the real widths are in v4v5/subjects.json)
  // --from-try: V4 and V5 start at this try (V4 tries are independent, so one damaged try can be rerun alone with --from-try n --tries n)
  let fromTry = Number(opt('from-try', 1));
  if (!Number.isInteger(fromTry) || fromTry < 1 || fromTry > tries) fail('--from-try must be an integer from 1 to --tries');
  if (fromTry > 1 && round.id === 'V3') fail('--from-try applies to V4 and V5; V3 runs every target through all its attempts');
  // --link-v4-try1 (V5 only, off by default): reuse V4 try 1 as V5 try 1 and run from try 2, as the published models were
  if (has('link-v4-try1')) {
    if (round.id !== 'V5' || fromTry !== 1) fail('--link-v4-try1 applies to V5 from try 1');
    const { linkV4Try1 } = await import('./pipeline/link-v4.mjs');
    try { linkV4Try1({ outRoot, modelKey: model.key }); } catch (e) { fail(e.message); }
    console.error(`bench:run: V5 try 1 is ${model.name}'s V4 try 1 (--link-v4-try1)`);
    fromTry = 2;
  }
  const runOpts = { round, model, tries, crops, dry: DRY, outRoot, force: has('force') || DRY, gpu: opt('gpu', DRY ? 'off' : 'auto'), dryWidth: Number(opt('dry-width', 96)), fromTry, strictVerdict: has('strict-verdict'), profile };
  try {
    if (round.id === 'V3') await (await import('./v3.mjs')).runV3(runOpts);
    else await (await import('./pipeline/round45.mjs')).runPipeline(runOpts);
  } catch (e) { fail(e.stack || e.message); }
  process.exit(process.exitCode ?? 0);
}
const tryDir = path.join(outRoot, round.dir, model.key, String(tryNo));
const raw = path.join(BENCH, 'work', 'raw', DRY ? 'dry-run' : '', round.dir, model.key, String(tryNo));
if (fs.existsSync(path.join(tryDir, 'run.json')) && !has('force')) fail(`${tryDir} already has a run.json; pass --force to replace it`);
fs.rmSync(raw, { recursive: true, force: true });
fs.mkdirSync(raw, { recursive: true });
fs.mkdirSync(tryDir, { recursive: true });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unpaint-bench-'));
const ws = path.join(tmp, 'ws'), view = path.join(tmp, 'view');
const git = (...a) => execFileSync('git', a, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
git('worktree', 'add', '--detach', '-q', ws, 'HEAD');
const cleanup = () => { try { git('worktree', 'remove', '--force', ws); } catch { /* already gone */ } fs.rmSync(tmp, { recursive: true, force: true }); };
process.on('SIGINT', () => { cleanup(); process.exit(130); });

for (const p of ['.claude', '.agents', 'AGENTS.md', 'CLAUDE.md', 'bench', 'work', 'examples/targets', 'docs/reviews']) fs.rmSync(path.join(ws, p), { recursive: true, force: true });
fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(ws, 'node_modules'));
const wb = path.join(ws, 'bench');
fs.mkdirSync(path.join(wb, 'tasks'), { recursive: true });
fs.mkdirSync(path.join(wb, 'out'), { recursive: true });
fs.copyFileSync(path.join(V2, 'kit', 'kit.mjs'), path.join(wb, 'kit.mjs'));
fs.copyFileSync(path.join(V2, 'kit', 'guard.mjs'), path.join(wb, 'guard.mjs'));
for (const c of crops) fs.copyFileSync(coarseOf(c), path.join(wb, 'tasks', `${c}-coarse.json`));
fs.mkdirSync(view);
for (const c of crops) fs.copyFileSync(targetOf(c), path.join(view, `${c}.png`));
fs.writeFileSync(path.join(wb, 'BRIEF.md'), brief(round.key, crops, view));
installSkills(round.key, ws);

const env = {
  ...process.env, BENCH_SEED: String(tryNo), BENCH_VIOLATIONS: path.join(raw, 'violations.jsonl'),
  PYTHONPATH: path.join(V2, 'kit', 'py'), BENCH_PYGUARD: path.join(V2, 'kit', 'py'),
};

function launch(cmd, args, { stdinFile, extraEnv = {}, logName = 'events.jsonl' } = {}) {
  return new Promise(resolve => {
    const stdout = fs.openSync(path.join(raw, logName), 'a'), stderr = fs.openSync(path.join(raw, 'stderr.log'), 'a');
    const stdin = stdinFile ? fs.openSync(stdinFile, 'r') : 'ignore';
    const child = spawn(cmd, args, { cwd: ws, env: { ...env, ...extraEnv }, stdio: [stdin, stdout, stderr] });
    let killed = false;
    const timer = setTimeout(() => { killed = true; child.kill('SIGTERM'); }, BUDGET.sessionCapMin * 60 * 1000);
    child.on('exit', code => { clearTimeout(timer); resolve({ code, killed }); });
    child.on('error', err => { clearTimeout(timer); fs.appendFileSync(path.join(raw, 'stderr.log'), String(err) + '\n'); resolve({ code: -1, killed }); });
  });
}

/** Dry run only: prove the guard blocks a script that reads a target, logging to its own file. */
function guardProbe() {
  const probe = path.join(wb, 'probe.mjs'), log = path.join(raw, 'probe-violations.jsonl');
  fs.writeFileSync(probe, `import './kit.mjs';\nimport fs from 'node:fs';\ntry { fs.readFileSync(${JSON.stringify(path.join(view, `${crops[0]}.png`))}); console.log('read'); } catch (e) { console.log('blocked'); }\n`);
  const outp = execFileSync('node', [probe], { cwd: ws, env: { ...env, BENCH_VIOLATIONS: log } }).toString().trim();
  fs.rmSync(probe);
  const logged = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').length : 0;
  return { result: outp, logged };
}

const t0 = Date.now();
let exit, probe = null;
try {
  if (DRY) {
    probe = guardProbe();
    fs.copyFileSync(path.join(BENCH, 'scripts', 'dry-painter.mjs'), path.join(wb, 'paint.mjs'));
    console.error(`bench:run: dry run, painting ${crops.join(', ')} with the scripted painter`);
    exit = await launch('node', ['bench/paint.mjs', ...crops], { logName: 'stdout.log' });
  } else {
    const c = command(model, { ws, viewDir: view, raw, crops, text: prompt(crops), sessionCapMin: BUDGET.sessionCapMin });
    console.error(`bench:run: ${model.name}, ${round.id}, trial ${tryNo}, crops ${crops.join(', ')}; session cap ${BUDGET.sessionCapMin} min`);
    exit = await launch(c.cmd, c.args, { stdinFile: c.stdinFile, extraEnv: c.env });
  }
} finally {

  if (fs.existsSync(path.join(wb, 'out'))) fs.cpSync(path.join(wb, 'out'), path.join(raw, 'out'), { recursive: true });
  const skip = /^\.agents\/skills\/|^\.claude\/skills$|^bench\/(out|tasks)\/|^bench\/(BRIEF\.md|kit\.mjs|guard\.mjs)$|^node_modules$/;
  let untracked = [];
  try { untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ws }).toString().split('\n').filter(f => f && !skip.test(f)); } catch { /* worktree gone */ }
  for (const f of untracked) { fs.mkdirSync(path.dirname(path.join(raw, 'scripts', f)), { recursive: true }); fs.copyFileSync(path.join(ws, f), path.join(raw, 'scripts', f)); }
  cleanup();
}
const minutes = Math.round((Date.now() - t0) / 6000) / 10;

const jsonl = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);
const violations = jsonl(path.join(raw, 'violations.jsonl')).length;
const rejections = jsonl(path.join(raw, 'rejections.jsonl')).length;
const scriptText = [];
const walk = d => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(mjs|js|cjs|py|sh)$/.test(e.name)) scriptText.push(fs.readFileSync(p, 'utf8')); } };
walk(path.join(raw, 'scripts'));
const { hits, targetHits } = auditScripts(scriptText);

const cropsOut = {};
for (const c of crops) {
  const o = path.join(raw, 'out', c);
  if (!fs.existsSync(path.join(o, 'final.png'))) continue;
  const s = fs.existsSync(path.join(o, 'stats.json')) ? readJson(path.join(o, 'stats.json')) : {};
  await thumb(path.join(o, 'final.png'), path.join(tryDir, `${c}.webp`));
  const stages = await stageStrip(path.join(o, 'frames'), path.join(tryDir, `${c}-stages.webp`));
  const logged = fs.existsSync(path.join(o, 'strokes.jsonl.gz'));
  if (logged) fs.copyFileSync(path.join(o, 'strokes.jsonl.gz'), path.join(tryDir, `${c}-strokes.jsonl.gz`));
  cropsOut[c] = {
    seed: s.seed ?? null, sheet: s.sheet ?? null, strokeLog: logged ? `${c}-strokes.jsonl.gz` : null,
    strokes: s.strokes ?? null, minutes: s.seconds != null ? Math.round(s.seconds / 6) / 10 : null, smallShare: s.smallShare ?? null,
    shortStrokes: s.shortStrokes ?? null, dotStrokes: s.dotStrokes ?? null, copyHF: null, images: { final: `${c}.webp`, stages }, painterNote: null, score: null, progression: null,
  };
}
const use = DRY ? { tokens: null, costUSD: null } : usage(model.runner, path.join(raw, 'events.jsonl'));
const dq = violations > 0 || targetHits.length > 0;
const run = {
  schema: RUN_SCHEMA, benchmark: 'unpaint-bench', protocol: 'v2', round: round.id, ...VERSION_STAMP,
  painter: { key: model.key, name: model.name, id: model.id, effort: model.effort, runner: model.runner },
  planner: null,
  evaluators: { scoreJudges: [], progressionJudges: [] },
  try: tryNo,
  settings: { mode, strokeBudget: BUDGET.strokes, minutesPerCrop: BUDGET.minutesPerCrop, sessionCapMin: BUDGET.sessionCapMin, lookBudget: null, crops, learnsBetweenTries: round.learning },
  session: { minutes, tokens: use.tokens, costUSD: use.costUSD, exitCode: exit.code, killedAtCap: exit.killed },
  guard: { blockedImageReads: violations, kitRejections: rejections, auditHits: hits },
  crops: cropsOut,
  score: { status: DRY ? 'dry-run' : 'unscored', composite: null, complete: false },
  cheat: {
    disqualified: dq, readTargetPixels: dq,
    reason: dq ? (violations ? `${violations} blocked target read(s) at paint time` : `scripts refer to the target files: ${targetHits.join(', ')}`) : null,
    risk: null, progressionRisk: null, review: null,
  },
  complete: Object.keys(cropsOut).length === crops.length,
  raw: posix(path.relative(BENCH, raw)),
  ...(probe ? { dryRunGuardProbe: probe } : {}),
};
const errs = validateRun(run);
if (errs.length) fail(`run.json failed its own checks: ${errs.join('; ')}`);
writeJson(path.join(tryDir, 'run.json'), run);
console.log(`bench:run: wrote ${posix(path.relative(process.cwd(), tryDir))}/run.json: ${Object.keys(cropsOut).length} of ${crops.length} paintings, ${minutes} min, ${violations} blocked reads${probe ? `, guard probe ${probe.result} (${probe.logged} logged)` : ''}`);
