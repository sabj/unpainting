import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { orderSessions, waveCost, mayStart, isIdle, poolUse, saysWaiting } from './wave.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('sessions start level by level, the models in turn', () => {
  const s = orderSessions({ models: ['a', 'b'], pictures: () => ['p', 'q'], levels: ['L1', 'L2'] });
  assert.deepEqual(s.slice(0, 3).map(x => x.folder), ['a-p-L1', 'b-p-L1', 'a-q-L1']);
  assert.equal(s.length, 8);
});

test('a wave reckons a running session at its model\'s average, and an ended one at what it cost', () => {
  const c = waveCost([{ author: 'a', status: 'done', started: 1, costUSD: 2 }, { author: 'a', status: 'running', started: 1 }, { author: 'b', status: 'running', started: 1 }, { author: 'b', status: 'pending' }], { b: 5 });
  assert.equal(c.spent, 2); assert.equal(c.reckoned, 7); assert.equal(c.next('a'), 2);
});

test('no start at the concurrency, below the disk floor, or past the cap', () => {
  const cost = { total: 85, next: () => 1 }, base = { atWork: 5, concurrency: 6, freeGB: 50, diskFloorGB: 25, cost, capUSD: 90, author: 'a' };
  assert.equal(mayStart(base).ok, true);
  assert.equal(mayStart({ ...base, atWork: 6 }).ok, false);
  assert.match(mayStart({ ...base, freeGB: 10 }).why, /disk/);
  const capped = mayStart({ ...base, cost: { total: 89.5, next: () => 1 } });
  assert.equal(capped.capped, true);
});

test('idle only when nothing was written for the limit and no render is waited for', () => {
  assert.equal(isIdle({ lastWriteMs: 0, nowMs: 21 * 60000, idleMinutes: 20, rendering: false }), true);
  assert.equal(isIdle({ lastWriteMs: 0, nowMs: 21 * 60000, idleMinutes: 20, rendering: true }), false);
  assert.equal(isIdle({ lastWriteMs: 0, nowMs: 19 * 60000, idleMinutes: 20, rendering: false }), false);
});

test('a session waiting for its final is told apart from one waiting for a look', () => {
  const pool = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-pool-'));
  fs.mkdirSync(path.join(pool, 'waiting')); fs.mkdirSync(path.join(pool, 'claims'));
  fs.writeFileSync(path.join(pool, 'waiting', 'x.json'), JSON.stringify({ pid: 11, kind: 'painting' }));
  fs.writeFileSync(path.join(pool, 'claims', 'local-0.json'), JSON.stringify({ pid: 12, kind: 'look' }));
  const u = poolUse(pool);
  assert.deepEqual([...u.final], [11]); assert.deepEqual([...u.rendering].sort(), [11, 12]);
  fs.rmSync(pool, { recursive: true });
});

test('the pod batching rule (pods_policy_test.py)', () => {
  const r = spawnSync('python3', ['-B', 'pods_policy_test.py'], { cwd: HERE, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /OK/);
});

test('the pods daemon with the batching rule, on a fake queue: rents nothing for five finals, two pods for six', () => {
  const pool = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-pool-')), w = path.join(pool, 'waiting'); fs.mkdirSync(w);
  const wait = n => { for (let i = 0; i < n; i++) fs.writeFileSync(path.join(w, `f${i}.json`), JSON.stringify({ id: `f${i}`, pid: process.pid, since: Date.now() - 60000, commit: 'abc12345', kind: 'painting', only: ['local', 'pod'] })); };
  fs.writeFileSync(path.join(w, 'look.json'), JSON.stringify({ id: 'look', pid: process.pid, since: Date.now() - 600000, commit: 'abc12345', kind: 'look' }));
  const dry = () => spawnSync('python3', ['-B', path.join(HERE, 'pods-batched.py'), pool, '--dry-run'], { encoding: 'utf8' });
  wait(5); let r = dry();
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /finals waiting 5/); assert.match(r.stdout, /would rent 0 pod/);
  wait(6); r = dry();
  assert.match(r.stdout, /finals waiting 6/); assert.match(r.stdout, /would rent 2 pod/);
  assert.equal(fs.existsSync(path.join(pool, 'pods.json')), false, 'a dry run writes nothing');
  fs.rmSync(pool, { recursive: true });
});

test('a session whose log ends on a waiting line is not idle', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-log-')), f = path.join(d, 's.log');
  fs.writeFileSync(f, 'round 0: script\n[x] look 2: waiting, 2 GPU paintings are running and --jobs is 2\n');
  assert.equal(saysWaiting(f), true);
  fs.appendFileSync(f, '[x] look 2 painted\n'); assert.equal(saysWaiting(f), false);
  assert.equal(saysWaiting(path.join(d, 'none.log')), false);
  fs.rmSync(d, { recursive: true });
});
