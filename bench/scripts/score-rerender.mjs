#!/usr/bin/env node
// Turn rerender output into try folders that score.mjs reads unchanged (J1, Together by default).
//   node bench/scripts/score-rerender.mjs --from work/rerender-031 [--out <dir>] [--round v4-pipeline] [--models opus] [--tries 1,2,3]
//        [--route together|openrouter] [--force] [--score-dry-run]
// Per (model, try) it writes <out>/<round dir>/<model>/<try>/run.json with <subject>.webp and <subject>-stages.webp,
// and a raw folder <out>/raw/<round dir>/<model>/<try>/ shaped as score.mjs expects:
//   out/<subject>/final.png and out/<subject>/frames/stage-N.png   (hard links to the full-size rerender files)
//   <subject>/painting/out/cheat-risk.json                          (the painter's own record, when it has a risk number)
// It makes no network calls. Score a folder with: npm run bench:score -- <try folder>  (needs TOGETHER_API_KEY).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BENCH, V2, RUN_SCHEMA, readJson, writeJson, roundById, loadModels, validateRun, posix } from './lib.mjs';
import { STAGES } from './images.mjs';
import { pngSize } from './pipeline/plan-args.mjs';

const subjects = () => readJson(path.join(BENCH, 'v4v5', 'subjects.json')).subjects;
const listDirs = d => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) : []);
const stampKey = s => [s.release, s.painterVersion, s.simVersion, s.commit, s.dirtyHash ?? ''].join('|');

/** Hard-link src to dst, or copy when they are on different devices. */
function link(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.rmSync(dst, { force: true });
  try { fs.linkSync(src, dst); } catch { fs.copyFileSync(src, dst); }
}

function strokesOf(jobOut) {
  const log = path.join(jobOut, 'paint.log');
  const m = fs.existsSync(log) ? [...fs.readFileSync(log, 'utf8').matchAll(/^marks: (\d+) strokes/gm)].at(-1) : null;
  if (m) return Number(m[1]);
  const stats = path.join(jobOut, 'stroke-stats.json');
  const n = fs.existsSync(stats) ? readJson(stats)?.counts?.paint : null;
  return Number.isInteger(n) ? n : null;
}

const optionalJson = f => { try { return fs.existsSync(f) ? readJson(f) : null; } catch { return null; } };

function cropEntry({ rec, jobOut, spec, warnings, rawTry, roundDir }) {
  const c = rec.subject, [tw, th] = pngSize(path.join(V2, 'targets', `${c}.png`));
  const rawOut = path.join(rawTry, 'out', c);
  link(path.join(jobOut, 'painting.png'), path.join(rawOut, 'final.png'));
  for (const p of STAGES) link(path.join(jobOut, 'frames', `stage-${p}.png`), path.join(rawOut, 'frames', `stage-${p}.png`));
  const risk = optionalJson(path.join(jobOut, 'cheat-risk.json'));
  if (Number.isFinite(risk?.risk)) link(path.join(jobOut, 'cheat-risk.json'), path.join(rawTry, c, 'painting', 'out', 'cheat-risk.json'));
  else warnings.push(`${c}: no cheat-risk score from the painter, so its cheat risk is not scored`);
  const guard = optionalJson(path.join(jobOut, 'target-guard.json'));
  const backend = optionalJson(path.join(jobOut, 'backend.json'));
  return {
    violations: guard?.violations ?? 0,
    entry: {
      seed: 0, sheet: { W: spec.width, H: Math.round(spec.width * th / tw), mmPerCell: +(spec.sheetmm / spec.width).toFixed(4) }, strokeLog: null,
      strokes: strokesOf(jobOut), strokesBasis: 'brush strokes plus pen lines', minutes: +(rec.seconds / 60).toFixed(2),
      smallShare: null, shortStrokes: null, dotStrokes: null, copyHF: null, images: { final: `${c}.webp`, stages: `${c}-stages.webp` }, painterNote: null, score: null, progression: null,
      pipeline: {
        outcome: 'painted', rerender: true, plan: `bench/runs/${roundDir}/${rec.model}/${rec.try}/${c}-plan`, renderSeconds: rec.seconds,
        renderBackend: backend?.backend ?? backend?.renderBackend ?? null, paintExit: rec.exit, notes: rec.notes ?? [], warnings: rec.planWarnings?.length ? rec.planWarnings : undefined,
      },
    },
  };
}

function buildTry({ from, out, roundDir, model, tryNum, route, force }) {
  const round = roundById(roundDir), spec = subjects();
  const tryFrom = path.join(from, roundDir, model, String(tryNum));
  const recs = fs.readdirSync(tryFrom).filter(f => f.endsWith('-job.json')).map(f => readJson(path.join(tryFrom, f))).sort((a, b) => a.subject.localeCompare(b.subject));
  const done = recs.filter(r => r.ok);
  if (new Set(done.map(r => stampKey(r.stamp))).size > 1) throw new Error(`${model} try ${tryNum} (${roundDir}): finished jobs ran at different commits (${[...new Set(done.map(r => r.stamp.commit))].join(', ')}); rerender them at one commit`);
  const stamp = done[0]?.stamp ?? recs[0].stamp;
  const tryOut = path.join(out, roundDir, model, String(tryNum));
  const rawTry = path.join(out, 'raw', roundDir, model, String(tryNum));
  const runFile = path.join(tryOut, 'run.json');
  if (fs.existsSync(runFile) && !force) {
    const prev = readJson(runFile);
    if (Object.values(prev.crops ?? {}).some(c => c.score)) throw new Error(`${posix(tryOut)} already has scores; pass --force to rebuild it and lose them`);
  }
  fs.rmSync(rawTry, { recursive: true, force: true });
  fs.mkdirSync(tryOut, { recursive: true });
  for (const f of fs.readdirSync(tryOut)) if (/\.webp$/.test(f)) fs.rmSync(path.join(tryOut, f));
  for (const f of fs.readdirSync(tryFrom)) if (/\.webp$/.test(f)) link(path.join(tryFrom, f), path.join(tryOut, f));
  const warnings = [], crops = {}, unpainted = {};
  let violations = 0, seconds = 0;
  for (const rec of recs) {
    seconds += rec.seconds || 0;
    if (!rec.ok) {
      unpainted[rec.subject] = { pipeline: { outcome: 'render-failed', rerender: true, failure: { failures: (rec.problems?.length ? rec.problems : ['render did not finish']).map(reason => ({ reason })) } } };
      continue;
    }
    const jobOut = path.join(tryFrom, `${rec.subject}-raw`);
    const r = cropEntry({ rec, jobOut, spec: spec[rec.subject], warnings, rawTry, roundDir });
    crops[rec.subject] = r.entry; violations += r.violations;
  }
  const model_ = loadModels().find(m => m.key === model) ?? { key: model, name: model, id: model, effort: null, runner: null };
  const names = recs.map(r => r.subject);
  const run = {
    schema: RUN_SCHEMA, benchmark: 'unpaint-bench', protocol: 'v2', round: round.id,
    release: stamp.release, painterVersion: stamp.painterVersion, simVersion: stamp.simVersion, commit: stamp.commit, judgeVersion: 'J1',
    painter: { key: model_.key, name: model_.name, id: model_.id, effort: model_.effort ?? null, runner: model_.runner ?? null },
    planner: null, evaluators: { scoreJudges: [], progressionJudges: [] }, try: tryNum,
    settings: { mode: 'gentle', strokeBudget: null, minutesPerCrop: null, sessionCapMin: null, modelMinutesCap: null, lookBudget: null, selfView: 'gentle', targetGuard: 'gentle',
      crops: names, learnsBetweenTries: round.learning, judgeRoute: route, scoreProtocol: 'native-v1', paintWidth: Object.fromEntries(names.map(c => [c, spec[c].width])),
      painter: 'tools/paint-plate.mjs', machine: 'local', rerender: { of: `bench/runs/${roundDir}/${model}/${tryNum}`, note: 'stored plan repainted on this release; no model session' } },
    session: { minutes: +(seconds / 60).toFixed(1), modelMinutes: 0, tokens: null, usageComplete: false, costUSD: null, renderSeconds: +seconds.toFixed(1) },
    guard: { blockedImageReads: violations, kitRejections: 0, auditHits: [] },
    crops, ...(Object.keys(unpainted).length ? { unpainted } : {}),
    score: { status: 'unscored', composite: null, complete: false },
    cheat: { disqualified: violations > 0, readTargetPixels: violations > 0, reason: violations > 0 ? `${violations} blocked target read(s) by the painter` : null, risk: null, progressionRisk: null, review: null },
    complete: Object.keys(crops).length === names.length,
    raw: posix(path.relative(BENCH, rawTry)),
  };
  const errs = validateRun(run);
  if (errs.length) throw new Error(`run.json for ${model} try ${tryNum} failed its checks: ${errs.join('; ')}`);
  writeJson(runFile, run);
  return { tryDir: tryOut, painted: Object.keys(crops).length, total: names.length, warnings };
}

/** Build try folders for every (model, try) in a rerender output folder that has job records. */
export function buildTryFolders({ from, out = path.join(from, 'scorable'), round = 'v4-pipeline', models = null, tries = null, route = 'together', force = false }) {
  const roundDir = roundById(round)?.dir;
  if (!roundDir) throw new Error(`unknown round: ${round}`);
  const built = [];
  for (const model of listDirs(path.join(from, roundDir))) {
    if (models && !models.includes(model)) continue;
    for (const t of listDirs(path.join(from, roundDir, model))) {
      if (tries && !tries.includes(Number(t))) continue;
      const dir = path.join(from, roundDir, model, t);
      if (!fs.readdirSync(dir).some(f => f.endsWith('-job.json'))) continue;
      built.push(buildTry({ from, out, roundDir, model, tryNum: Number(t), route, force }));
    }
  }
  return { out, tries: built };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), has = n => argv.includes('--' + n), opt = n => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
  const list = v => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : null);
  if (!opt('from')) { console.error('usage: score-rerender.mjs --from <rerender output> [--out dir] [--round v4-pipeline] [--models a,b] [--tries 1,2,3] [--route together] [--force] [--score-dry-run]'); process.exit(2); }
  const from = path.resolve(opt('from'));
  const res = buildTryFolders({ from, out: opt('out') ? path.resolve(opt('out')) : undefined, round: opt('round') ?? 'v4-pipeline', models: list(opt('models')), tries: list(opt('tries'))?.map(Number), route: opt('route') ?? 'together', force: has('force') });
  for (const t of res.tries) {
    console.log(`${posix(t.tryDir)}: ${t.painted} of ${t.total} painted`);
    for (const w of t.warnings) console.error(`  ${w}`);
    if (has('score-dry-run')) {
      const r = spawnSync(process.execPath, [path.join(BENCH, 'scripts', 'score.mjs'), t.tryDir, '--dry-run'], { stdio: 'inherit', env: { ...process.env, TOGETHER_API_KEY: '', OPENROUTER_API_KEY: '' } });
      if (r.status !== 0) process.exitCode = 1;
    }
  }
}
