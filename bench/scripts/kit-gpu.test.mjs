// node --test bench/scripts/kit-gpu.test.mjs   (part of npm run bench:test)
// The kit never falls back to the CPU by itself: with the GPU held by another process of the session, kit.open stops
// with a plain message that names the holder and paints nothing; the CPU is used only when asked for by name.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { BENCH, V2 } from './lib.mjs';

const REPO = path.resolve(BENCH, '..');
/** A session's folder as the round seeds it: <tmp>/ws/bench with the kit; the GPU lock lies beside ws, in <tmp>. */
function workspace() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kitgpu-')), ws = path.join(tmp, 'ws'), wb = path.join(ws, 'bench');
  fs.mkdirSync(path.join(wb, 'tasks'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'src'), path.join(ws, 'src')); fs.symlinkSync(path.join(REPO, 'tools'), path.join(ws, 'tools')); fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(ws, 'node_modules'));
  fs.copyFileSync(path.join(REPO, 'package.json'), path.join(ws, 'package.json'));
  for (const f of ['kit.mjs', 'guard.mjs']) fs.copyFileSync(path.join(V2, 'kit', f), path.join(wb, f));
  fs.copyFileSync(path.join(V2, 'targets', 'sargent-coarse.json'), path.join(wb, 'tasks', 'sargent-coarse.json'));
  return { tmp, wb, lock: path.join(tmp, '.bench-gpu.lock') };
}
const OPEN = gpu => `import * as kit from './kit.mjs';\nconst { sheet } = await kit.open('sargent'${gpu === false ? ', { gpu: false }' : ''});\nconsole.log('OPENED ' + (sheet._gpu ? 'gpu' : 'cpu'));\nprocess.exit(0);\n`;

test('with the GPU held by another process of the session, kit.open stops and names the holder; it never paints on the CPU by itself', async () => {
  const { tmp, wb, lock } = workspace();
  // another process of the session holds the lock, as a stray calibration script did (it is alive, so the lock is live)
  const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  try {
    fs.mkdirSync(lock); fs.writeFileSync(path.join(lock, 'pid'), String(holder.pid));
    fs.writeFileSync(path.join(wb, 'open.mjs'), OPEN());
    const r = spawnSync(process.execPath, ['open.mjs'], { cwd: wb, encoding: 'utf8' });
    assert.notEqual(r.status, 0, 'the run stops');
    assert.ok(!r.stdout.includes('OPENED'), 'nothing was opened, on any backend');
    assert.match(r.stderr, new RegExp(`the GPU is held by another painting of this session: process ${holder.pid} \\(.*setTimeout`), 'the message names the process and its command');
    assert.match(r.stderr, /Nothing was painted[\s\S]*\{ gpu: false \}/, 'and says how to ask for the CPU by name');
    assert.ok(!fs.existsSync(path.join(wb, 'out', 'sargent', 'final.png')));
    assert.equal(+fs.readFileSync(path.join(lock, 'pid'), 'utf8'), holder.pid, 'the holder keeps its lock');
    // asked for by name, the CPU paints, lock or no lock
    fs.writeFileSync(path.join(wb, 'cpu.mjs'), OPEN(false));
    const c = spawnSync(process.execPath, ['cpu.mjs'], { cwd: wb, encoding: 'utf8' });
    assert.equal(c.status, 0, c.stderr); assert.match(c.stdout, /OPENED cpu/); assert.match(c.stderr, /kit v2: sargent \d+x\d+, cpu,/);
    // a lock left by a process that is gone is not a holder: it is taken over (no false stop)
    holder.kill('SIGKILL'); await new Promise(res => holder.once('exit', res));
    fs.writeFileSync(path.join(wb, 'env.mjs'), OPEN());
    const e = spawnSync(process.execPath, ['env.mjs'], { cwd: wb, encoding: 'utf8', env: { ...process.env, BENCH_CPU: '1' } });
    assert.equal(e.status, 0, e.stderr); assert.match(e.stdout, /OPENED cpu/, 'BENCH_CPU=1 is the other way to ask for the CPU by name');
  } finally { try { holder.kill('SIGKILL'); } catch { /* gone */ } fs.rmSync(tmp, { recursive: true, force: true }); }
});
