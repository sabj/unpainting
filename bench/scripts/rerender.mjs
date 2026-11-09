#!/usr/bin/env node
// Repaint stored V4/V5 benchmark plans on the current painter without a model session.
// Usage: node bench/scripts/rerender.mjs [--round v4-pipeline] [--models argon,astra,opus] [--tries 1,2,3] [--subjects hills,south-france,...] [--out work/rerender-031] [--gpu on] [--segments sam|off] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BENCH, REPO, V2, readJson, writeJson } from './lib.mjs';
import { resolvePlan, renderVerdict } from './pipeline/plan-args.mjs';
import { thumb, stageStrip } from './images.mjs';
import { verifyComparisonRun } from './preflight.mjs';

const list = v => v ? v.split(',').map(s => s.trim()).filter(Boolean) : null;

export function parseRerenderArgs(argv = process.argv.slice(2)) {
  const o = {
    round: 'v4-pipeline',
    models: ['argon', 'astra', 'opus'],
    tries: [1, 2, 3],
    subjects: null,
    out: path.join(REPO, 'work', 'rerender-031'),
    gpu: 'on',
    segments: null,
    allowDirty: false,
    dryRun: false,
    compileOnly: false,
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
    else if (a === '--dry-run' || a === '--plan') o.dryRun = true;
    else if (a === '--compile') o.compileOnly = true;
    else throw new Error(`unknown option: ${a}`);
  }
  if (!o.dryRun && !o.compileOnly && o.gpu !== 'on') {
    throw new Error(`rerender requires --gpu on for comparison parity (got --gpu ${o.gpu})`);
  }
  return o;
}

export function discoverStoredPlans({ round = 'v4-pipeline', models = ['argon', 'astra', 'opus'], tries = [1, 2, 3], subjects = null } = {}) {
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

export async function runRerender(argv = process.argv.slice(2)) {
  const opts = parseRerenderArgs(argv);
  const jobs = discoverStoredPlans(opts);
  if (opts.dryRun) {
    return { ok: true, count: jobs.length, jobs: jobs.map(j => ({ model: j.model, try: j.tryNum, subject: j.subject, variant: j.variant, width: j.spec.width })) };
  }
  fs.mkdirSync(opts.out, { recursive: true });
  const results = [];
  for (const job of jobs) {
    const jobOut = path.join(opts.out, job.round, job.model, String(job.tryNum), `${job.subject}-raw`);
    const tryOut = path.join(opts.out, job.round, job.model, String(job.tryNum));
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
    const child = spawnSync(process.execPath, runArgs, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const seconds = +((Date.now() - t0) / 1000).toFixed(1);
    const logText = (child.stdout || '') + (child.stderr ? `\n${child.stderr}` : '');
    fs.mkdirSync(jobOut, { recursive: true });
    fs.writeFileSync(path.join(jobOut, 'paint.log'), logText);
    const verdict = renderVerdict({ outDir: jobOut, logText, exit: child.status, plan });
    if (!opts.compileOnly && verdict.painted) {
      const pFile = fs.existsSync(path.join(jobOut, 'painting.png')) ? path.join(jobOut, 'painting.png') : path.join(jobOut, 'painting.jpg');
      if (fs.existsSync(pFile)) await thumb(pFile, path.join(tryOut, `${job.subject}.webp`));
      const framesDir = path.join(jobOut, 'frames');
      if (fs.existsSync(framesDir)) await stageStrip(framesDir, path.join(tryOut, `${job.subject}-stages.webp`));
      if (!opts.segments || opts.segments !== 'off') {
        const check = verifyComparisonRun(jobOut, { requireGpu: opts.gpu === 'on', minWidth: job.spec.width });
        if (!check.ok) verdict.problems.push(...check.errors);
      }
    }
    const rec = { model: job.model, try: job.tryNum, subject: job.subject, variant: job.variant, exit: child.status, painted: verdict.painted, ok: verdict.ok, seconds, problems: verdict.problems, notes: verdict.notes, outDir: jobOut };
    results.push(rec);
    console.log(`[rerender] ${job.model}/${job.tryNum}/${job.subject}: ${verdict.painted ? 'PAINTED' : 'FAILED'} in ${seconds}s (exit ${child.status})`);
  }
  const summaryPath = path.join(opts.out, 'rerender-summary.json');
  writeJson(summaryPath, { generatedAt: new Date().toISOString(), options: opts, total: results.length, painted: results.filter(r => r.painted).length, results });
  return { ok: results.every(r => r.painted || opts.compileOnly), results, summaryPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await runRerender();
  if (r.jobs) console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exitCode = 1;
}
