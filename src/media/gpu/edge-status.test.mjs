import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuSheet } from './stepfull.mjs';
import { DEFAULTS } from '../sheet.mjs';
import { levelBudget } from './film-level-host.mjs';

globalThis.GPUBufferUsage = { MAP_READ: 1, COPY_DST: 8 };
globalThis.GPUMapMode = { READ: 1 };

function fixture(level = 1) {
  const submissions = [], staging = [], resets = [];
  const b = {
    EFB: { label: 'edge', words: Uint32Array.of(0, 16, 2, 13, 1) },
    LVS: { label: 'level', words: Uint32Array.of(0, 0, 0, 120, 0, 21, 0, 2, 0, 0, 1, 17) },
  };
  const device = {
    createCommandEncoder() {
      const commands = [];
      return {
        commands,
        copyBufferToBuffer(src, from, dst, to, bytes) {
          commands.push([src.label, () => dst.words.set(src.words.subarray(from / 4, (from + bytes) / 4), to / 4)]);
        },
        finish: () => commands,
      };
    },
    queue: {
      submit(batches) {
        for (const commands of batches) {
          submissions.push(commands.map(([name]) => name));
          for (const [, run] of commands) run();
        }
      },
      writeBuffer(dst, offset, values) { resets.push([...values]); dst.words.set(values, offset / 4); },
    },
    createBuffer({ size }) {
      const rb = {
        words: new Uint32Array(size / 4), mapState: 'unmapped',
        async mapAsync() {
          assert.equal(this.mapState, 'unmapped');
          this.mapState = 'pending';
          await Promise.resolve();
          this.mapState = 'unmapped';
          if (device.failMap) throw new Error('map failed');
          this.mapState = 'mapped';
        },
        getMappedRange(offset = 0, length = size) {
          assert.equal(this.mapState, 'mapped');
          return this.words.buffer.slice(offset, offset + length);
        },
        unmap() { this.mapState = 'unmapped'; },
        destroy() { this.destroyed = true; },
      };
      staging.push(rb);
      return rb;
    },
  };
  const sheet = Object.assign(new GpuSheet(), {
    device, b, o: { level }, lvBig: true, lv: levelBudget(), ef: { rounds: 16 },
    flushStrokes() {}, efWriteRounds() {}, readCountLater() {},
    setOptions() { this.ef.stale = true; },
    async efRefresh() { this.ef.stale = false; b.EFB.words[4] = 0; },
    encodeSteps(encoder, count, measure) {
      encoder.commands.push([`step ${count}${measure ? ' measured' : ''}`, () => {
        b.EFB.words[2]++; b.LVS.words[7] += count;
      }]);
    },
  });
  return { sheet, submissions, staging, resets };
}

test('one map per edge poll preserves batch growth, final measurement and levelling budgets', async () => {
  const { sheet, submissions, staging, resets } = fixture();
  await sheet.efSteps(7, true);
  assert.deepEqual(submissions, [
    ['edge', 'level'], ['step 1', 'edge', 'level'], ['step 2', 'edge', 'level'], ['step 4 measured'],
  ]);
  assert.equal(sheet.efForced, 4);
  assert.equal(sheet.ef.rounds, 20);
  assert.equal(sheet.lv.iters, 4); // two completed zero-iteration batches learn the cheaper budget
  assert.equal(sheet.lv.total.iterations, 120);
  assert.equal(sheet.lv.total.solves, 5); // initial 2, then 1 and 2; final batch remains on the device
  assert.equal(sheet.b.LVS.words[7], 4);
  assert.equal(staging.length, 1);
  assert.equal(staging[0].mapState, 'unmapped');
  // First poll resets EFB[3] (13 -> 0) and LVS[3..11]; subsequent polls reset LVS[3..11]
  assert.deepEqual(resets, [[0], ...Array(3).fill(Array(9).fill(0))]);
});

test('levelling off omits its read and reset, and an empty advance submits nothing', async () => {
  const { sheet, submissions, resets } = fixture(0);
  await sheet.efSteps(0);
  assert.deepEqual(submissions, []);
  await sheet.efSteps(2);
  assert.deepEqual(submissions, [['edge'], ['step 1', 'edge'], ['step 1']]);
  assert.deepEqual(resets, [[0]]);
});

test('failed and concurrent polls release staging and keep solver counters for retry', async () => {
  const { sheet, staging, resets } = fixture();
  sheet.device.failMap = true;
  await assert.rejects(sheet.efSteps(1), /map failed/);
  assert.deepEqual(resets, []);
  sheet.device.failMap = false;
  const [a, b] = await Promise.all([sheet.readEdgeStatus(), sheet.readEdgeStatus()]);
  assert.deepEqual(a, b);
  assert.equal(a[5 + 7], 2);
  assert.equal(staging.length, 2);
  assert.equal(staging[0].mapState, 'unmapped');
  assert.ok(staging[1].destroyed);
});

test('readWords can copy behind an existing producer in the same submission', async () => {
  const { sheet, submissions, staging } = fixture();
  const enc = sheet.device.createCommandEncoder();
  enc.commands.push(['pack', () => { sheet.b.EFB.words[3] = 42; }]);
  const out = new Uint32Array(await sheet.readWords('EFB', 4, 12, enc));
  assert.equal(out[0], 42);
  assert.deepEqual(submissions, [['pack', 'edge']]);
  assert.ok(staging[0].destroyed);
  sheet.device.failMap = true;
  await assert.rejects(sheet.readWords('EFB', 4), /map failed/);
  assert.ok(staging[1].destroyed);
});

test('large edge lists gate parallel budgets and finish exceptional rounds in the same step', async () => {
  const { SRC, analyse } = await import('./stepfull.mjs');
  const { edgeFeedWgsl, EF_RMAX } = await import('./edge-feed-wgsl.mjs');
  const info = analyse(SRC);
  assert.ok(!edgeFeedWgsl().includes('@binding(60)'), 'the Lab keeps its existing buffer contract');
  for (const budget of [2, 8, 12, 32]) {
    const calls = [], host = { efOn: true, ef: { count: 5001, rounds: budget },
      p: new Proxy({}, { get: (_, name) => name }), bg: new Proxy({}, { get: (_, name) => name }),
      b: { EF_ARGS: 'round-gate' }, efPipe: (name, round) => `${name}#${round}` };
    const pass = { setPipeline(name) { this.name = name; }, setBindGroup() {},
      dispatchWorkgroups(groups) { calls.push([this.name, groups]); },
      dispatchWorkgroupsIndirect(buffer, offset) { calls.push([this.name, buffer, offset]); } };
    GpuSheet.prototype.efEncode.call(host, pass);
    assert.equal(calls.length, 2 + 2 * EF_RMAX);
    assert.deepEqual(calls.filter(([name]) => name.startsWith('ef_continue')), []);
    assert.equal(calls.filter(([name, groups]) => name.startsWith('ef_prep_parallel#') && groups === 20).length, EF_RMAX);
    assert.ok(calls.every(([, groups]) => typeof groups === 'number'), 'no indirect validation passes');
    assert.equal(calls.filter(([name]) => name.startsWith('ef_round_prep#')).length, 0);
  }
  for (const name of ['ef_prep_parallel', 'ef_apply_parallel']) {
    assert.ok(info.uses(name).filter(b => b !== 0).length <= 10, `${name} fits Metal`);
  }
});


test('production options preserve learned budgets and geometry probes across dt transitions', () => {
  const g = Object.assign(new GpuSheet(), {
    o: { ...DEFAULTS }, paper: { mmPerCell: .25, hollowUnit: 1 }, mmPerCell: .25,
    w: 1024, h: 1024, n: 1024 ** 2, ntiles: 4096, K: 0, act: [], b: { U: {} },
    ef: { stale: false, rounds: 24, recent: [16], batch: 16 }, lv: levelBudget(4096),
    flushStrokes() {}, device: { queue: { writeBuffer() {} } },
  });
  g.setOptions({ dt: .1 }); assert.equal(g.lv.iters, 12); assert.equal(g.ef.rounds, 4);
  g.ef.rounds = 6; g.ef.recent = [3];
  g.lv.iters = 9; g.lv.subs = 10; g.lv.recent = [[6, 7]];
  g.setOptions({ dt: 1 }); g.lv.iters = 20; assert.equal(g.ef.rounds, 12); g.ef.rounds = 18;
  g.setOptions({ dt: 2 }); g.lv.iters = 16; assert.equal(g.ef.rounds, 24); g.ef.rounds = 30;
  g.setOptions({ dt: .1 });
  assert.equal(g.lv.iters, 9); assert.equal(g.lv.subs, 10); assert.deepEqual(g.lv.recent, [[6, 7]]);
  assert.equal(g.ef.rounds, 6); assert.deepEqual(g.ef.recent, [3]);
  g.setOptions({ dt: 1 }); assert.equal(g.lv.iters, 20); assert.equal(g.ef.rounds, 18);
  g.setOptions({ dt: 2 }); assert.equal(g.lv.iters, 16); assert.equal(g.ef.rounds, 30);
  g.chunkDt = 10; g.setOptions({ dt: 10 }); assert.equal(g.ef.batch, 1, 'large dt jumps still probe geometry after one step');
});


test('delayed and mixed edge reads grow the regimes that encoded work without shrinking another regime', async () => {
  const g = Object.assign(new GpuSheet(), {
    ef: { regime: 'fast', rounds: 24, recent: [], count: 5000, regimes: {
      stroke: { rounds: 4, recent: [] }, level: { rounds: 12, recent: [] },
    }, pendingRegimes: new Set(['stroke']) }, b: { EFB: {} },
    device: { queue: { writeBuffer() {} } },
  });
  await g.applyEdgeStatus(Uint32Array.of(0, 32, 0, 7, 0));
  assert.equal(g.ef.regimes.stroke.rounds, 11); assert.equal(g.ef.rounds, 24);
  g.ef.pendingRegimes = new Set(['stroke', 'level']);
  await g.applyEdgeStatus(Uint32Array.of(0, 32, 0, 1, 0));
  assert.deepEqual(g.ef.regimes.stroke.recent, [7]); assert.deepEqual(g.ef.regimes.level.recent, []);
  assert.equal(g.ef.regimes.stroke.rounds, 11); assert.equal(g.ef.regimes.level.rounds, 12);
});
