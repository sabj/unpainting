// The lab's side of the WebGPU sheet. Two copies of the sheet exist: the GPU copy is ahead after every step and fix, and the
// CPU copy (sheet.js's arrays) is what the brush, pen and pencil read and write. A stroke reads the stale tiles of its
// rectangle back first, works on the CPU copy, and writes the rectangle up. Anything that reads the whole sheet (the CPU render
// probe, the equivalence check) calls syncAll. The colour render reads the GPU buffers directly.
//
// Every call is async and must run under the worker's lock, in order. Nothing here touches the DOM.
import { stroke } from '../media/brush.js';
import { GpuSheet, openDevice } from './gpu-sheet.js';
import { Composer } from './gpu-compose.js';
import { GpuFinish } from './gpu-finish.js';
import { FreshMap } from './fresh.js';

const PLANES = K => 4 + 3 * K;

export class GpuPhysics {
  static async create(pigments, options, gpu) {
    const { adapter, device, name } = await openDevice(gpu);
    try {
      const p = new GpuPhysics(device, name, pigments);
      p.adapter = adapter;
      p.sheet = await GpuSheet.create(device, pigments, options);
      p.composer = new Composer(device, pigments);
      p.finish = new GpuFinish(device, 2);
      await p.composer.ready;
      if (p.composer.error) throw new Error(`compose shader: ${p.composer.error.slice(0, 200)}`);
      return p;
    } catch (e) { device.destroy(); throw e; }
  }
  constructor(device, name, pigments) {
    this.device = device; this.name = name; this.pigments = pigments; this.K = pigments.length;
    this.stale = false; this.topStale = false; this.fresh = null;
    this.stats = { steps: 0, stepMs: 0, down: 0, downMs: 0, downBytes: 0, up: 0, upMs: 0, fixes: 0, fullDown: 0, fullUp: 0 };
    this.lost = null;
    device.lost.then(info => { this.lost = info.message || info.reason || 'device lost'; this.onLost?.(this.lost); });
  }
  /** Put a new (CPU) sheet on the GPU. */
  async load(sheet, baseR, graphite) {
    // the biggest buffer is the scratch for four planes per pigment; a device with the 128 MiB limit (Safari, phones) cannot hold a large sheet
    const limits = this.device.limits, widest = sheet.n * 16 * this.K, allowed = Math.min(limits.maxStorageBufferBindingSize, limits.maxBufferSize);
    if (widest > allowed) throw new Error(`a ${sheet.w} x ${sheet.h} sheet needs a ${(widest / 1048576).toFixed(0)} MB buffer and this adapter allows ${(allowed / 1048576).toFixed(0)} MB`);
    this.device.pushErrorScope('out-of-memory'); this.device.pushErrorScope('validation');
    await this.sectionPending;
    this.sectionWrote = false;
    this.sheet.sectionBrush?.labReadback?.destroy();
    this.sheet.attach(sheet); this.composer.attach(this.sheet, baseR, graphite);
    const bad = await this.device.popErrorScope(), oom = await this.device.popErrorScope();
    if (bad || oom) throw new Error(`attaching the sheet failed: ${(bad || oom).message.slice(0, 200)}`);
    this.w = sheet.w; this.h = sheet.h; this.n = sheet.n;
    this.fresh = new FreshMap(sheet.w, sheet.h); this.stale = false; this.topStale = false;
    this.finish?.invalidate(false);
    // Compile Section before the first hand stroke. A zero-step plan performs
    // no cell exchange; upload restores the scheduler's initial wet bounds.
    await GpuSheet.prototype.runSectionStroke.call(this.sheet, new Float32Array(64), { planFloats: 64, nSteps: 0, sp: 32, s0: 64, rect: [0, 0, 1, 1], mask: 0 });
    this.sheet.sectionBrush.runNow = runSectionNow;
    this.sheet.upload(sheet);
    const link = new SectionPlanLink(this, sheet);
    this.sectionLink = link;
    sheet._sectionStroke = (brush, path, options) => {
      sheet._gpu = link;
      try { return stroke(brush, sheet, path, options); }
      finally { sheet._gpu = null; }
    };
  }
  /** Re-upload state into existing GPU buffers without destroying/reallocating them (same W, H, K). */
  upload(sheet) {
    this.stats.fullUp++;
    this.sectionWrote = false;
    this.sheet.upload(sheet);
    this.fresh = new FreshMap(sheet.w, sheet.h); this.stale = false; this.topStale = false;
  }
  setOptions(o) { this.sheet.setOptions(o); }
  /**
   * The sheet's pigments changed (a new sheet, or a pigment a brush used for the first time). The kernels take the count as
   * a uniform, so nothing recompiles; the buffers are sized by it, so load() must follow with the CPU copy made current.
   */
  setPigments(pigments) {
    if (pigments.length > 16) throw new Error('GpuPhysics: at most 16 pigments');
    this.pigments = pigments; this.K = pigments.length;
    this.sheet.pigments = pigments; this.sheet.K = pigments.length;
    this.composer.pigments = pigments; this.composer.K = pigments.length;
  }

  // ---- stepping ----------------------------------------------------------------------------------------------------
  /** Run `steps` steps; resolves to whether anything is still wet. */
  async step(steps) {
    await this.sectionPending;
    const gs = this.sheet, t = performance.now(), ran = !gs.knownDry;
    const wet = await gs.advance(steps);
    if (ran) { this.stale = true; this.topStale = true; this.fresh.stale(); this.stats.steps += steps; this.stats.stepMs += performance.now() - t; }
    return wet;
  }
  /** The same steps with GPU-side stopping at the original surface-dry quantum. */
  async stepSurface(steps, quantum) {
    await this.sectionPending;
    const t = performance.now(), result = await this.sheet.advanceSurface(steps, quantum);
    if (result.steps) { this.stale = true; this.topStale = true; this.fresh.stale(); this.stats.steps += result.steps; this.stats.stepMs += performance.now() - t; }
    return result;
  }
  /**
   * Dry (fix) the sheet: pores into the deposit, the deposit becomes the top layer.
   * When `foldOnGpu` is true (no resist/liveTape), folds any superseded TOP directly into GPU BASE
   * (zero CPU glaze() and zero baseR upload), and optionally folds into the 2x smooth fineBase on GPU!
   */
  async fix(sheet, baseR = null, { foldOnGpu = false, foldFine = false } = {}) {
    await this.sectionPending;
    let foldedOnGpu = false;
    // Fixed-bed transport needs the retained layers after CPU mutations too.
    const onFoldTop = foldOnGpu && !(this.sheet.o.fixedBed > 0) ? async () => {
      if (foldFine && this.finish && baseR) {
        // Pull only active channels of superseded TOP to fold at 2x smooth resolution into fineBase
        const n = this.n, K = this.K, active = this.sheet.act;
        const layer = Array.from({ length: K }, () => new Float32Array(n));
        for (const k of active) {
          layer[k].set(new Float32Array(await this.sheet.readWords('TOP', n * 4, k * n * 4)));
        }
        try {
          if (this.composer.baseAhead) await this.composer.syncBase(baseR);
          await this.finish.foldLayer({ layer, pigments: this.pigments, paper: sheet.paper, baseR });
        } catch {
          this.finish.invalidate(false);
        }
      }
      this.composer.foldTop();
      foldedOnGpu = true;
    } : null;
    const pushed = await this.sheet.fixInto(sheet, onFoldTop);
    this.stale = true; this.topStale = true; this.fresh.stale(); this.stats.fixes++;
    return { pushed, foldedOnGpu };
  }

  // ---- strokes ---------------------------------------------------------------------------------------------------
  /** The rectangle of the sheet a stroke can touch: `points` plus `reach` cells on every side, clipped to the sheet. */
  rect(points, reach) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of points) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
    const b = Math.ceil(reach), X0 = Math.max(0, Math.floor(x0 - b)), Y0 = Math.max(0, Math.floor(y0 - b)), X1 = Math.min(this.w - 1, Math.ceil(x1 + b)), Y1 = Math.min(this.h - 1, Math.ceil(y1 + b));
    if (![X0, Y0, X1, Y1].every(Number.isFinite) || X1 < X0 || Y1 < Y0) return [0, 0, this.w, this.h];
    const A = Math.min(X0, this.w - 1), B = Math.min(Y0, this.h - 1);
    return [A, B, Math.max(1, X1 - A + 1), Math.max(1, Y1 - B + 1)];
  }
  /** Make the CPU copy current inside `rect` before an instrument reads or writes it. */
  async ensureFresh(sheet, rect) {
    await this.sectionPending;
    this.sectionWrote = false;
    if (!this.stale) return;
    const need = this.fresh.staleBounds(rect); if (!need) return;
    const t = performance.now(); await this.sheet.syncDown(sheet, need); this.fresh.mark(need);
    this.stats.down++; this.stats.downMs += performance.now() - t; this.stats.downBytes += need[2] * need[3] * PLANES(this.K) * 4;
  }
  /** The instrument wrote into `rect` on the CPU copy: send it up. */
  up(sheet, rect) {
    if (this.sectionWrote) { this.sectionWrote = false; return; }
    const t = performance.now(); this.sheet.syncUp(sheet, rect); if (this.stale) this.fresh.mark(rect);
    this.stats.up++; this.stats.upMs += performance.now() - t;
  }

  // ---- whole-sheet coherence ---------------------------------------------------------------------------------------
  /** The CPU copy current everywhere (the CPU render probe, the equivalence check, undo/autosave, 2x finish). */
  async syncAll(sheet, baseR = null) {
    await this.sectionPending;
    this.sectionWrote = false;
    if (baseR && this.composer.baseAhead) await this.composer.syncBase(baseR);
    if (!this.stale && !this.topStale) return;
    await this.sheet.download(sheet); this.stale = false; this.topStale = false; this.fresh.fresh(); this.stats.fullDown++;
  }

  /** Queue an immutable stroke boundary, without mapping or downloading it.
   * The worker materializes it only after input rests (or before undo).
   * Buffers belong to the checkpoint, so another stroke cannot overwrite it.
   */
  // Masked/tape rendering uploads a temporary glazed base. Only an unmasked
  // GPU fold can supersede the canonical CPU base saved by the worker.
  captureBase(sheet, { baseIsBare = false } = {}) {
    return !baseIsBare && !sheet.resist && !sheet._liveTape && this.composer.baseAhead;
  }
  captureStateBytes(sheet, options) {
    return this.n * 4 * (4 + this.K * (3 + (this.sheet.hasTop && sheet.layers.length > 0 ? 1 : 0))
      + (this.captureBase(sheet, options) ? 3 : 0));
  }
  captureState(sheet, options) {
    const d = this.device, n = this.n, planes = [], top = this.sheet.hasTop && sheet.layers.length > 0;
    for (const [name, field] of [['W', 'W'], ['S', 's'], ['M', 'M'], ['EVER', 'ever']])
      planes.push({ buffer: this.sheet.b[name], field, Type: sheet[field].constructor, words: n });
    for (const field of ['G', 'P', 'D', ...(top ? ['layers'] : [])]) {
      const name = field === 'layers' ? 'TOP' : field;
      for (let k = 0; k < this.K; k++) planes.push({ buffer: this.sheet.b[name], offset: k * n * 4, field, k, Type: Float32Array, words: n });
    }
    if (this.captureBase(sheet, options)) planes.push({ buffer: this.composer.base, field: 'baseR', Type: Float32Array, words: n * 3 });
    const buffers = [], enc = d.createCommandEncoder();
    const limit = d.limits.maxBufferSize;
    let bytes = 0, group = [];
    const flush = () => {
      if (!bytes) return;
      const rb = d.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      let at = 0;
      for (const p of group) { enc.copyBufferToBuffer(p.buffer, p.offset ?? 0, rb, at, p.words * 4); p.at = at; at += p.words * 4; }
      buffers.push({ rb, planes: group }); group = []; bytes = 0;
    };
    for (const p of planes) { if (bytes + p.words * 4 > limit) flush(); group.push(p); bytes += p.words * 4; }
    flush(); d.queue.submit([enc.finish()]);
    const dispose = () => { for (const { rb } of buffers) rb.destroy(); };
    return { bytes: planes.reduce((sum, p) => sum + p.words * 4, 0), dispose, read: async () => {
      const fields = {}, result = { fields, top };
      try {
        for (const { rb, planes } of buffers) {
          await rb.mapAsync(GPUMapMode.READ);
          const data = rb.getMappedRange();
          for (const p of planes) {
            const raw = new (p.field === 'M' || p.field === 'ever' ? Uint32Array : Float32Array)(data, p.at, p.words);
            const value = new p.Type(raw);
            if (p.field === 'baseR') result.baseR = value;
            else if (p.k === undefined) fields[p.field] = value;
            else (fields[p.field] ??= [])[p.k] = value;
          }
          rb.unmap();
        }
        return result;
      } finally { dispose(); }
    } };
  }

  // ---- render ----------------------------------------------------------------------------------------------------
  draw(ctx) { this.composer.draw(ctx); }
  presentRgba(ctx, rgba) { this.composer.presentRgba(ctx, rgba); }
  readPixels() { return this.composer.readPixels(); }
  setBase(baseR) { this.composer.setBase(baseR); }
  setGraphite(g) { this.composer.setGraphite(g); }
  async idle() { await this.sectionPending; await this.sheet.idle(); }
  destroy() { try { this.sheet.sectionBrush?.labReadback?.destroy(); this.sheet.destroy(); this.composer.release(); this.device.destroy(); } catch { /* already gone */ } }
}

// Same Section submission/continuation protocol as SectionBrushGpu.runNow,
// with one reusable small reservoir readback instead of a new buffer per move.
// The worker serializes segments because planning needs the actual brush load.
async function runSectionNow(data, { planFloats, nSteps, sp, s0, rect, cont, h0 }, split) {
  const sh = this.sheet, d = sh.device, U = new Uint32Array(data.buffer, data.byteOffset, data.length);
  if (data.length > sh.SB) throw new Error('GpuSheet: the section stroke plan is too long');
  this.ensureScratch(U, nSteps, sp, s0);
  const wr = (a, b) => { if (b > a) d.queue.writeBuffer(sh.b.BSTR, a * 4, data, a, b - a); };
  if (cont === 2) { wr(0, h0); wr(s0, data.length); } else wr(0, data.length);
  sh.bumpFor(rect); sh.gpuAhead = true;
  let enc = d.createCommandEncoder(), pass = sh.timestamps.begin(enc, 'runSectionStroke');
  const pipes = this.pipelines(U[2] !== 0, data[35] > 0);
  for (const { flows } of this.encodeRuns(() => pass, U, nSteps, sp, s0, pipes)) {
    if (!flows) continue;
    if (split && !sh.efCanLag()) { sh.efWatch(pass); pass.end(); d.queue.submit([enc.finish()]); await sh.efMidStroke(); enc = d.createCommandEncoder(); pass = sh.timestamps.begin(enc, 'runSectionStroke'); }
    if (sh.ef) { sh.ef.steps = (sh.ef.steps ?? 0) + flows; sh.ef.statusFresh = false; }
    for (let q = 0; q < flows; q++) sh.stepsInPass(pass, 1);
  }
  pass.end();
  const bytes = planFloats * 4;
  if (!this.labReadback || this.labReadback.size < bytes) {
    this.labReadback?.destroy();
    this.labReadback = d.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  }
  const rb = this.labReadback;
  enc.copyBufferToBuffer(sh.b.BSTR, 0, rb, 0, bytes); d.queue.submit([enc.finish()]); sh.readCountLater(false);
  await rb.mapAsync(GPUMapMode.READ, 0, bytes);
  try { return new Float32Array(rb.getMappedRange(0, bytes).slice(0)); }
  finally { rb.unmap(); }
}

/** A section-only planning link: geometry stays in brush.js, all cell exchange stays on GPU. */
class SectionPlanLink {
  constructor(phys, sheet) {
    this.phys = phys; this.sheet = sheet; this.w = sheet.w; this.h = sheet.h;
    this.brushGpu = true; this.strokePlanCapacity = 3900000;
    this.stats = {};
  }
  beginSectionPlan(sheet, brush, p) {
    const { K, lanes, nClumps } = p, HS = 4 + K, H0 = 64, S0 = H0 + (lanes + 1) * HS, SP = 32 + nClumps;
    const plan = { K, lanes, nClumps, HS, H0, S0, SP, n: 0, cap: 0, x0: this.w, y0: this.h, x1: -1, y1: -1 };
    plan.grow = cap => {
      const buf = new ArrayBuffer((S0 + cap * SP) * 4);
      if (plan.F) new Uint8Array(buf).set(new Uint8Array(plan.F.buffer, 0, (S0 + plan.n * SP) * 4));
      plan.cap = cap; plan.F = new Float32Array(buf); plan.U = new Uint32Array(buf);
    };
    plan.grow(128);
    plan.step = () => { if (plan.n === plan.cap) plan.grow(plan.cap * 2); return S0 + plan.n++ * SP; };
    const { F, U } = plan;
    U[0] = lanes; U[1] = K; U[2] = Number(brush.flat); U[3] = Number(!!sheet.wetting);
    F.set([brush.capacity, p.capB, p.keep, p.Hb, p.g, p.kF, p.ka, brush.bridge, p.relief, p.soft, p.tlo, p.tspan, p.ET, p.vr], 4);
    U[18] = p.ends.length; U[22] = brush.rs.s >>> 16; U[23] = brush.rs.s & 65535;
    U[26] = SP; U[27] = H0; U[28] = S0; U[29] = HS;
    F[35] = brush.resP.some(v => Object.is(v, -0)) || brush.hairs.some(h => h.pig.some(v => Object.is(v, -0))) ? 1 : 0;
    p.ends.slice(0, 2).forEach((e, q) => { F.set([e.x, e.y, e.tx, e.ty, e.r2], 36 + q * 5); F.set([e.s0 ?? 0, e.s1 ?? 1e9], 46 + q * 2); });
    for (let j = 0; j <= lanes; j++) {
      const b = H0 + j * HS, hr = brush.hairs[j];
      F[b] = hr ? hr.water : brush.resW;
      if (hr) { F[b + 1] = hr.len; U[b + 2] = hr.clump; }
      const pig = hr ? hr.pig : brush.resP;
      F.set(pig, b + 4);
      for (let k = 0; k < K; k++) if (pig[k] !== 0 || Object.is(pig[k], -0)) plan.mask = (plan.mask ?? 0) | (1 << k);
    }
    return plan;
  }
  endSectionPlan(sheet, brush, plan, rect) {
    this.phys.sectionWrote = true;
    if (!plan.n) return;
    const { F, U, S0, SP, H0, HS, lanes, K } = plan;
    U[24] = plan.n;
    const end = S0 + plan.n * SP, clip = sheet.clip;
    const hasBox = plan.x1 >= plan.x0 && plan.y1 >= plan.y0;
    const rw = hasBox ? plan.x1 - plan.x0 + 1 : 0, rh = hasBox ? plan.y1 - plan.y0 + 1 : 0;
    const offClip = clip && hasBox ? end : 0;
    U[19] = offClip;
    if (offClip) { U[20] = plan.x0; U[21] = plan.y0; U[30] = rw; U[31] = rh; }
    const data = new Float32Array(end + (offClip ? Math.ceil(rw * rh / 32) : 0)); data.set(F.subarray(0, end));
    if (offClip) {
      const du = new Uint32Array(data.buffer);
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const c = y * rw + x;
        if (clip[(plan.y0 + y) * this.w + plan.x0 + x]) du[offClip + (c >>> 5)] |= 1 << (c & 31);
      }
    }
    const read = value => {
      const floor = -(2 ** -23) * Math.max(1, brush.capacity);
      if (!(value >= floor)) throw new Error(`GPU section brush readback below float32 rounding: ${value}`);
      return value < 0 ? 0 : value;
    };
    const phys = this.phys;
    phys.sectionWrote = true; phys.stale = true; phys.fresh.stale();
    this.stats.sectionGpuStrokes = (this.stats.sectionGpuStrokes ?? 0) + 1;
    phys.sectionPending = phys.sheet.runSectionStroke(data, {
      planFloats: S0, nSteps: plan.n, sp: SP, s0: S0, rect, h0: H0, mask: plan.mask,
    }).then(out => {
      for (let j = 0; j <= lanes; j++) {
        const b = H0 + j * HS, hr = brush.hairs[j];
        if (hr) { hr.water = read(out[b]); for (let k = 0; k < K; k++) hr.pig[k] = read(out[b + 4 + k]); }
        else { brush.resW = read(out[b]); for (let k = 0; k < K; k++) brush.resP[k] = read(out[b + 4 + k]); }
      }
    });
    // Keep failures observable at the next awaited physics operation.
    phys.sectionPending.catch(() => {});
  }
  beginStroke() {
    if (this.phys.sectionGpuOnly) throw new Error('Section GPU admission rejected the plan; CPU sheet is stale');
  }
  endStroke() {}
}
