// The whole benchmark at once (levels.mjs, 24 Nov): every model of the roster on every picture of a run set at each
// level, each one fresh, independent session (no level is handed another level's result), all started together;
// their looks and finals go through the render pool. L1 to L3 are fixed rounds, L4 an open session with tools (60
// minutes on its clock). Every level: look budget 3 units, the anti-cheat guard, no judge feedback.
//   node tools/paint/run-benchmark.mjs --out DIR [--set core] [--models a,b] [--levels L1,L2,L3,L4] [--pictures a,b]
//                                      [--pool mini,pod] [--cap 8] [--start]
//     without --start: the sessions it would start, and the prepare it needs; starts nothing
//     --start: checks the checkout is clean and every picture is prepared for this commit (Auto's plan, the traced
//       shapes, and for L3 and L4 Auto's full-size painting), then starts every session at once, each its own
//       command and folder DIR/<model>-<picture>-<level>/ (a folder that exists is left alone), and writes
//       DIR/launch.json (the commit and the sessions) and DIR/manifest.json
//   node tools/paint/run-benchmark.mjs manifest DIR
//     the scorer's manifest (npm run bench:score04 -- DIR/manifest.json) written again as finals land: every session
//     that has ended (run.json), and Auto's prepared painting of each picture at the same commit
// What a picture needs prepared, once a commit, through the pool:  npm run paint -- <set> prepare --level L3
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadRunSets, picturesAt } from './run-sets.mjs';
import { levelOf, BENCHMARK_LEVELS } from './levels.mjs';
import { preparedRoot, preparedKey } from './prepared.mjs';
import { registryPath } from './subjects.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
/** What every session of the run gets on its command line beside its level: the 240-frame film of its final. */
export const FINAL_SETS = Object.freeze([['video', '1'], ['frames', '240']]);
/** The open session's clock (L4), in minutes: the same 60 as the rounds levels are given. */
export const L4_MINUTES = 60;

/** The folder name of one session. */
export const sessionFolder = ({ author, subject, level }) => `${author}-${subject}-${level}`;

/**
 * Every session of the run: [{author, subject, level, work, folder, args}], models x pictures x levels, each its own
 * command and nothing passed between them. `pictures(level)`: the set's pictures that run at the level.
 */
export function planRuns({ models, levels, pictures }) {
  if (!models.length) throw new Error('no models');
  for (const l of levels) if (!BENCHMARK_LEVELS.includes(l)) throw new Error(`level ${l} is not one of the benchmark's (${BENCHMARK_LEVELS.join(', ')})`);
  const runs = [];
  for (const level of levels) {
    const { work } = levelOf(level);
    for (const subject of pictures(level)) for (const author of models) {
      const args = [subject, 'paint', '--work', work, '--level', level, '--author', author, ...(work === 'session' ? ['--wallminutes', String(L4_MINUTES)] : []), ...FINAL_SETS.flatMap(([k, v]) => ['--set', `${k}=${v}`])];
      runs.push({ author, subject, level, work, folder: sessionFolder({ author, subject, level }), args });
    }
  }
  return runs;
}

/** The pictures that need Auto's painting prepared (a level that hands it over runs on them). */
export const needsAutoPainting = runs => [...new Set(runs.filter(r => levelOf(r.level).autoPainting).map(r => r.subject))];

/**
 * The scorer's manifest: {about, commit, runs: [{folder, subject, author, level}]}: each session that has ended
 * (run.json in its folder; one still running is left out, so it is not read as failed) and Auto's runs (`autos`:
 * [{subject, folder}]). A session that ended without a painting stays in: the scorer keeps it as a failed run.
 */
export function manifestOf(dir, launch, autos = []) {
  const runs = [];
  for (const a of autos) if (fs.existsSync(path.join(a.folder, 'run.json'))) runs.push({ folder: path.relative(dir, a.folder), subject: a.subject, author: 'auto', level: 'Auto' });
  for (const r of launch.runs) if (fs.existsSync(path.join(dir, r.folder, 'run.json'))) runs.push({ folder: r.folder, subject: r.subject, author: r.author, level: r.level });
  return { about: `The benchmark run of ${launch.started} at commit ${launch.commit}: ${launch.runs.length} sessions (each one fresh and independent) and Auto. Written by run-benchmark.mjs manifest as finals land; sessions still running are not listed yet.`, commit: launch.commit, runs };
}

/** Auto's prepared painting of each picture at this commit: [{subject, folder}] (its run folder, whether or not it is there). */
function autoRuns(subjects, commit) {
  const root = preparedRoot(path.dirname(registryPath()));
  return subjects.map(subject => ({ subject, folder: path.join(root, preparedKey({ id: subject, commit }), 'painting') }));
}

function parse(argv) {
  const o = { set: 'core', models: null, levels: [...BENCHMARK_LEVELS], pictures: null, pool: 'mini,pod', cap: '8', start: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => { const x = argv[++i]; if (x == null) throw new Error(`${a} needs a value`); return x; };
    if (a === '--start') o.start = true;
    else if (a === '--out') o.out = path.resolve(v()); else if (a === '--set') o.set = v(); else if (a === '--pool') o.pool = v(); else if (a === '--cap') o.cap = v();
    else if (a === '--models') o.models = v().split(','); else if (a === '--levels') o.levels = v().split(','); else if (a === '--pictures') o.pictures = v().split(',');
    else throw new Error(`unknown: ${a}`);
  }
  if (!o.out) throw new Error('--out DIR: where the sessions and the manifest are written');
  return o;
}

async function main(argv) {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  if (argv[0] === 'manifest') {
    const dir = path.resolve(argv[1] ?? ''), launch = JSON.parse(fs.readFileSync(path.join(dir, 'launch.json'), 'utf8'));
    const m = manifestOf(dir, launch, autoRuns([...new Set(launch.runs.map(r => r.subject))], launch.commit));
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 1) + '\n');
    console.log(`manifest.json: ${m.runs.length} runs (${m.runs.filter(r => r.level !== 'Auto').length} of ${launch.runs.length} sessions ended)`);
    return;
  }
  const o = parse(argv), runSets = loadRunSets(), models = o.models ?? runSets.roster;
  const runs = planRuns({ models, levels: o.levels, pictures: level => picturesAt(o.set, level, runSets).map(p => p.id).filter(id => !o.pictures || o.pictures.includes(id)) });
  const commit = git('rev-parse', 'HEAD'), autos = needsAutoPainting(runs), subjects = [...new Set(runs.map(r => r.subject))];
  console.log(`${runs.length} sessions at once (${models.length} models; ${o.levels.join(', ')}; set ${o.set}) at commit ${commit.slice(0, 8)}, each one fresh and independent, into ${o.out}`);
  console.log(`prepared first, once at this commit (through the pool):\n  UNPAINT_RENDER=pool UNPAINT_POOL_ONLY=${o.pool} npm run paint -- ${subjects.join(',')} prepare --level L3`);
  if (!o.start) { for (const r of runs) console.log(`  ${r.folder}: npm run paint -- ${r.args.join(' ')} --out ${path.join(o.out, r.folder)}`); console.log('nothing started (add --start)'); return; }
  if (git('status', '--porcelain')) throw new Error('the checkout has uncommitted changes: the pool paints committed code only');
  const missing = autoRuns(autos, commit).filter(a => !fs.existsSync(path.join(a.folder, 'run.json'))).map(a => a.subject);
  if (missing.length) throw new Error(`Auto's painting is not prepared at this commit for ${missing.join(', ')}: prepare them first (the line above); nothing started`);
  fs.mkdirSync(o.out, { recursive: true });
  const launch = { started: new Date().toISOString(), commit, set: o.set, models, levels: o.levels, pool: o.pool, cap: o.cap, runs: runs.map(({ args, ...r }) => ({ ...r, command: `npm run paint -- ${args.join(' ')}` })) };
  fs.writeFileSync(path.join(o.out, 'launch.json'), JSON.stringify(launch, null, 1) + '\n');
  const env = { ...process.env, UNPAINT_RENDER: 'pool', UNPAINT_POOL_ONLY: o.pool, UNPAINT_POOL_CAP: o.cap };
  for (const r of runs) {
    const folder = path.join(o.out, r.folder);
    if (fs.existsSync(folder)) { console.log(`${r.folder}: its folder exists, not started again`); continue; }
    const log = fs.openSync(`${folder}.log`, 'a');
    spawn(process.execPath, [path.join(ROOT, 'tools', 'paint', 'cli.mjs'), ...r.args, '--out', folder], { cwd: ROOT, env, detached: true, stdio: ['ignore', log, log] }).unref();
    console.log(`${r.folder}: started`);
  }
  fs.writeFileSync(path.join(o.out, 'manifest.json'), JSON.stringify(manifestOf(o.out, launch, autoRuns(subjects, commit)), null, 1) + '\n');
  console.log(`all started. The manifest, written again as finals land: node tools/paint/run-benchmark.mjs manifest ${o.out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2)).catch(e => { console.error(`run-benchmark: ${e.message}`); process.exit(1); });
