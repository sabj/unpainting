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
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BENCH, V2, VERSION_STAMP, PIPELINE_ROUNDS, readJson, writeJson, loadCrops, validateRun, cheatRisk, riskLevel, mean, round2, posix, compositeTargets } from './lib.mjs';
import sharp from 'sharp';
import { progressionSheet } from './images.mjs';

const argv = process.argv.slice(2);
const has = n => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const fail = msg => { console.error(`bench:score: ${msg}`); process.exit(2); };
const DRY = has('dry-run'), ONLY = has('composite-only'), JUDGES_ONLY = has('judges-only');
const tryDir = argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--raw' && argv[argv.indexOf(a) - 1] !== '--python');
if (!tryDir) fail('usage: score.mjs <try folder> [--raw dir] [--dry-run]');
const runFile = path.resolve(tryDir, 'run.json');
if (!fs.existsSync(runFile)) fail(`no run.json in ${tryDir}`);
const run = readJson(runFile);
const raw = path.resolve(opt('raw', run.raw ? path.join(BENCH, run.raw) : ''));
const PY = opt('python', 'python3');
const SCORER = path.join(BENCH, 'scorer');

const specs = Object.fromEntries(loadCrops().map(c => [c.task, c]));
const PRIVATE = process.env.BENCH_PRIVATE_CROPS ? path.resolve(process.env.BENCH_PRIVATE_CROPS) : null;
const targetOf = c => (specs[c].distributed ? path.join(V2, specs[c].file) : PRIVATE && path.join(PRIVATE, `${c}.png`));

if (!DRY && !ONLY) {
  const route = process.env.JUDGE_ROUTE || 'together', key = { together: 'TOGETHER_API_KEY', openrouter: 'OPENROUTER_API_KEY' }[route];
  if (!key) fail(`JUDGE_ROUTE must be together or openrouter, not ${route}`);
  if (!process.env[key]) fail(`scoring calls the vision judges through ${route}: set ${key}, or pass --dry-run`);
  if (route !== 'together' && !JUDGES_ONLY) fail('progression judging runs on Together only; pass --judges-only to move a run to another judge route');
  try { execFileSync(PY, ['-c', 'import numpy, scipy, skimage, PIL'], { stdio: 'ignore' }); } catch { fail(`${PY} needs the packages in bench/scorer/requirements.txt`); }
}
const py = (script, args) => JSON.parse(execFileSync(PY, [path.join(SCORER, script), ...args], { maxBuffer: 1 << 26 }).toString());

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unpaint-score-'));
const parts = {}, problems = [];
try {
  for (const [c, crop] of ONLY ? [] : Object.entries(run.crops)) {
    const final = path.join(raw, 'out', c, 'final.png'), frames = path.join(raw, 'out', c, 'frames'), target = targetOf(c);
    if (!fs.existsSync(final)) { problems.push(`${c}: no ${posix(path.relative(BENCH, final))}`); continue; }
    if (!target || !fs.existsSync(target)) { problems.push(`${c}: target not available (set BENCH_PRIVATE_CROPS for private crops)`); continue; }
    const style = specs[c].style.split(':')[0];
    let copyHF = null;
    if (!DRY) {
      console.error(`bench:score: ${c}: ${JUDGES_ONLY ? 'judges' : 'judges, progression, copy band'}`);
      // V4/V5 paint at the painter's width (about 1200 px); like the published tries, they are scored at the
      // target's own size, Lanczos-resized, so every painting is judged at the same resolution as V1-V3
      let image = final, scoreInput = null;
      if (PIPELINE_ROUNDS.has(run.round)) {
        const [t, f] = await Promise.all([sharp(target).metadata(), sharp(final).metadata()]);
        if (f.width !== t.width || f.height !== t.height) {
          image = path.join(tmp, `${c}-native.png`);
          await sharp(final).removeAlpha().resize(t.width, t.height, { kernel: 'lanczos3', fit: 'fill' }).png().toFile(image);
          scoreInput = { w: t.width, h: t.height, from: [f.width, f.height], resize: "Lanczos to the target's native size" };
        }
      }
      crop.score = { ...py('score_painting.py', ['--target', target, '--image', image, '--style', style]), ...(scoreInput ? { protocol: 'native', scoreInput } : {}) };
      if (JUDGES_ONLY) copyHF = crop.copyHF ?? null;
      else {
        const sheet = await progressionSheet(target, frames, path.join(tmp, `${c}-sheet.jpg`));
        crop.progression = sheet ? py('progression.py', ['--sheet', sheet, '--style', style]) : null;
        copyHF = py('copy_band.py', ['--target', target, '--image', image]).copyHF;
        crop.copyHF = copyHF;
      }
    } else if (!fs.existsSync(path.join(frames, 'stage-100.png'))) {
      problems.push(`${c}: no stage frames`);
    }
    parts[c] = { earlyMean: crop.progression?.earlyMean ?? null, copyHF, smallShare: crop.smallShare ?? null };
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
const complete = !DRY && scores.length === targets.length;
run.judgeVersion = VERSION_STAMP.judgeVersion;
run.score = {
  rubric: 'bench-v3-median5, 5 calls per judge model, median per model', status: DRY ? 'dry-run' : 'scored',
  composite: complete ? round2(mean(scores)) : null, partialComposite: !complete && scores.length ? round2(mean(scores)) : null,
  cropsScored: scores.length, complete, ...(extra.length ? { extraTargets: extra } : {}),
};
run.cheat = { ...run.cheat, risk, progressionRisk, review: [risk?.level, progressionRisk?.level].includes('high') ? { status: 'flagged', finding: null } : null };
const errs = validateRun(run);
if (errs.length) fail(`run.json failed its checks: ${errs.join('; ')}`);
writeJson(runFile, run);
for (const p of problems) console.error(`bench:score: ${p}`);
console.log(`bench:score: ${DRY ? 'dry run' : 'scored'} ${posix(path.relative(process.cwd(), runFile))}: ${scores.length} of ${targets.length} paintings scored${extra.length ? ` (${extra.join(', ')} scored but outside the round's targets)` : ''}, `
  + `cheat risk ${risk ? `${risk.score} (${risk.level})` : 'n/a'}${risk?.parts.progressionMissing ? ', progression not judged' : ''}`);
if (problems.length && !DRY) process.exit(1);
