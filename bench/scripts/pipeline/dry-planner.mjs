// A scripted stand-in for a model in V4 and V5, used by `run.mjs --dry-run`. It is never a contestant. It runs in the
// try's worktree like a model would: in V5 after try 1 it writes SELF-REVIEW.md before it reads FEEDBACK.md; it writes
// a plan (one token wrong at first, so the admission check refuses it), traces the target's pen lines, runs the check,
// starts the painting, looks, goes one pass on, revises a painter setting, looks again and finishes.
//   node bench/dry-planner.mjs start|repair
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const say = s => console.log(s);
const paint = (...a) => { const r = spawnSync('bash', ['bench/paint.sh', ...a], { encoding: 'utf8' }); say(`$ paint.sh ${a.join(' ')} (exit ${r.status})\n${r.stdout}${r.stderr}`); return r.stdout; };
const until = (out, done) => { for (let i = 0; i < 200 && !done(out); i++) out = paint('wait'); return out; };
const stopped = o => /Stopped:|finished|ended|refused|failed|REFUSED/.test(o);
const write = (f, v) => fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v, null, 1));

if (process.argv[2] === 'repair') { say('dry planner: nothing to repair'); process.exit(0); }
const fb = 'bench/feedback';
if (fs.existsSync(fb)) {
  // judge the previous painting first, then read the judges
  write('bench/SELF-REVIEW.md', `# Self-review (dry run)\n\nLooked at ${fs.existsSync(`${fb}/compare.png`) ? 'compare.png' : 'no painting'} before reading FEEDBACK.md. Own score: 3 of 10, plausibility 2 of 5.\n`);
  const lines = fs.readFileSync(`${fb}/FEEDBACK.md`, 'utf8').split('\n').length;
  fs.appendFileSync('bench/SELF-REVIEW.md', `\nRead FEEDBACK.md afterwards (${lines} lines). Agree with the outcome; nothing else to weigh in a dry run.\n`);
}
const config = {
  subject: 'dry', name: 'Dry run',
  styleSelection: { style: 'ink-and-wash', reason: 'scripted dry run' },
  families: [{ id: 'dry.top', bounds: [0, 0, 1, 0.5], baseMove: 'wet in wet', referenceCue: 'upper half' }, { id: 'dry.bottom', bounds: [0, 0.5, 1, 1], baseMove: 'wet on dry', referenceCue: 'lower half' }],
  reserves: [],
};
write('bench/plan/config.json', config);
write('bench/plan/extra-args.json', ['--darkgain', '1.2']);
write('bench/variant.txt', 'region_w13_lay2_bogus\n');
write('bench/PLAN.md', `# Plan (dry run)\n\nTwo families, two mid layers, darker darks.${fs.existsSync(fb) ? ' Changed from the last try: nothing; a dry run.' : ''}\n`);
execFileSync('node', ['bench/tools/trace-ink.mjs', 'bench/plan/target.png', 'bench/plan/opening-lines.json', '.12', '14', '.62'], { stdio: 'inherit' });
fs.copyFileSync('bench/plan/opening-lines.json', 'bench/plan/closing-lines.json');
let out = paint('start');                          // refused: "bogus" is not a recipe token
write('bench/variant.txt', 'region_w13_lay2\n');
const check = spawnSync('bash', ['bench/check.sh'], { encoding: 'utf8' });
say(`$ check.sh (exit ${check.status})\n${check.stdout.split('\n').slice(-2).join('\n')}`);
out = until(paint('start'), stopped);
paint('look');
out = until(paint('next'), stopped);
write('bench/plan/extra-args.json', ['--darkgain', '1.1']);
out = until(paint('revise', 'then', 'next'), stopped);
paint('look');
paint('status');
out = until(paint('finish'), o => /finished|ended|failed/.test(o));
paint('look');
say('dry planner: done');
