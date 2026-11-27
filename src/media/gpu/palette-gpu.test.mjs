import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getAuxGpuDevice, destroyAuxGpuDevice } from './aux-device.mjs';
import { GpuPaletteScorer, chooseBoxGpu, widePaletteGpu, pickPaletteGpu, renderUniquePaletteGpu } from './palette-gpu.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { sampleSource, sampleError, chooseBox, darkWarmth } from '../../crop/boxpick.mjs';
import { pickPalette } from '../../crop/palettepick.mjs';
import { localColours, localError, widePalette } from '../../crop/palettewide.mjs';
import { channelDensity, unmix } from '../../crop/pigments.mjs';
import { renderLayers } from '../km.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../../crop/palettewide-score.fixture.json', import.meta.url)));

test('palette-gpu matches CPU sampleError, localError, darkWarmth, chooseBox, widePalette, and renderUnique tightly', async t => {
  const ctx = await getAuxGpuDevice(process.env.GPU_REQUIRED === '1' ? 'on' : 'auto');
  if (!ctx) { t.skip('no WebGPU adapter'); return; }
  const { device } = ctx;

  for (const row of fixture.rows) {
    const px = Uint8Array.from(row.rgb);
    const sample = sampleSource(px, row.w, row.h, fixture.paper);
    const colours = localColours(sample, { K: 4 });
    const scorer = await GpuPaletteScorer.create(device, sample, colours);
    try {
      const lists = [[BOX[0]], [BOX[1], BOX[4], BOX[7]], BOX.slice(0, 5)];
      const batch = await scorer.scoreBatch(lists);
      for (let i = 0; i < lists.length; i++) {
        const cpuSample = sampleError(sample, lists[i]);
        const cpuLocal = localError(sample, colours, lists[i]);
        const cpuWarmth = darkWarmth(sample, lists[i]);
        assert.ok(Math.abs(batch[i].sampleError - cpuSample) <= 0.02, `${row.name} sampleError: gpu=${batch[i].sampleError} cpu=${cpuSample}`);
        assert.ok(Math.abs(batch[i].localMean - cpuLocal.mean) <= 0.02, `${row.name} localMean: gpu=${batch[i].localMean} cpu=${cpuLocal.mean}`);
        assert.ok(Math.abs(batch[i].darkWarmth - cpuWarmth) <= 0.05, `${row.name} darkWarmth: gpu=${batch[i].darkWarmth} cpu=${cpuWarmth}`);
      }
    } finally {
      scorer.destroy();
    }

    const cpuBox = chooseBox(px, row.w, row.h, fixture.paper, { min: 3, max: 4, gain: 0.5 });
    const gpuBox = await chooseBoxGpu(device, px, row.w, row.h, fixture.paper, { min: 3, max: 4, gain: 0.5 });
    assert.deepEqual(gpuBox.paints.map(p => p.key), cpuBox.paints.map(p => p.key), `${row.name} chooseBox keys`);
    assert.ok(Math.abs(gpuBox.e - cpuBox.e) <= 0.02, `${row.name} chooseBox error: gpu=${gpuBox.e} cpu=${cpuBox.e}`);

    const cpuWide = widePalette(px, row.w, row.h, fixture.paper, { monochrome: false, pigments: [{}, {}] }, row.options);
    const gpuWide = await widePaletteGpu(device, px, row.w, row.h, fixture.paper, { monochrome: false, pigments: [{}, {}] }, row.options);
    assert.deepEqual(gpuWide.palette.box.keys, cpuWide.palette.box.keys, `${row.name} widePalette keys`);
    assert.ok(Math.abs(gpuWide.palette.box.sampleError - cpuWide.palette.box.sampleError) <= 0.02, `${row.name} widePalette error`);

    const pickOpts = { pigs: 4, boxpick: true, boxmargin: 0, box: { gain: 0.25, max: 4, min: 4 } };
    const cpuPick = pickPalette(px, row.w, row.h, fixture.paper, pickOpts);
    const gpuPick = await pickPaletteGpu(device, px, row.w, row.h, fixture.paper, pickOpts);
    assert.equal(gpuPick.name, cpuPick.name, `${row.name} pickPalette name`);
    assert.deepEqual(gpuPick.palette.box?.keys, cpuPick.palette.box?.keys, `${row.name} pickPalette box keys`);
    assert.ok(Math.abs(gpuPick.e - cpuPick.e) <= 0.02, `${row.name} pickPalette error: gpu=${gpuPick.e} cpu=${cpuPick.e}`);
  }

  // Test renderUniquePaletteGpu parity against CPU unmix + renderLayers
  const row = fixture.rows[0], px = Uint8Array.from(row.rgb), n = row.w * row.h;
  const D = channelDensity(px, n, fixture.paper);
  const pigs = [BOX[0], BOX[4], BOX[10]].map(p => boxPigment(p));
  const A = unmix(D, n, pigs.map(q => q.K.map(v => v / 0.55)));
  const layer = pigs.map((_, j) => Float32Array.from({ length: n }, (_, i) => A[i * pigs.length + j]));
  const flat = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) flat[i * 3 + c] = fixture.paper[c];
  const cpuRgb = renderLayers([layer], pigs, flat, n, 1);
  const gpuRgb = await renderUniquePaletteGpu(device, D, n, pigs, fixture.paper);
  let maxD = 0;
  for (let i = 0; i < cpuRgb.length; i++) maxD = Math.max(maxD, Math.abs(gpuRgb[i] - cpuRgb[i]));
  assert.ok(maxD <= 1, `renderUniquePaletteGpu max |dRGB|=${maxD}`);

  destroyAuxGpuDevice();
});


test('expanded palettes score and render all 9–16 pigments with CPU parity', async t => {
  const ctx = await getAuxGpuDevice(process.env.GPU_REQUIRED === '1' ? 'on' : 'auto');
  if (!ctx) return t.skip('no WebGPU adapter');
  const { device } = ctx, row = fixture.rows[0], px = Uint8Array.from(row.rgb), n = row.w * row.h;
  const sample = sampleSource(px, row.w, row.h, fixture.paper), colours = localColours(sample, { K: 4 });
  const scorer = await GpuPaletteScorer.create(device, sample, colours);
  try {
    const trials = Array.from({ length: 8 }, (_, j) => BOX.slice(0, j + 9));
    assert.equal(trials.at(-1).length, 16);
    const batch = await scorer.scoreBatch(trials);
    for (let j = 0; j < trials.length; j++) {
      assert.ok(Math.abs(batch[j].sampleError - sampleError(sample, trials[j])) <= 0.02, `${trials[j].length} pigments`);
      assert.ok(Math.abs(batch[j].localMean - localError(sample, colours, trials[j]).mean) <= 0.02);
    }
    const D = channelDensity(px, n, fixture.paper);
    for (const k of [9, 16]) {
      const pigs = BOX.slice(0, k).map(p => boxPigment(p));
      const A = unmix(D, n, pigs.map(q => q.K.map(v => v / 0.55)));
      const layer = pigs.map((_, j) => Float32Array.from({ length: n }, (_, i) => A[i * k + j]));
      const flat = Uint8ClampedArray.from({ length: n * 3 }, (_, i) => fixture.paper[i % 3]);
      const cpu = renderLayers([layer], pigs, flat, n, 1), gpu = await renderUniquePaletteGpu(device, D, n, pigs, fixture.paper);
      assert.ok(cpu.every((v, i) => Math.abs(v - gpu[i]) <= 1), `${k}-pigment render`);
    }
  } finally { scorer.destroy(); destroyAuxGpuDevice(); }
});

test('GPU forced palette guard matches CPU for disjoint picks, merge, and add recovery', async t => {
  const ctx = await getAuxGpuDevice(process.env.GPU_REQUIRED === '1' ? 'on' : 'auto');
  if (!ctx) return t.skip('no WebGPU adapter');
  const w = 24, h = 18, px = Uint8Array.from({ length: w * h * 3 }, (_, i) =>
    (Math.floor(i / (w * 3)) < 6 ? [110, 150, 215] : [170, 200, 60])[i % 3]);
  const lean = { monochrome: false, pigments: [{}, {}] };
  try {
    for (const mode of ['merge', 'add']) {
      const options = { keys: ['sepia', 'ochre'], min: 3, max: 3, extend: false,
        guard: { mode, max: 4, threshold: 0.15 } };
      const cpu = widePalette(px, w, h, fixture.paper, lean, options);
      const gpu = await widePaletteGpu(ctx.device, px, w, h, fixture.paper, lean, options);
      const c = cpu.palette.box.guard, g = gpu.palette.box.guard;
      assert.ok(c.own.every(key => !options.keys.includes(key)), 'fixture has independent, disjoint picks');
      assert.equal(c.action, 'merged', `${mode} exercises merging from the own pick`);
      assert.equal(g.action, c.action);
      assert.deepEqual(g.paints, c.paints);
      assert.ok(Math.abs(g.finalError - c.finalError) <= 0.02);
    }
  } finally { destroyAuxGpuDevice(); }
});
