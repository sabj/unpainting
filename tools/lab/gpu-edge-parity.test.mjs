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
  try { const w = await import('webgpu'); Object.assign(globalThis, w.globals); const gpu = w.create([]); KEEP.push(gpu); const o = await openDevice(gpu); KEEP.push(o.adapter); return o.device; } catch { return null; }
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
