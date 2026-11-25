import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSubjects, pool, gpuPlace, throughput, jobsNow } from './queue.mjs';

const S = (id, variant = null) => ({ id, variant });

test('all stands for every registered subject not already named, where it is written', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(expandSubjects([S('all')], ids).map(s => s.id), ids);
  assert.deepEqual(expandSubjects([S('c'), S('a', 'approved'), S('all')], ids), [S('c'), S('a', 'approved'), S('b'), S('d')]);
  assert.deepEqual(expandSubjects([S('b')], ids), [S('b')]);
  assert.throws(() => expandSubjects([S('all'), S('all')], ids), /once/);
  assert.throws(() => expandSubjects([S('all', 'approved')], ids), /without a variant/);
});

test('the pool runs n at once in the order asked, and a failed job gives its place back', async () => {
  const slot = pool(2), log = []; let now = 0, most = 0;
  const gates = [];
  const job = i => slot(async () => {
    log.push(`start ${i}`); most = Math.max(most, ++now);
    await new Promise(r => gates.push(r));
    now--; if (i === 1) throw new Error('painter died');
    return i;
  });
  const all = [0, 1, 2, 3, 4].map(i => job(i).then(v => v, e => e.message));
  const tick = () => new Promise(r => setImmediate(r));
  await tick(); assert.deepEqual(log, ['start 0', 'start 1']);
  gates.shift()(); gates.shift()(); await tick(); await tick();
  assert.deepEqual(log, ['start 0', 'start 1', 'start 2', 'start 3']);
  while (gates.length || log.length < 5) { gates.shift()?.(); await tick(); }
  gates.shift()?.();
  for (let i = 0; i < 4; i++) { gates.shift()?.(); await tick(); }
  assert.deepEqual(await Promise.all(all), [0, 'painter died', 2, 3, 4]);
  assert.equal(most, 2);
});

test('a GPU place is waited for while others hold them all', async () => {
  const counts = [4, 4, 3], slept = [], waits = [];
  const n = await gpuPlace({ most: 4, running: () => counts.shift(), sleep: async ms => { slept.push(ms); }, everyMs: 5, onWait: c => waits.push(c) });
  assert.equal(n, 3); assert.deepEqual(slept, [5, 5]); assert.deepEqual(waits, [4]);
  assert.equal(await gpuPlace({ most: () => 6, running: () => 5 }), 5);
  assert.equal(jobsNow(2, '6\n'), 6); assert.equal(jobsNow(2, null), 2); assert.equal(jobsNow(2, 'many'), 2); assert.equal(jobsNow(2, '0'), 2);
  assert.equal(await gpuPlace({ most: 2, running: () => 0, sleep: () => { throw new Error('no wait'); } }), 0);
});

test('throughput is finished paintings an hour over the whole wall time', () => {
  const t = throughput([
    { startedMs: 0, endedMs: 1200e3, failure: null }, { startedMs: 0, endedMs: 1800e3, failure: null },
    { startedMs: 1200e3, endedMs: 3600e3, failure: 'died' }, { startedMs: null, endedMs: null, failure: 'never ran' },
  ]);
  assert.deepEqual(t, { paintings: 3, failed: 1, wallSeconds: 3600, meanSeconds: 1800, longestSeconds: 2400, perHour: 2 });
  assert.equal(throughput([]).paintings, 0);
});
