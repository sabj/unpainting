import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuSheet } from './stepfull.mjs';
import { levelBudget } from './film-level-host.mjs';

globalThis.GPUBufferUsage = { MAP_READ: 1, COPY_DST: 8 };
globalThis.GPUMapMode = { READ: 1 };

function fixture(level = 1) {
  const submissions = [], staging = [], resets = [];
  const b = {
    EFB: { label: 'edge', words: Uint32Array.of(0, 16, 2, 13, 1) },
    LVS: { label: 'level', words: Uint32Array.of(0, 0, 0, 120, 1, 21, 0, 2, 0, 0, 0, 17) },
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
  assert.equal(sheet.ef.rounds, 32);
  assert.equal(sheet.lv.iters, 256);
  assert.equal(sheet.lv.total.solves, 5); // initial 2, then 1 and 2; final batch remains on the device
  assert.equal(sheet.b.LVS.words[7], 4);
  assert.equal(staging.length, 1);
  assert.equal(staging[0].mapState, 'unmapped');
  assert.deepEqual(resets, Array(3).fill(Array(9).fill(0)));
});

test('levelling off omits its read and reset, and an empty advance submits nothing', async () => {
  const { sheet, submissions, resets } = fixture(0);
  await sheet.efSteps(0);
  assert.deepEqual(submissions, []);
  await sheet.efSteps(2);
  assert.deepEqual(submissions, [['edge'], ['step 1', 'edge'], ['step 1']]);
  assert.deepEqual(resets, []);
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
