#!/usr/bin/env node
// Score a try folder written by run.mjs and update its run.json.
//   npm run bench:score -- <try folder> [--raw <raw folder>] [--dry-run]
// For each painting: the vision-model ensemble plus classic metrics (scorer/score_painting.py), the progression
// check on the stage frames (scorer/progression.py) and the copy signal (scorer/copy_band.py). Then the two
// cheat-risk scores for the try. Needs python3 with scorer/requirements.txt and TOGETHER_API_KEY.
// --dry-run makes no network calls and needs no Python: it checks the inputs, computes the cheat-risk parts that
// need no vision model, and marks the try "dry-run" so build-results.mjs leaves it out.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BENCH, V2, VERSION_STAMP, readJson, writeJson, loadCrops, validateRun, cheatRisk, mean, round2, posix } from './lib.mjs';
import { progressionSheet } from './images.mjs';

const argv = process.argv.slice(2);
const has = n => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const fail = msg => { console.error(`bench:score: ${msg}`); process.exit(2); };
const DRY = has('dry-run');
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

if (!DRY) {
  if (!process.env.TOGETHER_API_KEY) fail('scoring calls the vision judges on Together: set TOGETHER_API_KEY, or pass --dry-run');
  try { execFileSync(PY, ['-c', 'import numpy, scipy, skimage, PIL'], { stdio: 'ignore' }); } catch { fail(`${PY} needs the packages in bench/scorer/requirements.txt`); }
}
const py = (script, args) => JSON.parse(execFileSync(PY, [path.join(SCORER, script), ...args], { maxBuffer: 1 << 26 }).toString());

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unpaint-score-'));
const parts = {}, problems = [];
try {
  for (const [c, crop] of Object.entries(run.crops)) {
    const final = path.join(raw, 'out', c, 'final.png'), frames = path.join(raw, 'out', c, 'frames'), target = targetOf(c);
    if (!fs.existsSync(final)) { problems.push(`${c}: no ${posix(path.relative(BENCH, final))}`); continue; }
    if (!target || !fs.existsSync(target)) { problems.push(`${c}: target not available (set BENCH_PRIVATE_CROPS for private crops)`); continue; }
    const style = specs[c].style.split(':')[0];
    let copyHF = null;
    if (!DRY) {
      console.error(`bench:score: ${c}: judges, progression, copy band`);
      crop.score = py('score_painting.py', ['--target', target, '--image', final, '--style', style]);
      const sheet = await progressionSheet(target, frames, path.join(tmp, `${c}-sheet.jpg`));
      crop.progression = sheet ? py('progression.py', ['--sheet', sheet, '--style', style]) : null;
      copyHF = py('copy_band.py', ['--target', target, '--image', final]).copyHF;
      crop.copyHF = copyHF;
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
const { risk, progressionRisk } = cheatRisk(parts, audit);
const scores = Object.values(run.crops).map(c => c.score?.composite).filter(v => v != null);
const n = Object.keys(run.crops).length;
const complete = !DRY && n === run.settings.crops.length && scores.length === n;
run.judgeVersion = VERSION_STAMP.judgeVersion;
run.score = {
  rubric: 'bench-v3-median5, 5 calls per judge model, median per model', status: DRY ? 'dry-run' : 'scored',
  composite: complete ? round2(mean(scores)) : null, partialComposite: !complete && scores.length ? round2(mean(scores)) : null,
  cropsScored: scores.length, complete,
};
run.cheat = { ...run.cheat, risk, progressionRisk, review: [risk?.level, progressionRisk?.level].includes('high') ? { status: 'flagged', finding: null } : null };
const errs = validateRun(run);
if (errs.length) fail(`run.json failed its checks: ${errs.join('; ')}`);
writeJson(runFile, run);
for (const p of problems) console.error(`bench:score: ${p}`);
console.log(`bench:score: ${DRY ? 'dry run' : 'scored'} ${posix(path.relative(process.cwd(), runFile))}: ${scores.length} of ${n} paintings scored, `
  + `cheat risk ${risk ? `${risk.score} (${risk.level})` : 'n/a'}${risk?.parts.progressionMissing ? ', progression not judged' : ''}`);
if (problems.length && !DRY) process.exit(1);
