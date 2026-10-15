#!/usr/bin/env node
// A bounded V4 suite. --plan is offline; --dry-run substitutes a scripted planner and makes no judge calls.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BENCH, REPO, VERSION_STAMP, loadModels, loadCrops, readJson, writeJson } from './lib.mjs';
import { loadSubjects } from './pipeline/round45.mjs';
import { benchmarkProfile, selectModels } from './profiles.mjs';
import { workEstimate, compareMeasured } from './budget.mjs';

export function suitePlan({ profileName = 'lite', selection = 'core' } = {}) {
  const profile = benchmarkProfile(profileName), models = selectModels(loadModels(), selection);
  const crops = loadCrops().filter(c => c.distributed), subjects = loadSubjects();
  for (const c of crops) if (!subjects[c.task]) throw new Error(`no pipeline specification for ${c.task}`);
  return { schema: 'unpaint-bench/suite@1', profile, models, targets: crops.map(c => c.task),
    estimate: workEstimate(crops.map(c => ({ ...subjects[c.task], aspect: c.height / c.width })), models.length) };
}

export async function main(argv = process.argv.slice(2)) {
  const valued = ['--profile', '--models', '--out', '--gpu', '--python', '--baseline'];
  const switches = ['--plan', '--dry-run', '--force'];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (valued.includes(k)) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`${k} needs a value`);
      options[k] = argv[++i];
    } else if (switches.includes(k)) options[k] = true;
    else throw new Error(`unknown suite option ${k}`);
  }
  const plan = suitePlan({ profileName: options['--profile'] ?? 'lite', selection: options['--models'] ?? 'core' });
  if (options['--plan']) { console.log(JSON.stringify(plan, null, 2)); return; }
  const dry = Boolean(options['--dry-run']), gpu = options['--gpu'] ?? 'off';
  if (!['off', 'on'].includes(gpu)) throw new Error('--gpu must explicitly be off or on; no automatic timing fallback');
  // Doctor is read-only and precedes every paid job. Scripted tests still exercise the harness without credentials.
  if (!dry) {
    const preflight = spawnSync(process.execPath, ['tools/doctor.mjs'], { cwd: REPO, stdio: 'inherit' });
    if (preflight.status !== 0) throw new Error('doctor failed; no model jobs started');
  }
  const out = path.resolve(options['--out'] ?? path.join(BENCH, 'work', 'suites', plan.profile.id));
  const summaryFile = path.join(out, 'suite.json');
  if (fs.existsSync(summaryFile) && !options['--force']) throw new Error(`${summaryFile} exists; choose another --out or explicitly --force`);
  const start = Date.now(), jobs = [];
  const subjects = loadSubjects();
  const targetFingerprints = Object.fromEntries(plan.targets.map(c => [c, { sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(BENCH, 'v2', 'targets', `${c}.png`))).digest('hex'),
    sheetmm: subjects[c].sheetmm, style: subjects[c].taskStyle }]));
  const summary = { ...plan, ...VERSION_STAMP, targetFingerprints, machine: os.hostname(), backendRequested: gpu === 'off' ? 'cpu' : 'gpu',
    complete: false, jobs, measurement: null };
  writeJson(summaryFile, summary);
  for (const model of plan.models) {
    const modelRoot = path.join(out, 'runs');
    const jobStart = Date.now();
    const args = [path.join(BENCH, 'scripts', 'run.mjs'), '--round', 'V4', '--model', model.key, '--profile', options['--profile'] ?? 'lite',
      '--tries', String(plan.profile.tries), '--crops', plan.targets.join(','), '--gpu', gpu, '--out', modelRoot,
      ...(dry ? ['--dry-run', '--dry-key', model.key] : []), ...(options['--force'] ? ['--force'] : [])];
    const job = { model: model.key, plannedPaintings: plan.targets.length * plan.profile.tries, status: 'running', runExit: null, scoreExits: [], elapsedSeconds: null };
    jobs.push(job); writeJson(summaryFile, summary);
    const run = spawnSync(process.execPath, args, { cwd: REPO, stdio: 'inherit' });
    job.runExit = run.status;
    job.status = run.status === 0 ? 'ran' : 'failed';
    let recordedTries = 0;
    for (let n = 1; n <= plan.profile.tries; n++) {
      const tryDir = path.join(modelRoot, 'v4-pipeline', model.key, String(n));
      if (!fs.existsSync(path.join(tryDir, 'run.json'))) continue;
      recordedTries++;
      if (!dry) {
        const score = spawnSync(process.execPath, [path.join(BENCH, 'scripts', 'score.mjs'), tryDir,
          ...(options['--python'] ? ['--python', options['--python']] : [])], { cwd: REPO, stdio: 'inherit' });
        job.scoreExits.push(score.status);
      }
    }
    job.elapsedSeconds = (Date.now() - jobStart) / 1000;
    job.status = job.runExit === 0 && recordedTries === plan.profile.tries && job.scoreExits.every(s => s === 0) ? (dry ? 'dry-run' : 'scored') : 'failed';
    writeJson(summaryFile, summary);
    // Missing credentials, a crash or timeout is recorded; do not retry or silently substitute another model.
  }
  const records = [];
  for (const model of plan.models) for (let n = 1; n <= plan.profile.tries; n++) {
    const f = path.join(out, 'runs', 'v4-pipeline', model.key, String(n), 'run.json');
    if (fs.existsSync(f)) records.push(readJson(f));
  }
  const nExpected = plan.models.length * plan.profile.tries;
  summary.complete = records.length === nExpected && records.every(r => r.complete && (dry || r.score?.complete)) && jobs.every(j => j.status !== 'failed');
  const sumIfKnown = get => records.length === nExpected && records.every(r => Number.isFinite(get(r))) ? records.reduce((s, r) => s + get(r), 0) : null;
  const backends = new Set(records.flatMap(r => Object.values(r.crops).map(c => c.pipeline.renderBackend).filter(Boolean)));
  const uniform = get => { const vs = [...new Set(records.map(get))]; return records.length === nExpected && vs.length === 1 ? vs[0] : null; };
  summary.measurement = { models: plan.models.map(m => ({ key: m.key, id: m.id, effort: m.effort })), targets: plan.targets,
    targetFingerprints, benchmarkProfile: plan.profile.id, tries: plan.profile.tries, round: 'V4', sourceCommit: VERSION_STAMP.commit,
    judgeVersion: uniform(r => r.judgeVersion), judgeProfile: uniform(r => r.judgeProfile), judgeRoute: uniform(r => r.judgeRoute),
    scoreProtocol: 'native-v1', progressionProtocol: 'progression-v1-complete',
    progressionJudges: (process.env.BENCH_PROG_JUDGES ?? 'zai-org/GLM-5.3-Flash,Qwen/Qwen3.5-9B').split(',').map(s => s.trim()), rubric: 'bench-v3-median5', strictVerdict: false,
    painterVersion: VERSION_STAMP.painterVersion, simVersion: VERSION_STAMP.simVersion, machine: summary.machine,
    backend: backends.size === 1 ? [...backends][0] : null, complete: summary.complete && !dry,
    wallSeconds: (Date.now() - start) / 1000, renderSeconds: sumIfKnown(r => r.session.renderSeconds),
    modelTokens: sumIfKnown(r => r.session.tokens), costUSD: null,
    costNote: 'Total billed model + final/progression judge cost is not fully reported; do not treat missing cost as zero.' };
  if (options['--baseline']) summary.comparison = compareMeasured(summary.measurement, readJson(options['--baseline']).measurement);
  summary.dryRun = dry;
  writeJson(summaryFile, summary);
  console.log(`bench:suite: ${jobs.length} model jobs; complete=${summary.complete}; ${summaryFile}`);
  if (!summary.complete) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(`bench:suite: ${e.stack || e}`); process.exitCode = 1; });
