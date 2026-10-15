// node --test bench/scripts/kit-log.test.mjs   (part of npm run bench:test)
// Proves the stroke log is read-only: one fixed script paints the same final.png with and without logging.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { BENCH, V2 } from './lib.mjs';

const REPO = path.resolve(BENCH, '..');
const SCRIPT = `
import * as kit from './kit.mjs';
const { sheet, O } = await kit.open('sargent', { gpu: false });
const b = kit.createBrush({ radius: 8, bristles: 16, capacity: 60 });
const pen = kit.createPen({});
for (let k = 0; k < 30; k++) {
  if (k % 5 === 0) kit.dip(b, { water: 0.8, conc: kit.mix({ ultramarine: 0.2 + 0.02 * k, sienna: 0.1 }) });
  const y = 20 + 4 * k;
  kit.stroke(b, sheet, [{ x: 10, y, p: 0.6 }, { x: 40, y: y + 3, p: 1 }, { x: 80, y: y - 2, p: 0.5 }]);
}
kit.dipPen(pen, kit.mix({ sepia: 1 }));
kit.penStroke(pen, sheet, [{ x: 12, y: 30, p: 1 }, { x: 70, y: 44, p: 1 }]);
kit.dryAll(sheet, O);
await kit.finish('test');
`;

function paint(noLog) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'kitlog-'));
  try {
    fs.symlinkSync(path.join(REPO, 'src'), path.join(ws, 'src'));
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(ws, 'node_modules'));
    fs.copyFileSync(path.join(REPO, 'package.json'), path.join(ws, 'package.json'));
    const wb = path.join(ws, 'bench'); fs.mkdirSync(path.join(wb, 'tasks'), { recursive: true });
    for (const f of ['kit.mjs', 'guard.mjs']) fs.copyFileSync(path.join(V2, 'kit', f), path.join(wb, f));
    fs.copyFileSync(path.join(V2, 'targets', 'sargent-coarse.json'), path.join(wb, 'tasks', 'sargent-coarse.json'));
    fs.writeFileSync(path.join(wb, 'paint.mjs'), SCRIPT);
    const env = { ...process.env, BENCH_SEED: '7' }; delete env.BENCH_NO_STROKELOG; if (noLog) env.BENCH_NO_STROKELOG = '1';
    execFileSync('node', ['paint.mjs'], { cwd: wb, env, stdio: 'pipe' });
    const out = path.join(wb, 'out', 'sargent');
    const read = f => (fs.existsSync(path.join(out, f)) ? fs.readFileSync(path.join(out, f)) : null);
    return { final: read('final.png'), log: read('strokes.jsonl.gz'), stats: JSON.parse(read('stats.json')) };
  } finally { fs.rmSync(ws, { recursive: true, force: true }); }
}

test('logging does not change what is painted, and the log is complete', () => {
  const on = paint(false), off = paint(true);
  assert.ok(on.final.length > 1000);
  assert.ok(on.final.equals(off.final), 'final.png differs with logging on');
  assert.equal(off.log, null);
  const lines = zlib.gunzipSync(on.log).toString().trim().split('\n').map(l => JSON.parse(l));
  assert.equal(lines[0].ev, 'open');
  assert.equal(lines[0].seed, 7);
  assert.equal(lines[0].mmPerCell, 0.259);
  const strokes = lines.filter(l => l.tool);
  assert.equal(strokes.length, 31);
  assert.deepEqual(strokes.map(s => s.i), strokes.map((_, k) => k + 1));
  assert.equal(strokes[0].tool, 'brush');
  assert.equal(strokes[0].dip.water, 0.8);
  assert.equal(strokes[0].pts.length, 3);
  assert.equal(strokes.at(-1).tool, 'pen');
  assert.ok(lines.some(l => l.ev === 'snap' && l.after === 25));
  assert.deepEqual(lines.filter(l => l.ev === 'stage').map(l => l.pct), [10, 25, 50, 75, 100]);
  assert.equal(lines.at(-1).ev, 'finish');
  assert.equal(on.stats.seed, 7);
  assert.equal(on.stats.strokeLog, 'strokes.jsonl.gz');
});

test('the kit takes its targets from the coarse maps installed next to it', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'kittasks-'));
  try {
    fs.symlinkSync(path.join(REPO, 'src'), path.join(ws, 'src'));
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(ws, 'node_modules'));
    fs.copyFileSync(path.join(REPO, 'package.json'), path.join(ws, 'package.json'));
    const wb = path.join(ws, 'bench'); fs.mkdirSync(path.join(wb, 'tasks'), { recursive: true });
    for (const f of ['kit.mjs', 'guard.mjs']) fs.copyFileSync(path.join(V2, 'kit', f), path.join(wb, f));
    // mittens, and a target added later under a new name, installed the way run.mjs installs them
    fs.copyFileSync(path.join(V2, 'targets', 'mittens-coarse.json'), path.join(wb, 'tasks', 'mittens-coarse.json'));
    fs.copyFileSync(path.join(V2, 'targets', 'sargent-coarse.json'), path.join(wb, 'tasks', 'harbour-coarse.json'));
    fs.writeFileSync(path.join(wb, 'tasks.mjs'), "import * as kit from './kit.mjs'; console.log(JSON.stringify(kit.TASKS));");
    const tasks = JSON.parse(execFileSync('node', ['tasks.mjs'], { cwd: wb }).toString());
    assert.deepEqual(tasks, ['harbour', 'mittens']);
  } finally { fs.rmSync(ws, { recursive: true, force: true }); }
});
