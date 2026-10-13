import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceHealth, markBroken, brokenReason, assertDeviceHealthy, watchDevice } from './device-health.mjs';
import { GpuLink, attachGpu } from './link.mjs';
import { createSheet, DEFAULTS } from '../sheet.mjs';
import { makePaper } from '../paper.mjs';

// a stand-in for Dawn's device: an event target with a lost promise
function fakeDevice() {
  const device = new EventTarget(); let lose;
  device.lost = new Promise(r => { lose = r; });
  return { device, lose };
}
const uncaptured = (name, message) => { const e = new Event('uncapturederror'); e.error = new ({ [name]: class { constructor(m) { this.message = m; } } })[name](message); return e; };

test('the first uncaptured device error marks the device broken, once, with its kind and message', () => {
  const { device } = fakeDevice(), seen = [];
  watchDevice(device, t => seen.push(t), { fakeAfterOps: 0 });
  device.dispatchEvent(uncaptured('GPUOutOfMemoryError', 'vkAllocateMemory failed with VK_ERROR_OUT_OF_DEVICE_MEMORY\n - While calling [Device].CreateBuffer'));
  device.dispatchEvent(uncaptured('GPUValidationError', '[Invalid CommandBuffer] is invalid due to a previous error.'));
  assert.deepEqual(seen, ['out of memory: vkAllocateMemory failed with VK_ERROR_OUT_OF_DEVICE_MEMORY']);
});

test('a lost device breaks it unless the loss was asked for', async () => {
  const a = fakeDevice(), b = fakeDevice(), seen = [];
  watchDevice(a.device, t => seen.push(['a', t]), { fakeAfterOps: 0 });
  watchDevice(b.device, t => seen.push(['b', t]), { fakeAfterOps: 0 });
  a.lose({ reason: 'unknown', message: 'Device was lost' }); b.lose({ reason: 'destroyed', message: 'device was destroyed' });
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(seen, [['a', 'device lost (unknown) Device was lost']]);
});

test('GPU_FAKE_DEVICE_ERROR reports a synthetic error on the Nth message only', () => {
  const { device } = fakeDevice(), seen = [];
  const w = watchDevice(device, t => seen.push(t), { fakeAfterOps: 3 });
  w.tick(); w.tick(); assert.equal(seen.length, 0);
  w.tick(); w.tick(); assert.equal(seen.length, 1);
  assert.match(seen[0], /synthetic device error on GPU message 3/);
});

test('the shared state keeps the first error and survives the other thread', () => {
  const h = deviceHealth();
  assert.equal(brokenReason(h), '');
  assert.equal(markBroken(h, 'out of memory: first'), true);
  assert.equal(markBroken(h, 'validation: second'), false);
  assert.equal(brokenReason(new Int32Array(h.buffer)), 'out of memory: first');
});

test('assertDeviceHealthy passes a CPU sheet and a healthy GPU sheet, and stops a broken one before the painting', () => {
  assert.doesNotThrow(() => assertDeviceHealthy({}));
  const health = deviceHealth(), sheet = { _gpu: { health } };
  assert.doesNotThrow(() => assertDeviceHealthy(sheet));
  markBroken(health, 'validation: [Invalid CommandBuffer] is invalid due to a previous error.');
  assert.throws(() => assertDeviceHealthy(sheet), e => e.name === 'GpuDeviceError' && /Invalid CommandBuffer/.test(e.message) && /writes no painting/.test(e.message));
});

// GpuLink over a fake worker that answers every op: once the GPU thread marks the device broken, the painter's next
// blocking call and its next posted op both fail, however healthy the op itself looked.
test('a GPU link stops at its next call once the GPU thread reported a device error', () => {
  const n = 4, sheet = { w: 2, h: 2, n, K: 1, layers: [] };
  const ctrl = new Int32Array(new SharedArrayBuffer(64)), health = deviceHealth();
  const worker = { postMessage() { Atomics.store(ctrl, 0, 1); } };
  const link = new GpuLink(worker, { ctrl, err: new Uint8Array(64), health }, sheet);
  assert.doesNotThrow(() => link.call({ op: 'idle' }));
  markBroken(health, 'out of memory: vkAllocateMemory failed with VK_ERROR_OUT_OF_DEVICE_MEMORY');
  assert.throws(() => link.call({ op: 'idle' }), /GPU device error: out of memory/);
  assert.throws(() => link.post({ op: 'step', n: 1 }), /GPU device error/);
});

// The real worker on the real GPU (skipped without one): a synthetic device error injected in the GPU thread reaches the
// painter's next call.
test('a device error in the GPU worker thread reaches the painter thread', () => {
  const prior = process.env.GPU_FAKE_DEVICE_ERROR;
  process.env.GPU_FAKE_DEVICE_ERROR = '3';
  try {
    const sheet = createSheet(makePaper(16, 16, { seed: 1 }), [{ K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 }]);
    const logs = [], info = attachGpu(sheet, { ...DEFAULTS }, { mode: 'auto', log: m => logs.push(m) });
    if (info.backend !== 'gpu') { console.log(`# skipped: ${info.reason}`); return; }
    try {
      assert.throws(() => { for (let i = 0; i < 6; i++) sheet._gpu.call({ op: 'idle' }); }, /GPU device error: synthetic device error on GPU message 3/);
      assert.throws(() => assertDeviceHealthy(sheet), /GPU device error/);
    } finally { sheet._gpu.close(); }
  } finally { if (prior === undefined) delete process.env.GPU_FAKE_DEVICE_ERROR; else process.env.GPU_FAKE_DEVICE_ERROR = prior; }
});

// Dawn itself (skipped without the `webgpu` package or an adapter): an invalid copy is an uncaptured validation error and
// the submit that carries it is dropped, yet mapping the copy's target still succeeds. The watch is what notices.
test('a real Dawn validation error is caught by the watch, though the read-back still succeeds', async () => {
  let webgpu; try { webgpu = await import('webgpu'); } catch { console.log('# skipped: no webgpu package'); return; }
  Object.assign(globalThis, webgpu.globals);
  const adapter = await webgpu.create([]).requestAdapter(); if (!adapter) { console.log('# skipped: no adapter'); return; }
  const device = await adapter.requestDevice(), seen = [];
  watchDevice(device, t => seen.push(t), { fakeAfterOps: 0 });
  const src = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_SRC }), dst = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const e = device.createCommandEncoder(); e.copyBufferToBuffer(src, 0, dst, 0, 64); device.queue.submit([e.finish()]);
  await device.queue.onSubmittedWorkDone(); await dst.mapAsync(GPUMapMode.READ); dst.unmap();
  for (let i = 0; i < 20 && !seen.length; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(seen.length, 1); assert.match(seen[0], /^validation: Copy range/);
  device.destroy();
});
