import test from 'node:test';
import assert from 'node:assert/strict';
import { dryingPressure } from '../drying-pressure.mjs';
import { GpuDryingPressure } from './drying-pressure-gpu.mjs';
import { dryingPressureWgsl } from './drying-pressure-wgsl.mjs';
import { GpuSheet, openGpu } from './stepfull.mjs';
import { createSheet, deposit, step, DEFAULTS } from '../sheet.mjs';
import { makePaper } from '../paper.mjs';

let device;
async function gpu(t) {
  if (device) return device;
  try {
    const impl = await import('webgpu'); Object.assign(globalThis, impl.globals);
    ({ device } = await openGpu(impl.create([]))); return device;
  } catch (e) { if (process.env.GPU_REQUIRED === '1') throw e; t.skip(e.message); }
}
test.after(() => device?.destroy());

function problem(w, h, wet) {
  const index = new Uint8Array(w * h), sink = new Float64Array(w * h), cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!wet(x, y)) continue;
    index[i] = 1; cells.push(i);
    sink[i] = .004 * (1 + Math.sin(.07 * x) * Math.cos(.12 * y)) + .02 * (x % 31 === 0);
  }
  return { index, sink, order: Int32Array.from(cells), width: w };
}
const output = n => [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
function worst(a, b) { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; }

test('pressure WGSL stays browser-safe and within ten storage bindings', () => {
  assert.equal((dryingPressureWgsl.match(/var<storage/g) ?? []).length, 9);
});

for (const [name, w, h, wet] of [
  ['small CPU solve', 24, 24, (x, y) => x > 1 && y > 1],
  ['one ragged puddle with holes and narrow necks', 128, 128, (x, y) => x > 2 && x < 125 && y > 3 && y < 124 && !(x > 28 && x < 52 && y > 35 && y < 61) && (x !== 64 || y > 60 && y < 66)],
  ['two corner-touching components', 144, 144, (x, y) => x < 72 && y < 72 || x >= 72 && y >= 72],
  ['six disconnected ragged puddles at 512 square', 512, 512, (x, y) => x % 170 > 5 && x % 170 < 163 && y % 256 > 7 && y % 256 < 245 && !(x % 53 < 5 && y % 71 < 9)],
]) {
  test(name + ' matches CPU face flux and original Neumann equations', { timeout: 25000 }, async t => {
    const d = await gpu(t); if (!d) return;
    const { index, sink, order, width } = problem(w, h, wet), cpu = output(w * h), actual = output(w * h);
    // Warm starts exercise subtraction of the component's gauge as well as zero-start refinement.
    for (const i of order) cpu[2][i] = actual[2][i] = .0001 * Math.sin(i);
    const expected = dryingPressure(order, order.length, index, width, sink, ...cpu);
    d.pushErrorScope('validation');
    const runner = new GpuDryingPressure(d);
    try {
      const result = await runner.solve(order, order.length, index, width, sink, ...actual);
      assert.equal(await d.popErrorScope(), null);
      assert.equal(result.components, expected.components);
      assert.ok(result.relativeResidual <= 1e-6, JSON.stringify(result));
      const error = Math.max(worst(cpu[0], actual[0]), worst(cpu[1], actual[1]));
      assert.ok(error < 1e-5, `face flux error ${error}`);
      if (order.length >= 4096) {
        assert.equal(result.backend, 'gpu', JSON.stringify(result));
        const H = runner.hierarchy;
        if (H.structured) {
          assert.equal(H.mask.byteLength, 4 * H.fine);
          assert.equal(H.graph, undefined, 'dense multi-component washes upload no host graph');
        } else {
          assert.equal(H.graph.byteLength, H.total * 64);
          for (const L of H.levels) for (let q = 0; q < L.n; q++) for (let e = 0; e < 4; e++) {
            const j = L.nb[4 * q + e]; if (j < 0) continue;
            assert.equal(Math.abs(L.X[q] - L.X[j]) + Math.abs(L.Y[q] - L.Y[j]), 1, 'Galerkin edges remain cardinal');
          }
        }
      }
      else assert.equal(result.reason, 'small');
      t.diagnostic(JSON.stringify({ cells: order.length, error, ...result }));
    } finally { runner.destroy(); }
  });
}

test('repeated zero and uniform sinks retain each component gauge without stale GPU state', async t => {
  const d = await gpu(t); if (!d) return;
  const { index, sink, order, width } = problem(80, 80, () => true), actual = output(6400), runner = new GpuDryingPressure(d);
  try {
    for (const value of [.07, 0, .02]) {
      sink.fill(value); actual[2].fill(3);
      const result = await runner.solve(order, order.length, index, width, sink, ...actual);
      assert.ok(result.relativeResidual < 1e-6);
      assert.ok(Math.max(...actual[0].map(Math.abs), ...actual[1].map(Math.abs)) < 1e-10);
    }
  } finally { runner.destroy(); }
});

test('a one-cell serpentine channel falls back cleanly when GPU refinement misses tolerance', { timeout: 25000 }, async t => {
  const d = await gpu(t); if (!d) return;
  const { index, sink, order, width } = problem(128, 80, (x, y) => y % 2 === 0 || x === ((y >> 1) % 2 ? 0 : 127));
  const expected = output(index.length), actual = output(index.length), runner = new GpuDryingPressure(d);
  dryingPressure(order, order.length, index, width, sink, ...expected);
  try {
    const result = await runner.solve(order, order.length, index, width, sink, ...actual);
    assert.equal(result.backend, 'cpu', JSON.stringify(result));
    assert.equal(result.fallback, true); assert.equal(result.reason, 'refinement tolerance');
    assert.ok(result.relativeResidual <= 1e-6, JSON.stringify(result));
    assert.ok(Math.max(worst(actual[0], expected[0]), worst(actual[1], expected[1])) < 1e-5);
    // The CPU continues from the GPU correction, including the same gauge.
    const warm = output(index.length);
    for (let q = 0; q < order.length; q++) warm[2][order[q]] = runner.foot.solution[q];
    const continued = dryingPressure(order, order.length, index, width, sink, ...warm);
    assert.equal(result.iterations, continued.iterations);
    assert.equal(result.relativeResidual, continued.relativeResidual);
    assert.equal(worst(actual[0], warm[0]), 0); assert.equal(worst(actual[1], warm[1]), 0);
    t.diagnostic(JSON.stringify(result));
  } finally { runner.destroy(); }
});

test('40 mm wash smoke uses GPU distance and pressure and retains CPU water and pigment', { timeout: 25000 }, async t => {
  const d = await gpu(t); if (!d) return;
  const pigments = [{ K: [.46, .29, .05], S: [.02, .02, .02], rho: .047, omega: .5, gamma: .85, floc: .3 }];
  const make = () => {
    const s = createSheet(makePaper(160, 160, { seed: 9, mmPerCell: .25, cockle: { rmsMm: 0 } }), pigments);
    for (let y = 5; y < 155; y++) for (let x = 5; x < 155; x++) {
      if (x > 60 && x < 85 && y > 45 && y < 95 || x < 20 && y % 23 < 7) continue;
      deposit(s, y * s.w + x, .12, [.054]);
    }
    return s;
  };
  const cpu = make(), actual = make(), o = { ...DEFAULTS, mmPerCell: .25, edgeEvap: .004, dt: .1, slide: 0 };
  const runner = await GpuSheet.create(d, actual, o);
  d.pushErrorScope('validation');
  try {
    await runner.advance(2); await runner.download(actual);
    step(cpu, o); step(cpu, o);
    assert.ok(runner.gpuDistanceBoxes > 0, 'GPU quadrature path executed');
    assert.equal(runner.ef.pressureSolve.backend, 'gpu', JSON.stringify(runner.ef.pressureSolve));
    const water = Math.max(worst(cpu.W, actual.W), worst(cpu.s, actual.s));
    const pigment = Math.max(worst(cpu.G[0], actual.G[0]), worst(cpu.P[0], actual.P[0]), worst(cpu.D[0], actual.D[0]));
    assert.ok(water < 1e-4, `water ${water}`); assert.ok(pigment < 1e-4, `pigment ${pigment}`);
    assert.equal(await d.popErrorScope(), null);
    t.diagnostic(JSON.stringify({ water, pigment, pressure: runner.ef.pressureSolve }));
  } finally { runner.destroy(); }
});

test('pressure reuses buffers and hierarchy, then invalidates topology for reordered and resized footprints', async t => {
  const d = await gpu(t); if (!d) return;
  const runner = new GpuDryingPressure(d);
  d.pushErrorScope('validation');
  try {
    const base = problem(96, 80, () => true);
    let previous;
    for (const mode of ['initial', 'repeat', 'reorder', 'resize', 'sparse components', 'dense again']) {
      const p = mode === 'resize' ? problem(112, 96, () => true) : mode === 'sparse components'
        ? problem(2048, 128, x => x % 128 < 4) : base;
      if (mode === 'repeat') for (const i of p.order) p.sink[i] += .001 * Math.cos(i);
      if (mode === 'reorder') p.order.reverse(); // graph construction must not require sheet order
      const actual = output(p.index.length), expected = output(p.index.length);
      const reference = dryingPressure(p.order, p.order.length, p.index, p.width, p.sink, ...expected);
      const result = await runner.solve(p.order, p.order.length, p.index, p.width, p.sink, ...actual);
      assert.equal(result.backend, 'gpu', JSON.stringify(result));
      assert.equal(result.fallback, false);
      assert.equal(result.components, reference.components);
      assert.ok(result.relativeResidual <= 5e-7, JSON.stringify(result));
      const error = Math.max(worst(actual[0], expected[0]), worst(actual[1], expected[1]));
      assert.ok(error < 1e-6, `${mode}: flux error ${error}`);
      if (mode === 'repeat') {
        assert.equal(runner.hierarchy, previous.hierarchy);
        assert.equal(runner.bindings, previous.bindings);
        for (const [name, buffer] of Object.entries(previous.buffers)) assert.equal(runner.buffers[name], buffer, name);
      } else if (previous) assert.notEqual(runner.hierarchy, previous.hierarchy);
      previous = { hierarchy: runner.hierarchy, bindings: runner.bindings, buffers: { ...runner.buffers } };
    }
    assert.equal(await d.popErrorScope(), null);
  } finally { runner.destroy(); }
});

test('odd, cropped single-component boxes upload only a mask and build compact GPU levels', async t => {
  const d = await gpu(t); if (!d) return;
  const runner = new GpuDryingPressure(d);
  d.pushErrorScope('validation');
  try {
    for (const [w, h] of [[137, 109], [149, 121], [137, 109]]) {
      const p = problem(w, h, (x, y) => x >= 7 && x < w - 9 && y >= 5 && y < h - 7 && !(x > 40 && x < 53 && y > 30 && y < 41));
      p.order.reverse();
      const actual = output(w * h), expected = output(w * h);
      dryingPressure(p.order, p.order.length, p.index, w, p.sink, ...expected);
      const result = await runner.solve(p.order, p.order.length, p.index, w, p.sink, ...actual);
      assert.equal(result.backend, 'gpu'); assert.equal(result.fallback, false);
      assert.ok(result.relativeResidual <= 1e-6);
      assert.ok(Math.max(worst(actual[0], expected[0]), worst(actual[1], expected[1])) < 1e-5);
      const H = runner.hierarchy;
      assert.equal(H.structured, true);
      assert.equal(H.fine, (w - 16) * (h - 12));
      assert.equal(H.mask.byteLength, 4 * H.fine);
      assert.ok(H.levels.at(-1).n <= 16);
      assert.ok(runner.buffers.graph.size <= Math.ceil(H.total * 16 * 1.25 / 4) * 4);
      assert.equal(H.graph, undefined, 'no host node graph');
      assert.equal(H.inverse, undefined, 'no host Cholesky inverse');
    }
    assert.equal(await d.popErrorScope(), null);
  } finally { runner.destroy(); }
});

test('full-size holed wash with satellites refines on GPU and preserves independent component equations', { timeout: 60000 }, async t => {
  const d = await gpu(t); if (!d) return;
  const w = 1086, h = 1448;
  const p = problem(w, h, (x, y) => {
    const main = ((x - 543) / 440) ** 2 + ((y - 724) / 620) ** 2 < 1;
    if (!main) return x < 80 && y % 140 < 5 && x % 25 < 5;
    return !(x > 360 && x < 420 && y > 450 && y < 650)
      && !(x > 630 && x < 710 && y > 850 && y < 1040)
      && (x !== 543 || y > 718 && y < 727);
  });
  // Contact-line evaporation: a demanding low-frequency pressure field, with
  // independent tiny puddles spread over the same source-size bounding box.
  for (const i of p.order) {
    const x = i % w, y = (i / w) | 0;
    p.sink[i] = x < 80 ? .002 * (1 + x % 5) : .004 * (x < 200 || y < 200 || y > 1250);
  }
  const runner = new GpuDryingPressure(d), actual = output(w * h), expected = output(w * h);
  dryingPressure(p.order, p.order.length, p.index, w, p.sink, ...expected);
  try {
    d.pushErrorScope('validation');
    const result = await runner.solve(p.order, p.order.length, p.index, w, p.sink, ...actual);
    assert.equal(await d.popErrorScope(), null);
    assert.equal(result.backend, 'gpu', JSON.stringify(result));
    assert.equal(result.fallback, false);
    assert.equal(result.structured, true);
    assert.ok(result.components > 20);
    assert.ok(result.relativeResidual <= 5e-7, JSON.stringify(result));
    assert.equal(result.passResiduals.length, result.passes);
    assert.ok(result.iterations > 0 && result.iterations <= result.passes * 32);
    const error = Math.max(worst(actual[0], expected[0]), worst(actual[1], expected[1]));
    assert.ok(error < 1e-5, `face flux error ${error}`);
    t.diagnostic(JSON.stringify({ cells: p.order.length, error, ...result }));
  } finally { runner.destroy(); }
});

function unequalPuddles() {
  const p = problem(67, 64, x => x < 64 || x >= 65);
  for (const i of p.order) p.sink[i] = i % 67 < 64 ? 1 : 0;
  p.sink[65] = 2e-5;
  return p;
}
function mockDevice(limit = 256 * 1024) {
  return {
    limits: { maxBufferSize: 1 << 28, maxStorageBufferBindingSize: limit, maxComputeWorkgroupsPerDimension: 65535 },
    createShaderModule: () => ({}), createComputePipeline: () => ({}),
    createBuffer() { assert.fail('device-limit fallback must precede every allocation'); },
    queue: { writeBuffer() { assert.fail('device-limit fallback must precede every upload'); } },
  };
}

test('unequal components cannot accept zero flux before dispatch (host regression)', async () => {
  const p = unequalPuddles(), runner = new GpuDryingPressure(mockDevice(1));
  const result = await runner.solve(p.order, p.order.length, p.index, p.width, p.sink, ...output(p.index.length));
  assert.equal(result.reason, 'device limits', 'the small nonuniform component must request a solve');
  assert.ok(runner.foot.compNorm[1] === 0);
  assert.ok(runner.foot.compNorm[2] > 0);
});

test('64x64 uniform puddle cannot hide a disconnected 2x64 small sink', async t => {
  const d = await gpu(t); if (!d) return;
  const p = unequalPuddles(), runner = new GpuDryingPressure(d), expected = output(p.index.length), actual = output(p.index.length);
  dryingPressure(p.order, p.order.length, p.index, p.width, p.sink, ...expected);
  try {
    const result = await runner.solve(p.order, p.order.length, p.index, p.width, p.sink, ...actual);
    assert.equal(result.backend, 'gpu', JSON.stringify(result));
    assert.equal(result.fallback, false);
    assert.ok(result.passes > 0);
    assert.ok(result.relativeResidual <= 1e-6, JSON.stringify(result));
    assert.ok(Math.abs(expected[0][65] - -7.320508075689842e-6) < 1e-12);
    assert.ok(Math.abs(actual[0][65] - expected[0][65]) < 1e-8, `small component flux ${actual[0][65]}`);
  } finally { runner.destroy(); }
});

test('256 disconnected 4x4 components reject a 512 KiB inverse at a 256 KiB binding limit before allocation/upload', async () => {
  const p = problem(2048, 128, (x, y) => x % 128 < 4 && y % 8 < 4);
  const runner = new GpuDryingPressure(mockDevice()), actual = output(p.index.length);
  const result = await runner.solve(p.order, p.order.length, p.index, p.width, p.sink, ...actual);
  assert.equal(runner.foot.components, 256);
  assert.equal(runner.hierarchy.graph.byteLength, 262144);
  assert.equal(runner.hierarchy.inverse.byteLength, 524288);
  assert.equal(result.backend, 'cpu'); assert.equal(result.reason, 'device limits'); assert.equal(result.fallback, true);
});

test('storage rejects truncation and permits readback beyond the storage binding limit', async () => {
  const { globals } = await import('webgpu'); Object.assign(globalThis, globals);
  const sizes = [], d = mockDevice(256), runner = new GpuDryingPressure(d);
  d.createBuffer = ({ size }) => { sizes.push(size); return { size }; };
  assert.throws(() => runner.storage('inverse', 512, GPUBufferUsage.STORAGE), /exceeds device limit/);
  assert.equal(runner.storage('x', 240, GPUBufferUsage.STORAGE).size, 256);
  assert.ok(runner.storage('read', 512, GPUBufferUsage.MAP_READ).size >= 512);
  assert.deepEqual(sizes, [256, 640]);
});
