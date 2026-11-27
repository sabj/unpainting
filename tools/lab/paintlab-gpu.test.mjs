// Focused CPU/GPU parity and browser-compatibility tests for Paint Lab's WebGPU paper,
// 2x sub-cell smooth KM finish, GPU layer folding, and upgraded GpuSheet transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makePaper } from '../../demos/lab/media/paper.js';
import { makePaperGpu } from '../../demos/lab/media/gpu/paper-gpu.js';
import { SURFACES, paperOptions, paperReflectance } from '../../demos/lab/media/papers.js';
import { createSheet, deposit, dry, fix, step, DEFAULTS } from '../../demos/lab/media/sheet.js';
import { layerRT } from '../../demos/lab/media/km.js';
import { BY_KEY } from '../../demos/lab/media/pigments.js';
import { GpuSheet, openDevice } from '../../demos/lab/gpu/gpu-sheet.js';
import { GpuPhysics } from '../../demos/lab/gpu/gpu-physics.js';
import { GpuFinish } from '../../demos/lab/gpu/gpu-finish.js';
import { renderSubgridLayers } from '../plate/subcell-finish.mjs';
import { subcellSpread, SUBCELL_GAIN } from '../../src/media/subcell-grain.mjs';
import { paperRelief } from '../../src/media/paper-relief.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const KEEP = [];

async function getGpu() {
  try {
    const w = await import('webgpu');
    Object.assign(globalThis, w.globals);
    const gpu = w.create([]);
    KEEP.push(gpu);
    return gpu;
  } catch (e) {
    if (process.env.GPU_REQUIRED === '1') throw e;
    return null;
  }
}

function glazeCpu(R, layer, pigments, n) {
  const K = layer.length;
  for (let i = 0; i < n; i++) {
    let xt = 0; for (let k = 0; k < K; k++) xt += layer[k][i];
    if (xt <= 1e-7) continue;
    for (let c = 0; c < 3; c++) {
      let Kc = 0, Sc = 0;
      for (let k = 0; k < K; k++) { const f = layer[k][i] / xt; Kc += f * pigments[k].K[c]; Sc += f * pigments[k].S[c]; }
      const [Rl, Tl] = layerRT(Kc, Sc, xt), r = R[i * 3 + c];
      R[i * 3 + c] = Rl + (Tl * Tl * r) / (1 - Rl * r);
    }
  }
}

test('demos/lab contains zero static Node-only imports (node:*, sharp, webgpu)', () => {
  const labDir = path.join(ROOT, 'demos', 'lab');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    if (e.name === 'examples' || e.name === 'fonts' || e.name === 'thumbnails') return [];
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
  for (const file of walk(labDir)) {
    const code = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    assert.ok(!/^\s*(?:import|export)\s[^'"]*from\s+'(?:node:|sharp|webgpu)/m.test(code), `${rel} has a static Node-only import`);
  }
});

test('Paint Lab browser makePaperGpu matches CPU makePaper across all surfaces (non-physical) and physical sheets', async t => {
  const gpu = await getGpu();
  if (!gpu) return t.skip('no WebGPU adapter');
  const { adapter, device } = await openDevice(gpu);
  KEEP.push(adapter);
  try {
    // 1. All 4 Paint Lab interactive surfaces (non-physical value-noise branch)
    const w = 96, h = 72, dpi = 160, seed = 7;
    for (const surface of Object.keys(SURFACES)) {
      const opts = paperOptions(surface, dpi, seed);
      const cpu = makePaper(w, h, opts);
      const got = await makePaperGpu(device, w, h, opts);
      for (const field of ['height', 'grainH', 'valley', 'capacity', 'proud', 'tooth', 'fdx', 'fdy', 'grain', 'hollow', 'throat']) {
        const a = cpu[field], b = got[field];
        assert.equal(b.length, a.length, `${surface}.${field} length`);
        let maxD = 0;
        for (let i = 0; i < a.length; i++) maxD = Math.max(maxD, Math.abs(a[i] - b[i]));
        const tol = field === 'throat' ? 5e-4 : 1e-4;
        assert.ok(maxD < tol, `${surface}.${field} max diff ${maxD} >= ${tol}`);
      }
      for (const scalar of ['toothLo', 'toothSpan', 'relief', 'subRelief', 'hollowUnit', 'fibreHalf']) {
        assert.ok(Math.abs(got[scalar] - cpu[scalar]) < 1e-4, `${surface}.${scalar}: gpu=${got[scalar]} cpu=${cpu[scalar]}`);
      }
    }

    // 2. Physical sheet (liveTape / mmPerCell branch)
    const pOpts = { mmPerCell: 0.25, seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, coldPress: { mmPerCell: 0.25 } };
    const pCpu = makePaper(w, h, pOpts);
    const pGpu = await makePaperGpu(device, w, h, pOpts);
    for (const field of ['height', 'grainH', 'valley', 'surface', 'capacity', 'proud', 'tooth', 'fdx', 'fdy', 'grain', 'hollow', 'throat']) {
      let maxD = 0;
      for (let i = 0; i < pCpu[field].length; i++) maxD = Math.max(maxD, Math.abs(pCpu[field][i] - pGpu[field][i]));
      const tol = field === 'throat' ? 5e-4 : 1e-4;
      assert.ok(maxD < tol, `physical.${field} max diff ${maxD} >= ${tol}`);
    }
  } finally {
    device.destroy();
  }
});

test('Paint Lab GpuFinish matches CPU 2x sub-cell KM finish (max |dRGB| <= 1) and supports non-physical + multi-layer fold', async t => {
  const gpu = await getGpu();
  if (!gpu) return t.skip('no WebGPU adapter');
  const { adapter, device } = await openDevice(gpu);
  KEEP.push(adapter);
  try {
    // 1. Physical sheet exact parity vs CPU renderSubgridLayers
    const w = 48, h = 36, mm = 0.25, N = 2, FW = w * N, FH = h * N;
    const pigments = [BY_KEY.rose, BY_KEY.ultramarine, BY_KEY.sienna];
    const paper = await makePaperGpu(device, w, h, { mmPerCell: mm, seed: 7 });
    const sheet = createSheet(paper, pigments);
    const l0 = pigments.map(() => new Float32Array(w * h));
    for (let y = 6; y < 28; y++) for (let x = 8; x < 38; x++) {
      l0[0][y * w + x] = 0.28;
      if (x > 18) l0[1][y * w + x] = 0.35;
    }
    sheet.layers.push(l0);
    const baseR = paperReflectance(paper, 'cold', 101.6);

    const finish = new GpuFinish(device, N);
    const gpuRes = await finish.render({ sheet, pigments, paper, baseR, wantCoarse: true });
    assert.equal(gpuRes.fineWidth, FW);
    assert.equal(gpuRes.fineHeight, FH);
    assert.equal(gpuRes.fineRgba.length, FW * FH * 4);
    assert.equal(gpuRes.coarseRgba.length, w * h * 4);

    // Build exact same upsampled fbase for CPU reference
    const hF = paperRelief(FW, FH, mm / N, paper.reliefOf).height;
    assert.equal(hF.length, FW * FH);
    const fbase = new Uint8Array(FW * FH * 3);
    const ax0 = new Int32Array(FW), ax1 = new Int32Array(FW), tx = new Float32Array(FW);
    for (let x = 0; x < FW; x++) { const u = Math.min(w - 1, Math.max(0, (x + 0.5) / N - 0.5)), i0 = Math.floor(u); ax0[x] = i0; ax1[x] = Math.min(w - 1, i0 + 1); tx[x] = u - i0; }
    for (let y = 0; y < FH; y++) {
      const v = Math.min(h - 1, Math.max(0, (y + 0.5) / N - 0.5)), y0 = Math.floor(v), y1 = Math.min(h - 1, y0 + 1), fy = v - y0;
      for (let x = 0; x < FW; x++) {
        const i00 = (y0 * w + ax0[x]) * 3, i10 = (y0 * w + ax1[x]) * 3, i01 = (y1 * w + ax0[x]) * 3, i11 = (y1 * w + ax1[x]) * 3;
        for (let c = 0; c < 3; c++) {
          const a = baseR[i00 + c] * (1 - tx[x]) + baseR[i10 + c] * tx[x];
          const b = baseR[i01 + c] * (1 - tx[x]) + baseR[i11 + c] * tx[x];
          fbase[(y * FW + x) * 3 + c] = Math.min(255, Math.max(0, Math.round((a * (1 - fy) + b * fy) * 255)));
        }
      }
    }
    const spread = subcellSpread(pigments, paper, N, { gain: SUBCELL_GAIN });
    const cpuRes = renderSubgridLayers({ sheetLayers: sheet.layers, spread, pigments, fbase, W2: w, H2: h, N, wantCoarse: true });
    let maxFine = 0, maxCoarse = 0;
    for (let i = 0; i < FW * FH; i++) for (let c = 0; c < 3; c++) maxFine = Math.max(maxFine, Math.abs(gpuRes.fineRgba[i * 4 + c] - cpuRes.fine[i * 3 + c]));
    for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) maxCoarse = Math.max(maxCoarse, Math.abs(gpuRes.coarseRgba[i * 4 + c] - cpuRes.coarse[i * 3 + c]));
    assert.ok(maxFine <= 1, `GpuFinish fine max |dRGB|=${maxFine}`);
    assert.ok(maxCoarse <= 1, `GpuFinish coarse max |dRGB|=${maxCoarse}`);

    // 2. Non-physical interactive Paint Lab sheet + persistent foldLayer + graphite
    const npPaper = { ...(await makePaperGpu(device, w, h, paperOptions('cold', 120, 7))), mmPerCell: 25.4 / 120 };
    const npSheet = createSheet(npPaper, pigments);
    const npBase = paperReflectance(npPaper, 'cold', 120);
    const graphite = new Float32Array(w * h);
    for (let x = 4; x < 40; x++) graphite[18 * w + x] = 0.6;
    const npFinish = new GpuFinish(device, 2);
    await npFinish.foldLayer({ layer: l0, pigments, paper: npPaper, baseR: npBase });
    assert.ok(npFinish.fineBase && npFinish.fineBase.length === FW * FH * 3);
    const npRes = await npFinish.render({ sheet: npSheet, pigments, paper: npPaper, baseR: npBase, graphite, wantCoarse: true });
    assert.equal(npRes.fineWidth, FW);
    assert.ok(npRes.coarseRgba.length === w * h * 4);
    // Verify graphite darkened the pencil line relative to bare paper above it
    const lineIdx = (18 * 2 * FW + 20 * 2) * 4, bareIdx = (2 * FW + 20 * 2) * 4;
    assert.ok(npRes.fineRgba[lineIdx] < npRes.fineRgba[bareIdx] - 20, 'graphite darkened fine output');
  } finally {
    device.destroy();
  }
});

test('Paint Lab GpuPhysics GPU foldTop, wetMask, ef_small, lv.light, and dry() match CPU with zero Dawn warnings', async t => {
  const gpu = await getGpu();
  if (!gpu) return t.skip('no WebGPU adapter');
  const pigments = [BY_KEY.rose, BY_KEY.ultramarine];
  const phys = await GpuPhysics.create(pigments, { ...DEFAULTS }, gpu);
  try {
    const w = 64, h = 48, n = w * h, mm = 0.25;
    const paper = await makePaperGpu(phys.device, w, h, { mmPerCell: mm, seed: 7 });
    const gpuSheet = createSheet(paper, pigments);
    const cpuSheet = createSheet(paper, pigments);
    const gpuBase = paperReflectance(paper, 'cold', 101.6);
    const cpuBase = Float32Array.from(gpuBase);
    const graphite = new Float32Array(n);

    // Wash 1: deposit, dry on GPU vs CPU, fix
    for (let y = 10; y < 34; y++) for (let x = 10; x < 34; x++) {
      deposit(gpuSheet, y * w + x, 0.08, [0.35, 0]);
      deposit(cpuSheet, y * w + x, 0.08, [0.35, 0]);
    }
    await phys.load(gpuSheet, gpuBase, graphite);
    const mask = await phys.sheet.wetMask();
    assert.equal(mask[20 * w + 20], 1, 'wetMask detects wet center');
    assert.equal(mask[0], 0, 'wetMask keeps dry corner 0');

    await phys.sheet.dry(20000, { dt: 2 });
    const r1 = await phys.fix(gpuSheet, gpuBase, { foldOnGpu: true, foldFine: true });
    assert.equal(r1.pushed, true);
    assert.equal(r1.foldedOnGpu, false, 'first wash has no prior TOP to fold');

    const opts = { ...DEFAULTS, mmPerCell: mm };
    dry(cpuSheet, 20000, opts, { dt: 2 });

    // Wash 2: deposit overlapping wash, dry, GPU-fold Wash 1 into BASE without CPU glaze!
    for (let y = 18; y < 40; y++) for (let x = 22; x < 48; x++) deposit(cpuSheet, y * w + x, 0.06, [0, 0.4]);
    await phys.syncAll(gpuSheet, gpuBase);
    for (let y = 18; y < 40; y++) for (let x = 22; x < 48; x++) deposit(gpuSheet, y * w + x, 0.06, [0, 0.4]);
    phys.up(gpuSheet, [22, 18, 26, 22]);

    await phys.sheet.dry(20000, { dt: 2 });
    const r2 = await phys.fix(gpuSheet, gpuBase, { foldOnGpu: true, foldFine: true });
    assert.equal(r2.pushed, true);
    assert.equal(r2.foldedOnGpu, true, 'second wash folded Wash 1 directly on GPU');
    assert.equal(phys.composer.baseAhead, true, 'GPU base is ahead until syncAll');
    assert.ok(phys.sheet.lv.tracksWrites, 'lv.tracksWrites enabled for light levelling');
    assert.ok(phys.sheet.zeroWaterKnown, 'zeroWaterKnown activated during pore-drying tail');

    // Verify lv.light activates on a thin surface film (0 < W < levelFloor)
    await phys.syncAll(gpuSheet, gpuBase);
    for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) deposit(gpuSheet, y * w + x, 0.015, [0, 0]);
    phys.up(gpuSheet, [10, 10, 10, 10]);
    await phys.step(2);
    await phys.step(2);
    assert.ok(phys.sheet.lv.lightSteps > 0, `lv.light activated on thin film (lightSteps=${phys.sheet.lv.lightSteps})`);

    dry(cpuSheet, 20000, opts, { dt: 2 });
    while (cpuSheet.layers.length > 1) glazeCpu(cpuBase, cpuSheet.layers.shift(), pigments, n);

    assert.equal(phys.composer.baseAhead, false, 'syncAll pulled GPU BASE into CPU baseR');
    let maxBaseDiff = 0, sumBaseDiff = 0;
    for (let i = 0; i < gpuBase.length; i++) {
      const d = Math.abs(gpuBase[i] - cpuBase[i]);
      if (d > maxBaseDiff) maxBaseDiff = d;
      sumBaseDiff += d;
    }
    const meanBaseDiff = sumBaseDiff / gpuBase.length;
    assert.ok(meanBaseDiff < 1e-3, `GPU-folded baseR mean diff=${meanBaseDiff} >= 1e-3`);
    assert.ok(maxBaseDiff < 2e-2, `GPU-folded baseR max diff=${maxBaseDiff} >= 2e-2`);

    // Direct exact parity of Composer.foldTop() against CPU glaze() on identical layer data (< 1e-5)
    const exactSheet = createSheet(paper, pigments);
    const exactLayer = [new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) { exactLayer[0][i] = (i % 7) * 0.08; exactLayer[1][i] = (i % 5) * 0.06; }
    exactSheet.layers.push(exactLayer);
    const exactGpuBase = paperReflectance(paper, 'cold', 101.6);
    const exactCpuBase = Float32Array.from(exactGpuBase);
    await phys.load(exactSheet, exactGpuBase, graphite);
    phys.composer.foldTop();
    await phys.composer.syncBase(exactGpuBase);
    glazeCpu(exactCpuBase, exactLayer, pigments, n);
    let maxFoldDiff = 0;
    for (let i = 0; i < exactGpuBase.length; i++) maxFoldDiff = Math.max(maxFoldDiff, Math.abs(exactGpuBase[i] - exactCpuBase[i]));
    assert.ok(maxFoldDiff < 1e-5, `Composer.foldTop exact KM parity vs CPU glaze (max diff=${maxFoldDiff})`);
  } finally {
    phys.destroy();
  }
});

test('Paint Lab Section strokes execute on WebGPU with CPU parity, continuation, clip/resist and no Dawn warnings', async t => {
  const gpu = await getGpu();
  if (!gpu) return t.skip('no WebGPU adapter');
  const { createBrush, dip, stroke, thirsty } = await import('../../demos/lab/media/brush.js');
  const pigments = [BY_KEY.rose, BY_KEY.ultramarine, BY_KEY.sienna];
  const phys = await GpuPhysics.create(pigments, { ...DEFAULTS, edgeEvap: 0 }, gpu);
  const errors = [];
  phys.device.addEventListener('uncapturederror', e => errors.push(e.error.message));
  phys.device.pushErrorScope('validation');
  try {
    const paper = makePaper(64, 48, { mmPerCell: 0.25, seed: 19, tooth: 0.75, coldPress: { mmPerCell: 0.25 } });
    for (const flat of [false, true]) {
      const a = createSheet(paper, pigments), b = createSheet(paper, pigments);
      for (const sh of [a, b]) {
        sh.clip = Uint8Array.from({ length: sh.n }, (_, i) => Number(i % sh.w > 5 && i % sh.w < 60));
        sh.resist = Uint8Array.from({ length: sh.n }, (_, i) => Number(i % sh.w > 28 && i % sh.w < 32));
        for (let y = 10; y < 36; y++) for (let x = 8; x < 56; x++) {
          const i = y * sh.w + x;
          sh.W[i] = 0.1; sh.s[i] = 0.02; sh.M[i] = sh.ever[i] = 1; sh.G[1][i] = 0.03;
        }
      }
      await phys.load(b, paperReflectance(paper, 'cold', 101.6), new Float32Array(b.n));
      const brushes = [a, b].map(() => {
        const br = createBrush({ model: 'section', flat, radius: 5, bristles: 18, seed: 23, capacity: 30, belly: 4, feed: 0.2, give: 0.8, free: 0.4, wetness: 0.9, wetMix: 0.5 });
        dip(br, { water: 0.8, conc: [0.25, 0.1, 0] }); return br;
      });
      for (const [path, options] of [
        [[{ x: 10, y: 18, p: 0.8 }, { x: 34, y: 24, p: 0.95 }], { lift: false }],
        [[{ x: 34, y: 24, p: 0.95 }, { x: 54, y: 34, p: 0.4 }], { lift: true }],
      ]) {
        const rect = phys.rect(path, 20);
        await phys.ensureFresh(b, rect);
        stroke(brushes[0], a, path, options); stroke(brushes[1], b, path, options);
        phys.up(b, rect); await phys.idle();
      }
      for (const br of brushes) thirsty(br, { water: 0.1 });
      const liftPath = [{ x: 16, y: 34, p: 0.8 }, { x: 50, y: 18, p: 0.8 }];
      const rect = phys.rect(liftPath, 20);
      await phys.ensureFresh(b, rect);
      stroke(brushes[0], a, liftPath); stroke(brushes[1], b, liftPath);
      phys.up(b, rect); await phys.syncAll(b);
      assert.equal(phys.sectionLink.stats.sectionGpuStrokes, 3);
      assert.equal(phys.stats.up, 0, 'GPU section contact requires no CPU rectangle upload');
      assert.ok(phys.sheet.sectionBrush.smallDispatches >= 3);
      for (const [name, x, y] of [['W', a.W, b.W], ['s', a.s, b.s], ['M', a.M, b.M], ['ever', a.ever, b.ever],
        ...a.G.map((x, k) => [`G${k}`, x, b.G[k]]), ...a.D.map((x, k) => [`D${k}`, x, b.D[k]])]) {
        let max = 0, sum = 0;
        for (let i = 0; i < x.length; i++) { const diff = Math.abs(x[i] - y[i]); max = Math.max(max, diff); sum += diff; }
        assert.ok(max < 2e-3 && sum / x.length < 5e-5, `${flat ? 'flat' : 'round'}.${name}: max=${max}, mean=${sum / x.length}`);
      }
      for (let j = 0; j < brushes[0].hairs.length; j++) {
        assert.ok(Math.abs(brushes[0].hairs[j].water - brushes[1].hairs[j].water) < 1e-3);
        for (let k = 0; k < pigments.length; k++) assert.ok(Math.abs(brushes[0].hairs[j].pig[k] - brushes[1].hairs[j].pig[k]) < 1e-3);
      }
    }
    await phys.idle();
    assert.equal(await phys.device.popErrorScope(), null);
    assert.deepEqual(errors, []);
  } finally { phys.destroy(); }
});

test('fused small runs match parallel GPU exchange across radius changes, NONE/OFFSHEET and signed zero', async t => {
  const { SMALL_CELLS, SMALL_LANES } = await import('../../demos/lab/media/gpu/section-brush-wgsl.js');
  const gpu = await getGpu(); if (!gpu) return t.skip('no WebGPU adapter');
  const { createBrush, dip, stroke } = await import('../../demos/lab/media/brush.js');
  const pigments = [BY_KEY.rose, BY_KEY.ultramarine, BY_KEY.sienna];
  const phys = await GpuPhysics.create(pigments, { ...DEFAULTS, edgeEvap: 0 }, gpu);
  const paper = makePaper(120, 80, { mmPerCell: 0.25, seed: 19 });
  const base = paperReflectance(paper, 'cold', 101.6), graphite = new Float32Array(120 * 80);
  const validation = [];
  phys.device.addEventListener('uncapturederror', e => validation.push(e.error.message));
  try {
    const a = createSheet(paper, pigments);
    await phys.load(a, base, graphite);
    let plan, info, fusedBrush;
    const run = phys.sheet.runSectionStroke.bind(phys.sheet);
    phys.sheet.runSectionStroke = (data, meta) => {
      plan = data.slice(); info = meta;
      return run(data, meta).then(out => { fusedBrush = out; return out; });
    };
    const br = createBrush({ model: 'section', radius: 5, bristles: 24, capacity: 20, seed: 37 });
    dip(br, { water: 0.8, conc: [0.3, 0.1, -0] });
    for (const hr of br.hairs) hr.pig[2] = -0; br.resP[2] = -0;
    stroke(br, a, [
      { x: -35, y: 30, r: 3, p: 0.8 }, { x: 25, y: 30, r: 3, p: 0.8 },
      { x: 38, y: 35, r: 30, p: 0.9 }, { x: 60, y: 35, r: 30, p: 0.9 },
      { x: 75, y: 40, r: 3, p: 0.8 }, { x: 85, y: 40, r: 3, p: 0 },
      { x: 100, y: 40, r: 3, p: 0.8 },
    ]);
    await phys.syncAll(a);
    assert.ok(phys.sheet.sectionBrush.smallDispatches > 0 && phys.sheet.sectionBrush.largeSteps > 0);
    const b = createSheet(paper, pigments);
    await phys.load(b, base, graphite);
    phys.sheet.runSectionStroke = run;
    // Build the driver without painting, then encode each step through the four-stage path.
    await run(plan, { ...info, nSteps: 0 });
    const driver = phys.sheet.sectionBrush;
    driver.encodeRuns = function* (getPass, U, nSteps, sp, s0, pipes) {
      for (let s = 0; s < nSteps; s++) {
        const pass = getPass(), cells = this.cells(U, s0 + s * sp);
        pass.setBindGroup(0, this.bgEval);
        // commit preps the next large step; small steps intentionally initialize locally.
        if (s === 0 || (U[0] <= SMALL_LANES && cells <= SMALL_CELLS)) { pass.setPipeline(pipes.pInit); pass.dispatchWorkgroups(1); }
        if (cells) {
          const count = Math.min(128, Math.ceil(cells / 256));
          pass.setPipeline(pipes.pEval); pass.dispatchWorkgroups(count);
          pass.setPipeline(pipes.pScale); pass.dispatchWorkgroups(1);
          pass.setBindGroup(0, this.bgApply); pass.setPipeline(pipes.pApply); pass.dispatchWorkgroups(count);
          pass.setBindGroup(0, this.bgEval);
        }
        pass.setPipeline(pipes.pCommit); pass.dispatchWorkgroups(1);
        yield { s, flows: 0 };
      }
    };
    const parallelBrush = await run(plan, info);
    await phys.sheet.download(b);
    for (const [x, y] of [[a.W, b.W], [a.s, b.s], [a.M, b.M], [a.ever, b.ever],
      ...a.G.map((x, k) => [x, b.G[k]]), ...a.D.map((x, k) => [x, b.D[k]])]) {
      let max = 0; for (let i = 0; i < x.length; i++) max = Math.max(max, Math.abs(x[i] - y[i]));
      assert.ok(max < 5e-5, `fused vs parallel sheet max=${max}`);
    }
    // Header bit fields may encode NaNs; compare only numerical hair/belly state.
    for (let j = 0; j <= br.hairs.length; j++) for (const word of [0, 3, 4, 5, 6]) {
      const at = 64 + j * 7 + word;
      assert.ok(Math.abs(fusedBrush[at] - parallelBrush[at]) < 5e-5, `brush state at ${at}`);
    }
    assert.deepEqual(validation, []);
  } finally { phys.destroy(); }
});


test('Paint Lab efRefresh uses browser GPU distance and pressure on a 40 mm wash with CPU parity', async t => {
  const gpu = await getGpu(); if (!gpu) return t.skip('no WebGPU adapter');
  const { adapter, device } = await openDevice(gpu); KEEP.push(adapter);
  const errors = []; device.addEventListener('uncapturederror', e => errors.push(e.error.message));
  device.pushErrorScope('validation');
  let g;
  try {
    const pigments = [BY_KEY.ultramarine], mm = .25;
    const paper = makePaper(160, 160, { mmPerCell: mm, seed: 9, cockle: { rmsMm: 0 } });
    const make = () => {
      const s = createSheet(paper, pigments);
      for (let y = 5; y < 155; y++) for (let x = 5; x < 155; x++) {
        if (x > 60 && x < 85 && y > 45 && y < 95 || x < 20 && y % 23 < 7) continue;
        deposit(s, y * s.w + x, .12, [.054]);
      }
      return s;
    };
    const cpu = make(), actual = make(), o = { ...DEFAULTS, mmPerCell: mm, edgeEvap: .004, dt: .1, slide: 0 };
    g = await GpuSheet.create(device, pigments, o); g.attach(actual); g.setOptions(o);
    await g.advance(2); await g.download(actual);
    step(cpu, o); step(cpu, o);
    assert.ok(g.gpuDistanceBoxes > 0);
    assert.equal(g.ef.pressureSolve.backend, 'gpu', JSON.stringify(g.ef.pressureSolve));
    assert.equal(g.ef.pressureSolve.fallback, false);
    for (const [name, a, b] of [['W', cpu.W, actual.W], ['s', cpu.s, actual.s],
      ['G', cpu.G[0], actual.G[0]], ['P', cpu.P[0], actual.P[0]], ['D', cpu.D[0], actual.D[0]]]) {
      let error = 0; for (let i = 0; i < a.length; i++) error = Math.max(error, Math.abs(a[i] - b[i]));
      assert.ok(error < 1e-4, `${name}: ${error}`);
    }
    // Same footprint is served from the Lab geometry cache; detaching releases both GPU solvers.
    const pressure = g.dryingPressure, contact = g.contactDistance;
    g.ef.stale = true; await g.efRefresh();
    assert.equal(g.dryingPressure, pressure); assert.equal(g.contactDistance, contact);
    g.detach(); assert.equal(g.dryingPressure, null); assert.equal(g.contactDistance, null);
    assert.equal(await device.popErrorScope(), null); assert.deepEqual(errors, []);
    t.diagnostic(JSON.stringify(g.ef.pressureSolve));
  } finally { g?.destroy(); device.destroy(); }
});

test('Paint Lab fixed-bed glazes retain support through GPU fix and masked full uploads', async t => {
  const gpu = await getGpu(); if (!gpu) return t.skip('no WebGPU adapter');
  const pigments = [BY_KEY.ultramarine, BY_KEY.sienna], w = 48, h = 36;
  const paper = makePaper(w, h, { mmPerCell: .3, seed: 9 });
  const make = () => {
    const s = createSheet(paper, pigments);
    for (let l = 0; l < 2; l++) {
      const layer = pigments.map(() => new Float32Array(s.n));
      for (let y = 4; y < h - 4; y++) for (let x = 4; x < w - 4; x++) layer[l][y * w + x] = x % 9 < 4 ? .8 : .04;
      s.layers.push(layer);
    }
    for (let y = 8; y < h - 8; y++) for (let x = 8; x < w - 8; x++) {
      const i = y * w + x; deposit(s, i, .18, [.03, .02]); s.D[0][i] = .12; s.D[1][i] = .07;
    }
    return s;
  };
  const o = { ...DEFAULTS, fixedBed: 1, mmPerCell: .3, edgeEvap: 0, dt: .1, slide: .04, fillRef: .4 };
  const cpu = make(), actual = make(), legacy = make(), phys = await GpuPhysics.create(pigments, o, gpu);
  const errors = []; phys.device.addEventListener('uncapturederror', e => errors.push(e.error.message));
  const base = paperReflectance(paper, 'cold', 85);
  const parity = label => {
    for (const key of ['W', 's', 'G', 'P', 'D']) {
      const aa = ArrayBuffer.isView(cpu[key]) ? [cpu[key]] : cpu[key], bb = ArrayBuffer.isView(actual[key]) ? [actual[key]] : actual[key];
      for (let k = 0; k < aa.length; k++) {
        let error = 0; for (let i = 0; i < cpu.n; i++) error = Math.max(error, Math.abs(aa[k][i] - bb[k][i]));
        assert.ok(error < 2e-4, `${label} ${key}[${k}] max error ${error}`);
      }
    }
    assert.equal(actual.layers.length, cpu.layers.length);
  };
  try {
    await phys.load(actual, base, new Float32Array(cpu.n)); phys.setOptions(o);
    for (let phase = 0; phase < 3; phase++) {
      await phys.step(2); step(cpu, o); step(cpu, o);
      await phys.syncAll(actual); parity(`glaze ${phase}`);
      if (phase === 0) {
        step(legacy, { ...o, fixedBed: 0 }); step(legacy, { ...o, fixedBed: 0 });
        assert.ok(cpu.D.some((a, k) => a.some((v, i) => Math.abs(v - legacy.D[k][i]) > 1e-6)), 'bound pigment changes the slide/filled hollow');
      }
      fix(cpu);
      const result = await phys.fix(actual, base, { foldOnGpu: true });
      assert.equal(result.foldedOnGpu, false, 'bound layers remain available to mask removal and undo');
      await phys.syncAll(actual); parity(`fixed ${phase}`);
      const lower = new Float32Array(await phys.sheet.readWords('DEP', cpu.n * 4, 2 * cpu.n * 4));
      for (let i = 0; i < cpu.n; i++) {
        let sum = 0; for (const layer of cpu.layers.slice(0, -1)) for (const plane of layer) sum += plane[i];
        assert.ok(Math.abs(lower[i] - sum) < 2e-4, 'GPU retains each superseded TOP exactly once');
      }
      // Mask removal can alter an old layer; a full upload must replace cached support.
      for (const s of [cpu, actual]) {
        s.layers[0][0][12 * w + 12] = 0;
        for (let y = 9; y < 20; y++) for (let x = 10; x < 26; x++) {
          const i = y * w + x; deposit(s, i, .12, [.01, .02]); s.D[1][i] += .06;
        }
      }
      phys.upload(actual);
    }
    assert.deepEqual(errors, []);
  } finally { phys.destroy(); }
});
