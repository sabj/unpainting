#!/usr/bin/env node
// Run one model through a round under protocol v2, gentle mode, and write its try folders.
//   npm run bench:run -- --model opus --round V4|V5 [--tries 3] [--crops <crop,crop>] [--out bench/runs] [--strict-verdict] [--skills <dir>]
//   npm run bench:run -- --dry-run [--round V4|V5]   (no model, no keys: a scripted stand-in exercises the whole path)
// V4 and V5 write tries 1 to --tries (pipeline/round45.mjs). Rounds V1 to V3 are published history and can no longer be run.
// A try folder (<out>/<round dir>/<model>/<try>/) gets run.json, <crop>.webp and <crop>-stages.webp. Raw outputs
// (full-size PNGs, stage frames, the model's scripts and logs) go to bench/work/raw/..., which git ignores.
// Score a try afterwards with `npm run bench:score -- <try folder>`. V5 scores each try itself before the next.
// The model runs code with permission prompts turned off. Run real trials in a disposable machine or container.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BENCH, REPO, V2, PUBLIC_CROPS, CROP_ORDER, roundById, loadCrops, loadLevelOneCrops, loadModels } from './lib.mjs';
import { KEYS } from './runners.mjs';
import { preflight, scorePython } from './preflight.mjs';
import { runDoctor } from '../../src/paint/doctor.mjs';
import { profileForRound } from './profiles.mjs';

const argv = process.argv.slice(2);
const has = n => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const fail = msg => { console.error(`bench:run: ${msg}`); process.exit(2); };
const FLAGS = new Set(['--dry-run', '--link-v4-try1', '--force', '--strict-verdict']);
const OPTS = new Set(['--round', '--profile', '--judge', '--notargetlooks', '--mode', '--dry-key', '--model', '--crops', '--python', '--out', '--tries', '--from-try', '--gpu', '--dry-width', '--skills']);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (FLAGS.has(a)) continue;
  if (OPTS.has(a)) {
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) fail(`${a} requires a value`);
    i++;
    continue;
  }
  fail(`unknown option ${a}`);
}

const DRY = has('dry-run');
const round = roundById(opt('round', 'V4'));
if (!round || !['V3', 'V4', 'V5'].includes(round.id)) fail('--round must be V3, V4 or V5 (V1 and V2 are published history and can no longer be run)');
if (['V4', 'V5'].includes(round.id)) fail((await import('./pipeline/round45.mjs')).RETIRED_V45);
let profile;
try { profile = profileForRound(round.id, opt('profile')); } catch (e) { fail(e.message); }
if (opt('judge')) {
  if (!['J1', 'J2'].includes(opt('judge'))) fail('--judge must be J1 or J2');
  profile = { ...profile, judgeVersion: opt('judge') };
}
if (opt('notargetlooks') && !['0', '1'].includes(opt('notargetlooks'))) fail('--notargetlooks must be 0 or 1');
const mode = opt('mode', 'gentle');
if (mode !== 'gentle') fail('only gentle mode is implemented; hard mode needs a look counter per runner (see docs/anti-cheat.md)');

const models = loadModels();
const dryKey = opt('dry-key', 'dry-run');
if (opt('dry-key') && (!DRY || !models.some(m => m.key === dryKey))) fail('--dry-key requires --dry-run and a registered model key');
const model = DRY ? { key: dryKey, name: 'Scripted dry run', id: 'dry-run', effort: 'n/a', runner: 'dry-run' }
  : models.find(m => m.key === opt('model')) || fail(`--model must be one of ${models.map(m => m.key).join(', ')}`);

// level 1 (the V3 round) also paints its own full-size targets (bench/v3/crops.json), which are not in the public suite
const cropSpecs = Object.fromEntries([...loadCrops(), ...(round.id === 'V3' ? loadLevelOneCrops() : [])].map(c => [c.task, c]));
const crops = (opt('crops') ? opt('crops').split(',') : round.targets ?? PUBLIC_CROPS).map(s => s.trim()).filter(Boolean);
const PRIVATE = process.env.BENCH_PRIVATE_CROPS ? path.resolve(process.env.BENCH_PRIVATE_CROPS) : null;
for (const c of crops) {
  if (!CROP_ORDER.includes(c) && !cropSpecs[c]?.base) fail(`unknown crop ${c}`);
  if (!cropSpecs[c].distributed && !PRIVATE) fail(`crop ${c} is not distributed; set BENCH_PRIVATE_CROPS to a folder with ${c}.png and ${c}-coarse.json`);
}
crops.sort((a, b) => CROP_ORDER.indexOf(a) - CROP_ORDER.indexOf(b));
const targetOf = c => (cropSpecs[c].distributed ? path.join(cropSpecs[c].base ?? V2, cropSpecs[c].file) : path.join(PRIVATE, `${c}.png`));
const coarseOf = c => (cropSpecs[c].distributed ? path.join(cropSpecs[c].base ?? V2, cropSpecs[c].coarseFile) : path.join(PRIVATE, `${c}-coarse.json`));
for (const c of crops) for (const f of [targetOf(c), coarseOf(c)]) if (!fs.existsSync(f)) fail(`missing ${f}`);

const python = scorePython(opt('python'));
if (!DRY) {
  try { preflight({ root: REPO, python }); } catch (e) { fail(e.message); }
  const doc = runDoctor({ root: REPO, strictModels: true });
  if (!doc.ok) fail(`doctor --strict failed: ${doc.failures.join('; ')}`);
  const k = KEYS[model.runner];
  try { execFileSync('which', [k.cli], { stdio: 'ignore' }); } catch { fail(`${model.runner} runner needs \`${k.cli}\` on PATH`); }
  if (model.runner === 'together' && !process.env.TOGETHER_API_KEY) fail('the together runner needs TOGETHER_API_KEY in the environment');
}

const outRoot = path.resolve(opt('out', path.join(BENCH, 'work', DRY ? 'dry-run' : 'profile-runs', profile.id, 'runs')));
{
  const tries = Number(opt('tries', profile.planOnly ? 1 : DRY ? (round.id === 'V4' ? 1 : 2) : 3));
  if (profile.planOnly && tries !== 1) fail('lite uses one try; select --profile full for repeated trials');
  if (!Number.isInteger(tries) || tries < 1 || tries > 9) fail('--tries must be an integer from 1 to 9');
  if (!DRY && round.id === 'V5' && !process.env.TOGETHER_API_KEY) fail('V5 scores each try for the next one\'s feedback: set TOGETHER_API_KEY (the judges run on Together)');
  // --dry-width: the painting width of a dry run (default 96 px; the real widths are in v4v5/subjects.json)
  // --from-try: V4 and V5 start at this try (V4 tries are independent, so one damaged try can be rerun alone with --from-try n --tries n)
  let fromTry = Number(opt('from-try', 1));
  if (!Number.isInteger(fromTry) || fromTry < 1 || fromTry > tries) fail('--from-try must be an integer from 1 to --tries');
  // --link-v4-try1 (V5 only, off by default): reuse V4 try 1 as V5 try 1 and run from try 2, as the published models were
  if (has('link-v4-try1')) {
    if (round.id !== 'V5' || fromTry !== 1) fail('--link-v4-try1 applies to V5 from try 1');
    const { linkV4Try1 } = await import('./pipeline/link-v4.mjs');
    try { linkV4Try1({ outRoot, modelKey: model.key }); } catch (e) { fail(e.message); }
    console.error(`bench:run: V5 try 1 is ${model.name}'s V4 try 1 (--link-v4-try1)`);
    fromTry = 2;
  }
  // --skills: a skills folder to seed instead of the repository's .agents/skills.
  const skills = opt('skills') ? path.resolve(opt('skills')) : null;
  if (skills && !['painting-planner', 'watercolor-technique'].every(k => fs.existsSync(path.join(skills, k, 'SKILL.md')))) fail('--skills must hold painting-planner/SKILL.md and watercolor-technique/SKILL.md');
  const runOpts = { round, model, tries, crops, dry: DRY, outRoot, force: has('force') || DRY, gpu: opt('gpu', DRY ? 'off' : 'on'), dryWidth: Number(opt('dry-width', 96)), fromTry, strictVerdict: has('strict-verdict'), noTargetLooks: opt('notargetlooks') === '1', profile, python, skills };
  try {
    // V3 (level 1): the toolkit round, one session a target in attempts (v3.mjs); V4 and V5: the pipeline rounds
    if (round.id === 'V3') { if (fromTry > 1) fail('--from-try applies to V4 and V5; V3 runs every target through all its attempts'); await (await import('./v3.mjs')).runV3(runOpts); }
    else await (await import('./pipeline/round45.mjs')).runPipeline(runOpts);
  } catch (e) { fail(e.stack || e.message); }
  process.exit(process.exitCode ?? 0);
}
