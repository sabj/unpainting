#!/usr/bin/env node
// Repaint stored V4/V5 benchmark plans on the current painter without a model session.
// Usage: node bench/scripts/rerender.mjs [--round v4-pipeline] [--models argon,argonmed,astra,opus] [--tries 1,2,3] [--subjects hills,south-france,...] [--out work/rerender-031] [--gpu on] [--segments sam|off] [--dry-run] [--force]
// Resumable: a job with a finished record (<try>/<subject>-job.json) at the same commit, with its files still on disk, is skipped. --force repaints it.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BENCH, REPO, V2, readJson, writeJson } from './lib.mjs';
import { resolvePlan, renderVerdict } from './pipeline/plan-args.mjs';
import { STAGES, thumb, stageStrip } from './images.mjs';
import { verifyComparisonRun } from './preflight.mjs';
import { runDoctor } from '../../src/paint/doctor.mjs';
import { codeState } from '../../src/paint/code-state.mjs';
import { versionStamp } from '../../src/painter-version.mjs';

const list = v => v ? v.split(',').map(s => s.trim()).filter(Boolean) : null;
// Published targets start at 300 px, so a fixed floor admits them all and still refuses thumbnails.
const MIN_SOURCE_WIDTH = 300;
export const rerenderGate = spec => ({ minWidth: spec.width, minSourceWidth: MIN_SOURCE_WIDTH });

export function parseRerenderArgs(argv = process.argv.slice(2)) {
  const o = {
    round: 'v4-pipeline',
    models: ['argon', 'argonmed', 'astra', 'opus'],
    tries: [1, 2, 3],
    subjects: null,
    out: path.join(REPO, 'work', 'rerender-031'),
    gpu: 'on',
    segments: null,
    allowDirty: false,
    keepMarks: false,
    strictPlan: false,
    dryRun: false,
    compileOnly: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { if (i + 1 >= argv.length) throw new Error(`${a} requires a value`); return argv[++i]; };
    if (a === '--round') o.round = next();
    else if (a === '--models') o.models = list(next());
    else if (a === '--tries') o.tries = list(next()).map(Number);
    else if (a === '--subjects') o.subjects = list(next());
    else if (a === '--out') o.out = path.resolve(next());
    else if (a === '--gpu') o.gpu = next();
    else if (a === '--segments') o.segments = next();
    else if (a === '--allowdirty') o.allowDirty = next() !== '0';
    else if (a === '--keep-marks') o.keepMarks = true;
    else if (a === '--strict-plan') o.strictPlan = true;
    else if (a === '--dry-run' || a === '--plan') o.dryRun = true;
    else if (a === '--compile') o.compileOnly = true;
    else if (a === '--force') o.force = true;
    else throw new Error(`unknown option: ${a}`);
  }
  if (!o.dryRun && !o.compileOnly && o.gpu !== 'on') {
    throw new Error(`rerender requires --gpu on for comparison parity (got --gpu ${o.gpu})`);
  }
  return o;
}

export function discoverStoredPlans({ round = 'v4-pipeline', models = ['argon', 'argonmed', 'astra', 'opus'], tries = [1, 2, 3], subjects = null } = {}) {
  const subjectsDoc = readJson(path.join(BENCH, 'v4v5', 'subjects.json')).subjects;
  const roundDir = path.join(BENCH, 'runs', round);
  const jobs = [];
  for (const model of models) {
    for (const t of tries) {
      const tryDir = path.join(roundDir, model, String(t));
      if (!fs.existsSync(tryDir)) continue;
      for (const [id, spec] of Object.entries(subjectsDoc)) {
        if (subjects && !subjects.includes(id)) continue;
        const planDir = path.join(tryDir, `${id}-plan`);
        if (!fs.existsSync(path.join(planDir, 'config.json'))) continue;
        const variantFile = path.join(planDir, 'variant.txt');
        const variant = fs.existsSync(variantFile) ? fs.readFileSync(variantFile, 'utf8').trim() : 'region_w13';
        const target = path.join(V2, 'targets', `${id}.png`);
        jobs.push({ round, model, tryNum: t, subject: id, spec, planDir, variant, target, priorWebp: path.join(tryDir, `${id}.webp`), priorStagesWebp: path.join(tryDir, `${id}-stages.webp`) });
      }
    }
  }
  return jobs;
}

/** What made a rerender: the stamped release, painter and sim versions and the commit, plus a hash of the diff when the tree is dirty. */
export function renderStamp(root = REPO) {
  const v = versionStamp(root);
  const state=codeState(root);
  const extra=spawnSync('git',['ls-files','--others','--exclude-standard','-z','--','bench/scripts'],{cwd:root,encoding:'utf8'}).stdout.split('\0').filter(f=>/\.(mjs|js|json|py|wgsl)$/.test(f)).sort().map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}));
  const dirty=state.dirty||extra.length>0;
  const dirtyHash=dirty?crypto.createHash('sha256').update(JSON.stringify({diff:state.diffSha256,untracked:[...state.untracked,...extra]})).digest('hex').slice(0,12):null;
  return {release:v.release,painterVersion:v.painterVersion,simVersion:v.simVersion,commit:state.commit+(dirty?'-dirty':''),dirtyHash};
}
const sameStamp = (a, b) => ['release', 'painterVersion', 'simVersion', 'commit', 'dirtyHash'].every(k => (a?.[k] ?? null) === (b?.[k] ?? null));

export function jobPaths(opts, job) {
  const tryOut = path.join(opts.out, job.round, job.model, String(job.tryNum));
  return { tryOut, jobOut: path.join(tryOut, `${job.subject}-raw`), recordFile: path.join(tryOut, `${job.subject}-job.json`) };
}

/** Resolved command and all source/plan inputs, before painting. */
export function jobFingerprint(opts,job){
 const {jobOut}=jobPaths(opts,job),spec=opts.segments?{...job.spec,segments:opts.segments}:job.spec;
 const plan=resolvePlan({spec,planDir:job.planDir,variant:job.variant,target:job.target,out:jobOut,compile:opts.compileOnly,gpu:opts.gpu});
 const hash=crypto.createHash('sha256').update(JSON.stringify({args:plan.args,strictPlan:opts.strictPlan}));
 const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.isFile())hash.update(path.relative(job.planDir,file)).update(fs.readFileSync(file));}};
 hash.update(fs.readFileSync(job.target));walk(job.planDir);return hash.digest('hex');
}

/** The finished record for a job, when it is valid at this stamp and its files are still on disk; otherwise null. */
export function finishedRecord(opts, job, stamp, {verify=verifyComparisonRun}={}) {
  const { jobOut, recordFile } = jobPaths(opts, job);
  if (!fs.existsSync(recordFile)) return null;
  let rec;
  try { rec = readJson(recordFile); } catch { return null; }
  if (!rec?.ok || !sameStamp(rec.stamp, stamp) || Boolean(rec.compileOnly) !== opts.compileOnly) return null;
  if(rec.inputFingerprint!==jobFingerprint(opts,job))return null;
  const need = opts.compileOnly ? ['value-plan.json'] : ['painting.png', ...STAGES.map(p => path.join('frames', `stage-${p}.png`))];
  if(!need.every(f=>fs.existsSync(path.join(jobOut,f))))return null;
  if(!opts.compileOnly)try{verify(jobOut,{requireGpu:true,requireSegments:opts.segments!=='off',requireStages:true,requireDistinctStages:true,...rerenderGate(job.spec)});}catch{return null;}
  return rec;
}

function writeRecord(file, rec) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 1) + '\n');
  fs.renameSync(tmp, file);
}

async function renderJob(opts, job, { run, verify }) {
  const { tryOut, jobOut, recordFile } = jobPaths(opts, job);
  // Drop the old record first so a kill mid-render cannot leave an ok record over wiped files.
  fs.rmSync(recordFile, { force: true });
  fs.rmSync(jobOut, { recursive: true, force: true });
  fs.mkdirSync(tryOut, { recursive: true });
  const spec = opts.segments ? { ...job.spec, segments: opts.segments } : job.spec;
  const plan = resolvePlan({
    spec,
    planDir: job.planDir,
    variant: job.variant,
    target: job.target,
    out: jobOut,
    compile: opts.compileOnly,
    gpu: opts.gpu,
  });
  const runArgs = [...plan.args];
  if (opts.allowDirty) runArgs.push('--allowdirty', '1');
  const t0 = Date.now();
  const child = run(process.execPath, runArgs, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const seconds = +((Date.now() - t0) / 1000).toFixed(1);
  const logText = (child.stdout || '') + (child.stderr ? `\n${child.stderr}` : '');
  fs.mkdirSync(jobOut, { recursive: true });
  fs.writeFileSync(path.join(jobOut, 'paint.log'), logText);

  const uf = path.join(jobOut, 'unused-options.txt');
  const unused = fs.existsSync(uf) ? fs.readFileSync(uf, 'utf8').split('\n').filter(Boolean) : [];
  const dm = [...logText.matchAll(/(\d+) passages yielded no brush path and were never painted, carrying ([\d.]+)% of the planned mass/g)].at(-1);
  const finished = opts.compileOnly ? (child.status === 0 && fs.existsSync(path.join(jobOut, 'value-plan.json'))) : fs.existsSync(path.join(jobOut, 'painting.png'));
  const verdict = renderVerdict({
    paintExit: child.status,
    unused,
    modelOptions: plan.modelOptions,
    extraOptions: plan.extraOptions,
    baseOptions: plan.baseOptions,
    templateOptions: plan.templateOptions,
    dropped: dm ? Number(dm[1]) : 0,
    droppedPct: dm ? Number(dm[2]) : 0,
    finished,
  });
  const painted = verdict.exit === 0 && finished;
  const problems = [...verdict.failures.map(f => f.reason)];
  if (opts.strictPlan && plan.problems?.length) problems.push(...plan.problems);
  let stagesFile = null;
  if (!opts.compileOnly && painted) {
    const pFile = path.join(jobOut, 'painting.png');
    if (fs.existsSync(pFile)) await thumb(pFile, path.join(tryOut, `${job.subject}.webp`));
    const framesDir = path.join(jobOut, 'frames');
    fs.mkdirSync(framesDir, { recursive: true });
    for (const pct of STAGES) {
      const jpg = path.join(jobOut, 'stages', `stage-${String(pct).padStart(3, '0')}.jpg`);
      if (fs.existsSync(jpg)) await sharp(jpg).png().toFile(path.join(framesDir, `stage-${pct}.png`));
    }
    stagesFile = await stageStrip(framesDir, path.join(tryOut, `${job.subject}-stages.webp`));
    if (!stagesFile) problems.push('missing or incomplete progressive stage strip');
    try {
      verify(jobOut, {
        requireGpu: opts.gpu === 'on',
        requireSegments: opts.segments !== 'off',
        requireStages: true,
        requireDistinctStages: true,
        ...rerenderGate(job.spec),
      });
    } catch (err) {
      problems.push(err.message);
    }
    if (!opts.keepMarks) {
      for (const big of ['marks.json', 'value-plan.json', 'value-commands.jsonl']) {
        fs.rmSync(path.join(jobOut, big), { force: true });
      }
    }
  }
  const ok = (opts.compileOnly ? child.status === 0 : painted) && problems.length === 0;
  return {
    round: job.round, model: job.model, try: job.tryNum, subject: job.subject, variant: job.variant,
    exit: child.status, painted, ok, seconds, problems, planWarnings: plan.problems || [], notes: verdict.notes, stages: stagesFile, outDir: jobOut,
  };
}

export async function runRerender(argv = process.argv.slice(2), { run = spawnSync, verify = verifyComparisonRun, doctor = runDoctor, stamp = renderStamp } = {}) {
  const opts = parseRerenderArgs(argv);
  const jobs = discoverStoredPlans(opts);
  const at = stamp();
  if (opts.dryRun) {
    return { ok: true, count: jobs.length, done: jobs.filter(j => finishedRecord(opts, j, at, {verify})).length, jobs: jobs.map(j => ({ model: j.model, try: j.tryNum, subject: j.subject, variant: j.variant, width: j.spec.width, done: Boolean(finishedRecord(opts, j, at, {verify})) })) };
  }
  if (!opts.compileOnly) {
    const doc = doctor({ root: REPO, strictModels: true });
    const failures = opts.allowDirty ? doc.failures.filter(f => !f.startsWith('working tree is dirty')) : doc.failures;
    if (failures.length) throw new Error(`doctor --strict failed before rerender: ${failures.join('; ')}`);
  }
  fs.mkdirSync(opts.out, { recursive: true });
  const summaryPath = path.join(opts.out, 'rerender-summary.json');
  const keyOf = r => `${r.round || opts.round}:${r.model}:${r.try}:${r.subject}`;
  const merged = new Map();
  if (fs.existsSync(summaryPath)) {
    try {
      const prev = readJson(summaryPath);
      if (Array.isArray(prev?.results)) for (const r of prev.results) merged.set(keyOf(r), r);
    } catch { /* replace unreadable summary */ }
  }
  const saveSummary = () => {
    const all = [...merged.values()];
    writeJson(summaryPath, { generatedAt: new Date().toISOString(), options: opts, total: all.length, painted: all.filter(r => r.painted).length, okCount: all.filter(r => r.ok).length, results: all });
  };
  const results = [];
  for (const job of jobs) {
    const { tryOut, recordFile } = jobPaths(opts, job);
    const prior = opts.force ? null : finishedRecord(opts, job, at, {verify});
    let rec;
    if (prior) {
      const { stamp: _s, compileOnly: _c, ...rest } = prior;
      rec = { ...rest, skipped: true };
      console.log(`[rerender] ${job.model}/${job.tryNum}/${job.subject}: SKIPPED, finished at ${at.commit}`);
    } else {
      try {
        rec = await renderJob(opts, job, { run, verify });
      } catch (err) {
        rec = { round: job.round, model: job.model, try: job.tryNum, subject: job.subject, variant: job.variant, exit: null, painted: false, ok: false, seconds: 0, problems: [`job crashed: ${err.message}`], planWarnings: [], notes: [], stages: null, outDir: jobPaths(opts, job).jobOut };
      }
      fs.mkdirSync(tryOut, { recursive: true });
      writeRecord(recordFile, { ...rec, stamp: at, compileOnly: opts.compileOnly,inputFingerprint:jobFingerprint(opts,job) });
      console.log(`[rerender] ${job.model}/${job.tryNum}/${job.subject}: ${rec.ok ? 'PAINTED' : 'FAILED'} in ${rec.seconds}s (exit ${rec.exit})`);
    }
    results.push(rec);
    merged.set(keyOf(rec), rec);
    saveSummary();
  }
  saveSummary();
  return { ok: results.every(r => r.ok), results, summaryPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await runRerender();
  if (r.jobs) console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exitCode = 1;
}
