import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuSheet } from './stepfull.mjs';
import { instrumentDispatches } from './dispatch-profile.mjs';
import { BrushReadbacks } from './brush-readbacks.mjs';
function device() {
  globalThis.GPUBufferUsage = { COPY_SRC: 1, COPY_DST: 2, MAP_READ: 4 };
  globalThis.GPUMapMode = { READ: 1 };
  return {
    queue: { submit() {}, async onSubmittedWorkDone() {} },
    createBuffer({ size }) { const data = new ArrayBuffer(size); return { size, async mapAsync() {}, getMappedRange(offset = 0, bytes = size) { return data.slice(offset, offset + bytes); }, unmap() {}, destroy() {} }; },
    createCommandEncoder() { return { copyBufferToBuffer() {}, finish() { return {}; }, beginComputePass() { return { setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, dispatchWorkgroupsIndirect() {}, end() {} }; } }; },
  };
}
test('production resident stroke+flow batches add zero awaits until a state decision', async () => {
  const d = device(), telemetry = instrumentDispatches(d);
  const h = { device: d, batch: true, SB: 1000, b: { BSTR: {} }, p: { stroke_run: {}, stroke_end: {} }, bg: { stroke_run: {}, stroke_end: {} },
    timestamps: { begin: e => e.beginComputePass() }, batchItems: [], brushSlots: new Map(), epoch: 0,
    stepsInPass(pass, steps) { for (let i = 0; i < steps; i++) pass.dispatchWorkgroups(1); },
    queueStroke: GpuSheet.prototype.queueStroke, brushBuffer: GpuSheet.prototype.brushBuffer, flushStrokes: GpuSheet.prototype.flushStrokes };
  const data = new Float32Array(48); new Uint32Array(data.buffer)[46] = 2;
  for (let i = 0; i < 32; i++) {
    const out = await GpuSheet.prototype.runStroke.call(h, data, { planFloats: 40, nSteps: 1, sp: 8, s0: 40, lift: true, slot: i, seq: i + 1, state: i });
    assert.equal(out, null);
  }
  assert.equal(telemetry.waits, 0, '32 strokes and their flow steps must not map or await the GPU queue');
  assert.equal(telemetry.submissions, 1); assert.equal(telemetry.dispatches, 128);
  const state = await GpuSheet.prototype.brushState.call(h, 31, 32);
  assert.equal(state.length, 40); assert.equal(telemetry.waits, 1);
  assert.deepEqual(telemetry.betweenWaits, { '2/2/128': 1 });
  await assert.rejects(GpuSheet.prototype.brushState.call(h, 31, 999), /stale/);
  assert.equal(telemetry.waits, 1, 'invalid brush state must not issue a readback');
  h.brushReadbacks.destroy();
});
test('double-buffered staging overlaps reads and reuses both slots', async () => {
  const d = device(), pending = []; let allocations = 0;
  const create = d.createBuffer;
  d.createBuffer = options => { allocations++; const b = create(options); b.mapAsync = () => new Promise(resolve => pending.push(resolve)); return b; };
  const pool = new BrushReadbacks(d), a = pool.read({}, 16), b = pool.read({}, 16);
  assert.equal(allocations, 2); assert(pool.slots.every(slot => slot.busy));
  pending.splice(0).forEach(resolve => resolve()); await Promise.all([a, b]);
  const c = pool.read({}, 16); pending.splice(0).forEach(resolve => resolve()); await c;
  assert.equal(allocations, 2); pool.destroy();
});
test('dispatch telemetry includes zero-dispatch transfers and queue waits', async () => {
  const d = device(), p = instrumentDispatches(d);
  d.queue.submit([d.createCommandEncoder().finish()]); await d.queue.onSubmittedWorkDone();
  assert.deepEqual(p.snapshot().betweenWaits, { '1/1/0': 1 }); assert.deepEqual(p.waitKinds, { queue: 1 });
});
