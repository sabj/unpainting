import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderSetting, outOf, paintHere, renderer } from './render.mjs';
import { namedPaths, jobInputs, workerArgs, homePaths, workerEnv } from './render-ship.mjs';
import { claim, claims, release, markStarted, waitRank, places, costOf, paintOnPool, WorkerFailure, WorkersFailed, registerClient, podsDaemon, daemonProcessAlive, DAEMON_GONE_GRACE_S } from './render-pool.mjs';
import { paintJob } from './render-worker.mjs';
import { shellWords, keptCommand } from './render-replay.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'render-test-'));

test('the render setting is local by default, pool when asked, and a misspelt one is refused', () => {
  assert.equal(renderSetting({}), 'local');
  assert.equal(renderSetting({ UNPAINT_RENDER: 'pool' }), 'pool');
  assert.throws(() => renderSetting({ UNPAINT_RENDER: 'cloud' }), /local .* or pool/);
  assert.equal(outOf({ args: ['--width', '9', '--out', '/x/plate'] }), '/x/plate');
  assert.throws(() => outOf({ args: [] }), /without --out/);
});

test('local: the painter is started as before, and a stage stop goes through stage-look', async () => {
  const seen = [];
  const got = await paintHere({ cmd: 'node', args: ['--out', '/o'] }, { cwd: '/c', logFile: '/l', onLine: null }, async (c, o) => { seen.push([c.args, o]); return { exit: 0, signal: null, seconds: 3 }; });
  assert.deepEqual(got, { done: { exit: 0, signal: null, seconds: 3 }, stopped: null, endedEarly: false });
  assert.deepEqual(seen[0][0], ['--out', '/o']);
  const r = renderer({}, { root: '/r', codeState: () => ({ commit: 'a', dirty: true }) });
  assert.equal(r.pool, false); assert.equal(r.register(3), null);
});

test('pool: only committed code is painted on a worker', () => {
  const dir = tmp(), r = renderer({ UNPAINT_RENDER: 'pool', UNPAINT_POOL_DIR: dir }, { root: '/r', codeState: () => ({ commit: 'abc', dirty: true }) });
  assert.equal(r.pool, true); assert.equal(r.cap, 10);
  assert.throws(() => r.register(1), /committed code only/);
  assert.throws(() => renderer({ UNPAINT_RENDER: 'pool', UNPAINT_POOL_DIR: dir, UNPAINT_POOL_CAP: '0' }, { root: '/r', codeState: () => ({}) }), /UNPAINT_POOL_CAP/);
});

const ARGS = ['--max-old-space-size=18432', 'tools/paint-plate.mjs', '--gpu', 'on', '--planfile', '/m/run/plans/5/final-plan.bin', '--washplan', 'edit:/m/run/look.plan-edit.json,/s/studies/a.png:6,/s/studies/b.png:4',
  '--drawingfile', '/m/run/tools/k/lines/opening', '--thingmasks', '/s/forms/cat/receipt.json', '--image', '/s/src.png', '--width', '543', '--out', '/m/run/look-paints/6-1'];

test('what a painting takes with it: each named file, a drawing by its stem, the named forms with their folder; never its output', () => {
  assert.deepEqual(namedPaths(ARGS).map(p => p.file), ['/m/run/plans/5/final-plan.bin', '/m/run/look.plan-edit.json', '/s/studies/a.png', '/s/studies/b.png', '/m/run/tools/k/lines/opening', '/s/forms/cat/receipt.json', '/s/src.png']);
  const files = new Set(['/m/run/plans/5/final-plan.bin', '/m/run/look.plan-edit.json', '/s/studies/a.png', '/s/studies/b.png', '/s/forms/cat/receipt.json', '/s/src.png', '/m/run/tools/k/lines/opening-lines.json', '/m/run/tools/k/lines/opening-vectors.json']);
  const dirs = new Set(['/m/run/tools/k/lines', '/s/forms/cat']);
  const see = f => (files.has(f) ? 'file' : dirs.has(f) ? 'dir' : null), list = d => [...files].filter(f => path.dirname(f) === d).map(f => path.basename(f)).concat(d.endsWith('lines') ? ['lines-edit.json', 'openingX.json'] : []);
  assert.deepEqual(jobInputs(ARGS, { see, list }), ['/m/run/look.plan-edit.json', '/m/run/plans/5/final-plan.bin', '/m/run/tools/k/lines/opening-lines.json', '/m/run/tools/k/lines/opening-vectors.json', '/s/forms/cat', '/s/src.png', '/s/studies/a.png', '/s/studies/b.png']);
  assert.throws(() => jobInputs(['--image', '/nowhere/x.png'], { see: () => null, list: () => [] }), /--image \/nowhere\/x\.png: no such file/);
});

test('on the worker every path reads under its mirror, the output is the job\'s own, and the records come home', () => {
  const w = workerArgs(ARGS, { root: '/h/fs', out: '/h/jobs/1/out' });
  assert.equal(w[w.indexOf('--washplan') + 1], 'edit:/h/fs/m/run/look.plan-edit.json,/h/fs/s/studies/a.png:6,/h/fs/s/studies/b.png:4');
  assert.equal(w[w.indexOf('--out') + 1], '/h/jobs/1/out'); assert.equal(w[1], 'tools/paint-plate.mjs'); assert.equal(w[0], '--max-old-space-size=18432');
  assert.throws(() => workerArgs(['--pausedir', '/p'], { root: '/h', out: '/o' }), /stopped at a stage by the worker/);
  assert.equal(homePaths('{"image":"/h/fs/s/src.png","frames":"/h/jobs/1/out/f0001.webp"}', { root: '/h/fs', out: '/h/jobs/1/out', localOut: '/m/run/look-paints/6-1' }), '{"image":"/s/src.png","frames":"/m/run/look-paints/6-1/f0001.webp"}');
});

test('the worker\'s environment keeps what changes the painting and none of this Mac\'s paths', () => {
  const env = workerEnv({ PAINTER_SEG_PYTHON: '/mac/py', W2_CACHE_DIR: '/mac/cache/paint-3f2a' }, { X_SOFT: '1', GPU_STEP: '2', HOME: '/Users/me', DAWN_FLAGS: 'metal' }, { own: { PAINTER_SEG_PYTHON: '/w/py' }, cache: '/w/cache' });
  assert.deepEqual(env, { X_SOFT: '1', GPU_STEP: '2', PAINTER_SEG_PYTHON: '/w/py', W2_CACHE_DIR: '/w/cache/paint-3f2a' });
});

test('places: one painting a worker, a claim held while its process lives, waiting jobs in their order', () => {
  const dir = tmp();
  assert.equal(claim(dir, 'pod-a', { job: 1, kind: 'look' }), true); assert.equal(claim(dir, 'pod-a', { job: 2, kind: 'look' }), false);
  markStarted(dir, 'pod-a'); assert.ok(claims(dir)['pod-a'].started);
  assert.equal(claim(dir, 'mini-0', { job: 3, pid: 999999, kind: 'look' }, () => true), true);
  assert.deepEqual(Object.keys(claims(dir, pid => pid === process.pid)), ['pod-a']);
  assert.equal(claim(dir, 'mini-0', { job: 4, kind: 'look' }, pid => pid === process.pid), true, 'a dead process\'s claim is cleared');
  release(dir, 'pod-a'); assert.equal(claim(dir, 'pod-a', { job: 5, kind: 'look' }), true);
  fs.mkdirSync(path.join(dir, 'waiting'));
  for (const [id, since] of [['b', 2], ['a', 1], ['c', 3]]) fs.writeFileSync(path.join(dir, 'waiting', `${id}.json`), JSON.stringify({ id, pid: process.pid, since }));
  assert.deepEqual(['a', 'b', 'c'].map(id => waitRank(dir, id)), [0, 1, 2]);
  fs.writeFileSync(path.join(dir, 'waiting', 'f.json'), JSON.stringify({ id: 'f', pid: process.pid, since: 9, kind: 'painting' }));
  assert.equal(waitRank(dir, 'f'), 0, 'a painting does not wait behind looks: they wait for other places');
});

test('benchmark jobs go first: an operator\'s job takes a place only while none waits, and one at a time', () => {
  const dir = tmp(); fs.mkdirSync(path.join(dir, 'waiting'));
  assert.equal(claim(dir, 'mini-0', { job: 'p1', kind: 'profile' }), true);
  assert.equal(claim(dir, 'mini-1', { job: 'p2', kind: 'operator look' }), false, 'one operator job in the whole pool');
  release(dir, 'mini-0');
  fs.writeFileSync(path.join(dir, 'waiting', 'b.json'), JSON.stringify({ id: 'b', pid: process.pid, since: 1, kind: 'look' }));
  assert.equal(claim(dir, 'mini-0', { job: 'p3', kind: 'profile' }), false, 'a benchmark job is waiting');
  assert.equal(claim(dir, 'mini-0', { job: 'b', kind: 'look' }), true);
  // a final waiting for a pod does not hold an operator's look off the mini; a session's look waiting there does
  const d2 = tmp(); fs.mkdirSync(path.join(d2, 'waiting'));
  fs.writeFileSync(path.join(d2, 'waiting', 'f.json'), JSON.stringify({ id: 'f', pid: process.pid, since: 1, kind: 'painting' }));
  assert.equal(claim(d2, 'mini-0', { job: 'op', kind: 'operator look' }), true, 'only a job waiting for the same kind of place blocks it');
  release(d2, 'mini-0'); fs.writeFileSync(path.join(d2, 'waiting', 'l.json'), JSON.stringify({ id: 'l', pid: process.pid, since: 2, kind: 'look' }));
  assert.equal(claim(d2, 'mini-0', { job: 'op', kind: 'operator look' }), false, 'a session\'s look waits for the mini too');
});

test('the places a job may take: a look this Mac then the mini; a full-size painting a ready pod with the commit and time left', () => {
  const now = 1e12, pods = [{ name: 'p1', ready: true, trees: { abcdef12: '/t' }, limit: now / 1000 + 3600, ip: '1.2.3.4', port: 22, rate: 0.89 }, { name: 'p2', ready: true, trees: { abcdef12: '/t' }, limit: now / 1000 + 600 }, { name: 'p3', ready: false, trees: { abcdef12: '/t' } }, { name: 'p4', ready: true, trees: { other000: '/t' }, limit: now / 1000 + 9999 }];
  assert.deepEqual(places({ pods, mini: { host: 'mini', slots: 2 }, local: 1, commit: 'abcdef1234', now }).map(p => p.slot), ['local-0', 'mini-0', 'mini-1']);
  const got = places({ pods, mini: { host: 'mini', slots: 2 }, local: 1, commit: 'abcdef1234', kind: 'painting', now });
  assert.deepEqual(got.map(p => p.slot), ['pod-p1']); assert.equal(got[0].worker.tree, '/t');
  assert.deepEqual(places({ pods, mini: { host: 'mini' }, local: 2, commit: 'abcdef1234', now, only: ['mini'] }).map(p => p.slot), ['mini-0', 'mini-1']);
  assert.equal(costOf({ kind: 'pod', rate: 0.89 }, 3600), 0.89); assert.equal(costOf({ kind: 'mini' }, 3600), 0);
});

test('a full-size painting with no pods daemon running fails at once, saying how to start it', async () => {
  const dir = tmp(), job = { command: { cmd: 'node', args: ['--out', path.join(dir, 'out')] }, cwd: dir, logFile: path.join(dir, 'x.log'), out: path.join(dir, 'out'), commit: 'a'.repeat(40), kind: 'painting' };
  await assert.rejects(paintOnPool(job, { dir, env: {}, local: async () => assert.fail('not here'), pollMs: 5 }), /pods daemon is not running.*render-pool-pods\.py/);
});

test('a stale pods heartbeat of a live daemon is waited for, not failed; a gone daemon is waited for a while', async () => {
  assert.equal(podsDaemon({ updated: 1000, nowS: 1050, processAlive: false }), 'fresh');
  assert.equal(podsDaemon({ updated: 1000, nowS: 1195, processAlive: true }), 'busy', 'tonight: 195 s old while it set up a pod');
  assert.equal(podsDaemon({ updated: 1000, nowS: 1195, processAlive: false }), 'gone');
  assert.equal(podsDaemon({ updated: null, nowS: 1195, processAlive: true }), 'busy');
  assert.equal(podsDaemon({ updated: null, nowS: 1195, processAlive: false }), 'never');
  assert.ok(DAEMON_GONE_GRACE_S >= 600);
  const dir = tmp(); fs.writeFileSync(path.join(dir, 'pods.json'), JSON.stringify({ updated: Date.now() / 1000 - 195, pods: [] }));
  const job = { command: { cmd: 'node', args: ['--out', path.join(dir, 'out')] }, cwd: dir, logFile: path.join(dir, 'x.log'), out: path.join(dir, 'out'), commit: 'a'.repeat(40), kind: 'painting' };
  const whys = []; job.tick = why => { whys.push(why); if (whys.length >= 3) throw new Error('stop the test'); };
  await assert.rejects(paintOnPool(job, { dir, env: {}, local: async () => assert.fail('not here'), pollMs: 1, daemonAlive: () => true }), /stop the test/);
  assert.match(whys[0], /pods daemon is busy .*last written 19\d s ago; its process lives/);
  whys.length = 0;
  await assert.rejects(paintOnPool(job, { dir, env: {}, local: async () => assert.fail('not here'), pollMs: 1, daemonAlive: () => false }), /stop the test/);
  assert.match(whys[0], /process is gone .*waiting 15 min/);
  assert.equal(daemonProcessAlive(dir), false, 'no pods.pid');
  fs.writeFileSync(path.join(dir, 'pods.pid'), String(process.pid));
  assert.equal(daemonProcessAlive(dir, () => 'node test'), false, 'a pid that is not the daemon');
  assert.equal(daemonProcessAlive(dir, () => 'python3 tools/cloud/render-pool-pods.py /p'), true);
});

test('a worker failure is tried once more and then fails loudly; a painter\'s own exit is never retried', async () => {
  const dir = tmp(), job = { command: { cmd: 'node', args: ['--out', path.join(dir, 'out')] }, cwd: dir, logFile: path.join(dir, 'x.log'), out: path.join(dir, 'out'), commit: 'a'.repeat(40), kind: 'look' };
  let n = 0;
  const failing = async () => { n++; throw new WorkerFailure(`gone ${n}`); };
  await assert.rejects(paintOnPool(job, { dir, env: {}, local: failing, pollMs: 5 }), e => e instanceof WorkersFailed && /failed on two workers .*this Mac: gone 1; this Mac: gone 2/.test(e.message));
  assert.equal(n, 2);
  assert.match(fs.readFileSync(path.join(dir, 'log.txt'), 'utf8'), /FAILED on this Mac: gone 2/);
  n = 0;
  const ends = async () => { n++; return { done: { exit: 1, signal: null, seconds: 4 }, stopped: null }; };
  const got = await paintOnPool(job, { dir, env: {}, local: ends, pollMs: 5 });
  assert.equal(n, 1); assert.equal(got.done.exit, 1); assert.equal(got.render.worker, 'this Mac'); assert.equal(got.render.costUSD, 0); assert.equal(got.render.tries.length, 1);
  n = 0;
  const killedOnce = async () => (++n === 1 ? { done: { exit: null, signal: 'SIGKILL' } } : { done: { exit: 0, signal: null } });
  const again = await paintOnPool(job, { dir, env: {}, local: killedOnce, pollMs: 5 });
  assert.equal(again.done.exit, 0); assert.deepEqual(again.render.tries.map(t => t.ok), [false, true]);
  assert.deepEqual(Object.keys(claims(dir)), [], 'every claim is given back');
});

test('a command painting through the pool says how many sessions it runs', () => {
  const dir = tmp(), f = registerClient(dir, { sessions: 3, commit: 'abc' });
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')).sessions, 3);
});

test('the worker paints the job and writes how it ended', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify({ cwd: '/tree', args: ['tools/paint-plate.mjs', '--out', `${dir}/out`], env: { X: '1' }, until: null }));
  let asked = null;
  const r = await paintJob(dir, async (c, o) => { asked = { c, o }; return { exit: 0, signal: null, seconds: 2 }; });
  assert.deepEqual(r, { done: { exit: 0, signal: null, seconds: 2 }, stopped: null });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')), r);
  assert.equal(asked.o.cwd, '/tree'); assert.deepEqual(asked.c.env, { X: '1' });
});

test('a kept command line reads back as the command, with its output moved', () => {
  assert.deepEqual(shellWords("A=1 node x --set 'a b' --q 'it'\\''s'"), ['A=1', 'node', 'x', '--set', 'a b', '--q', "it's"]);
  const c = keptCommand('W2_CACHE_DIR=/c/paint-plain node --max-old-space-size=9 tools/paint-plate.mjs --out /old', '/new');
  assert.deepEqual(c, { cmd: 'node', args: ['--max-old-space-size=9', 'tools/paint-plate.mjs', '--out', '/new'], env: { W2_CACHE_DIR: '/c/paint-plain' } });
  assert.throws(() => keptCommand('python x', '/n'), /not a painter command/);
});

test('a full-size painting goes to a pod, and to the mini only when the operator names it', () => {
  const mini = { host: 'mini', slots: 3 }, commit = 'abcdef0123456789';
  assert.deepEqual(places({ pods: [], mini, commit, kind: 'painting' }), []);
  assert.deepEqual(places({ pods: [], mini, commit, kind: 'painting', only: ['pod'] }), []);
  assert.deepEqual(places({ pods: [], mini, commit, kind: 'painting', only: ['mini'] }).map(p => p.slot), ['mini-0', 'mini-1', 'mini-2']);
  // a look named for the mini alone leaves this Mac out
  assert.deepEqual(places({ pods: [], mini, commit, kind: 'look', only: ['mini'] }).map(p => p.worker.kind), ['mini', 'mini', 'mini']);
});
