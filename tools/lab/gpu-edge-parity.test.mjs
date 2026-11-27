import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../demos/lab/media/paper.js';
import { createSheet, deposit, step, DEFAULTS } from '../../demos/lab/media/sheet.js';
import { GpuSheet, openDevice } from '../../demos/lab/gpu/gpu-sheet.js';

// Both sides of the lab (its CPU copy of the painter's sheet and its own WebGPU kernels) dry a wet blob with a dry bay
// cut into it: with the edge flow off, and with the pinned-edge feed on (edge-feed.js on the CPU; the same geometry and
// its transport kernels, media/gpu/edge-geometry.js and edge-feed-wgsl.js, on the GPU). Skipped where no WebGPU
// adapter is available.
const PIGMENTS = [{ K: [.35, .49, .66], S: [.06, .025, .014], rho: .05, omega: 1.4, gamma: .15 }];
const N = 96, STEPS = 24;

function blob(mm) {
  const sheet = createSheet(makePaper(N, N, { mmPerCell: mm }), PIGMENTS);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - 48, y - 48), bay = x > 48 && Math.abs(y - 48) < 12;
    if (d < 30 && !bay) deposit(sheet, y * N + x, 0.05, [0.3]);
  }
  return sheet;
}
const worst = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };

// Dawn's instance and adapter must stay reachable or the GC frees them under the running device (the CLI keeps them the same way)
const KEEP = [];
async function device() {
  try { const w = await import('webgpu'); Object.assign(globalThis, w.globals); const gpu = w.create([]); KEEP.push(gpu); const o = await openDevice(gpu); KEEP.push(o.adapter); return o.device; } catch (e) { if (process.env.GPU_REQUIRED === '1') throw e; return null; }
}
async function runGpu(dev, opts, mm) {
  const sheet = blob(mm), g = await GpuSheet.create(dev, PIGMENTS, { ...DEFAULTS, ...opts });
  g.attach(sheet); g.setOptions({ ...DEFAULTS, ...opts, mmPerCell: mm }); await g.advance(STEPS); await g.idle(); await g.download(sheet); g.destroy();
  return sheet;
}

// level paper: the lab's kernels refuse slope
const cases = [['with the edge flow off', { edgeEvap: 0, slope: 0 }], ['with the pinned-edge feed on', { edgeEvap: 0.004, slope: 0 }]];
// 0.1 mm cells: five pore passes and three flow passes a step (flow-time.js)
for (const mm of [0.3, 0.1]) for (const [name, opts] of cases) test(`the lab WebGPU sheet and its CPU sheet dry a blob to the same water ${name}, ${mm} mm cells`, async t => {
  const dev = await device();
  if (!dev) return t.skip('no WebGPU adapter');
  const cpu = blob(mm); for (let i = 0; i < STEPS; i++) step(cpu, { ...DEFAULTS, ...opts, mmPerCell: mm });
  const gpu = await runGpu(dev, opts, mm);
  const match = Math.max(worst(cpu.W, gpu.W), worst(cpu.s, gpu.s)), pig = Math.max(worst(cpu.G[0], gpu.G[0]), worst(cpu.P[0], gpu.P[0]), worst(cpu.D[0], gpu.D[0]));
  t.diagnostic(`max water difference CPU vs GPU ${match}, pigment ${pig}; water left ${cpu.W.reduce((a, b) => a + b, 0).toFixed(3)} on the surface, ${cpu.s.reduce((a, b) => a + b, 0).toFixed(3)} in the pores`);
  assert.ok(match < 2e-3, `GPU and CPU water differ by ${match}`);
  assert.ok(pig < 2e-3, `GPU and CPU pigment differ by ${pig}`);
  if (opts.edgeEvap) assert.ok(worst(cpu.edgePending ?? [0], gpu.edgePending ?? [0]) < 1e-4, 'unmet edge demand');
  dev.destroy();
});


test('the Lab keeps deposited grains still below the connected-film threshold, as the CPU does', async t => {
  const dev = await device(); if (!dev) return t.skip('no WebGPU adapter');
  const opts = { ...DEFAULTS, mmPerCell: .3, edgeEvap: 0, evap: 0, absorb: 0, paperDry: 0,
    capRate: 0, slope: 0, level: 0, invade: 0, spill: 0, diffuse: 0, settle: 0, lift: 0,
    rewetLift: 0, scour: 10, slide: 1, slideCap: 1 };
  const make = () => {
    const s = createSheet(makePaper(48, 40, { seed: 9, mmPerCell: .3 }), PIGMENTS);
    for (let y = 5; y < 35; y++) for (let x = 5; x < 43; x++) {
      const i = y * s.w + x; deposit(s, i, x < 24 ? .025 : .012, [0]);
      s.D[0][i] = .1 + .08 * ((x + y) % 2);
    }
    return s;
  };
  const cpu = make(), gpu = make(), original = cpu.D[0].slice();
  const g = await GpuSheet.create(dev, PIGMENTS, opts);
  try {
    for (let i = 0; i < 8; i++) step(cpu, opts);
    g.attach(gpu); g.setOptions(opts); await g.advance(8); await g.download(gpu);
    assert.equal(worst(cpu.D[0], original), 0, 'the CPU grain cannot roll in disconnected water');
    assert.equal(worst(gpu.D[0], original), 0, 'the GPU grain cannot roll or scour in disconnected water');
    assert.equal(gpu.G[0].reduce((a, b) => a + b, 0), 0, 'flow alone cannot lift the disconnected bed');
    assert.ok(worst(cpu.W, gpu.W) < 2e-6, 'the physical water flow still runs');
  } finally { g.destroy(); dev.destroy(); }
});


test('the Lab exchanges and sorts mixed grains in a connected pool with the CPU rates and donor caps', async t => {
  const dev = await device(); if (!dev) return t.skip('no WebGPU adapter');
  const pigments = [PIGMENTS[0], { ...PIGMENTS[0], rho: .047, omega: .5, gamma: .85, floc: .3 }];
  const opts = { ...DEFAULTS, mmPerCell: .25, edgeEvap: 0, evap: 0, absorb: 0, paperDry: 0,
    capRate: 0, slope: 0, level: 0, invade: 0, spill: 0, slideCap: 1 };
  const make = () => {
    const s = createSheet(makePaper(48, 40, { seed: 9, mmPerCell: .25 }), pigments);
    for (let y = 5; y < 35; y++) for (let x = 5; x < 43; x++) {
      const i = y * s.w + x, water = x < 24 ? .08 : .2;
      deposit(s, i, water, [.8 * water, .2 * water]); s.D[0][i] = .02; s.D[1][i] = .03;
    }
    return s;
  };
  const cpu = make(), gpu = make(), original = cpu.D[1].slice();
  const mass = s => s.G.map((_, k) => s.G[k].reduce((a, b) => a + b, 0) + s.P[k].reduce((a, b) => a + b, 0) + s.D[k].reduce((a, b) => a + b, 0));
  const before = mass(cpu), g = await GpuSheet.create(dev, pigments, opts);
  try {
    for (let i = 0; i < 12; i++) step(cpu, opts);
    g.attach(gpu); g.setOptions(opts); await g.advance(12); await g.download(gpu);
    assert.ok(worst(cpu.D[1], original) > .001, 'the wet grains actually settled or moved');
    assert.ok(worst(cpu.W, gpu.W) < 2e-4);
    for (const key of ['G', 'P', 'D']) for (let k = 0; k < 2; k++) assert.ok(worst(cpu[key][k], gpu[key][k]) < 2e-4, `${key}[${k}]`);
    for (const s of [cpu, gpu]) for (const [k, value] of mass(s).entries()) assert.ok(Math.abs(value / before[k] - 1) < 1e-5);
  } finally { g.destroy(); dev.destroy(); }
});
