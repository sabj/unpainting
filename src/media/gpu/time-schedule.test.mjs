import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuSheet, UF } from './stepfull.mjs';
import { DEFAULTS } from '../sheet.mjs';
import { flowTime, poreTime } from '../flow-time.mjs';

// Exercise the production uniform writer and dispatch scheduler without a device.
function host(dt, mm) {
  const events = []; let uniforms;
  const g = Object.assign(Object.create(GpuSheet.prototype), {
    o: { ...DEFAULTS, edgeEvap: 0, dt }, paper: { mmPerCell: mm, hollowUnit: 1 },
    w: 32, h: 32, n: 1024, tw: 2, th: 2, ntiles: 4, cap: 4, K: 1,
    workers: 2, act: [0], pigments: [], b: { U: {} }, bg: {},
    p: new Proxy({}, { get: (_, name) => name }), flushStrokes() {},
    device: { queue: { writeBuffer(_b, _off, data) { uniforms = new Float32Array(data.slice(0)); } } },
  });
  g.setOptions({});
  const pass = { setPipeline(name) { events.push(name); }, setBindGroup() {}, dispatchWorkgroups() {} };
  return { g, events, pass, value: name => uniforms[UF.findIndex(([k]) => k === name)] };
}

test('GPU uniforms preserve integrated flow and pore exposure through long-step subdivision', () => {
  for (const mm of [.1, .25, .3]) for (const dt of [.1, 2, 6, 14]) {
    const { g, value } = host(dt, mm), chunks = Math.ceil(dt / 2);
    const sub = { ...g.o, dt: dt / chunks };
    const flow = flowTime(g, sub), pore = poreTime(g, sub);
    assert.equal(g.timeChunks, chunks);
    assert.deepEqual(g.flowTime, flow); assert.deepEqual(g.poreTime, pore);
    assert.ok(Math.abs(value('dt') * chunks - dt) < 1e-6);
    const expected = dt * .25 ** 2 / (2 * mm ** 2) * g.o.flowIters * g.o.flow;
    assert.ok(Math.abs(value('flow') * flow.iters * chunks - expected) < 1e-6);
    assert.ok(Math.abs(value('capStep') * pore.iters * chunks - g.o.capRate * dt * 10 * (.25 / mm) ** 2) < 1e-5);
    assert.ok(value('capStep') <= 2 / 3 + 1e-7);
    assert.ok(value('poreHalo') * 16 >= pore.iters);
    assert.equal(value('poreReach'), Math.max(2, pore.iters));
  }
});

test('pore subcycles publish intermediate fields, with wet-front events only once per kinetic chunk', () => {
  const previous = process.env.GPU_STEP;
  try {
    for (const mode of ['old', 'fused']) {
      process.env.GPU_STEP = mode;
      const { g, pass, events } = host(14, .1);
      g.stepsInPass(pass, 1);
      const count = name => events.filter(e => e === name).length;
      assert.equal(count('cap_commit'), g.timeChunks * (g.poreTime.iters - 1));
      assert.equal(count(mode === 'old' ? 'cap_s' : 'cap_sp'), g.timeChunks * g.poreTime.iters);
      assert.equal(count('p5a'), g.timeChunks);
      assert.equal(count('faces') + count('faces_pflux') + count('faces_wsc'), g.timeChunks * g.flowTime.iters);
    }
  } finally {
    if (previous === undefined) delete process.env.GPU_STEP; else process.env.GPU_STEP = previous;
  }
});

test('zero elapsed time dispatches no physics; invalid elapsed time fails before upload', () => {
  const { g, pass, events } = host(0, .1);
  g.stepsInPass(pass, 10); assert.deepEqual(events, []);
  for (const dt of [-1, Infinity, NaN]) assert.throws(() => g.setOptions({ dt }), /dt must be finite and nonnegative/);
});
