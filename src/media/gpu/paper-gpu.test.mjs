import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuxGpuDevice, destroyAuxGpuDevice } from './aux-device.mjs';
import { paperReliefGpu, makePaperGpu, finishReliefAndGrainGpu, fineDeltaZFromHeightGpu } from './paper-gpu.mjs';
import { paperRelief, HEIGHT_SPAN_UM } from '../paper-relief.mjs';
import { makePaper } from '../paper.mjs';
import { grainField, gaussianField, grainUnit } from '../grain-field.mjs';

test('paper-gpu paperReliefGpu, makePaperGpu, and finishReliefAndGrainGpu match CPU tightly with zero Dawn warnings', async t => {
  const ctx = await getAuxGpuDevice(process.env.GPU_REQUIRED === '1' ? 'on' : 'auto');
  if (!ctx) { t.skip('no WebGPU adapter'); return; }
  const { device } = ctx;

  const w = 128, h = 96, mm = 0.25;
  const opts = { mmPerCell: mm, seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, coldPress: { mmPerCell: mm } };

  // 1. paperReliefGpu parity
  const rCpu = paperRelief(w, h, mm, { seed: 9, relief: 'cold' });
  const rGpu = await paperReliefGpu(device, w, h, mm, { seed: 9, relief: 'cold' });
  assert.equal(rGpu.rmsUm, rCpu.rmsUm);
  assert.equal(rGpu.hollowRmsUm, rCpu.hollowRmsUm);
  let maxZ = 0, maxH = 0;
  for (let i = 0; i < w * h; i++) {
    maxZ = Math.max(maxZ, Math.abs(rGpu.zUm[i] - rCpu.zUm[i]));
    maxH = Math.max(maxH, Math.abs(rGpu.height[i] - rCpu.height[i]));
  }
  assert.ok(maxZ < 1e-3, `paperRelief zUm max diff=${maxZ}`);
  assert.ok(maxH < 1e-5, `paperRelief height max diff=${maxH}`);

  // 2. makePaperGpu parity across EVERY field
  const pCpu = makePaper(w, h, opts);
  const pGpu = await makePaperGpu(device, w, h, opts);
  for (const field of ['height', 'grainH', 'capacity', 'valley', 'surface', 'proud', 'tooth', 'fdx', 'fdy', 'grain', 'hollow', 'throat', 'zUm']) {
    const a = pCpu[field], b = pGpu[field];
    assert.ok(a && b && a.length === b.length, `field ${field} length mismatch`);
    let maxD = 0;
    for (let i = 0; i < a.length; i++) maxD = Math.max(maxD, Math.abs(a[i] - b[i]));
    const tol = field === 'zUm' ? 1e-3 : field === 'fdx' || field === 'fdy' ? 1e-4 : 1e-4;
    assert.ok(maxD < tol, `makePaper ${field} max diff=${maxD} >= ${tol}`);
  }
  for (const scalar of ['toothLo', 'toothSpan', 'relief', 'subRelief', 'hollowUnit', 'reliefUm', 'mmPerCell']) {
    assert.ok(Math.abs(pGpu[scalar] - pCpu[scalar]) < 1e-5, `makePaper ${scalar}: gpu=${pGpu[scalar]} cpu=${pCpu[scalar]}`);
  }

  // Non-physical surfaces must retain their fibre entry heads too.
  for (const npOpts of [{ seed: 9 }, { seed: 9, scale: 2, toothScale: 0.5 }]) {
    const cpu = makePaper(24, 16, npOpts), gpu = await makePaperGpu(device, 24, 16, npOpts);
    assert.ok(gpu.throat instanceof Float32Array);
    let maxD = 0;
    for (let i = 0; i < cpu.throat.length; i++) maxD = Math.max(maxD, Math.abs(cpu.throat[i] - gpu.throat[i]));
    assert.ok(maxD < 5e-4, `non-physical throat max diff=${maxD}`);
  }

  // 3. finishReliefAndGrainGpu parity
  const N = 2, FW = w * N, FH = h * N;
  const fg = await finishReliefAndGrainGpu(device, FW, FH, mm / N, N, { seed: 9, relief: 'cold' });
  const rfFine = paperRelief(FW, FH, mm / N, { seed: 9, relief: 'cold' });
  const zCpu = grainField(rfFine.zUm, FW, FH, mm / N);
  const zrefCpu = gaussianField(zCpu, FW, FH, N);
  const unit = grainUnit({ seed: 9, relief: 'cold' }) * HEIGHT_SPAN_UM;
  let maxDZ = 0;
  for (let i = 0; i < FW * FH; i++) {
    maxDZ = Math.max(maxDZ, Math.abs(fg.deltaZ[i] - (zrefCpu[i] - zCpu[i]) / unit));
  }
  assert.ok(maxDZ < 1e-4, `finishReliefAndGrainGpu deltaZ max diff=${maxDZ}`);

  // 4. fineDeltaZFromHeightGpu smoke check (non-physical papers)
  const dzNp = await fineDeltaZFromHeightGpu(device, pCpu.height, w, h, N, pCpu.hollowUnit);
  assert.equal(dzNp.length, FW * FH);
  assert.ok(dzNp.every(Number.isFinite), 'fineDeltaZFromHeightGpu produces finite values');

  destroyAuxGpuDevice();
});
