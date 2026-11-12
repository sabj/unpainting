// A scripted stand-in for a model on the area route, used by `run.mjs --dry-run --planform area`. It is never a
// contestant. It runs in the try's worktree like a model would: it writes an area plan (two areas, one wash each), traces
// the target's lines, runs the check, starts the painting, looks, tries to revise (an area plan cannot be revised once
// painting has started, so the harness refuses), and finishes.
//   node bench/dry-planner.mjs start|repair
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const say = s => console.log(s);
const paint = (...a) => { const r = spawnSync('bash', ['bench/paint.sh', ...a], { encoding: 'utf8' }); say(`$ paint.sh ${a.join(' ')} (exit ${r.status})\n${r.stdout}${r.stderr}`); return r.stdout; };
const until = (out, done) => { for (let i = 0; i < 200 && !done(out); i++) out = paint('wait'); return out; };
const stopped = o => /Stopped:|finished|ended|refused|failed|REFUSED/.test(o);
const write = (f, v) => fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v, null, 1));

if (process.argv[2] === 'repair') { say('dry planner: nothing to repair'); process.exit(0); }
const T = 'bench/plan/target.png', png = fs.readFileSync(T);
const frozen = JSON.parse(fs.readFileSync('bench/frozen.json', 'utf8'));
const load = water => ({ water, pigmentScale: 1, waterQuantityMm3: 120, capacityMm3: 160, minRemainingFraction: 0.15, reload: 'before-stroke', rinse: 'fresh-brush-per-gesture', blot: 'none', concentrationSource: 'solver-calibrated' });
const pass = (id, order, move, water) => ({ id, order, dependsOn: [], valueRange: [1, 99], move, edges: { kind: 'hard', overlap: false }, lights: { mode: 'paint-owned', reason: 'scripted dry run' },
  brush: { kind: 'flat', widthMm: 12, contact: 'belly', orientation: 'sweep', pressure: [0.5, 0.9, 0.5] }, load: load(water), wetness: { required: 'dry', neighborCells: 2 }, stop: { after: 'pass', reason: 'scripted dry run' } });
const area = (id, y0, y1, p) => ({ id, parent: null, intent: `${id} half`, referenceCue: 'scripted dry run', drawingRole: 'structural', geometry: { polygon: [[0, y0], [1, y0], [1, y1], [0, y1]], anchors: [] }, passes: [p] });
const pen = frozen.medium === 'pen';
write('bench/plan/area-plan.json', {
  version: 1, coordinateSpace: 'normalized-target',
  target: { path: T, sha256: crypto.createHash('sha256').update(png).digest('hex'), width: png.readUInt32BE(16), height: png.readUInt32BE(20) },
  paints: ['ultramarine', 'sepia'],
  drawing: { medium: pen ? 'ink' : 'graphite', reason: 'scripted dry run' },
  areas: [area('top', 0, 0.5, pass('wash', 1, 'wet on dry', 0.62)), area('bottom', 0.5, 1, pass('wash', 2, 'wet on dry', 0.62))],
  edges: [{ areas: ['top', 'bottom'], kind: 'hard', reason: 'scripted dry run' }],
});
write('bench/PLAN.md', '# Plan (dry run)\n\nTwo areas, one wash each, on dry paper.\n');
execFileSync('node', ['bench/tools/trace-ink.mjs', T, 'bench/plan/opening-lines.json'], { stdio: 'inherit' });
if (pen) fs.copyFileSync('bench/plan/opening-lines.json', 'bench/plan/closing-lines.json');
const check = spawnSync('bash', ['bench/check.sh'], { encoding: 'utf8' });
say(`$ check.sh (exit ${check.status})\n${check.stdout.split('\n').slice(-2).join('\n')}`);
let out = until(paint('start'), stopped);
paint('look');
out = until(paint('next'), stopped);
paint('look');
write('bench/PLAN.md', '# Plan (dry run)\n\nTwo areas, one wash each, on dry paper. A revision is refused on the area route.\n');
const a = JSON.parse(fs.readFileSync('bench/plan/area-plan.json', 'utf8'));
a.areas[1].passes[0].brush.widthMm = 10;
write('bench/plan/area-plan.json', a);
paint('revise');                                   // refused: an area plan cannot be revised once painting has started
paint('status');
out = until(paint('finish'), o => /finished|ended|failed/.test(o));
paint('look');
say('dry planner: done');
