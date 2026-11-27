// Generated from src/media/gpu/section-brush-gpu.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Browser/Metal/WebGPU driver for fused small runs and parallel large section steps.
// Keeps section brush execution GPU-resident on the existing GpuSheet buffers without CPU readbacks.
import { WGSL, SMALL_CELLS, SMALL_LANES } from './section-brush-wgsl.js';
import { strokePlanShader } from './stroke-plan-budget.js';

const FLOW_WORD = 27; // step record word offset for flow count (matches section-brush-wgsl.mjs)
const X0_WORD = 28;
const Y0_WORD = 29;
const X1_WORD = 30;
const Y1_WORD = 31;
const NONE = 0xFFFFFFFF;
const OFFSHEET = 0xFFFFFFFE;
const MAX_WG = 128;
const SWORK_HDR_BYTES = 24576; // SWork fixed header (~19.5 KB) before trailing data[]
const INIT_DATA_WORDS = 1048576; // 4 MB initial scratch (partials + compacted active cells)

export class SectionBrushGpu {
  constructor(sheet, prelude) {
    this.sheet = sheet;
    const d = sheet.device;
    const code = prelude + strokePlanShader(WGSL, sheet.SB);
    const module = d.createShaderModule({ label: 'section-brush', code });

    this.dataWords = INIT_DATA_WORDS;
    this.bSwork = d.createBuffer({ size: SWORK_HDR_BYTES + this.dataWords * 4, usage: GPUBufferUsage.STORAGE });

    // Two bind group layouts so every pipeline stays <= 10 storage buffers per compute stage:
    //   bglEval  (init/eval/scale/commit): U + 7 storage buffers (M, RESIST, W, S, BSTR, BPAP, SW)
    //   bglApply (apply):                  U + 10 storage buffers (M, EVER, RESIST, W, S, G, D, FLAGS2, BSTR, SW)
    const evalEntries = [
      [0, 'uniform'],
      [1, 'storage'],
      [3, 'read-only-storage'],
      [4, 'storage'],
      [5, 'storage'],
      [9, 'storage'],
      [10, 'read-only-storage'],
      [11, 'storage'],
    ];
    const applyEntries = [
      [0, 'uniform'],
      [1, 'storage'],
      [2, 'storage'],
      [3, 'read-only-storage'],
      [4, 'storage'],
      [5, 'storage'],
      [6, 'storage'],
      [7, 'storage'],
      [8, 'storage'],
      [9, 'storage'],
      [11, 'storage'],
    ];
    this.bglEval = d.createBindGroupLayout({
      label: 'section-brush-eval-bgl',
      entries: evalEntries.map(([binding, type]) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } })),
    });
    this.bglApply = d.createBindGroupLayout({
      label: 'section-brush-apply-bgl',
      entries: applyEntries.map(([binding, type]) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } })),
    });
    this.bglFused = d.createBindGroupLayout({
      label: 'section-brush-fused-bgl',
      entries: [...applyEntries.filter(([b]) => b !== 11), [10, 'read-only-storage']]
        .map(([binding, type]) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } })),
    });
    const layoutFused = d.createPipelineLayout({ bindGroupLayouts: [this.bglFused] });
    const layoutEval = d.createPipelineLayout({ bindGroupLayouts: [this.bglEval] });
    const layoutApply = d.createPipelineLayout({ bindGroupLayouts: [this.bglApply] });
    const mk = (layout, label, entryPoint, constants) => d.createComputePipeline({
      label, layout, compute: { module, entryPoint, constants: { ...sheet.sectionConstants, ...constants } },
    });

    this.pInitRound = mk(layoutEval, 'section_init_round', 'section_init', { IS_FLAT: 0, FULL_BRUSH_PIGMENTS: 0 });
    this.pInitRoundFull = mk(layoutEval, 'section_init_round_full', 'section_init', { IS_FLAT: 0, FULL_BRUSH_PIGMENTS: 1 });
    this.pInitFlat = mk(layoutEval, 'section_init_flat', 'section_init', { IS_FLAT: 1, FULL_BRUSH_PIGMENTS: 0 });
    this.pInitFlatFull = mk(layoutEval, 'section_init_flat_full', 'section_init', { IS_FLAT: 1, FULL_BRUSH_PIGMENTS: 1 });

    this.pEvalRound = mk(layoutEval, 'section_eval_round', 'section_eval', { IS_FLAT: 0 });
    this.pEvalFlat = mk(layoutEval, 'section_eval_flat', 'section_eval', { IS_FLAT: 1 });

    this.pScale = mk(layoutEval, 'section_scale', 'section_scale');

    this.pApply = mk(layoutApply, 'section_apply', 'section_apply', { FULL_BRUSH_PIGMENTS: 0 });
    this.pApplyFull = mk(layoutApply, 'section_apply_full', 'section_apply', { FULL_BRUSH_PIGMENTS: 1 });

    this.pCommitRound = mk(layoutEval, 'section_commit_round', 'section_commit_prep', { IS_FLAT: 0, FULL_BRUSH_PIGMENTS: 0 });
    this.pCommitRoundFull = mk(layoutEval, 'section_commit_round_full', 'section_commit_prep', { IS_FLAT: 0, FULL_BRUSH_PIGMENTS: 1 });
    this.pCommitFlat = mk(layoutEval, 'section_commit_flat', 'section_commit_prep', { IS_FLAT: 1, FULL_BRUSH_PIGMENTS: 0 });
    this.pCommitFlatFull = mk(layoutEval, 'section_commit_flat_full', 'section_commit_prep', { IS_FLAT: 1, FULL_BRUSH_PIGMENTS: 1 });

    this.pSmall = [false, true].flatMap(isFlat => [false, true].map(full =>
      mk(layoutFused, 'section_run_small', 'section_run_small', { IS_FLAT: Number(isFlat), FULL_BRUSH_PIGMENTS: Number(full) })));
    this.rebuildBindGroups();
  }

  rebuildBindGroups() {
    const sh = this.sheet, d = sh.device;
    const evalBufs = [
      [0, sh.b.U], [1, sh.b.M], [3, sh.b.RESIST], [4, sh.b.W], [5, sh.b.S],
      [9, sh.b.BSTR], [10, sh.b.BPAP], [11, this.bSwork],
    ];
    const applyBufs = [
      [0, sh.b.U], [1, sh.b.M], [2, sh.b.EVER], [3, sh.b.RESIST], [4, sh.b.W],
      [5, sh.b.S], [6, sh.b.G], [7, sh.b.D], [8, sh.b.FLAGS2], [9, sh.b.BSTR], [11, this.bSwork],
    ];
    this.bgFused = d.createBindGroup({
      label: 'section-brush-fused-bg', layout: this.bglFused,
      entries: [...applyBufs.filter(([b]) => b !== 11), [10, sh.b.BPAP]]
        .map(([binding, buffer]) => ({ binding, resource: { buffer } })),
    });
    this.bgEval = d.createBindGroup({
      label: 'section-brush-eval-bg',
      layout: this.bglEval,
      entries: evalBufs.map(([binding, buffer]) => ({ binding, resource: { buffer } })),
    });
    this.bgApply = d.createBindGroup({
      label: 'section-brush-apply-bg',
      layout: this.bglApply,
      entries: applyBufs.map(([binding, buffer]) => ({ binding, resource: { buffer } })),
    });
  }

  ensureScratch(U, nSteps, sp, s0) {
    const lanes = U[0], K = U[1];
    let maxCells = 0;
    for (let s = 0; s < nSteps; s++) {
      const base = s0 + s * sp;
      const x0 = U[base + X0_WORD];
      if (x0 !== NONE && x0 !== OFFSHEET) {
        const nc = (U[base + X1_WORD] - x0 + 1) * (U[base + Y1_WORD] - U[base + Y0_WORD] + 1);
        if (nc > maxCells) maxCells = nc;
      }
    }
    const partWords = MAX_WG * lanes * Math.max(4, 2 + K);
    const needWords = partWords + maxCells * 4;
    if (needWords <= this.dataWords) return;
    const sh = this.sheet;
    if (sh.batchEncoder) sh.flushStrokes();
    const limits = sh.device.limits ?? {};
    const limit = Math.min(limits.maxStorageBufferBindingSize ?? Infinity, limits.maxBufferSize ?? Infinity);
    const needBytes = SWORK_HDR_BYTES + needWords * 4;
    if (needBytes > limit) throw new Error(`SectionBrushGpu scratch ${needBytes} B exceeds device limit ${limit} B`);
    let next = this.dataWords;
    while (next < needWords) next *= 2;
    const maxWords = Number.isFinite(limit) ? Math.floor((limit - SWORK_HDR_BYTES) / 4) : next;
    next = Math.min(next, maxWords);
    const nextBuf = sh.device.createBuffer({ size: SWORK_HDR_BYTES + next * 4, usage: GPUBufferUsage.STORAGE });
    const oldBuf = this.bSwork;
    this.dataWords = next;
    this.bSwork = nextBuf;
    this.rebuildBindGroups();
    if (typeof sh.device.queue?.onSubmittedWorkDone === 'function') {
      sh.device.queue.onSubmittedWorkDone().finally(() => oldBuf.destroy());
    } else {
      oldBuf.destroy();
    }
  }

  pipelines(isFlat, full) {
    return {
      pSmall: this.pSmall[Number(isFlat) * 2 + Number(full)],
      pInit: isFlat ? (full ? this.pInitFlatFull : this.pInitFlat) : (full ? this.pInitRoundFull : this.pInitRound),
      pEval: isFlat ? this.pEvalFlat : this.pEvalRound,
      pScale: this.pScale,
      pApply: full ? this.pApplyFull : this.pApply,
      pCommit: isFlat ? (full ? this.pCommitFlatFull : this.pCommitFlat) : (full ? this.pCommitRoundFull : this.pCommitRound),
    };
  }

  *encodeRuns(getPass, U, nSteps, sp, s0, pipes) {
    const { pInit, pEval, pScale, pApply, pCommit, pSmall } = pipes;
    const small = s => U[0] <= SMALL_LANES && this.cells(U, s0 + s * sp) <= SMALL_CELLS;
    if (this.sheet?.device?.dispatchProfile) {
      const bins = this.footprints ??= {};
      for (let s = 0; s < nSteps; s++) {
        const cells = this.cells(U, s0 + s * sp);
        const bin = [512, 1024, 2048, 4096].find(n => cells <= n) ?? 'larger';
        bins[bin] = (bins[bin] ?? 0) + 1;
      }
    }
    let parallelReady = false;
    for (let s = 0; s < nSteps;) {
      const pass = getPass();
      if (small(s)) {
        do { s++; } while (s < nSteps && !U[s0 + (s - 1) * sp + FLOW_WORD] && small(s));
        pass.setBindGroup(0, this.bgFused); pass.setPipeline(pSmall); pass.dispatchWorkgroups(1);
        this.smallDispatches = (this.smallDispatches ?? 0) + 1;
        parallelReady = false;
      } else {
        pass.setBindGroup(0, this.bgEval);
        if (!parallelReady) { pass.setPipeline(pInit); pass.dispatchWorkgroups(1); }
        const nCells = this.cells(U, s0 + s * sp);
        if (nCells) {
          const nWG = Math.min(MAX_WG, (nCells + 255) >>> 8);
          pass.setPipeline(pEval); pass.dispatchWorkgroups(nWG);
          pass.setPipeline(pScale); pass.dispatchWorkgroups(1);
          pass.setBindGroup(0, this.bgApply); pass.setPipeline(pApply); pass.dispatchWorkgroups(nWG);
          pass.setBindGroup(0, this.bgEval);
        }
        pass.setPipeline(pCommit); pass.dispatchWorkgroups(1);
        this.largeSteps = (this.largeSteps ?? 0) + 1;
        parallelReady = true; s++;
      }
      yield { s: s - 1, flows: U[s0 + (s - 1) * sp + FLOW_WORD] };
    }
  }

  cells(U, base) {
    const x0 = U[base + X0_WORD];
    return x0 === NONE || x0 === OFFSHEET ? 0
      : (U[base + X1_WORD] - x0 + 1) * (U[base + Y1_WORD] - U[base + Y0_WORD] + 1);
  }

  /** Hold subsequent worker messages while a mid-stroke edge-feed refresh splits this stroke. */
  strokeEncoding(data, nSteps, sp, s0) {
    const sh = this.sheet;
    if (!sh.efOn) return null;
    const U = new Uint32Array(data.buffer, data.byteOffset, data.length);
    let flows = false;
    for (let s = 0; s < nSteps && !flows; s++) flows = U[s0 + s * sp + FLOW_WORD] > 0;
    if (!flows) return null;
    let release;
    sh.encoding = new Promise(r => { release = r; });
    return () => { sh.encoding = null; release(); };
  }

  async run(data, info) {
    const sh = this.sheet;
    if (sh.ef) { sh.ef.stale = true; sh.ef.batch = 1; }
    const done = this.strokeEncoding(data, info.nSteps, info.sp, info.s0);
    try {
      if (sh.batch && info.slot !== undefined) return await this.queue(data, info);
      return await this.runNow(data, info, done);
    } finally { done?.(); }
  }

  async runNow(data, { planFloats, nSteps, sp, s0, rect, cont, h0 }, split) {
    const sh = this.sheet, d = sh.device;
    if (sh.lv) sh.lv.light = false;
    const U32 = new Uint32Array(data.buffer, data.byteOffset, data.length);
    if (data.length > sh.SB) throw new Error('GpuSheet: the section stroke plan is too long');
    this.ensureScratch(U32, nSteps, sp, s0);
    const wr = (from, to) => { if (to > from) d.queue.writeBuffer(sh.b.BSTR, from * 4, data, from, to - from); };
    if (cont === 2) { wr(0, h0); wr(s0, data.length); }
    else wr(0, data.length);
    sh.bumpFor(rect); sh.gpuAhead = true;
    let enc = d.createCommandEncoder(), pass = sh.timestamps.begin(enc, 'runSectionStroke');
    const pipes = this.pipelines(U32[2] !== 0, data[35] > 0);
    for (const { flows } of this.encodeRuns(() => pass, U32, nSteps, sp, s0, pipes)) {
      if (flows) {
        if (split && !sh.efCanLag()) {
          sh.efWatch(pass); pass.end(); d.queue.submit([enc.finish()]);
          await sh.efMidStroke();
          enc = d.createCommandEncoder(); pass = sh.timestamps.begin(enc, 'runSectionStroke');
        }
        if (sh.ef) { sh.ef.steps = (sh.ef.steps ?? 0) + flows; sh.ef.statusFresh = false; }
        for (let q = 0; q < flows; q++) sh.stepsInPass(pass, 1);
      }
    }
    pass.end();
    const bytes = planFloats * 4;
    const rb = d.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    enc.copyBufferToBuffer(sh.b.BSTR, 0, rb, 0, bytes);
    d.queue.submit([enc.finish()]);
    sh.readCountLater(false);
    await rb.mapAsync(GPUMapMode.READ, 0, bytes);
    const out = new Float32Array(rb.getMappedRange(0, bytes).slice(0));
    rb.destroy();
    return out;
  }

  async queue(data, info) {
    const sh = this.sheet, d = sh.device;
    if (sh.lv) sh.lv.light = false;
    if (sh.ef) { sh.ef.stale = true; sh.ef.batch = 1; }
    const { planFloats, nSteps, sp, s0, cont, h0, seq, state, restore } = info;
    const split = !!sh.encoding;
    if (data.length > sh.SB || planFloats > 6144) throw new Error('section stroke exceeds GPU slot');
    const U = new Uint32Array(data.buffer, data.byteOffset, data.length);
    this.ensureScratch(U, nSteps, sp, s0);
    const bytes = data.byteLength, align = Math.ceil(bytes / 4) * 4, cap = 8 * 1024 * 1024;
    if ((sh.batchBytes ?? 0) + align > cap && sh.batchEncoder) sh.flushStrokes();
    let src, off = 0;
    if (d.queue.writeBuffer && align <= cap) {
      src = sh.batchStaging ??= d.createBuffer({ size: cap, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
      off = sh.batchBytes ?? 0; d.queue.writeBuffer(src, off, data);
    } else {
      src = d.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_SRC, mappedAtCreation: true });
      new Float32Array(src.getMappedRange()).set(data); src.unmap(); sh.batchItems.push(src);
    }
    let enc = sh.batchEncoder ??= d.createCommandEncoder();
    if (restore !== undefined && cont === 2) {
      const prev = sh.brushSlots.get(restore);
      if (!prev) throw new Error('missing resident section brush');
      enc.copyBufferToBuffer(prev.buffer, h0 * 4, sh.b.BSTR, h0 * 4, (s0 - h0) * 4);
    }
    const cp = (a, b) => { if (b > a) enc.copyBufferToBuffer(src, off + a * 4, sh.b.BSTR, a * 4, (b - a) * 4); };
    if (cont === 2) { cp(0, h0); cp(s0, data.length); }
    else cp(0, data.length);
    const pipes = this.pipelines(U[2] !== 0, data[35] > 0);
    let pass = sh.timestamps.begin(enc, 'queueSectionStroke');
    for (const { flows } of this.encodeRuns(() => pass, U, nSteps, sp, s0, pipes)) {
      if (flows) {
        if (split && !sh.efCanLag()) {
          sh.efWatch(pass); pass.end();
          await sh.efMidStroke();
          enc = sh.batchEncoder ??= d.createCommandEncoder();
          pass = sh.timestamps.begin(enc, 'queueSectionStroke');
        }
        if (sh.ef) { sh.ef.steps = (sh.ef.steps ?? 0) + flows; sh.ef.statusFresh = false; }
        sh.stepsInPass(pass, flows);
      }
    }
    pass.end();
    const saved = sh.brushBuffer(state, planFloats * 4);
    enc.copyBufferToBuffer(sh.b.BSTR, 0, saved.buffer, 0, planFloats * 4);
    Object.assign(saved, { seq, bytes: planFloats * 4 });
    sh.batchCount = (sh.batchCount ?? 0) + 1; sh.batchBytes = (sh.batchBytes ?? 0) + align;
    sh.epoch++; sh.knownDry = false; sh.gpuAhead = true;
    if (sh.batchCount >= 32 || sh.batchBytes >= 8 * 1024 * 1024) sh.flushStrokes();
    return null;
  }
}
