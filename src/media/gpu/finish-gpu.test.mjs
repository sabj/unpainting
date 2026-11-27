import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuxGpuDevice, destroyAuxGpuDevice } from './aux-device.mjs';
import { renderSubgridLayersGpu } from './finish-gpu.mjs';
import { renderSubgridLayers } from '../../../tools/plate/subcell-finish.mjs';
import { subcellSpread, SUBCELL_GAIN } from '../subcell-grain.mjs';
import { paperRelief } from '../paper-relief.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';

test('finish-gpu matches CPU renderSubgridLayers within max |dRGB| <= 1 across sparse, multi-pigment, granulating, empty and corner layers', async t => {
  const ctx = await getAuxGpuDevice(process.env.GPU_REQUIRED === '1' ? 'on' : 'auto');
  if (!ctx) { t.skip('no WebGPU adapter'); return; }
  const { device } = ctx;

  const W2 = 64, H2 = 48, N = 2, FW = W2 * N, FH = H2 * N, FN = FW * FH, N2 = W2 * H2;
  const pigments = ['rose', 'ultramarine', 'cadyellow', 'sienna'].map(k => ({
    ...boxPigment(BOX.find(p => p.key === k)),
    gamma: k === 'ultramarine' ? 0.85 : k === 'sienna' ? 0.55 : 0.15,
  }));
  const mm = 0.25;
  const paper = { w: W2, h: H2, mmPerCell: mm, reliefOf: { seed: 9, relief: 'cold' } };
  const hF = paperRelief(FW, FH, mm / N, { seed: 9, relief: 'cold' }).height;
  const paperRGB = [252, 250, 245], shade = 0.04;
  const fbase = new Uint8Array(FN * 3);
  for (let i = 0; i < FN; i++) {
    const sh = 1 - shade + shade * hF[i], o = i * 3;
    fbase[o] = Math.round(Math.min(255, paperRGB[0] * sh));
    fbase[o + 1] = Math.round(Math.min(255, paperRGB[1] * sh));
    fbase[o + 2] = Math.round(Math.min(255, paperRGB[2] * sh));
  }
  const zero = new Float32Array(N2);

  const l0 = pigments.map(() => new Float32Array(N2));
  for (let y = 4; y < 22; y++) for (let x = 6; x < 34; x++) l0[0][y * W2 + x] = 0.35 * (0.5 + 0.5 * Math.sin(x * 0.2));
  const l1 = [zero, zero, zero, zero];
  const l2 = [new Float32Array(N2), new Float32Array(N2), zero, new Float32Array(N2)];
  for (let y = 14; y < 44; y++) for (let x = 12; x < 58; x++) {
    l2[0][y * W2 + x] = 0.12;
    l2[1][y * W2 + x] = 0.42;
    l2[3][y * W2 + x] = 0.18;
  }
  const l3 = [zero, zero, new Float32Array(N2), zero];
  l3[2][0] = 0.5;
  l3[2][N2 - 1] = 0.25;
  l3[2][20 * W2 + 30] = 0.8; // isolated 1-cell core
  const sheetLayers = [l0, l1, l2, l3];

  const spread = subcellSpread(pigments, paper, N, { gain: SUBCELL_GAIN });
  const cpu = renderSubgridLayers({ sheetLayers, spread, pigments, fbase, W2, H2, N, wantCoarse: true, zeroLayer: zero });
  const gpu = await renderSubgridLayersGpu({ device, sheetLayers, pigments, paper, fbase, W2, H2, N, gain: SUBCELL_GAIN, wantCoarse: true, zeroLayer: zero });

  assert.equal(gpu.fine.length, cpu.fine.length);
  assert.equal(gpu.coarse.length, cpu.coarse.length);
  let maxFine = 0, diffFine = 0;
  for (let i = 0; i < cpu.fine.length; i++) {
    const d = Math.abs(gpu.fine[i] - cpu.fine[i]);
    if (d > 0) diffFine++;
    if (d > maxFine) maxFine = d;
  }
  let maxCoarse = 0;
  for (let i = 0; i < cpu.coarse.length; i++) {
    const d = Math.abs(gpu.coarse[i] - cpu.coarse[i]);
    if (d > maxCoarse) maxCoarse = d;
  }
  assert.ok(maxFine <= 1, `max fine |dRGB|=${maxFine} (diff bytes=${diffFine}/${cpu.fine.length})`);
  assert.ok(maxCoarse <= 1, `max coarse |dRGB|=${maxCoarse}`);

  // Also test heightFine + paperRGB + inkRatio fusion path
  const inkRatio = new Float32Array(FN * 3);
  for (let i = 0; i < inkRatio.length; i++) inkRatio[i] = i % 17 === 0 ? 0.65 : 1.0;
  const gpuFused = await renderSubgridLayersGpu({
    device, sheetLayers, pigments, paper, heightFine: hF, paperRGB, shade, W2, H2, N, gain: SUBCELL_GAIN, wantCoarse: false, zeroLayer: zero, inkRatio,
  });
  assert.equal(gpuFused.coarse, null);
  let maxFused = 0;
  for (let i = 0; i < cpu.fine.length; i++) {
    const expected = Math.max(0, Math.min(255, Math.round(cpu.fine[i] * inkRatio[i])));
    const d = Math.abs(gpuFused.fine[i] - expected);
    if (d > maxFused) maxFused = d;
  }
  assert.ok(maxFused <= 1, `max fused |dRGB|=${maxFused}`);

  destroyAuxGpuDevice();
});


test('finish preflight rejects active coarse planes before any GPU calls or allocations', async () => {
  const W2 = 16, H2 = 16, n = W2 * H2;
  const layer = Array.from({ length: 16 }, () => new Float32Array(n).fill(0.1));
  for (const limited of ['maxStorageBufferBindingSize', 'maxBufferSize']) {
    let calls = 0;
    const device = {
      limits: { maxStorageBufferBindingSize: 65536, maxBufferSize: 65536, [limited]: 12288 },
      createBuffer() { calls++; throw new Error('allocation before preflight'); },
      pushErrorScope() { calls++; throw new Error('pipeline before preflight'); },
    };
    await assert.rejects(renderSubgridLayersGpu({ device, sheetLayers: [layer], pigments: Array(16).fill({}),
      paper: {}, W2, H2, N: 1 }), /buffers exceed device binding limit/);
    assert.equal(calls, 0);
  }
});
