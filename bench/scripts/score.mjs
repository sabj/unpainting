#!/usr/bin/env node
// Score a try folder written by run.mjs and update its run.json.
//   npm run bench:score -- <try folder> [--raw <raw folder>] [--dry-run]
// For each painting: the vision-model ensemble plus classic metrics (scorer/score_painting.py), the progression
// check on the stage frames (scorer/progression.py) and the copy signal (scorer/copy_band.py). Then the two
// cheat-risk scores for the try. Needs python3 with scorer/requirements.txt and TOGETHER_API_KEY.
// --dry-run makes no network calls and needs no Python: it checks the inputs, computes the cheat-risk parts that
// need no vision model, and marks the try "dry-run" so build-results.mjs leaves it out.
// --judges-only reruns only the vision judges and classic metrics (score_painting.py) and keeps each painting's
// progression and copy band, e.g. to move a run to another judge route (JUDGE_ROUTE) at the cost of the judge calls.
// --composite-only recomputes the composite from the paintings' existing scores (no judges, no network).
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BENCH, V2, PIPELINE_ROUNDS, readJson, writeJson, loadCrops, validateRun, cheatRisk, riskLevel, mean, round2, posix, compositeTargets } from './lib.mjs';
import sharp from 'sharp';
import { progressionSheet } from './images.mjs';

const argv = process.argv.slice(2);
const has = n => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const fail = msg => { console.error(`bench:score: ${msg}`); process.exit(2); };
const DRY = has('dry-run'), ONLY = has('composite-only'), JUDGES_ONLY = has('judges-only');
const valued = new Set(['--raw', '--python', '--judge', '--profile']);
const tryDir = argv.find((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
if (!tryDir) fail('usage: score.mjs <try folder> [--raw dir] [--dry-run]');
const runFile = path.resolve(tryDir, 'run.json');
if (!fs.existsSync(runFile)) fail(`no run.json in ${tryDir}`);
const run = readJson(runFile);
const raw = path.resolve(opt('raw', run.raw ? path.join(BENCH, run.raw) : ''));
const PY = opt('python', 'python3');
const SCORER = path.join(BENCH, 'scorer');
const judge = opt('judge', run.settings.budget?.judgeVersion ?? run.judgeVersion ?? 'J1');
const profile = opt('profile', run.settings.budget?.judgeProfile);
if (!['J1', 'J2'].includes(judge)) fail('--judge must be J1 or J2');
if (profile && (judge !== 'J2' || !['lite', 'standard', 'full'].includes(profile))) fail('--profile lite|standard|full requires J2');
const expectedProfile = judge === 'J2' ? `J2-${profile ?? 'full'}` : 'J1-full';
const route = process.env.JUDGE_ROUTE || run.settings.judgeRoute || 'together';
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const scoreStarted = Date.now();
const explicit = Boolean(run.settings.benchmarkProfile);
const progJudges = (process.env.BENCH_PROG_JUDGES ?? 'zai-org/GLM-5.3-Flash,Qwen/Qwen3.5-9B').split(',').map(s => s.trim());
if (explicit && (progJudges.length !== 2 || new Set(progJudges).size !== 2 || progJudges.some(s => !s))) fail('explicit benchmark profiles require two distinct progression judges');
const stages = [10, 25, 50, 75, 100];
const validStages = p => stages.every(s => Number.isFinite(p?.stages?.[s]) && p.stages[s] >= 1 && p.stages[s] <= 5);
const progComplete = p => p?.complete === true && p.judgesN === 2 && progJudges.every(j => p.judges?.includes(j) && p.perJudge?.[j]?.judgesN === 1 && validStages(p.perJudge[j]));
const finalComplete = s => s?.complete === true && Number.isFinite(s.composite) && s.judgeVersion === judge && s.judgeProfile === expectedProfile && s.judgeRoute === route;


const specs = Object.fromEntries(loadCrops().map(c => [c.task, c]));
const PRIVATE = process.env.BENCH_PRIVATE_CROPS ? path.resolve(process.env.BENCH_PRIVATE_CROPS) : null;
const targetOf = c => (specs[c].distributed ? path.join(V2, specs[c].file) : PRIVATE && path.join(PRIVATE, `${c}.png`));

if (!DRY && !ONLY) {
  const key = { together: 'TOGETHER_API_KEY', openrouter: 'OPENROUTER_API_KEY' }[route];
  if (!key) fail(`JUDGE_ROUTE must be together or openrouter, not ${route}`);
  if (!process.env[key]) fail(`scoring calls the vision judges through ${route}: set ${key}, or pass --dry-run`);
  if (!JUDGES_ONLY && !process.env.TOGETHER_API_KEY) fail('progression judging needs TOGETHER_API_KEY');
  try { execFileSync(PY, ['-c', 'import numpy, scipy, skimage, PIL'], { stdio: 'ignore' }); } catch { fail(`${PY} needs the packages in bench/scorer/requirements.txt`); }
}
const py = (script, args) => JSON.parse(execFileSync(PY, [path.join(SCORER, script), ...args], { maxBuffer: 1 << 26, env: { ...process.env, JUDGE_ROUTE: route } }).toString());
const execAsync = promisify(execFile);
async function progression(sheet, style) {
  // Keep each judge's complete stage response: the legacy aggregate silently substitutes zero for missing stages.
  const perJudge = Object.fromEntries(await Promise.all(progJudges.map(async j => {
    try {
      const { stdout } = await execAsync(PY, [path.join(SCORER, 'progression.py'), '--sheet', sheet, '--style', style],
        { maxBuffer: 1 << 26, env: { ...process.env, BENCH_PROG_JUDGES: j, JUDGE_ROUTE: route } });
      return [j, JSON.parse(stdout)];
    } catch (e) { return [j, { error: e.message }]; }
  })));
  const ok = Object.entries(perJudge).filter(([j, p]) => p.judgesN === 1 && p.judges?.includes(j) && validStages(p));
  const complete = ok.length === progJudges.length;
  const values = complete ? Object.fromEntries(stages.map(s => [s, round2(mean(ok.map(([, p]) => p.stages[s])))])) : {};
  return { complete, perJudge, judgesN: ok.length, judges: ok.map(([j]) => j), stages: values,
    earlyMean: complete ? round2(mean([values[10], values[25]])) : null,
    mean: complete ? round2(mean(Object.values(values))) : null,
    humanOrderVotes: ok.reduce((n, [, p]) => n + (p.humanOrderVotes || 0), 0),
    tells: ok.reduce((acc, [, p]) => { for (const [t, n] of Object.entries(p.tells || {})) acc[t] = (acc[t] || 0) + n; return acc; }, {}),
    judgeNotes: Object.fromEntries(ok.map(([j, p]) => [j, p.judgeNotes?.[j] ?? ''])) };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unpaint-score-'));
const parts = {}, problems = [];
try {
  for (const [c, crop] of ONLY ? [] : Object.entries(run.crops)) {
    const final = path.join(raw, 'out', c, 'final.png'), frames = path.join(raw, 'out', c, 'frames'), target = targetOf(c);
    if (!fs.existsSync(final)) { crop.score = null; problems.push(`${c}: no ${posix(path.relative(BENCH, final))}`); continue; }
    if (!target || !fs.existsSync(target)) { crop.score = null; problems.push(`${c}: target not available (set BENCH_PRIVATE_CROPS for private crops)`); continue; }
    try {
    const style = specs[c].style.split(':')[0];
    let copyHF = null;
    if (!DRY) {
      console.error(`bench:score: ${c}: ${JUDGES_ONLY ? 'judges' : 'judges, progression, copy band'}`);
      // V4/V5 paint at the painter's width (about 1200 px); like the published tries, they are scored at the
      // target's own size, Lanczos-resized, so every painting is judged at the same resolution as V1-V3
      let image = final, scoreInput = null;
      if (PIPELINE_ROUNDS.has(run.round)) {
        const [t, f] = await Promise.all([sharp(target).metadata(), sharp(final).metadata()]);
        scoreInput = { w: t.width, h: t.height, from: [f.width, f.height] };
        if (f.width !== t.width || f.height !== t.height) {
          image = path.join(tmp, `${c}-native.png`);
          await sharp(final).removeAlpha().resize(t.width, t.height, { kernel: 'lanczos3', fit: 'fill' }).png().toFile(image);
          scoreInput = { w: t.width, h: t.height, from: [f.width, f.height], resize: "Lanczos to the target's native size" };
        }
      }
      const cacheKey = JSON.stringify({ input: 'native-v1', target: sha(target), image: sha(image), style, judge, profile: expectedProfile, route, rubric: 'bench-v3-median5' });
      const cached = !has('force') && (explicit ? finalComplete(crop.score) : crop.score?.complete === true) && crop.score.cacheKey === cacheKey;
      const started = Date.now();
      crop.score = { ...(cached ? crop.score : py('score_painting.py', ['--target', target, '--image', image, '--style', style, '--judge', judge, ...(profile ? ['--profile', profile] : [])])),
        ...(scoreInput ? { protocol: 'native', scoreInput } : {}), cacheKey, cacheHit: cached, elapsedSeconds: (Date.now() - started) / 1000 };

      if (JUDGES_ONLY) copyHF = crop.copyHF ?? null;
      else {
        const sheet = await progressionSheet(target, frames, path.join(tmp, `${c}-sheet.jpg`));
        const progKey = sheet ? JSON.stringify({ protocol: explicit ? 'progression-v1-complete' : 'progression-v1', image: sha(sheet), style, judges: progJudges }) : null;
        const progCached = !has('force') && progKey && crop.progression?.cacheKey === progKey && (explicit ? progComplete(crop.progression) : crop.progression?.judgesN === progJudges.length);
        crop.progression = sheet ? { ...(progCached ? crop.progression : explicit ? await progression(sheet, style) : py('progression.py', ['--sheet', sheet, '--style', style])), cacheKey: progKey, cacheHit: Boolean(progCached) } : null;
        copyHF = py('copy_band.py', ['--target', target, '--image', image]).copyHF;
        crop.copyHF = copyHF;
      }
    } else if (!fs.existsSync(path.join(frames, 'stage-100.png'))) {
      problems.push(`${c}: no stage frames`);
    }
    parts[c] = { earlyMean: crop.progression?.earlyMean ?? null, copyHF, smallShare: crop.smallShare ?? null };
    } catch (e) {
      crop.score = { complete: false, composite: null, judgeVersion: judge, judgeProfile: expectedProfile, judgeRoute: route, error: e.message };
      problems.push(`${c}: scoring failed: ${e.message}`);
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const judgesOf = pick => [...new Set(Object.values(run.crops).flatMap(pick))].sort();
run.evaluators = {
  scoreJudges: judgesOf(c => Object.keys(c.score?.judgeScores || {})),
  progressionJudges: judgesOf(c => c.progression?.judges || []),
};
const audit = run.guard.blockedImageReads > 0 || run.cheat.disqualified;
const { risk, progressionRisk } = PIPELINE_ROUNDS.has(run.round) ? pipelineRisk() : ONLY ? run.cheat : cheatRisk(parts, audit);

/** V4 and V5 paint with the painter, which works from the target by design, so the toolkit rounds' copy-band test
 * does not apply. As for the published V4/V5 tries, each painting's risk is the painter's own cheat-risk record
 * (<raw>/<crop>/painting/out/cheat-risk.json) and the try's is its highest painting. */
function pipelineRisk() {
  for (const [c, crop] of Object.entries(run.crops)) {
    const f = path.join(raw, c, 'painting', 'out', 'cheat-risk.json');
    const r = fs.existsSync(f) ? readJson(f) : null;
    crop.copyHF = null;
    crop.cheatRisk = r ? { score: r.risk, level: r.level, parts: r.parts, hfCorr: r.hfCorr ?? null, hfCeiling: r.hfCeiling ?? null, flags: r.flags ?? [], guardViolations: r.guard?.violations ?? 0 } : null;
  }
  const rs = Object.entries(run.crops).filter(([, c]) => c.cheatRisk);
  if (!rs.length) return { risk: null, progressionRisk: null };
  const [k, top] = rs.sort((x, y) => y[1].cheatRisk.score - x[1].cheatRisk.score)[0];
  const prog = Math.max(...rs.map(([, c]) => c.cheatRisk.parts?.progression ?? 0));
  return { risk: { score: top.cheatRisk.score, level: top.cheatRisk.level, basis: `highest painting (${k}), from the painter's cheat-risk record`, parts: top.cheatRisk.parts },
    progressionRisk: { score: round2(prog), level: riskLevel(prog), basis: 'highest progression part of any painting' } };
}
const targets = compositeTargets(run), extra = Object.keys(run.crops).filter(c => !targets.includes(c));
const scores = targets.map(c => run.crops[c]?.score?.composite).filter(v => v != null);
const complete = !DRY && scores.length === targets.length && (!explicit || (run.complete && targets.every(c => finalComplete(run.crops[c]?.score) && progComplete(run.crops[c]?.progression))));
if (!ONLY && !DRY) {
  const versions = new Set(Object.values(run.crops).filter(c => c.score).map(c => c.score.judgeVersion ?? 'J1'));
  const profiles = new Set(Object.values(run.crops).filter(c => c.score).map(c => c.score.judgeProfile ?? 'J1-full'));
  if (versions.size > 1 || profiles.size > 1) fail('mixed judge versions or sampling profiles; score every painting consistently');
  run.judgeVersion = [...versions][0] ?? judge; run.judgeProfile = [...profiles][0] ?? expectedProfile; run.judgeRoute = route;
} else if (DRY) { run.judgeVersion = judge; run.judgeProfile = expectedProfile; }

run.score = {
  rubric: 'bench-v3-median5, ' + (run.judgeProfile === 'J2-lite' ? 1 : run.judgeProfile === 'J2-standard' ? 3 : 5) + ' calls per judge model, median per model', status: DRY ? 'dry-run' : 'scored',
  composite: complete ? round2(mean(scores)) : null, partialComposite: !complete && scores.length ? round2(mean(scores)) : null,
  cropsScored: scores.length, complete, elapsedSeconds: (Date.now() - scoreStarted) / 1000, ...(extra.length ? { extraTargets: extra } : {}),
};
run.cheat = { ...run.cheat, risk, progressionRisk, review: [risk?.level, progressionRisk?.level].includes('high') ? { status: 'flagged', finding: null } : null };
const errs = validateRun(run);
if (errs.length) fail(`run.json failed its checks: ${errs.join('; ')}`);
writeJson(runFile, run);
for (const p of problems) console.error(`bench:score: ${p}`);
console.log(`bench:score: ${DRY ? 'dry run' : 'scored'} ${posix(path.relative(process.cwd(), runFile))}: ${scores.length} of ${targets.length} paintings scored${extra.length ? ` (${extra.join(', ')} scored but outside the round's targets)` : ''}, `
  + `cheat risk ${risk ? `${risk.score} (${risk.level})` : 'n/a'}${risk?.parts.progressionMissing ? ', progression not judged' : ''}`);
if (!DRY && (problems.length || (explicit && !complete))) process.exitCode = 1;
