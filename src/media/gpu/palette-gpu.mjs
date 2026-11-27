// Metal/WebGPU batched palette gamut search + palette judge accelerator.
// Dual-purpose: pairs with CPU chooseBox (src/crop/boxpick.mjs), widePalette (src/crop/palettewide.mjs),
// and pickPalette (src/crop/palettepick.mjs).
import fs from 'node:fs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { chromaOf, paletteOf } from '../../crop/palette.mjs';
import { channelDensity } from '../../crop/pigments.mjs';
import { sampleSource } from '../../crop/boxpick.mjs';
import { localColours } from '../../crop/palettewide.mjs';
import { guardForcedBoxBatched, guardNote } from '../../crop/paint-guard.mjs';
import { labOf, deltaE2000 } from '../../eval/colour.mjs';
import { gaussian } from '../../keyframes/density.mjs';
import { dispatch1D } from './aux-device.mjs';

const WGSL = fs.readFileSync(new URL('./palette-gpu.wgsl', import.meta.url), 'utf8');
const PIPELINES = new WeakMap();
const MAX_PIGMENTS = 16;
const TRIAL_STRIDE = 416; // 2 headers + 16x16 Gram matrix + nine 16-pigment fields, padded
const EXPLICIT_MIN_SHARE = 0.02;
const EARTH_HUE = [45, 90], EARTH_C = [4, 32], EARTH_SHARE = 0.2;

const toLinear = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

async function getPipelines(device) {
  let cached = PIPELINES.get(device);
  if (cached) return cached;
  device.pushErrorScope('validation');
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const module = device.createShaderModule({ code: WGSL });
  const score = device.createComputePipeline({ label: 'palette-score_trials', layout: pipelineLayout, compute: { module, entryPoint: 'score_trials' } });
  const renderUnique = device.createComputePipeline({ label: 'palette-render_unique', layout: pipelineLayout, compute: { module, entryPoint: 'render_unique' } });
  const err = await device.popErrorScope();
  if (err) throw new Error(`palette-gpu pipeline error: ${err.message}`);
  cached = { layout, score, renderUnique };
  PIPELINES.set(device, cached);
  return cached;
}

/** Pack a single pigment list (box entries or raw sheet pigments) into a trial descriptor slice. */
function packTrial(dst, offset, pigments, isBox = true) {
  const k = pigments.length;
  if (k < 1 || k > MAX_PIGMENTS) throw new Error(`palette-gpu: pigment count ${k} out of 1..${MAX_PIGMENTS}`);
  const ps = isBox ? pigments.map(p => boxPigment(p)) : pigments;
  const dirs = ps.map(q => q.K.map(v => v / 0.55));
  let L = 0;
  for (let j = 0; j < k; j++) {
    let rowSum = 0;
    for (let q = 0; q < k; q++) {
      const g = dirs[j][0] * dirs[q][0] + dirs[j][1] * dirs[q][1] + dirs[j][2] * dirs[q][2];
      dst[offset + 2 + j * k + q] = g;
      rowSum += Math.abs(g);
    }
    if (rowSum > L) L = rowSum;
  }
  dst[offset] = k;
  dst[offset + 1] = L > 0 ? 1 / L : 0;
  for (let j = 0; j < k; j++) {
    dst[offset + 258 + j] = dirs[j][0];
    dst[offset + 274 + j] = dirs[j][1];
    dst[offset + 290 + j] = dirs[j][2];
    dst[offset + 306 + j] = ps[j].K[0];
    dst[offset + 322 + j] = ps[j].K[1];
    dst[offset + 338 + j] = ps[j].K[2];
    const S = ps[j].S ?? [0, 0, 0];
    dst[offset + 354 + j] = S[0];
    dst[offset + 370 + j] = S[1];
    dst[offset + 386 + j] = S[2];
  }
}

/**
 * GPU-resident scorer for one `sample` (and optional `localColours`).
 * Evaluates batches of candidate palettes in a single Metal compute dispatch.
 */
export class GpuPaletteScorer {
  static async create(device, sample, colours = []) {
    const pipe = await getPipelines(device);
    const { m, rgb, lab, D, paperRGB } = sample;
    // Build unique colour table with counts, dark-tenth counts, and cluster IDs
    const seen = new Map();
    const first = [];
    const ids = new Int32Array(m);
    for (let s = 0; s < m; s++) {
      const key = (rgb[s * 3] << 16) | (rgb[s * 3 + 1] << 8) | rgb[s * 3 + 2];
      let j = seen.get(key);
      if (j === undefined) { j = first.length; seen.set(key, j); first.push(s); }
      ids[s] = j;
    }
    const u = first.length;
    const counts = new Uint32Array(u);
    for (let s = 0; s < m; s++) counts[ids[s]]++;

    // Darkest tenth indices (exact match to boxpick.mjs darkWarmth)
    const darkN = Math.max(1, Math.round(m * 0.1));
    const order = Int32Array.from({ length: m }, (_, s) => s).sort((a, b) => lab.L[a] - lab.L[b]);
    const darkCounts = new Uint32Array(u);
    let darkWantB = 0;
    for (let i = 0; i < darkN; i++) {
      const s = order[i];
      darkCounts[ids[s]]++;
      darkWantB += lab.b[s];
    }
    const darkWant = darkWantB / darkN;
    const darkestL = lab.L[order[0]];

    const C = colours.length;
    const clusterIds = new Uint32Array(u).fill(0xFFFFFFFF);
    const clusterCounts = new Uint32Array(C);
    for (let c = 0; c < C; c++) {
      const cells = colours[c].cells;
      clusterCounts[c] = cells.length;
      for (let i = 0; i < cells.length; i++) {
        clusterIds[ids[cells[i]]] = c;
      }
    }

    const uniqueD = new Float32Array(u * 4);
    const uniqueLab = new Float32Array(u * 4);
    for (let j = 0; j < u; j++) {
      const s = first[j];
      uniqueD[j * 4] = D[s * 3];
      uniqueD[j * 4 + 1] = D[s * 3 + 1];
      uniqueD[j * 4 + 2] = D[s * 3 + 2];
      uniqueD[j * 4 + 3] = counts[j];
      uniqueLab[j * 4] = lab.L[s];
      uniqueLab[j * 4 + 1] = lab.a[s];
      uniqueLab[j * 4 + 2] = lab.b[s];
      uniqueLab[j * 4 + 3] = darkCounts[j];
    }

    const mk = (bytes, usage = 0) => device.createBuffer({
      size: Math.max(16, bytes),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | usage,
    });
    const bUniqueD = mk(uniqueD.byteLength);
    const bUniqueLab = mk(uniqueLab.byteLength);
    const bUniqueCluster = mk(clusterIds.byteLength);
    const bUniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(bUniqueD, 0, uniqueD);
    device.queue.writeBuffer(bUniqueLab, 0, uniqueLab);
    device.queue.writeBuffer(bUniqueCluster, 0, clusterIds);

    const self = new GpuPaletteScorer();
    Object.assign(self, {
      device, pipe, sample, colours, m, u, C, darkN, darkWant, darkestL, clusterCounts, paperRGB,
      pLin: paperRGB.map(v => Math.max(1e-6, toLinear(v))),
      bUniqueD, bUniqueLab, bUniqueCluster, bUniform,
      bTrials: null, bOut: null, bRead: null, capTrials: 0,
    });
    return self;
  }

  ensureBatch(numTrials) {
    const numWgU = Math.ceil(this.u / 128);
    const outStride = 2 + this.C * 3;
    if (numTrials <= this.capTrials) return { numWgU, outStride };
    this.bTrials?.destroy(); this.bOut?.destroy(); this.bRead?.destroy();
    const cap = Math.max(numTrials, 20);
    const trialBytes = cap * TRIAL_STRIDE * 4;
    const outBytes = cap * numWgU * outStride * 4;
    this.bTrials = this.device.createBuffer({ size: Math.max(16, trialBytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.bOut = this.device.createBuffer({ size: Math.max(16, outBytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this.bRead = this.device.createBuffer({ size: Math.max(16, outBytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.capTrials = cap;
    return { numWgU, outStride };
  }

  /**
   * Score an array of candidate palettes in ONE single GPU dispatch.
   * Returns per-trial { sampleError, darkWarmth, localPer, localMean, clusterA, clusterB }.
   */
  async scoreBatch(trials, { isBox = true, iterations = 30 } = {}) {
    const T = trials.length;
    if (!T) return [];
    const { device, pipe, u, m, C, darkN, clusterCounts, paperRGB, pLin } = this;
    const { numWgU, outStride } = this.ensureBatch(T);

    const trialFloats = new Float32Array(T * TRIAL_STRIDE);
    for (let t = 0; t < T; t++) packTrial(trialFloats, t * TRIAL_STRIDE, trials[t], isBox);
    device.queue.writeBuffer(this.bTrials, 0, trialFloats);

    const uBuf = new ArrayBuffer(64);
    const u32 = new Uint32Array(uBuf), f32 = new Float32Array(uBuf);
    u32[0] = u; u32[1] = T; u32[2] = C; u32[3] = numWgU;
    u32[4] = outStride; u32[5] = TRIAL_STRIDE; u32[6] = iterations; u32[7] = 0;
    f32[8] = paperRGB[0]; f32[9] = paperRGB[1]; f32[10] = paperRGB[2];
    f32[11] = pLin[0]; f32[12] = pLin[1]; f32[13] = pLin[2];
    device.queue.writeBuffer(this.bUniform, 0, uBuf);

    const bg = device.createBindGroup({
      layout: pipe.layout,
      entries: [this.bUniform, this.bUniqueD, this.bUniqueLab, this.bUniqueCluster, this.bTrials, this.bOut]
        .map((buffer, binding) => ({ binding, resource: { buffer } })),
    });

    const outBytes = T * numWgU * outStride * 4;
    device.pushErrorScope('validation');
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipe.score);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(numWgU, T, 1);
    pass.end();
    enc.copyBufferToBuffer(this.bOut, 0, this.bRead, 0, outBytes);
    device.queue.submit([enc.finish()]);
    const err = await device.popErrorScope();
    if (err) throw new Error(`palette-gpu scoreBatch validation error: ${err.message}`);

    await this.bRead.mapAsync(GPUMapMode.READ, 0, outBytes);
    const raw = new Float32Array(this.bRead.getMappedRange(0, outBytes)).slice();
    this.bRead.unmap();

    const results = [];
    for (let t = 0; t < T; t++) {
      let sampSum = 0, darkSum = 0;
      const cErr = new Float64Array(C), cA = new Float64Array(C), cB = new Float64Array(C);
      const tOff = t * numWgU * outStride;
      for (let wg = 0; wg < numWgU; wg++) {
        const o = tOff + wg * outStride;
        sampSum += raw[o];
        darkSum += raw[o + 1];
        for (let c = 0; c < C; c++) {
          cErr[c] += raw[o + 2 + c * 3];
          cA[c] += raw[o + 2 + c * 3 + 1];
          cB[c] += raw[o + 2 + c * 3 + 2];
        }
      }
      const localPer = new Array(C);
      const clusterA = new Array(C);
      const clusterB = new Array(C);
      let locSum = 0;
      for (let c = 0; c < C; c++) {
        const cnt = Math.max(1, clusterCounts[c]);
        localPer[c] = cErr[c] / cnt;
        clusterA[c] = cA[c] / cnt;
        clusterB[c] = cB[c] / cnt;
        locSum += localPer[c];
      }
      results.push({
        sampleError: sampSum / m,
        darkWarmth: darkSum / darkN,
        localPer,
        localMean: C ? locSum / C : 0,
        clusterA,
        clusterB,
      });
    }
    return results;
  }

  destroy() {
    this.bUniqueD?.destroy();
    this.bUniqueLab?.destroy();
    this.bUniqueCluster?.destroy();
    this.bUniform?.destroy();
    this.bTrials?.destroy();
    this.bOut?.destroy();
    this.bRead?.destroy();
  }
}

function keyHueCoverageFromMetrics(colours, metrics, { minChroma = 20, maxHueError = 12, minChromaRatio = 0.8, minShare = 0 } = {}) {
  const hues = [];
  for (let c = 0; c < colours.length; c++) {
    const r = colours[c];
    if (r.grey || r.C < minChroma || r.share < minShare) continue;
    const a = metrics.clusterA[c], b = metrics.clusterB[c];
    const C = Math.hypot(a, b);
    const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    const diff = Math.abs(h - r.h), hueError = C < 1 ? 180 : Math.min(diff, 360 - diff);
    const loss = Math.max(0, hueError - maxHueError, r.C * minChromaRatio - C);
    hues.push({ h: r.h, C: r.C, share: r.share, fittedHue: h, fittedChroma: C, hueError, loss });
  }
  return { hues, loss: Math.max(0, ...hues.map(r => r.loss)) };
}

/**
 * GPU-accelerated chooseBox: exact same forward/drop/warmthFix/swap search as src/crop/boxpick.mjs,
 * batching each round's trials into ONE Metal compute dispatch.
 */
export async function chooseBoxGpu(device, px, w, h, paperRGB, {
  library = BOX, min = 2, max = 5, gain = 0.25, swap = true, stride = 3,
  weight = 0, sample: preSample = null, colours = [], scorer: preScorer = null,
} = {}) {
  const sample = preSample ?? sampleSource(px, w, h, paperRGB, { stride });
  const owned = !preScorer;
  const scorer = preScorer ?? await GpuPaletteScorer.create(device, sample, colours);
  try {
    const cache = new Map();
    const keyOf = paints => paints.map(p => p.key).sort().join('+');
    const scoreOf = res => (weight > 0 ? res.sampleError + weight * res.localMean : res.sampleError);

    const evalBatch = async trials => {
      const missing = [];
      const missingKeys = new Set();
      for (const t of trials) {
        const k = keyOf(t);
        if (!cache.has(k) && !missingKeys.has(k)) { missingKeys.add(k); missing.push(t); }
      }
      if (missing.length) {
        const res = await scorer.scoreBatch(missing);
        for (let i = 0; i < missing.length; i++) cache.set(keyOf(missing[i]), res[i]);
      }
      return trials.map(t => ({ t, m: cache.get(keyOf(t)), e: scoreOf(cache.get(keyOf(t))) }));
    };
    const lowest = async trials => {
      const scored = await evalBatch(trials);
      return scored.reduce((a, b) => (b.e < a.e ? b : a));
    };

    let chosen = [];
    const trail = [];
    while (chosen.length < Math.min(max, library.length)) {
      const candidates = library.filter(p => !chosen.includes(p)).map(p => [...chosen, p]);
      const best = await lowest(candidates);
      if (chosen.length >= min) {
        const cur = (await evalBatch([chosen]))[0].e;
        if (cur - best.e < gain) break;
      }
      chosen = best.t;
      trail.push(best.e);
    }

    while (chosen.length > min) {
      const cur = (await evalBatch([chosen]))[0].e;
      const best = await lowest(chosen.map(p => chosen.filter(q => q !== p)));
      if (best.e - cur >= gain) break;
      chosen = best.t;
    }

    if (scorer.darkestL < 45 && chosen.length < max) {
      const have = (await evalBatch([chosen]))[0].m.darkWarmth;
      const want = scorer.darkWant;
      if (Math.abs(have - want) > 1.5) {
        const rem = library.filter(q => !chosen.includes(q));
        const res = await evalBatch(rem.map(p => [...chosen, p]));
        let best = null;
        for (let i = 0; i < rem.length; i++) {
          const off = Math.abs(res[i].m.darkWarmth - want);
          if (best === null || off < best.off) best = { p: rem[i], off, e: res[i].e };
        }
        if (best && best.off < Math.abs(have - want)) {
          chosen = [...chosen, best.p];
          trail.push(best.e);
        }
      }
    }

    if (swap) {
      for (let i = 0; i < chosen.length; i++) {
        const trials = library.filter(p => !chosen.includes(p)).map(p => chosen.map((q, j) => (j === i ? p : q)));
        const best = await lowest([chosen, ...trials]);
        chosen = best.t;
      }
    }

    const finalRes = (await evalBatch([chosen]))[0];
    return { paints: chosen, e: finalRes.e, trail, metrics: finalRes.m };
  } finally {
    if (owned) scorer.destroy();
  }
}

/** GPU-accelerated boxPalette (exact shape of src/crop/boxpick.mjs boxPalette). */
async function boxPaletteGpu(device, px, w, h, paperRGB, options = {}) {
  const n = w * h;
  const { paints, e, trail } = await chooseBoxGpu(device, px, w, h, paperRGB, options);
  const chroma = chromaOf(channelDensity(px, n, paperRGB), n);
  return {
    pigments: paints.map(p => boxPigment(p)),
    ink: 0, chroma, paintChroma: chroma, inkApart: 0, monochrome: false,
    box: { keys: paints.map(p => p.key), sampleError: e, trail },
  };
}

function earthPans(colours) {
  const share = colours.filter(r => r.h >= EARTH_HUE[0] && r.h <= EARTH_HUE[1] && r.C >= EARTH_C[0] && r.C <= EARTH_C[1]).reduce((a, r) => a + r.share, 0);
  return share >= EARTH_SHARE ? ['rawsienna', 'sienna', 'ultramarine'].map(k => BOX.find(p => p.key === k)) : [];
}

/** GPU-accelerated widePalette (exact match to src/crop/palettewide.mjs widePalette). */
export async function widePaletteGpu(device, px, w, h, paperRGB, lean, {
  weight = 1, gain = 0.5, min = 3, max = 6, K = 8, minShare = 0.005, minChroma = 8,
  keys = null, add = null, guard = null, extend = true,
} = {}) {
  if (!keys && (lean.monochrome || lean.pigments.length < 2)) {
    return { palette: lean, note: `palette wide: the picture is one fluid (chroma ${lean.chroma.toFixed(3)}), kept ${lean.pigments.length} (lean)` };
  }
  const sample = sampleSource(px, w, h, paperRGB, { stride: 3 });
  const colours = localColours(sample, { K, minChroma, minShare });
  const scorer = await GpuPaletteScorer.create(device, sample, colours);

  const scoreOne = async paints => {
    const [m] = await scorer.scoreBatch([paints]);
    return { e: m.sampleError + weight * m.localMean, m };
  };

  const coverKeyHuesGpu = async (paints, { max: cap = 6, library = BOX, ...options } = {}) => {
    let kept = [...paints];
    let curM = (await scorer.scoreBatch([kept]))[0];
    let coverage = keyHueCoverageFromMetrics(colours, curM, options);
    const added = [];
    while (coverage.loss > 1e-6 && kept.length < cap) {
      const rem = library.filter(p => !kept.some(q => q.key === p.key));
      if (!rem.length) break;
      const trials = rem.map(pan => [...kept, pan]);
      const batch = await scorer.scoreBatch(trials);
      let best = null;
      for (let i = 0; i < rem.length; i++) {
        const trial = keyHueCoverageFromMetrics(colours, batch[i], options);
        if (trial.loss < coverage.loss - 1e-6 && (!best || trial.loss < best.coverage.loss)) {
          best = { pan: rem[i], coverage: trial };
        }
      }
      if (!best) break;
      kept.push(best.pan);
      added.push(best.pan.key);
      coverage = best.coverage;
    }
    return { paints: kept, added, coverage };
  };

  try {
    const chosen = keys
      ? await (async () => {
        const ps = keys.map(k => BOX.find(p => p.key === k) ?? (() => { throw new Error(`--paints: no box paint ${k} (${BOX.map(p => p.key).join(', ')})`); })());
        const { e } = await scoreOne(ps);
        return { paints: ps, e, trail: [e] };
      })()
      : await chooseBoxGpu(device, px, w, h, paperRGB, { min, max, gain, weight, sample, colours, scorer });

    let guarded = null;
    if (keys && guard?.threshold > 0) {
      const ownBase = await chooseBoxGpu(device, px, w, h, paperRGB, { min, max, gain, weight, sample, colours, scorer });
      const own = (await coverKeyHuesGpu(ownBase.paints, { max })).paints;
      guarded = await guardForcedBoxBatched({
        forced: chosen.paints, own, ...guard,
        scoreBatch: async trials => (await scorer.scoreBatch(trials)).map(m => m.sampleError + weight * m.localMean),
      });
    }

    const named = guarded ? guarded.paints : chosen.paints;
    const reach = { minShare: EXPLICIT_MIN_SHARE };
    const unreached = keys && extend
      ? keyHueCoverageFromMetrics(colours, (await scorer.scoreBatch([named]))[0], reach).hues.filter(r => r.loss > 1e-6)
      : [];
    const covered = keys && !extend
      ? { paints: named, added: [], coverage: null }
      : keys
        ? await coverKeyHuesGpu(named, { max: named.length + 2, ...reach })
        : await coverKeyHuesGpu(chosen.paints, { max });

    const extra = (add || []).map(k => BOX.find(p => p.key === k) ?? (() => { throw new Error(`--paintsadd: no box paint ${k} (${BOX.map(p => p.key).join(', ')})`); })())
      .filter(p => !covered.paints.some(q => q.key === p.key));
    const earths = !keys ? earthPans(colours).filter(p => ![...covered.paints, ...extra].some(q => q.key === p.key)) : [];
    extra.push(...earths);

    const paints = [...covered.paints, ...extra];
    const changed = covered.added.length || extra.length || (guarded && guarded.decision.action !== 'kept');
    const finalM = (await scorer.scoreBatch([paints]))[0];
    const e = changed ? (finalM.sampleError + weight * finalM.localMean) : chosen.e;
    const trail = changed ? [...chosen.trail, e] : chosen.trail;
    const n = w * h, chroma = chromaOf(channelDensity(px, n, paperRGB), n);
    const palette = {
      pigments: paints.map(p => boxPigment(p)),
      ink: 0, chroma, paintChroma: chroma, inkApart: 0, monochrome: false, wide: true,
      box: { keys: paints.map(p => p.key), sampleError: e, trail },
    };
    if (guarded) palette.box.guard = guarded.decision;
    if (covered.added.length || covered.coverage?.loss > 1e-6) palette.hueCoverage = covered.coverage;
    const cols = colours.map((r, q) => `${r.grey ? 'greys ' : ''}h ${r.h.toFixed(0)} C ${r.C.toFixed(0)} ${(100 * r.share).toFixed(1)}% off ${finalM.localPer[q].toFixed(1)}`).join('; ');
    const forNote = keys && covered.added.length ? `; added ${covered.added.join(', ')} for hue ${unreached.map(r => `${r.h.toFixed(0)} C ${r.C.toFixed(0)} (${(100 * r.share).toFixed(1)}%, painted C ${r.fittedChroma.toFixed(0)})`).join(', ')}, which the named pans ${named.map(p => p.key).join(', ')} cannot reach` : '';
    const coverageNote = forNote + (palette.hueCoverage ? `; key hues ${covered.coverage.loss < 1e-6 ? 'covered' : `gap ${covered.coverage.loss.toFixed(1)} at palette limit`}${covered.added.length && !keys ? `, added ${covered.added.join(', ')}` : ''}` : '');
    const guardLine = guarded ? `\n${guardNote(guarded.decision)}` : '';
    return {
      palette,
      note: `palette wide: ${paints.length} box paints (${paints.map(p => p.name).join(', ')}), sheet and local error ${trail.map(v => v.toFixed(2)).join(' to ')}; ${colours.length} local colours: ${cols}${coverageNote}${guardLine}`,
    };
  } finally {
    scorer.destroy();
  }
}

/**
 * GPU-accelerated render of a palette's unique colours (used by paletteJudge in pickPalette).
 * Renders all unique colours in `Du` (u x 3) through unmix + 1-layer KM in ~1 ms on Metal GPU.
 */
export async function renderUniquePaletteGpu(device, Du, u, pigments, paperRGB) {
  const pipe = await getPipelines(device);
  const maxPerDim = device.limits.maxComputeWorkgroupsPerDimension;
  const uniqueD = new Float32Array(u * 4);
  for (let j = 0; j < u; j++) {
    uniqueD[j * 4] = Du[j * 3];
    uniqueD[j * 4 + 1] = Du[j * 3 + 1];
    uniqueD[j * 4 + 2] = Du[j * 3 + 2];
    uniqueD[j * 4 + 3] = 1;
  }
  const trialFloats = new Float32Array(TRIAL_STRIDE);
  packTrial(trialFloats, 0, pigments, false);

  const outBytes = u * 3 * 4;
  const bU = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bD = device.createBuffer({ size: Math.max(16, uniqueD.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const bDummy = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
  const bT = device.createBuffer({ size: trialFloats.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const bOut = device.createBuffer({ size: Math.max(16, outBytes), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const bRead = device.createBuffer({ size: Math.max(16, outBytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

  try {
    const uBuf = new ArrayBuffer(64);
    const u32 = new Uint32Array(uBuf), f32 = new Float32Array(uBuf);
    u32[0] = u; u32[1] = 1; u32[2] = 0; u32[3] = 1; u32[4] = 3; u32[5] = TRIAL_STRIDE; u32[6] = 30;
    f32[8] = paperRGB[0]; f32[9] = paperRGB[1]; f32[10] = paperRGB[2];
    device.queue.writeBuffer(bU, 0, uBuf);
    device.queue.writeBuffer(bD, 0, uniqueD);
    device.queue.writeBuffer(bT, 0, trialFloats);

    const bg = device.createBindGroup({
      layout: pipe.layout,
      entries: [bU, bD, bDummy, bDummy, bT, bOut].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    device.pushErrorScope('validation');
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipe.renderUnique);
    pass.setBindGroup(0, bg);
    dispatch1D(pass, u, 128, maxPerDim);
    pass.end();
    enc.copyBufferToBuffer(bOut, 0, bRead, 0, outBytes);
    device.queue.submit([enc.finish()]);
    const err = await device.popErrorScope();
    if (err) throw new Error(`palette-gpu renderUnique validation error: ${err.message}`);

    await bRead.mapAsync(GPUMapMode.READ);
    const raw = new Float32Array(bRead.getMappedRange(0, outBytes));
    const out = new Uint8ClampedArray(u * 3);
    for (let i = 0; i < u * 3; i++) out[i] = raw[i];
    bRead.unmap();
    return out;
  } finally {
    bU.destroy(); bD.destroy(); bDummy.destroy(); bT.destroy(); bOut.destroy(); bRead.destroy();
  }
}

/**
 * GPU-accelerated pickPalette (matches src/crop/palettepick.mjs pickPalette).
 * Uses unique-colour GPU rendering for paletteJudge and batched GPU search for boxPalette.
 */
export async function pickPaletteGpu(device, px, w, h, paperRGB, {
  pigs = 4, gain = 0.02, neutral = 0.18, palettepick = true, greypick = true, widepick = true,
  palettemargin = 2.0, greymargin = 3, boxpick = false, boxmargin = 1.0, box = {},
  rescue = 0, monoScatter = 'ink',
} = {}) {
  const n = w * h;
  const shared = new Map();
  const candidate = options => paletteOf(px, n, paperRGB, { ...options, shared });
  const lean = candidate({ paints: pigs, gainPerPigment: gain, neutralBelow: neutral, rescue, monoScatter });
  if (!palettepick) return { palette: lean, name: 'lean', note: null, e: null };

  const rich = candidate({ paints: 6, gainPerPigment: 0.005, neutralBelow: 0.08, rescue, monoScatter });
  const grey = greypick ? candidate({ paints: pigs, gainPerPigment: 0.005, neutralBelow: 0, rescue, monoScatter }) : null;
  const wide = widepick ? [
    candidate({ paints: 4, gainPerPigment: 0, neutralBelow: 0.08, rescue, monoScatter }),
    candidate({ paints: 4, gainPerPigment: 0, neutralBelow: 0, rescue, monoScatter }),
  ] : [];
  if (rich.pigments.length === lean.pigments.length && !(grey && grey.pigments.length > lean.pigments.length) && !wide.length && !boxpick) {
    return { palette: lean, name: 'lean', note: null, e: null };
  }

  // Unique colours of full image for GPU unmix+KM in paletteJudge
  const D = shared.get('density') ?? channelDensity(px, n, paperRGB);
  const seenColor = new Map(), first = [], ids = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const key = (px[i * 3] << 16) | (px[i * 3 + 1] << 8) | px[i * 3 + 2];
    let j = seenColor.get(key);
    if (j === undefined) { j = first.length; seenColor.set(key, j); first.push(i); }
    ids[i] = j;
  }
  const u = first.length, Du = new Float32Array(u * 3);
  for (let j = 0; j < u; j++) {
    const o = first[j] * 3;
    Du[j * 3] = D[o]; Du[j * 3 + 1] = D[o + 1]; Du[j * 3 + 2] = D[o + 2];
  }

  const blurRGB = buf => {
    const o = new Uint8ClampedArray(n * 3);
    const ch = new Float32Array(n);
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < n; i++) ch[i] = buf[i * 3 + c];
      const B = gaussian(ch, w, h, 2);
      for (let i = 0; i < n; i++) o[i * 3 + c] = B[i];
    }
    return o;
  };
  const blurredSrc = blurRGB(px);
  const ns = Math.ceil(n / 3);
  const srcL = new Float32Array(ns), srcA = new Float32Array(ns), srcB = new Float32Array(ns);
  const greyCells = [];
  for (let i = 0, s = 0; i < n; i += 3, s++) {
    const [L, a, b] = labOf(blurredSrc, i, paperRGB);
    srcL[s] = L; srcA[s] = a; srcB[s] = b;
    if (L < 85 && Math.hypot(a, b) < 6) greyCells.push(i);
  }
  const greyShare = greyCells.length / ns;

  const seenJudge = new Map();
  const renderedBuf = new Uint8ClampedArray(n * 3);
  const judge = async pal => {
    if (seenJudge.has(pal)) return seenJudge.get(pal);
    const uRgb = await renderUniquePaletteGpu(device, Du, u, pal.pigments, paperRGB);
    for (let i = 0; i < n; i++) {
      const o = ids[i] * 3, p = i * 3;
      renderedBuf[p] = uRgb[o]; renderedBuf[p + 1] = uRgb[o + 1]; renderedBuf[p + 2] = uRgb[o + 2];
    }
    const bl = blurRGB(renderedBuf);
    let e = 0;
    for (let i = 0, s = 0; i < n; i += 3, s++) {
      const p2 = labOf(bl, i, paperRGB);
      e += deltaE2000([srcL[s], srcA[s], srcB[s]], p2);
    }
    let tint = 0;
    for (const i of greyCells) {
      const p2 = labOf(bl, i, paperRGB);
      tint += Math.hypot(p2[1], p2[2]);
    }
    const out = { e: e / ns, tint: greyCells.length ? tint / greyCells.length : 0 };
    seenJudge.set(pal, out);
    return out;
  };

  const jl = await judge(lean);
  const jr = rich.pigments.length !== lean.pigments.length ? await judge(rich) : null;
  let pick = jr && jr.e < jl.e - palettemargin ? rich : lean;
  let note = `palette pick: ${lean.pigments.length} pigments at ${jl.e.toFixed(2)} dE00${jr ? `, ${rich.pigments.length} at ${jr.e.toFixed(2)}` : ''}`;
  for (const [k, cand] of wide.entries()) {
    const jc = await judge(cand), jp = await judge(pick);
    note += `; wide ${k ? 'with greys' : ''} ${cand.pigments.length} at ${jc.e.toFixed(2)}`;
    if (jc.e < jp.e - palettemargin) pick = cand;
  }
  const boxed = boxpick ? await boxPaletteGpu(device, px, w, h, paperRGB, box) : null;
  if (boxed) {
    const jb = await judge(boxed), jp = await judge(pick);
    note += `; box ${boxed.pigments.length} (${boxed.pigments.map(p => p.name).join(', ')}) at ${jb.e.toFixed(2)}`;
    if (jb.e < jp.e - boxmargin) pick = boxed;
  }
  if (grey && grey.pigments.length > lean.pigments.length) {
    const jg = await judge(grey), jp = await judge(pick);
    note += `; greys ${(100 * greyShare).toFixed(0)}% of cells tinted ${jp.tint.toFixed(1)}, with greys kept ${grey.pigments.length} at ${jg.e.toFixed(2)} tinted ${jg.tint.toFixed(1)}`;
    if (greyShare > 0.02 && jp.tint - jg.tint > greymargin && jg.e <= jp.e) pick = grey;
  }
  const name = pick === lean ? 'lean' : pick === rich ? 'rich' : pick === grey ? 'greys kept' : pick === boxed ? 'box' : pick === wide[0] ? 'wide' : 'wide with greys';
  return { palette: pick, name, note: `${note}; kept ${pick.pigments.length} (${name})`, e: (await judge(pick)).e };
}
