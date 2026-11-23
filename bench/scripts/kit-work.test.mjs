// node --test bench/scripts/kit-work.test.mjs   (part of npm run bench:test)
// The kit moves the water itself and measures the work: a script's own `between` is refused; sweeps, dryings, waits
// and water steps are recorded, never charged; the paintings run are charged (one each, budget 3 an attempt); a
// runaway past the water-step guard is stopped with a plain message.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BENCH, V2 } from './lib.mjs';

const REPO = path.resolve(BENCH, '..');
function run(script, { unit = null, env = {} } = {}) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'kitwork-')), wb = path.join(ws, 'bench');
  try {
    for (const d of ['src', 'tools', 'node_modules']) fs.symlinkSync(path.join(REPO, d), path.join(ws, d));
    fs.copyFileSync(path.join(REPO, 'package.json'), path.join(ws, 'package.json'));
    fs.mkdirSync(path.join(wb, 'tasks'), { recursive: true });
    for (const f of ['kit.mjs', 'guard.mjs']) fs.copyFileSync(path.join(V2, 'kit', f), path.join(wb, f));
    fs.copyFileSync(path.join(V2, 'targets', 'sargent-coarse.json'), path.join(wb, 'tasks', 'sargent-coarse.json'));
    if (unit) fs.writeFileSync(path.join(wb, 'tasks', 'sargent-unit.json'), JSON.stringify(unit));
    fs.writeFileSync(path.join(wb, 'p.mjs'), script);
    const r = spawnSync(process.execPath, ['p.mjs'], { cwd: wb, encoding: 'utf8', env: { ...process.env, BENCH_NO_FILM: '1', ...env } });
    let stats = null; try { stats = JSON.parse(fs.readFileSync(path.join(wb, 'out', 'sargent', 'stats.json'), 'utf8')); } catch { /* not finished */ }
    return { ...r, stats };
  } finally { fs.rmSync(ws, { recursive: true, force: true }); }
}
const HEAD = `import * as kit from './kit.mjs';\nconst { sheet } = await kit.open('sargent', { gpu: false });\nconst b = kit.createBrush({ radius: 8, bristles: 16, capacity: 60 });\n`;
const STROKES = n => `for (let k = 0; k < ${n}; k++) { kit.dip(b, { water: 0.8, conc: kit.mix({ ultramarine: 0.3 }) }); kit.stroke(b, sheet, [{ x: 20, y: 20 + 12 * k, p: 0.8 }, { x: 200, y: 24 + 12 * k, p: 0.8 }]); }\n`;

test('a stroke with its own between is refused: the kit moves the water', () => {
  const r = run(HEAD + `try { kit.stroke(b, sheet, [{ x: 1, y: 1 }, { x: 50, y: 1 }], { between: () => {} }); } catch (e) { console.log(e.message); }\nconsole.log(typeof kit.step, typeof kit.dry); process.exit(0);`);
  assert.match(r.stdout, /leave out "between"\. The kit moves the water itself/);
  assert.match(r.stdout, /undefined undefined/, 'no step or dry for the script to call');
});

test('work is measured, not charged: sweeps, dryings, waits, water steps, cells stepped', () => {
  const unit = { sweeps: 90, dryings: 10, waterSteps: 400 };
  const r = run(HEAD + STROKES(9) + `kit.wait(sheet, 20);\nconsole.log('MID ' + JSON.stringify(kit.work()));\nkit.dryAll(sheet);\nawait kit.finish('w');`, { unit });
  assert.equal(r.status, 0, r.stderr);
  const mid = JSON.parse(/MID (.*)/.exec(r.stdout)[1]).measured, w = r.stats.work;
  assert.equal(mid.sweeps, 9); assert.equal(mid.waits, 1); assert.equal(mid.dryings, 0);
  assert.ok(mid.strokeSteps > 0, 'the brush time stepped the sheet');
  assert.equal(mid.waterSteps, mid.strokeSteps + 20);
  assert.equal(w.measured.dryings, 1); assert.equal(w.measured.waterSteps, mid.waterSteps + 30, 'a drying settles 30 steps first');
  assert.equal(w.measured.cellsStepped, w.measured.waterSteps * r.stats.sheet.W * r.stats.sheet.H);
  assert.equal(w.painting, 1); assert.equal(w.paintingsBudget, 3); assert.equal(w.paintingsLeft, 2);
  assert.equal(w.waterStepsOverAuto, +(w.measured.waterSteps / 400).toFixed(2)); assert.equal(w.runawayAt, 4000);
  assert.ok(!('units' in w), 'no water, stroke or drying is charged');
});

test('each painting run is charged once, at its first mark; the run past the budget is refused before it lays anything', () => {
  const r = run(HEAD + `kit.dip(b, { water: 0.8, conc: kit.mix({ ultramarine: 0.3 }) });
kit.stroke(b, sheet, [{ x: 20, y: 20, p: 0.8 }, { x: 200, y: 24, p: 0.8 }]); await kit.finish('one');
const again = await kit.open('sargent', { gpu: false }); console.log('SECOND ' + kit.work().painting);
kit.stroke(b, again.sheet, [{ x: 20, y: 40, p: 0.8 }, { x: 200, y: 44, p: 0.8 }]);
const third = await kit.open('sargent', { gpu: false }); try { kit.stroke(b, third.sheet, [{ x: 20, y: 60 }, { x: 200, y: 64 }]); } catch (e) { console.log('REFUSED ' + e.message); }
process.exit(0);`, { env: { BENCH_RUNS: '2' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /SECOND 2/);
  assert.match(r.stdout, /REFUSED protocol v2: you have run 2 paintings in this attempt, the budget of 2/);
});

test('a runaway is stopped by the guard, with a plain message, and recorded as a stop', () => {
  const r = run(HEAD + STROKES(1) + `kit.wait(sheet, 50);\ntry { kit.wait(sheet, 1); } catch (e) { console.log('STOP ' + e.message); }\nprocess.exit(0);`, { unit: { sweeps: 1, dryings: 0, waterSteps: 10 }, env: { BENCH_STEP_CEILING: '3' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /STOP protocol v2: this painting has taken \d+ water steps, more than 3 times the 10 of the automatic painting/);
});

test('without a subject unit the work is measured and there is no runaway guard', () => {
  const r = run(HEAD + STROKES(2) + `await kit.finish('n');`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stats.work.auto, null); assert.equal(r.stats.work.runawayAt, null); assert.equal(r.stats.work.measured.sweeps, 2);
});
