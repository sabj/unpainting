// A child that uses no CPU is killed after idleMs; a busy or quick child is left alone. Fake children, short times.
import test from 'node:test';
import assert from 'node:assert/strict';
import { psCpuSeconds, runWatched } from './watched-child.mjs';

test('a child stuck at 0% CPU is killed and the run rejects as idle', async () => {
  const t0 = Date.now();
  await assert.rejects(runWatched('sleep', ['30'], { idleMs: 400, pollMs: 50 }), e => e.idle === true && e.idleMinutes > 0 && /no CPU/.test(e.message));
  assert.ok(Date.now() - t0 < 5000, 'killed long before the sleep ends');
});

test('a child that keeps using CPU is not killed, however long it takes', async () => {
  const busy = 'const t=Date.now(); while (Date.now()-t < 1200) {}';
  const r = await runWatched(process.execPath, ['-e', busy + '; console.log("done")'], { idleMs: 300, pollMs: 50 });
  assert.equal(r.stdout.trim(), 'done');
});

test('a quiet-then-busy child survives while idle time is shorter than idleMs', async () => {
  const script = 'setTimeout(()=>{const t=Date.now(); while (Date.now()-t<500){} console.log("ok")}, 300)';
  const r = await runWatched(process.execPath, ['-e', script], { idleMs: 2000, pollMs: 50 });
  assert.equal(r.stdout.trim(), 'ok');
});

test('a failing child rejects with its stderr and exit code, not as idle', async () => {
  await assert.rejects(runWatched(process.execPath, ['-e', 'console.error("boom"); process.exit(2)'], { idleMs: 5000, pollMs: 50 }), e => e.code === 2 && /boom/.test(e.stderr) && !e.idle);
});

test('the wall-time cap kills a child that does use CPU', async () => {
  await assert.rejects(runWatched(process.execPath, ['-e', 'for(;;){}'], { idleMs: 60000, pollMs: 50, maxMs: 300 }), e => e.timedOut === true);
});

test('psCpuSeconds reads this process, and null for a pid that is gone', () => {
  assert.ok(psCpuSeconds(process.pid) > 0);
  assert.equal(psCpuSeconds(2 ** 22 - 3), null);
});
