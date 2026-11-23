// node --test bench/scripts/kit-work.test.mjs   (part of npm run bench:test)
// The kit moves the water itself and counts the rendering work: a script's own `between` is refused, the water steps
// it takes are counted, units are the levels 2 to 4 units (tools/paint/look-cost.mjs workUnits) over the subject's
// unit, and the budget stops a painting only at its limit (finish still works).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BENCH, V2 } from './lib.mjs';
import { workUnits } from '../../tools/paint/look-cost.mjs';

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

test('work is counted: sweeps, dryings, waits, water steps and cells stepped; units are workUnits over the subject unit', () => {
  const unit = { sweeps: 90, dryings: 10, waterSteps: 400 };
  const r = run(HEAD + STROKES(9) + `kit.wait(sheet, 20);\nconsole.log('MID ' + JSON.stringify(kit.work()));\nkit.dryAll(sheet);\nawait kit.finish('w');`, { unit });
  assert.equal(r.status, 0, r.stderr);
  const mid = JSON.parse(/MID (.*)/.exec(r.stdout)[1]), w = r.stats.work;
  assert.equal(mid.sweeps, 9); assert.equal(mid.waits, 1); assert.equal(mid.dryings, 0);
  assert.ok(mid.strokeSteps > 0, 'the brush time stepped the sheet');
  assert.equal(mid.waterSteps, mid.strokeSteps + 20);
  assert.equal(w.dryings, 1); assert.equal(w.waterSteps, mid.waterSteps + 30, 'a drying settles 30 steps first');
  assert.equal(w.cellsStepped, w.waterSteps * r.stats.sheet.W * r.stats.sheet.H);
  assert.equal(w.units, workUnits({ sweeps: 9, dryings: 1 }, 100));
  assert.equal(w.budget, 5); assert.equal(w.left, +(5 - w.units).toFixed(2));
  assert.equal(w.steppedShare, +(w.waterSteps / 400).toFixed(2));
});

test('the budget stops a painting only at its limit, and finish still works', () => {
  const r = run(HEAD + `try { ${STROKES(8)} } catch (e) { console.log('STOP ' + e.message); }\nawait kit.finish('over');`, { unit: { sweeps: 1, dryings: 0 }, env: { BENCH_UNITS: '3' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /STOP protocol v2: the rendering budget of 3 units is used \(3\)/);
  assert.equal(r.stats.brushStrokes, 3); assert.equal(r.stats.work.units, 3);
});

test('without a unit the work is counted, not charged', () => {
  const r = run(HEAD + STROKES(2) + `await kit.finish('n');`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stats.work.units, null); assert.equal(r.stats.work.sweeps, 2);
  assert.match(r.stderr, /no unit for this sheet, work is counted, not charged/);
});
