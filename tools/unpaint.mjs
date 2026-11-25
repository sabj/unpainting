#!/usr/bin/env node
// One CLI to spin up painting jobs, prepare Auto, manage cloud GPU pods, launch benchmarks, check status, and score.
// Wraps tools/paint/cli.mjs, tools/paint/run-benchmark.mjs, tools/cloud/render-pool-pods.py, and bench/scripts/score04.mjs.
// Benchmark runs and pod launches are dry-run / read-only unless explicitly asked to start.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadRunSets, picturesAt } from './paint/run-sets.mjs';
import { planRuns, needsAutoPainting } from './paint/run-benchmark.mjs';
import { BENCHMARK_LEVELS } from './paint/levels.mjs';
import { preparedRoot, preparedKey } from './paint/prepared.mjs';
import { registryPath } from './paint/subjects.mjs';
import { poolDir, claims, podsDaemon, daemonProcessAlive } from './paint/render-pool.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

export const USAGE = `unpaint — one CLI for painting jobs, Auto prep, cloud pods, benchmarks, and scoring

Usage:
  npm run unpaint -- <command> [options]

Commands:
  paint <subjects> <mode> [args...]   Run a painting, plan, look, or preflight (passes through to tools/paint/cli.mjs)
  prepare [set|subjects] [options]    Prepare Auto plans, traced shapes, and Auto paintings once per commit
                                      Options: --level L3 (default), --pool local|mini|mini,pod (default local),
                                               --jobs N (default 3 when local), --dry-run
  benchmark [options]                 Plan or launch a full benchmark run (dry-run by default; add --start to launch)
                                      Options: --out DIR (required), --set core|extended (default core),
                                               --models a,b (default roster), --levels L1,L2,L3,L4,
                                               --pictures a,b, --pool mini,pod (default mini,pod),
                                               --cap N (default 8), --with-pods (start pod renter after pre-checks), --resume, --start
  pods <status|dry-run|start|stop>    Inspect, dry-check, start, or stop the cloud GPU pod renter
                                      Options (start): --cap N (default 10), --hours H (default 8),
                                                       --limit-min M (default 240), --end-min M (default 0)
  score <run-dir> [options]           Refresh manifest.json, score finished paintings, and build the summary table
                                      Options: --manifest-only, --no-summary, plus any bench/scripts/score04.mjs flags
  status [run-dir]                    Show render pool state (Mac mini, cloud pods, waiting jobs) and run progress

Examples:
  npm run unpaint -- prepare core --pool local --jobs 3 --dry-run
  npm run unpaint -- benchmark --out work/bench-04 --set core --models neon-m,carbon-m,argon-m,opus-m,sonnet-m,wonderfull-m,sol-m,terra-m
  npm run unpaint -- pods status
  npm run unpaint -- status work/bench-04
  npm run unpaint -- score work/bench-04 --manifest-only
`;

const alive = pid => {
  if (!(pid > 0)) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** Expand a run-set name (core, extended) or comma-separated subject list into subject ids. */
export function resolveSubjects(spec = 'core') {
  const sets = loadRunSets();
  if (spec === 'core' || spec === 'extended') {
    const ids = sets.sets?.[spec]?.pictures?.map(p => (typeof p === 'string' ? p : p.id)) ?? [];
    if (!ids.length) throw new Error(`run set "${spec}" has no pictures in bench/run-sets.json`);
    return ids;
  }
  return spec.split(',').map(s => s.trim()).filter(Boolean);
}

/** Build the command and environment for `unpaint prepare`. Pure and testable. */
export function planPrepare(argv) {
  const opts = { target: 'core', level: 'L3', pool: 'local', jobs: '3', dryRun: false, extra: [] };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('--')) opts.target = rest.shift();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i], v = () => { const x = rest[++i]; if (x == null) throw new Error(`${a} needs a value`); return x; };
    if (a === '--level') opts.level = v();
    else if (a === '--pool') opts.pool = v();
    else if (a === '--jobs') opts.jobs = v();
    else if (a === '--dry-run') opts.dryRun = true;
    else opts.extra.push(a);
  }
  const subjects = resolveSubjects(opts.target);
  const args = [path.join(ROOT, 'tools', 'paint', 'cli.mjs'), subjects.join(','), 'prepare', '--level', opts.level];
  const env = {};
  if (opts.pool === 'local') {
    args.push('--jobs', String(opts.jobs));
  } else {
    env.UNPAINT_RENDER = 'pool';
    env.UNPAINT_POOL_ONLY = opts.pool;
  }
  if (opts.dryRun) args.push('--dry-run');
  args.push(...opts.extra);
  return { subjects, pool: opts.pool, level: opts.level, cmd: process.execPath, args, env };
}

/** Summarize the render pool folder (work/render-pool) without mutating anything. */
export function poolSummary(dir) {
  const pods = readJson(path.join(dir, 'pods.json'));
  const mini = readJson(path.join(dir, 'mini.json'));
  const activeClaims = claims(dir, alive);
  const waitDir = path.join(dir, 'waiting');
  const waiting = (fs.existsSync(waitDir) ? fs.readdirSync(waitDir) : [])
    .filter(n => n.endsWith('.json'))
    .map(n => readJson(path.join(waitDir, n)))
    .filter(w => w && alive(w.pid));
  const runningTxt = path.join(dir, 'RUNNING.txt');
  const runningPods = fs.existsSync(runningTxt)
    ? fs.readFileSync(runningTxt, 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
    : [];
  const processAlive = daemonProcessAlive(dir);
  const daemonState = podsDaemon({ updated: pods?.updated ?? null, nowS: Date.now() / 1000, processAlive });
  return {
    dir,
    mini: mini ? { host: mini.host ?? 'mini', slots: mini.slots ?? 2 } : null,
    daemonState,
    processAlive,
    podsLive: pods?.live ?? 0,
    podsAdding: pods?.adding ?? 0,
    podsTarget: pods?.target ?? 0,
    spentUSD: pods?.spentUSD ?? 0,
    runningPods,
    claims: Object.entries(activeClaims).map(([slot, c]) => ({ slot, kind: c.kind, worker: c.worker, pid: c.pid })),
    waitingCount: waiting.length,
  };
}

/** Summarize a benchmark run folder created by run-benchmark.mjs. */
export function runSummary(runDir) {
  const dir = path.resolve(runDir);
  const launch = readJson(path.join(dir, 'launch.json'));
  if (!launch) throw new Error(`no launch.json in ${dir}`);
  let finished = 0, failed = 0, pending = 0;
  for (const r of launch.runs ?? []) {
    const rec = readJson(path.join(dir, r.folder, 'run.json'));
    if (!rec) { pending++; continue; }
    if (rec.failure) failed++; else finished++;
  }
  return { dir, commit: launch.commit?.slice(0, 8) ?? 'unknown', total: launch.runs?.length ?? 0, finished, failed, pending };
}

function runSync(cmd, args, extraEnv = {}) {
  try {
    execFileSync(cmd, args, { cwd: ROOT, env: { ...process.env, ...extraEnv }, stdio: 'inherit' });
  } catch (e) {
    process.exit(e.status ?? 1);
  }
}

function formatPoolStatus(s) {
  const lines = [
    `Render pool: ${s.dir}`,
    `  Mac mini:   ${s.mini ? `${s.mini.host} (${s.mini.slots} slots)` : 'not configured'}`,
    `  Pod renter: ${s.daemonState}${s.processAlive ? ' (running)' : ' (stopped)'}; live pods: ${s.podsLive}, adding: ${s.podsAdding}, target: ${s.podsTarget}`,
    `  Active claims (${s.claims.length}): ${s.claims.length ? s.claims.map(c => `${c.slot} [${c.kind}]`).join(', ') : 'none'}`,
    `  Waiting jobs: ${s.waitingCount}`,
  ];
  if (s.runningPods.length) lines.push(`  RUNNING.txt: ${s.runningPods.join(', ')}`);
  return lines.join('\n');
}

function cmdPods(argv) {
  const sub = argv[0] ?? 'status';
  const rest = argv.slice(1);
  const dir = poolDir(process.env, ROOT);
  const script = path.join(ROOT, 'tools', 'cloud', 'render-pool-pods.py');
  if (sub === 'status') {
    console.log(formatPoolStatus(poolSummary(dir)));
    return;
  }
  if (sub === 'dry-run') {
    runSync('python3', [script, dir, '--dry-run', ...rest]);
    return;
  }
  if (sub === 'stop') {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'STOP-PODS'), `${new Date().toISOString()}\n`);
    console.log(`Wrote ${path.join(dir, 'STOP-PODS')}. The pod renter will delete any active pods and exit.`);
    return;
  }
  if (sub === 'start') {
    const s = poolSummary(dir);
    if (s.processAlive) {
      console.log(`Pod renter is already running (${path.join(dir, 'pods.pid')}).`);
      return;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.rmSync(path.join(dir, 'STOP-PODS'), { force: true });
    const out = fs.openSync(path.join(dir, 'pods.out'), 'a');
    const child = spawn('python3', [script, dir, ...rest], { cwd: ROOT, detached: true, stdio: ['ignore', out, out] });
    child.unref();
    fs.writeFileSync(path.join(dir, 'pods.pid'), `${child.pid}\n`);
    console.log(`Started pod renter (pid ${child.pid}). Log: ${path.join(dir, 'pods.log')}`);
    console.log(`Stop with: npm run unpaint -- pods stop`);
    return;
  }
  throw new Error(`pods: expected status, dry-run, start, or stop (got "${sub}")`);
}

/** Validate benchmark --start inputs, git cleanliness, output folder safety, and Auto prep BEFORE starting any pods. */
export function validateBenchmarkStart(argv, { root = ROOT, git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim() } = {}) {
  const o = { set: 'core', models: null, levels: [...BENCHMARK_LEVELS], pictures: null, pool: 'mini,pod', cap: '8', out: null, resume: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => { const x = argv[++i]; if (x == null) throw new Error(`${a} needs a value`); return x; };
    if (a === '--start' || a === '--with-pods') continue;
    else if (a === '--resume') o.resume = true;
    else if (a === '--out') o.out = path.resolve(v());
    else if (a === '--set') o.set = v();
    else if (a === '--pool') o.pool = v();
    else if (a === '--cap') o.cap = v();
    else if (a === '--models') o.models = v().split(',');
    else if (a === '--levels') o.levels = v().split(',');
    else if (a === '--pictures') o.pictures = v().split(',');
    else throw new Error(`unknown benchmark option: ${a}`);
  }
  if (!o.out) throw new Error('--out DIR: where the sessions and the manifest are written');
  const runSets = loadRunSets(), models = o.models ?? runSets.roster;
  const runs = planRuns({ models, levels: o.levels, pictures: level => picturesAt(o.set, level, runSets).map(p => p.id).filter(id => !o.pictures || o.pictures.includes(id)) });
  if (git('status', '--porcelain')) throw new Error('the checkout has uncommitted changes: the pool paints committed code only');
  const commit = git('rev-parse', 'HEAD');
  const existingLaunch = readJson(path.join(o.out, 'launch.json'));
  if (existingLaunch) {
    if (!o.resume) throw new Error(`${o.out} already has a launch.json: use a fresh --out folder (or pass --resume to continue the same commit)`);
    if (existingLaunch.commit && existingLaunch.commit !== commit) {
      throw new Error(`--resume refused: ${o.out}/launch.json is for commit ${existingLaunch.commit.slice(0, 8)}, not HEAD ${commit.slice(0, 8)}`);
    }
  }
  const prepRoot = preparedRoot(path.dirname(registryPath()));
  const missing = needsAutoPainting(runs).filter(subject => !fs.existsSync(path.join(prepRoot, preparedKey({ id: subject, commit }), 'painting', 'run.json')));
  if (missing.length) throw new Error(`Auto's painting is not prepared at commit ${commit.slice(0, 8)} for ${missing.join(', ')}: run prepare first; nothing started`);
  return { ...o, commit, runs };
}

function cmdBenchmark(argv) {
  const withPods = argv.includes('--with-pods');
  const start = argv.includes('--start');
  const pass = argv.filter(a => a !== '--with-pods' && a !== '--resume');
  if (start) {
    // Validate args, clean checkout, output folder safety, and Auto prep BEFORE touching pods
    const checked = validateBenchmarkStart(argv);
    const wantsPod = checked.pool.split(',').includes('pod');
    if (wantsPod) {
      const dir = poolDir(process.env, ROOT);
      const s = poolSummary(dir);
      if (!s.processAlive) {
        if (withPods) {
          cmdPods(['start', ...(checked.cap ? ['--cap', checked.cap] : [])]);
        } else {
          throw new Error('benchmark --start with --pool including pod needs the pod renter running. Pass --with-pods to start it, or use --pool mini.');
        }
      }
    }
  }
  runSync(process.execPath, [path.join(ROOT, 'tools', 'paint', 'run-benchmark.mjs'), ...pass]);
}

function cmdScore(argv) {
  const runDir = argv[0];
  if (!runDir || runDir.startsWith('--')) throw new Error('score: give the benchmark run folder (e.g. npm run unpaint -- score work/bench-04)');
  const rest = argv.slice(1);
  const manifestOnly = rest.includes('--manifest-only');
  const noSummary = rest.includes('--no-summary');
  const pass = rest.filter(a => a !== '--manifest-only' && a !== '--no-summary');
  const resolved = path.resolve(runDir);
  runSync(process.execPath, [path.join(ROOT, 'tools', 'paint', 'run-benchmark.mjs'), 'manifest', resolved]);
  if (manifestOnly) return;
  runSync(process.execPath, [path.join(ROOT, 'bench', 'scripts', 'score04.mjs'), path.join(resolved, 'manifest.json'), ...pass]);
  if (!noSummary) {
    const scoresFile = path.join(resolved, 'scores.json');
    if (fs.existsSync(scoresFile)) runSync(process.execPath, [path.join(ROOT, 'bench', 'scripts', 'summary04.mjs'), scoresFile]);
  }
}

export function main(argv) {
  const cmd = argv[0];
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    console.log(USAGE);
    return;
  }
  const rest = argv.slice(1);
  if (cmd === 'paint') {
    runSync(process.execPath, [path.join(ROOT, 'tools', 'paint', 'cli.mjs'), ...rest]);
    return;
  }
  if (cmd === 'prepare') {
    const plan = planPrepare(rest);
    runSync(plan.cmd, plan.args, plan.env);
    return;
  }
  if (cmd === 'benchmark') {
    cmdBenchmark(rest);
    return;
  }
  if (cmd === 'pods') {
    cmdPods(rest);
    return;
  }
  if (cmd === 'score') {
    cmdScore(rest);
    return;
  }
  if (cmd === 'status') {
    const dir = poolDir(process.env, ROOT);
    console.log(formatPoolStatus(poolSummary(dir)));
    if (rest[0]) {
      const r = runSummary(rest[0]);
      console.log(`\nBenchmark run: ${r.dir} (${r.commit})`);
      console.log(`  Sessions: ${r.total} total — ${r.finished} finished, ${r.failed} failed, ${r.pending} running/pending`);
    }
    return;
  }
  throw new Error(`unknown command "${cmd}". Run with --help to see available commands.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(`unpaint: ${e.message}`); process.exit(1); }
}
