// node --test bench/scripts/kit-engine.test.mjs   (part of npm run bench:test)
// The kit paints on the main painter's engine: the painter's section brush, its broad-wash spacing, its GPU settings,
// and the hand's own speed and a flat's twist at each point of a stroke.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { BENCH, V2 } from './lib.mjs';
import { applyNativeFastGpuEnv, NATIVE_FAST_GPU_ENV } from '../../tools/painter/native-gpu-env.mjs';

const REPO = path.resolve(BENCH, '..');
function run(script) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'kitengine-')), wb = path.join(ws, 'bench');
  try {
    for (const d of ['src', 'tools', 'node_modules']) fs.symlinkSync(path.join(REPO, d), path.join(ws, d));
    fs.copyFileSync(path.join(REPO, 'package.json'), path.join(ws, 'package.json'));
    fs.mkdirSync(path.join(wb, 'tasks'), { recursive: true });
    for (const f of ['kit.mjs', 'guard.mjs']) fs.copyFileSync(path.join(V2, 'kit', f), path.join(wb, f));
    fs.copyFileSync(path.join(V2, 'targets', 'sargent-coarse.json'), path.join(wb, 'tasks', 'sargent-coarse.json'));
    fs.writeFileSync(path.join(wb, 'p.mjs'), script);
    const r = spawnSync(process.execPath, ['p.mjs'], { cwd: wb, encoding: 'utf8', env: { ...process.env, BENCH_NO_FILM: '1' } });
    let log = null; try { log = zlib.gunzipSync(fs.readFileSync(path.join(wb, 'out', 'sargent', 'strokes.jsonl.gz'))).toString().trim().split('\n').map(l => JSON.parse(l)); } catch { /* not finished */ }
    return { ...r, log };
  } finally { fs.rmSync(ws, { recursive: true, force: true }); }
}
const HEAD = `import * as kit from './kit.mjs';\nconst { sheet } = await kit.open('sargent', { gpu: false });\n`;

test('the painter\'s GPU settings are set where unset, and a setting already given is kept', () => {
  const env = { GPU_RESIDENT: '0' }, r = applyNativeFastGpuEnv(env);
  assert.equal(env.GPU_RESIDENT, '0'); assert.deepEqual(r.kept, ['GPU_RESIDENT']);
  for (const [k, v] of Object.entries(NATIVE_FAST_GPU_ENV)) if (k !== 'GPU_RESIDENT') assert.equal(env[k], v, k);
  assert.equal(env.GPU_DEMAND_READBACK, 'fast');
});

test('every kit brush is the painter\'s section brush; a broad wash is spaced 1.4 cells, a small or dry one 0.7', () => {
  const r = run(HEAD + `const big = kit.createBrush({ radius: 30, bristles: 40, capacity: 400, flat: true }), small = kit.createBrush({ radius: 6, bristles: 14, capacity: 60 });
console.log('MODEL ' + big.model + ' ' + small.model);
kit.dip(big, { water: 0.85, conc: kit.mix({ ochre: 0.3 }) }); kit.stroke(big, sheet, [{ x: 40, y: 60, p: 0.9 }, { x: 300, y: 60, p: 0.9 }]);
kit.dip(big, { water: 0.3, conc: kit.mix({ ochre: 0.3 }) }); kit.stroke(big, sheet, [{ x: 40, y: 140, p: 0.9 }, { x: 300, y: 140, p: 0.9 }]);
kit.dip(small, { water: 0.85, conc: kit.mix({ ochre: 0.3 }) }); kit.stroke(small, sheet, [{ x: 40, y: 190, p: 0.9 }, { x: 300, y: 190, p: 0.9 }]);
try { kit.createBrush({ model: 'row' }); } catch (e) { console.log('ROW ' + e.message); }
try { kit.stroke(small, sheet, [{ x: 1, y: 1 }, { x: 50, y: 1 }], { spacing: 2 }); } catch (e) { console.log('SPACING ' + e.message); }
await kit.finish('s');`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /MODEL section section/);
  assert.match(r.stdout, /ROW protocol v2: createBrush: the kit's brushes are the painter's section brush/);
  assert.match(r.stdout, /SPACING protocol v2: stroke: leave out "spacing"/);
  const strokes = r.log.filter(l => l.tool === 'brush');
  assert.deepEqual(strokes.map(s => s.spacing), [1.4, 0.7, 0.7], 'broad and wet 1.4; the same brush dry, and a 1.6 mm brush, 0.7');
  assert.equal(strokes[0].brush.model, 'section');
});

test('a point may carry the hand\'s speed (v, mm/s) and a flat\'s blade angle; both are logged, and bad values refused', () => {
  const r = run(HEAD + `const f = kit.createBrush({ radius: 20, bristles: 30, capacity: 300, flat: true, bladeAngle: 90 });
kit.dip(f, { water: 0.85, conc: kit.mix({ sienna: 0.4 }) });
kit.stroke(f, sheet, [{ x: 40, y: 80, p: 0.9, v: 30, blade: 90 }, { x: 200, y: 80, p: 0.9, v: 120, blade: 0 }]);
for (const bad of [{ v: 0 }, { v: -5 }, { blade: NaN }]) try { kit.stroke(f, sheet, [{ x: 1, y: 1, ...bad }, { x: 50, y: 1 }]); } catch (e) { console.log('BAD ' + e.message); }
try { kit.stroke(f, sheet, [{ x: 1, y: 1 }, { x: 50, y: 1 }], { speed: 0 }); } catch (e) { console.log('BAD ' + e.message); }
await kit.finish('v');`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout.match(/BAD protocol v2/g) || []).length, 4);
  const s = r.log.find(l => l.tool === 'brush');
  assert.deepEqual(s.pts.map(q => [q.v, q.blade]), [[30, 90], [120, 0]]);
  assert.equal(s.brush.bladeAngle, 90); assert.equal(s.brush.flat, true);
});
