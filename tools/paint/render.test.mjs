import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { renderSetting, outOf, paintHere, renderer } from './render.mjs';
import { namedPaths, jobInputs, workerArgs, homePaths, workerEnv } from './render-ship.mjs';
import { claim, claims, release, markStarted, waitRank, places, podPlacesKept, costOf, paintOnPool, WorkerFailure, WorkersFailed, registerClient, miniCheckout, podsDaemon, daemonProcessAlive, DAEMON_GONE_GRACE_S } from './render-pool.mjs';
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

test('a plan preview goes through the pool as a plan, kept off this Mac by UNPAINT_POOL_ONLY; locally it runs here', async () => {
  const seen = [], run = async c => { seen.push(c.args); return { exit: 0, signal: null, seconds: 2 }; }, cmd = { cmd: 'node', args: ['--valuepreviewonly', '1', '--out', '/x/plate'] };
  assert.deepEqual(await renderer({}, { root: '/r', codeState: () => ({}), run }).plan(cmd, { cwd: '/c', logFile: '/l' }), { exit: 0, signal: null, seconds: 2 });
  const dir = tmp(), clean = () => ({ commit: 'a'.repeat(40), dirty: false });
  // (this Mac's place is taken however many GPU paintings the machine running the test has on: UNPAINT_POOL_LOCAL)
  const pooled = renderer({ UNPAINT_RENDER: 'pool', UNPAINT_POOL_DIR: dir, UNPAINT_POOL_LOCAL: '99' }, { root: '/r', codeState: clean, run });
  assert.equal((await pooled.plan({ ...cmd, args: ['--out', path.join(dir, 'p')] }, { cwd: dir, logFile: path.join(dir, 'p.log') })).exit, 0);
  assert.equal(seen.length, 2);
  assert.match(fs.readFileSync(path.join(dir, 'log.txt'), 'utf8'), /^\S+ plan p on this Mac/m);
  // with this Mac left out and no other worker up, it waits rather than painting here (in a process of its own: the
  // waiting job polls for a place for as long as its process lives, which would keep this file's process from ending)
  const code = `import { renderer } from ${JSON.stringify(new URL('./render.mjs', import.meta.url).href)};
const seen = [], off = renderer({ UNPAINT_RENDER: 'pool', UNPAINT_POOL_DIR: ${JSON.stringify(dir)}, UNPAINT_POOL_ONLY: 'mini,pod' }, { root: '/r', codeState: () => ({ commit: 'a'.repeat(40), dirty: false }), run: async c => { seen.push(c); return { exit: 0 }; } });
const waited = await Promise.race([off.plan({ cmd: 'node', args: ['--out', ${JSON.stringify(path.join(dir, 'q'))}] }, { cwd: ${JSON.stringify(dir)}, logFile: ${JSON.stringify(path.join(dir, 'q.log'))} }).then(() => 'ran'), new Promise(r => setTimeout(() => r('waiting'), 300))]);
console.log(waited, seen.length); process.exit(0);`;
  assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' }).trim(), 'waiting 0');
  assert.equal(seen.length, 2);
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
  markStarted(dir, 'pod-a', 1); assert.ok(claims(dir)['pod-a'].started);
  assert.equal(claim(dir, 'mini-0', { job: 3, pid: 999999, kind: 'look' }, () => true), true);
  assert.deepEqual(Object.keys(claims(dir, pid => pid === process.pid)), ['pod-a']);
  assert.equal(claim(dir, 'mini-0', { job: 4, kind: 'look' }, pid => pid === process.pid), true, 'a dead process\'s claim is cleared');
  release(dir, 'pod-a', 1); assert.equal(claim(dir, 'pod-a', { job: 5, kind: 'look' }), true);
  fs.mkdirSync(path.join(dir, 'waiting'));
  for (const [id, since] of [['b', 2], ['a', 1], ['c', 3]]) fs.writeFileSync(path.join(dir, 'waiting', `${id}.json`), JSON.stringify({ id, pid: process.pid, since }));
  assert.deepEqual(['a', 'b', 'c'].map(id => waitRank(dir, id)), [0, 1, 2]);
  fs.writeFileSync(path.join(dir, 'waiting', 'f.json'), JSON.stringify({ id: 'f', pid: process.pid, since: 9, kind: 'painting' }));
  assert.equal(waitRank(dir, 'f'), 3, 'looks and paintings can share pod slots');
  // a waiter that cannot take any place free now does not hold back a later one that can (a pod-only job while the mini alone is free)
  assert.equal(waitRank(dir, 'c', undefined, w => w.id !== 'a'), 1, 'a, which could take no free place, is skipped'); assert.equal(waitRank(dir, 'c', undefined, () => false), 0);
  const mini = { host: 'mini', slots: 2 }, free = new Set(places({ mini, local: 0, commit: 'abc', kind: 'look', only: ['mini'] }).map(p => p.slot));
  const could = w => places({ mini, local: 0, pods: [], commit: w.commit, kind: w.kind, only: w.only ?? null }).some(p => free.has(p.slot));
  assert.equal(could({ kind: 'speed check', commit: 'abc', only: ['pod'] }), false, 'a pod-only waiter cannot take the mini'); assert.equal(could({ kind: 'look', commit: 'abc' }), true);
});

test('benchmark jobs go first: an operator\'s job takes a place only while none waits, and one at a time', () => {
  const dir = tmp(); fs.mkdirSync(path.join(dir, 'waiting'));
  assert.equal(claim(dir, 'mini-0', { job: 'p1', kind: 'profile' }), true);
  assert.equal(claim(dir, 'mini-1', { job: 'p2', kind: 'operator look' }), false, 'one operator job in the whole pool');
  release(dir, 'mini-0', 'p1');
  fs.writeFileSync(path.join(dir, 'waiting', 'b.json'), JSON.stringify({ id: 'b', pid: process.pid, since: 1, kind: 'look' }));
  assert.equal(claim(dir, 'mini-0', { job: 'p3', kind: 'profile' }), false, 'a benchmark job is waiting');
  assert.equal(claim(dir, 'mini-0', { job: 'b', kind: 'look' }), true);
  // a final waiting for a pod does not hold an operator's look off the mini; a session's look waiting there does
  const d2 = tmp(); fs.mkdirSync(path.join(d2, 'waiting'));
  fs.writeFileSync(path.join(d2, 'waiting', 'f.json'), JSON.stringify({ id: 'f', pid: process.pid, since: 1, kind: 'painting' }));
  assert.equal(claim(d2, 'mini-0', { job: 'op', kind: 'operator look' }), true, 'only a job waiting for the same kind of place blocks it');
  release(d2, 'mini-0', 'op'); fs.writeFileSync(path.join(d2, 'waiting', 'l.json'), JSON.stringify({ id: 'l', pid: process.pid, since: 2, kind: 'look' }));
  assert.equal(claim(d2, 'mini-0', { job: 'op', kind: 'operator look' }), false, 'a session\'s look waits for the mini too');
});

test('the places a job may take: a look this Mac, the mini, then a pod that is up; a full-size painting a ready pod with the commit and time left', () => {
  const now = 1e12, pods = [{ name: 'p1', ready: true, trees: { abcdef12: '/t' }, limit: now / 1000 + 3600, ip: '1.2.3.4', port: 22, rate: 0.89 }, { name: 'p2', ready: true, trees: { abcdef12: '/t' }, limit: now / 1000 + 600 }, { name: 'p3', ready: false, trees: { abcdef12: '/t' } }, { name: 'p4', ready: true, trees: { other000: '/t' }, limit: now / 1000 + 9999 }];
  assert.deepEqual(places({ pods, mini: { host: 'mini', slots: 2 }, local: 1, commit: 'abcdef1234', now }).map(p => p.slot), ['local-0', 'mini-0', 'mini-1', 'pod-p1']);
  const got = places({ pods, mini: { host: 'mini', slots: 2 }, local: 1, commit: 'abcdef1234', kind: 'painting', now });
  assert.deepEqual(got.map(p => p.slot), ['pod-p1']); assert.equal(got[0].worker.tree, '/t');
  assert.deepEqual(places({ pods, mini: { host: 'mini' }, local: 2, commit: 'abcdef1234', now, only: ['mini'] }).map(p => p.slot), ['mini-0', 'mini-1']);
  assert.equal(costOf({ kind: 'pod', rate: 0.89 }, 3600), 0.89); assert.equal(costOf({ kind: 'mini' }, 3600), 0);
  // a pod paints as many at once as its GPU type was measured to: the places fill pod by pod, level by level
  const wide = [{ ...pods[0], slots: 3 }, { ...pods[0], name: 'q', slots: 2 }];
  assert.deepEqual(places({ pods: wide, commit: 'abcdef1234', kind: 'painting', now }).map(p => p.slot), ['pod-p1', 'pod-q', 'pod-p1-1', 'pod-q-1', 'pod-p1-2']);
  assert.equal(costOf({ kind: 'pod', rate: 0.9, slots: 3 }, 3600), 0.3, 'a place costs its share of the pod');
  // a look leaves a pod place for each painting waiting
  const dir = tmp(); fs.mkdirSync(path.join(dir, 'waiting'));
  fs.writeFileSync(path.join(dir, 'waiting', 'f.json'), JSON.stringify({ id: 'f', pid: process.pid, since: 1, kind: 'painting' }));
  fs.writeFileSync(path.join(dir, 'waiting', 'l.json'), JSON.stringify({ id: 'l', pid: process.pid, since: 1, kind: 'look' }));
  fs.writeFileSync(path.join(dir, 'waiting', 'g.json'), JSON.stringify({ id: 'g', pid: 999999, since: 1, kind: 'painting' }));
  assert.equal(podPlacesKept(dir, pid => pid === process.pid), 1);
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

test('stale claim recovery serializes contenders and release/start require the current job token', async () => {
  const dir = tmp();
  assert.equal(claim(dir, 'local-0', { pid: 999999, job: 'dead', kind: 'look' }, () => true), true);
  let contender;
  assert.equal(claim(dir, 'local-0', { job: 'new', kind: 'look' }, () => {
    contender = claim(dir, 'local-0', { job: 'racer', kind: 'look' }, () => false);
    return false;
  }), true);
  assert.equal(contender, false, 'a second stale observer cannot enter the mutation');
  assert.equal(await release(dir, 'local-0', 'dead'), false);
  assert.equal(markStarted(dir, 'local-0', 'dead'), false);
  assert.equal(claims(dir)['local-0'].job, 'new');
  assert.equal(markStarted(dir, 'local-0', 'new'), true);
  assert.equal(await release(dir, 'local-0', 'new'), true);
});

test('concurrent processes recovering a dead claim admit exactly one painter', async () => {
  const dir = tmp();
  claim(dir, 'local-0', { pid: 999999, job: 'dead', kind: 'look' }, () => true);
  fs.mkdirSync(path.join(dir, 'claims', 'local-0.json.locks', '999999-abandoned'), { recursive: true });
  const module = new URL('./render-pool.mjs', import.meta.url).href;
  const script = `import {claim} from ${JSON.stringify(module)}; console.log(claim(process.argv[1], 'local-0', {job: process.argv[2], kind: 'look', pid: process.ppid}));`;
  const attempts = await Promise.all(Array.from({ length: 8 }, (_, j) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, dir, String(j)]);
    let out = ''; child.stdout.on('data', d => { out += d; }); child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(`claim child ${code}`)));
  })));
  assert.equal(attempts.filter(x => x === 'true').length, 1);
});

test('FIFO ranks local-only finals and looks by their shared open slots', () => {
  const dir = tmp(), waiting = path.join(dir, 'waiting'); fs.mkdirSync(waiting);
  for (const [id, kind, only, since] of [['final', 'painting', ['local', 'mini'], 1], ['look', 'look', ['local'], 2], ['pod', 'painting', ['pod'], 0]]) {
    fs.writeFileSync(path.join(waiting, `${id}.json`), JSON.stringify({ id, kind, only, since, pid: process.pid }));
  }
  assert.equal(waitRank(dir, 'look'), 1);
  assert.equal(waitRank(dir, 'final'), 0);
  assert.equal(waitRank(dir, 'look', undefined, w => w.only.includes('local')), 1);
});

test('client allowlists persist and the pods daemon excludes clients that cannot use pods', () => {
  const dir = tmp(), f = registerClient(dir, { sessions: 8, commit: 'abc', only: 'local,mini' });
  assert.deepEqual(JSON.parse(fs.readFileSync(f)).only, ['local', 'mini']);
  const source = new URL('../cloud/render-pool-pods.py', import.meta.url).pathname;
  const script = `import ast, json, pathlib, sys
source, pool = sys.argv[1:]
module = ast.parse(pathlib.Path(source).read_text())
fn = next(n for n in module.body if isinstance(n, ast.FunctionDef) and n.name == 'live_clients')
ns = dict(POOL=pathlib.Path(pool), json=json, alive=lambda pid: True)
exec(compile(ast.Module(body=[fn], type_ignores=[]), source, 'exec'), ns)
assert ns['live_clients']() == []
for only, expected in [(None, 1), (['pod'], 1), ([], 0), (['mini'], 0)]:
 p = pathlib.Path(pool) / 'clients' / 'test.json'
 p.write_text(json.dumps(dict(pid=123, sessions=3, commit='def', only=only)))
 assert len(ns['live_clients']()) == expected, only
`;
  execFileSync('python3', ['-c', script, source, dir]);
});

test('benchmark inherits a no-pod allowlist unless --pool explicitly overrides it', () => {
  const cli = new URL('./run-benchmark.mjs', import.meta.url).pathname;
  const args = [cli, '--out', tmp(), '--models', 'astra', '--levels', 'L3'];
  const run = extra => execFileSync(process.execPath, [...args, ...extra], { encoding: 'utf8', env: { ...process.env, UNPAINT_POOL_ONLY: 'local,mini' } });
  assert.match(run([]), /UNPAINT_POOL_ONLY=local,mini/);
  assert.match(run(['--pool', 'pod']), /UNPAINT_POOL_ONLY=pod/);
});

test('mini checkout serializes installs and publishes readiness only after checkout and npm succeed', async () => {
  const home = tmp(), bin = path.join(home, 'bin'), commit = 'a'.repeat(40), tree = path.join(home, 'work', 'unpainting-c-aaaaaaaa');
  fs.mkdirSync(bin); fs.mkdirSync(path.join(home, 'work', 'unpainting-04-worker'), { recursive: true });
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh
if [ "$1" = -C ]; then cd "$2" || exit 1; shift 2; fi
case "$1" in
 rev-parse) cat .head ;;
 worktree) mkdir -p "$5" && echo "$6" > "$5/.head" ;;
 checkout) test "$FAIL_CHECKOUT" != 1 && echo "$4" > .head ;;
esac
`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh
mkdir .installing || exit 99
trap 'rmdir .installing' EXIT
printf 'install\\n' >> "$HOME/installs"
mkdir -p node_modules
sleep .1
test "$FAIL_INSTALL" != 1
`, { mode: 0o755 });
  let failInstall = '1', failCheckout = '0';
  const remote = {
    w: { host: 'fake' }, run: async () => ({ code: 0 }),
    script: input => new Promise((resolve, reject) => {
      const child = spawn('zsh', ['-s'], { env: { ...process.env, HOME: home, PATH: `${bin}:/usr/bin:/bin`, FAIL_INSTALL: failInstall, FAIL_CHECKOUT: failCheckout } });
      let out = '', err = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
      child.on('error', reject); child.on('close', code => resolve({ code, out, err })); child.stdin.end(input);
    }),
  };
  await assert.rejects(miniCheckout(remote, commit, '/repo'), WorkerFailure);
  assert.ok(fs.existsSync(path.join(tree, 'node_modules')), 'partial install is present');
  assert.equal(fs.existsSync(path.join(tree, '.ready')), false);
  failInstall = '0'; failCheckout = '1';
  await assert.rejects(miniCheckout(remote, commit, '/repo'), WorkerFailure);
  assert.equal(fs.existsSync(path.join(tree, '.ready')), false);
  failCheckout = '0';
  const made = await Promise.all([miniCheckout(remote, commit, '/repo'), miniCheckout(remote, commit, '/repo')]);
  assert.equal(made[0].tree, tree); assert.equal(made[1].tree, tree);
  assert.ok(fs.existsSync(path.join(tree, '.ready')));
  assert.equal(fs.readFileSync(path.join(home, 'installs'), 'utf8').trim().split('\n').length, 2, 'one failed install and exactly one successful install');
  // Reap a stale setup-lock left behind by a SIGKILLed setup shell (dead pid).
  fs.rmSync(path.join(tree, '.ready'), { force: true });
  fs.mkdirSync(`${tree}.setup-lock`, { recursive: true });
  fs.writeFileSync(`${tree}.setup-lock/pid`, '999999\n');
  const recovered = await miniCheckout(remote, commit, '/repo');
  assert.equal(recovered.tree, tree);
  assert.ok(fs.existsSync(path.join(tree, '.ready')));
});

test('mixed plan previews and benchmark final never deadlock and contended markStarted persists', async () => {
  const dir = tmp(), waiting = path.join(dir, 'waiting');
  fs.mkdirSync(waiting, { recursive: true });
  const only = ['local', 'mini'], mini = { host: 'mini', slots: 2 }, commit = 'b'.repeat(40);
  for (let i = 0; i < 4; i++) {
    fs.writeFileSync(path.join(waiting, `plan-${i}.json`), JSON.stringify({ id: `plan-${i}`, pid: process.pid, since: 100 + i, commit, kind: 'plan', only }));
  }
  fs.writeFileSync(path.join(waiting, 'final-0.json'), JSON.stringify({ id: 'final-0', pid: process.pid, since: 500, commit, kind: 'painting', only }));
  const open = places({ mini, local: 2, commit, kind: 'painting', only });
  assert.equal(open.length, 4);
  const openSlots = new Set(open.map(p => p.slot));
  const couldTake = w => places({ mini, local: 2, commit: w.commit, kind: w.kind, only: w.only }).some(p => openSlots.has(p.slot));
  // Final outranks all 4 older plan previews, so it immediately claims a slot instead of deadlocking.
  assert.equal(waitRank(dir, 'final-0', () => true, couldTake), 0);
  assert.ok(claim(dir, open[0].slot, { job: 'final-0', kind: 'painting', only, worker: open[0].worker.name }, () => true));
  // Contended markStarted retries instead of dropping the started timestamp.
  const locks = path.join(dir, 'claims', `${open[0].slot}.json.locks`);
  const blocker = path.join(locks, `${process.pid}-00000000-0000-0000-0000-000000000000`);
  fs.mkdirSync(blocker, { recursive: true });
  fs.writeFileSync(path.join(blocker, 'ticket.json'), JSON.stringify({ ticket: 0 }));
  setTimeout(() => fs.rmSync(blocker, { recursive: true, force: true }), 25);
  assert.equal(await markStarted(dir, open[0].slot, 'final-0'), true);
  assert.ok(claims(dir, () => true)[open[0].slot].started > 0);
  // Multiple plan previews claim slots in parallel across the pool (never serialized one-at-a-time).
  const dir2 = tmp();
  assert.ok(claim(dir2, 'local-0', { job: 'plan-a', kind: 'plan', only, worker: 'this Mac' }, () => true));
  assert.ok(claim(dir2, 'local-1', { job: 'plan-b', kind: 'plan', only, worker: 'this Mac' }, () => true));
  assert.ok(claim(dir2, 'mini-0', { job: 'plan-c', kind: 'plan', only, worker: 'Mac mini' }, () => true));
});
