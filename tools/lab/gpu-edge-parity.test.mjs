import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../demos/lab/media/paper.js';
import { createSheet, deposit, step, DEFAULTS } from '../../demos/lab/media/sheet.js';
import { GpuSheet, openDevice } from '../../demos/lab/gpu/gpu-sheet.js';

// Both sides of the lab (its CPU copy of the painter's sheet and its own WebGPU kernels) dry a wet blob's rim with the
// 0.3.1 local dry-fraction rule. A blob with a dry bay cut into it shows the rule: the rim next to the bay dries, the rim
// facing wet paper does not. Skipped where no WebGPU adapter is available.
const PIGMENTS = [{ K: [.35, .49, .66], S: [.06, .025, .014], rho: .05, omega: 1.4, gamma: .15 }];
const N = 96, STEPS = 24;

function blob() {
  const sheet = createSheet(makePaper(N, N, { mmPerCell: 0.3 }), PIGMENTS);
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
async function runGpu(dev, opts) {
  const sheet = blob(), g = await GpuSheet.create(dev, PIGMENTS, { ...DEFAULTS, ...opts });
  g.attach(sheet); g.setOptions({ ...DEFAULTS, ...opts, mmPerCell: 0.3 }); g.step(STEPS); await g.idle(); await g.download(sheet); g.destroy();
  return sheet;
}

test('the lab WebGPU sheet and its CPU sheet dry a blob rim to the same water, and the edge rule matters', async t => {
  const dev = await device();
  if (!dev) return t.skip('no WebGPU adapter');
  const cpu = blob(); for (let i = 0; i < STEPS; i++) step(cpu, { ...DEFAULTS, mmPerCell: 0.3 });
  const gpu = await runGpu(dev, {}), off = await runGpu(dev, { edgeFlowDepth: 0 });
  const match = worst(cpu.W, gpu.W), withoutRule = worst(cpu.W, off.W);
  t.diagnostic(`max water difference CPU vs GPU ${match}; CPU vs GPU with edgeFlowDepth 0: ${withoutRule}`);
  assert.ok(match < 2e-3, `GPU and CPU water differ by ${match}`);
  assert.ok(withoutRule > match * 3, `the edge-depth term must change the result (${withoutRule} vs ${match})`);
  dev.destroy();
});
