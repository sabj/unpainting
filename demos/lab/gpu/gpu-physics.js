// The lab's side of the WebGPU sheet. Two copies of the sheet exist: the GPU copy is ahead after every step and fix, and the
// CPU copy (sheet.js's arrays) is what the brush, pen and pencil read and write. A stroke reads the stale tiles of its
// rectangle back first, works on the CPU copy, and writes the rectangle up. Anything that reads the whole sheet (the CPU render
// probe, the equivalence check) calls syncAll. The colour render reads the GPU buffers directly.
//
// Every call is async and must run under the worker's lock, in order. Nothing here touches the DOM.
import { GpuSheet, openDevice } from './gpu-sheet.js';
import { Composer } from './gpu-compose.js';
import { FreshMap } from './fresh.js';

const PLANES = K => 4 + 3 * K;

export class GpuPhysics {
  static async create(pigments, options, gpu) {
    const { device, name } = await openDevice(gpu);
    try {
      const p = new GpuPhysics(device, name, pigments);
      p.sheet = await GpuSheet.create(device, pigments, options);
      p.composer = new Composer(device, pigments);
      await p.composer.ready;
      if (p.composer.error) throw new Error(`compose shader: ${p.composer.error.slice(0, 200)}`);
      return p;
    } catch (e) { device.destroy(); throw e; }
  }
  constructor(device, name, pigments) {
    this.device = device; this.name = name; this.pigments = pigments; this.K = pigments.length;
    this.stale = false; this.topStale = false; this.fresh = null;
    this.stats = { steps: 0, stepMs: 0, down: 0, downMs: 0, downBytes: 0, up: 0, upMs: 0, fixes: 0, fullDown: 0 };
    this.lost = null;
    device.lost.then(info => { this.lost = info.message || info.reason || 'device lost'; this.onLost?.(this.lost); });
  }
  /** Put a new (CPU) sheet on the GPU. */
  async load(sheet, baseR, graphite) {
    // the biggest buffer is the scratch for four planes per pigment; a device with the 128 MiB limit (Safari, phones) cannot hold a large sheet
    const limits = this.device.limits, widest = sheet.n * 16 * this.K, allowed = Math.min(limits.maxStorageBufferBindingSize, limits.maxBufferSize);
    if (widest > allowed) throw new Error(`a ${sheet.w} x ${sheet.h} sheet needs a ${(widest / 1048576).toFixed(0)} MB buffer and this adapter allows ${(allowed / 1048576).toFixed(0)} MB`);
    this.device.pushErrorScope('out-of-memory'); this.device.pushErrorScope('validation');
    this.sheet.attach(sheet); this.composer.attach(this.sheet, baseR, graphite);
    const bad = await this.device.popErrorScope(), oom = await this.device.popErrorScope();
    if (bad || oom) throw new Error(`attaching the sheet failed: ${(bad || oom).message.slice(0, 200)}`);
    this.w = sheet.w; this.h = sheet.h; this.n = sheet.n;
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
    const gs = this.sheet, t = performance.now(), ran = !gs.knownDry;
    const wet = await gs.advance(steps);
    if (ran) { this.stale = true; this.topStale = true; this.fresh.stale(); this.stats.steps += steps; this.stats.stepMs += performance.now() - t; }
    return wet;
  }
  /** The same steps with GPU-side stopping at the original surface-dry quantum. */
  async stepSurface(steps, quantum) {
    const t = performance.now(), result = await this.sheet.advanceSurface(steps, quantum);
    if (result.steps) { this.stale = true; this.topStale = true; this.fresh.stale(); this.stats.steps += result.steps; this.stats.stepMs += performance.now() - t; }
    return result;
  }
  /** Dry (fix) the sheet: pores into the deposit, the deposit becomes the top layer. The CPU layer list follows. */
  async fix(sheet) {
    const pushed = await this.sheet.fixInto(sheet);
    this.stale = true; this.topStale = true; this.fresh.stale(); this.stats.fixes++;
    return pushed;
  }

  // ---- strokes ---------------------------------------------------------------------------------------------------
  /** The rectangle of the sheet a stroke can touch: `points` plus `reach` cells on every side, clipped to the sheet. */
  rect(points, reach) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of points) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
    const b = Math.ceil(reach), X0 = Math.max(0, Math.floor(x0 - b)), Y0 = Math.max(0, Math.floor(y0 - b)), X1 = Math.min(this.w - 1, Math.ceil(x1 + b)), Y1 = Math.min(this.h - 1, Math.ceil(y1 + b));
    if (![X0, Y0, X1, Y1].every(Number.isFinite) || X1 < X0 || Y1 < Y0) return [0, 0, this.w, this.h]; // a NaN in a path: the whole sheet rather than misread memory
    const A = Math.min(X0, this.w - 1), B = Math.min(Y0, this.h - 1);
    return [A, B, Math.max(1, X1 - A + 1), Math.max(1, Y1 - B + 1)];
  }
  /** Make the CPU copy current inside `rect` before an instrument reads or writes it. */
  async ensureFresh(sheet, rect) {
    if (!this.stale) return;
    const need = this.fresh.staleBounds(rect); if (!need) return;
    const t = performance.now(); await this.sheet.syncDown(sheet, need); this.fresh.mark(need);
    this.stats.down++; this.stats.downMs += performance.now() - t; this.stats.downBytes += need[2] * need[3] * PLANES(this.K) * 4;
  }
  /** The instrument wrote into `rect` on the CPU copy: send it up. */
  up(sheet, rect) {
    const t = performance.now(); this.sheet.syncUp(sheet, rect); if (this.stale) this.fresh.mark(rect);
    this.stats.up++; this.stats.upMs += performance.now() - t;
  }

  // ---- whole-sheet coherence ---------------------------------------------------------------------------------------
  /** The CPU copy current everywhere (the CPU render probe, the equivalence check). */
  async syncAll(sheet) {
    if (!this.stale && !this.topStale) return;
    await this.sheet.download(sheet); this.stale = false; this.topStale = false; this.fresh.fresh(); this.stats.fullDown++;
  }

  // ---- render ----------------------------------------------------------------------------------------------------
  draw(ctx) { this.composer.draw(ctx); }
  readPixels() { return this.composer.readPixels(); }
  setBase(baseR) { this.composer.setBase(baseR); }
  setGraphite(g) { this.composer.setGraphite(g); }
  async idle() { await this.sheet.idle(); }
  destroy() { try { this.sheet.destroy(); this.composer.release(); this.device.destroy(); } catch { /* already gone */ } }
}
