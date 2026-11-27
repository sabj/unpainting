import test from 'node:test';
import assert from 'node:assert/strict';
import { create, globals } from 'webgpu';
import { openGpu } from '../../src/media/gpu/stepfull.mjs';
import { GpuFineTransport } from '../../src/media/gpu/fine-transport.mjs';
import { runTwoGridPlan } from './two-grid-plan.mjs';

const PLAN = {
  version: 1, id: 'mini-glaze', paperSeed: 7, paperRGB: [246, 245, 239],
  grid: { w: 48, h: 48, mmPerCell: 0.125 },
  palette: ['ultramarine', 'rose'],
  commands: [
    {
      id: 'diag-blue', operation: 'stroke', role: 'paint',
      brush: { kind: 'flat', widthMm: 2.2, orientation: 'follow' },
      load: { capacityMm3: 18, waterQuantityMm3: 12, concentration: { ultramarine: 0.45 } },
      paths: [[{ x: 0.2, y: 0.25, p: 0.85, rMm: 1.1 }, { x: 0.8, y: 0.65, p: 0.85, rMm: 1.1 }]],
    },
    { id: 'dry-1', operation: 'dry' },
    {
      id: 'diag-rose', operation: 'stroke', role: 'paint',
      brush: { kind: 'round', widthMm: 1.8, orientation: 'follow' },
      load: { capacityMm3: 14, waterQuantityMm3: 9, concentration: { rose: 0.5 } },
      paths: [[{ x: 0.25, y: 0.75, p: 0.8, rMm: 0.9 }, { x: 0.75, y: 0.3, p: 0.8, rMm: 0.9 }]],
    },
    { id: 'dry-2', operation: 'dry' },
  ],
};

test('runTwoGridPlan executes multi-glaze angled brush strokes with CPU/Metal parity', async t => {
  Object.assign(globalThis, globals);
  let device;
  try { ({ device } = await openGpu(create([]))); } catch (err) {
    if (process.env.GPU_REQUIRED === '1') throw err;
    t.skip('no WebGPU adapter'); return;
  }
  const transport = new GpuFineTransport(device);
  try {
    const cpu = await runTwoGridPlan(PLAN, { waterMm: 0.52, N: 4, transport: null });
    const gpu = await runTwoGridPlan(PLAN, { waterMm: 0.52, N: 4, transport });
    assert.equal(gpu.layers, 2);
    assert.equal(gpu.strokes, 2);
    assert.equal(gpu.steps, cpu.steps);
    assert.ok(gpu.totals[0] > 0 && gpu.totals[1] > 0, 'both glazed pigments survive drying');
    for (let k = 0; k < 2; k++) {
      assert.ok(Math.abs(gpu.totals[k] / cpu.totals[k] - 1) < 1e-5, `pigment ${k} total parity`);
    }
    let maxRgb = 0;
    for (let i = 0; i < cpu.rgb.length; i++) maxRgb = Math.max(maxRgb, Math.abs(cpu.rgb[i] - gpu.rgb[i]));
    assert.ok(maxRgb <= 2, `CPU/Metal rendered RGB max channel diff ${maxRgb} <= 2`);
  } finally { transport.destroy(); device.destroy(); }
});
