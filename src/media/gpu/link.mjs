import { fixedBedLower as sumFixedBedLower } from '../fixed-bed.mjs';
const fixedBedLower = sheet => sumFixedBedLower(sheet, { skipEmpty: process.env.GPU_SKIP_ZERO_LAYER === '1' });
// The painter's side of the GPU sheet backend. attachGpu(sheet, O, { mode }) starts a worker that holds the sheet on the
// GPU and sets sheet._gpu; with it unset (mode 'off', no adapter, no `webgpu` package) sheet, brush and pen run on the CPU.
// Keeps the GPU copy and the CPU copy agreed: strokes read and write back rectangles, whole-sheet readers call
// coherent(sheet), and whole-sheet CPU writers call cpuWroteAll() so the next GPU step uploads it.
import { Worker, workerData as threadData } from 'node:worker_threads';
// a stand-in for the GPU worker when the GPU thread belongs to a batch (src/media/gpu/batch-server.mjs)
function batchWorker(port, data) {
  port.postMessage({ op: 'hello', data });
  return { postMessage: (m, t) => port.postMessage(m, t), unref() { port.unref?.(); }, on() {}, terminate() {} };
}
import { fileURLToPath } from 'node:url';
import { readAdapterEvidence } from './adapter-evidence.mjs';
import { FreshMap } from './fresh.mjs';
import { resetCpuStrokeDirty, cpuStrokeDirtyRect } from '../cpu-stroke-dirty.mjs';
import { CpuDemandWindow } from './cpu-demand-window.mjs';
import { demandPolicy } from './demand-policy.mjs';
import { paperPlanes } from './paper-planes.mjs';
import { mergeOf } from '../brush.mjs';
import { deviceHealth, brokenReason, assertHealthy } from './device-health.mjs';
import { cpuFallbackWarning } from './backend-record.mjs';

const PLANES = K => 4 + 3 * K;
// DOWN_TRACE=1: count rectangle reads by caller, printed at exit
const DOWN_TRACE = typeof process !== 'undefined' && (process.env.DOWN_TRACE === '1' || process.argv.includes('--downtrace')) ? new Map() : null;
if (DOWN_TRACE) process.on('exit', () => { for (const [k, [n, cells]] of [...DOWN_TRACE].sort((a, b) => b[1][0] - a[1][0]).slice(0, 15)) console.error(`DOWN ${n} reads ${cells} cells: ${k}`); });
// (read when used, not when loaded: paint-plate sets them from its options after this file is imported)
const SYNC_STROKES = () => typeof process !== 'undefined' && process.env.GPU_SYNCSTROKES === '1';
const JITTER_MS = () => (typeof process !== 'undefined' ? +(process.env.GPU_JITTER_MS || 0) : 0);
// the ring the GPU worker leaves finished strokes' brush state in: a slot holds the header, the hairs, the belly and the pool
// of a brush of up to 256 hairs and 16 pigments
const RING_SLOTS = 256, RING_FLOATS = 6144;
const POST_LIMIT = 4 * 1024 * 1024; // floats: 16 MB
const TIMEOUT_MS = 30 * 60 * 1000;
const DEFERRED_ARCHIVE_BUDGET_BYTES = 128 * 1024 * 1024;
// the worker ops that only read the sheet: every other op counts as a change (GpuLink.version)
const READ_OPS = new Set(['down', 'paperDown', 'sums', 'topDown', 'topDownRect', 'counters', 'idle', 'prof', 'dryStats', 'snap', 'framePort', 'brushState', 'lowerDown', 'lowerBatch', 'opticalInit', 'opticalFrame', 'drainDrys','demandCheckState']);
const OPT_KEYS = ['flow', 'flowIters', 'diffuse', 'evap', 'edgeEvap', 'edgeWidth', 'absorb', 'film', 'capRate', 'capEps', 'capDelta', 'settle', 'lift', 'looseLift', 'scour', 'liftDepth', 'rewetLift', 'wetEps', 'spill', 'spillHeight', 'dampEase', 'pinning', 'pinFibre', 'encloseEase', 'slideCap', 'holeFill', 'holeSpan', 'fibreFlow', 'carryDepth', 'flowDepth', 'gran', 'granFill', 'slide', 'slideFill', 'repose', 'hold', 'sizing', 'wickFilter', 'dt', 'capSigma', 'paperDry', 'marangoni', 'slope', 'filmDiffuse', 'filmDepth'];

export class GpuLink {
  constructor(worker, shared, sheet) {
    Object.assign(this, { worker, ...shared });
    this.w = sheet.w; this.h = sheet.h; this.n = sheet.n; this.K = sheet.K;
    this.sheet = sheet; this.queuedDrys = 0; this.drainingDrys = false;
    this.version = 0;         // bumped by every op that can change the sheet: what a render was made from is still current while it holds
    this.stale = false;       // the GPU copy is ahead of the CPU copy (outside `fresh`)
    this.fresh = new FreshMap(sheet.w, sheet.h); // tiles the CPU copy is known to match, since the last GPU step
    this.dirty = null;        // rectangle the CPU wrote and the GPU has not seen
    this.stroke = null;       // rectangle of the stroke in progress
    this.needFullUp = false;  // the CPU wrote the whole sheet
    this.paused = false;      // a CPU-only stretch (dry with a per-step callback) is running
    this.brushGpu = !(typeof process !== 'undefined' && process.env.GPU_STROKES === '0'); // brush strokes laid on the GPU
    this.anyBetween = !(typeof process !== 'undefined' && process.env.GPU_BETWEEN === '0'); // and those with a flow-only `between` (brush.mjs stroke)
    this.check = typeof process !== 'undefined' && process.env.GPU_STROKES === 'check'; // see stroke-check.mjs
    this.noSums = typeof process !== 'undefined' && process.env.GPU_SUMS === '0'; // thickness and frames from the whole sheet brought down
    this.resident = process.env.GPU_RESIDENT === '1' && process.env.GPU_BATCH !== '0';
    this.brushKeys = new WeakMap(); this.brushKey = 0; this.pendingLayers = [];
    this.archiveBudgetBytes = DEFERRED_ARCHIVE_BUDGET_BYTES;
    this.planning = null; this.seq = 0; this.owners = new Array(RING_SLOTS).fill(null);
    // The pigments that may hold mass on the GPU sheet: those in its wet and unfixed pigment (wetMask) and in the newest dried
    // layer (topMask). The step runs its per-pigment kernels over these alone; see stepfull.wgsl klAt.
    this.wetMask = 0; this.topMask = 0; this.sentMask = -1; this.actCount = [];
    this.lastO = null; this.lastKey = '';
    this.stats = { steps: 0, drys: 0, down: 0, up: 0, downMs: 0, upMs: 0, dryMs: 0, fullDown: 0 };
    this.transferPhase = 'outside-stroke';
  }

  call(msg, transfer) {
    assertHealthy(this.health);
    const { ctrl } = this; if (!READ_OPS.has(msg.op)) this.version++;
    Atomics.store(ctrl, 0, 0); this.worker.postMessage(msg, transfer);
    const waitStart = performance.now();
    while (Atomics.wait(ctrl, 0, 0, TIMEOUT_MS) === 'timed-out') throw new Error(`gpu worker did not answer '${msg.op}'`);
    // time this painter thread spent blocked on the GPU thread, by op (gpuStats.waitMs)
    const wm = this.stats.waitMs ??= {}; wm[msg.op] = (wm[msg.op] ?? 0) + performance.now() - waitStart;
    assertHealthy(this.health);
    if (ctrl[2]) { ctrl[2] = 0; throw new Error(`gpu worker failed: ${this.errText()}`); }
  }
  errText() { let e = 0; while (e < this.err.length && this.err[e]) e++; return new TextDecoder().decode(this.err.slice(0, e)); }
  post(msg, transfer) { assertHealthy(this.health); if(msg.op==='framePort')this.frameWorkerActive=true; if (!READ_OPS.has(msg.op)) this.version++; this.worker.postMessage(msg, transfer); }

  applyOptions(o) {
    if (o === this.lastO) return;
    const pick = {}; let key = ''; for (const k of OPT_KEYS) if (o[k] !== undefined) { pick[k] = o[k]; key += `${k}=${o[k]};`; }
    this.lastO = o; if (key === this.lastKey) return;
    this.lastKey = key; this.post({ op: 'opts', o: pick });
  }

  recordTransfer(direction, bytes) {
    const phases = this.stats.transferPhases ??= {};
    const counts = phases[this.transferPhase] ??= { down: 0, up: 0, downBytes: 0, upBytes: 0 };
    counts[direction] = (counts[direction] || 0) + 1;
    counts[direction + 'Bytes'] = (counts[direction + 'Bytes'] || 0) + bytes;
  }
  down(sheet, rect) {
    if (DOWN_TRACE) { const k = new Error().stack.split('\n').slice(2, 7).map(l => l.trim().replace(/^at /, '').replace(/\(?file:\/\/.*\/(src|tools)\//, '').replace(/\)$/, '')).join(' < '); const e = DOWN_TRACE.get(k) ?? [0, 0]; e[0]++; e[1] += rect[2] * rect[3]; DOWN_TRACE.set(k, e); }
    const t = performance.now(); this.call({ op: 'down', rect });
    const [x0, y0, rw, rh] = rect, a = rw * rh, K = this.K, p = this.rectData, w = this.w;
    for (let y = 0; y < rh; y++) {
      const o = (y0 + y) * w + x0, j = y * rw;
      sheet.W.set(p.subarray(j, j + rw), o); sheet.s.set(p.subarray(a + j, a + j + rw), o);
      for (let x = 0; x < rw; x++) { sheet.M[o + x] = p[2 * a + j + x]; sheet.ever[o + x] = p[3 * a + j + x]; }
      for (let k = 0; k < K; k++) {
        sheet.G[k].set(p.subarray((4 + k) * a + j, (4 + k) * a + j + rw), o); sheet.P[k].set(p.subarray((4 + K + k) * a + j, (4 + K + k) * a + j + rw), o); sheet.D[k].set(p.subarray((4 + 2 * K + k) * a + j, (4 + 2 * K + k) * a + j + rw), o);
      }
    }
    this.stats.down++; this.stats.downMs += performance.now() - t; this.stats.downBytes = (this.stats.downBytes || 0) + a * PLANES(K) * 4;
    this.recordTransfer('down', a * PLANES(K) * 4);
  }
  // A rectangle going up is packed into a private copy and posted: the worker applies it in order behind the steps, and the
  // brush carries on without waiting. Only a rectangle too big for a cheap copy goes through the shared buffer and waits.
  up(sheet, rect, logicalRect = null) {
    const t = performance.now(), [x0, y0, rw, rh] = rect, a = rw * rh, K = this.K, w = this.w, post = a * PLANES(K) <= POST_LIMIT;
    const p = post ? new Float32Array(a * PLANES(K)) : this.rectData;
    for (let y = 0; y < rh; y++) {
      const o = (y0 + y) * w + x0, j = y * rw;
      p.set(sheet.W.subarray(o, o + rw), j); p.set(sheet.s.subarray(o, o + rw), a + j);
      for (let x = 0; x < rw; x++) { p[2 * a + j + x] = sheet.M[o + x]; p[3 * a + j + x] = sheet.ever[o + x]; }
      for (let k = 0; k < K; k++) { p.set(sheet.G[k].subarray(o, o + rw), (4 + k) * a + j); p.set(sheet.P[k].subarray(o, o + rw), (4 + K + k) * a + j); p.set(sheet.D[k].subarray(o, o + rw), (4 + 2 * K + k) * a + j); }
    }
    const uploadMask = logicalRect ? this.cpuRectMask(sheet, logicalRect) : GpuLink.maskOf(K, k => p.subarray((4 + k) * a, (5 + k) * a), a) | GpuLink.maskOf(K, k => p.subarray((4 + K + k) * a, (5 + K + k) * a), a) | GpuLink.maskOf(K, k => p.subarray((4 + 2 * K + k) * a, (5 + 2 * K + k) * a), a);
    this.wetMask |= uploadMask;this.syncAct();
    const logical = logicalRect ? { logicalRect, signedZero: this.cpuRectSignedZero(sheet, logicalRect) } : {};
    if (post) this.post({ op: 'up', rect, ...logical, mask:uploadMask, data: p, wait: false }, [p.buffer]); else this.call({ op: 'up', rect, ...logical, mask:uploadMask });
    this.stats.up++; this.stats.upMs += performance.now() - t; this.stats.upBytes = (this.stats.upBytes || 0) + a * PLANES(K) * 4;
    this.recordTransfer('up', a * PLANES(K) * 4);
  }
  full() { return [0, 0, this.w, this.h]; }
  // Uploads a demand-window payload and returns the GPU's pigment mask and signed-zero flag for the logical rectangle.
  upReduced(sheet, rect, logicalRect) {
    const started = performance.now();
    if (process.env.GPU_DEMAND_READBACK === '0' || (process.env.GPU_DEMAND_READBACK !== '1' && !sheet._cpuDemandWindow)) throw new Error('GPU demand readback is disabled');
    const logical = this.validRect(logicalRect);
    if (!logicalRect.every((v, i) => v === logical[i])) throw new RangeError('Invalid logical upload rectangle');
    let data = null;
    if (rect) {
      const valid = this.validRect(rect);
      if (!rect.every((v,i) => v === valid[i]) || rect[0] < logical[0] || rect[1] < logical[1] ||
        rect[0]+rect[2] > logical[0]+logical[2] || rect[1]+rect[3] > logical[1]+logical[3])
        throw new RangeError('Payload must fit the logical upload rectangle');
      const [x,y,rw,rh] = rect, area = rw*rh;
      data = new Float32Array(area*PLANES(this.K));
      const planes = [sheet.W,sheet.s,sheet.M,sheet.ever,...sheet.G,...sheet.P,...sheet.D];
      planes.forEach((plane,k) => {
        for(let row=0;row<rh;row++) data.set(plane.subarray((y+row)*this.w+x,(y+row)*this.w+x+rw),k*area+row*rw);
      });
    }
    if(process.env.GPU_DEMAND_READBACK==='fast') {
      // Stale host pixels cannot supply a global mask, so mark every pigment and signed zero; no ACK is needed.
      const mask=(2**this.K-1)>>>0;this.wetMask|=mask;this.syncAct();
      this.post({op:'up',rect:rect??[0,0,1,1],logicalRect:logical,data,mask,signedZero:true,wait:false,...(!rect?{op:'upNoop'}:{})},data?[data.buffer]:undefined);
      this.stats.fastDemandUploads=(this.stats.fastDemandUploads??0)+1;
      this.stats.up=(this.stats.up??0)+(rect?1:0);
      this.stats.upBytes=(this.stats.upBytes??0)+(rect?rect[2]*rect[3]*PLANES(this.K)*4:0);
      this.recordTransfer('up',rect?rect[2]*rect[3]*PLANES(this.K)*4:0);
      return {mask,signedZero:true};
    }
    this.call({ op:'upReduced',rect,logicalRect:logical,data },data ? [data.buffer] : undefined);
    const metadata = { mask:this.ctrl[10] >>> 0,signedZero:this.ctrl[11] === 1 };
    this.wetMask |= metadata.mask;
    // ordered behind the reduction ACK and ahead of the caller's step
    this.syncAct();
    this.stats.reducedUploads = (this.stats.reducedUploads || 0) + 1;
    const elapsed = performance.now() - started, bytes = rect ? rect[2]*rect[3]*PLANES(this.K)*4 : 0;
    this.stats.reducedUploadMs = (this.stats.reducedUploadMs || 0) + elapsed;
    this.stats.up = (this.stats.up || 0) + (rect ? 1 : 0);
    this.stats.upBytes = (this.stats.upBytes || 0) + bytes;
    this.stats.upMs = (this.stats.upMs || 0) + elapsed;
    this.stats.reducedAckBytes = (this.stats.reducedAckBytes || 0) + 8;
    this.recordTransfer('up',bytes);
    this.recordTransfer('metadata',8);
    return metadata;
  }
  cpuRectMask(sheet, [x0, y0, rw, rh]) {
    let mask = 0;
    for (let k = 0; k < this.K; k++) {
      find: for (const plane of [sheet.G[k], sheet.P[k], sheet.D[k]]) for (let y = y0; y < y0 + rh; y++)
        for (let i = y * this.w + x0, end = i + rw; i < end; i++) if (plane[i] !== 0) { mask |= 1 << k; break find; }
    }
    return mask;
  }
  cpuRectSignedZero(sheet, [x0, y0, rw, rh]) {
    for (const plane of [sheet.W, sheet.s, ...sheet.G, ...sheet.P, ...sheet.D]) {
      const bits = new Uint32Array(plane.buffer, plane.byteOffset, plane.length);
      for (let y = y0; y < y0 + rh; y++) if (bits.subarray(y * this.w + x0, y * this.w + x0 + rw).includes(0x80000000)) return true;
    }
    return false;
  }
  uploadCpuStroke(sheet, logicalRect) {
    if (sheet._cpuDemandWindow) {
      const payload = cpuStrokeDirtyRect(sheet);
      if (payload) sheet._cpuDemandWindow.assertFresh(payload);
      this.upReduced(sheet, payload, logicalRect);
      resetCpuStrokeDirty(sheet);
      return;
    }
    if (!sheet._cpuStrokeDirty) return this.up(sheet, logicalRect);
    let rect = cpuStrokeDirtyRect(sheet);
    if (rect && (rect[0] < logicalRect[0] || rect[1] < logicalRect[1] ||
      rect[0] + rect[2] > logicalRect[0] + logicalRect[2] || rect[1] + rect[3] > logicalRect[1] + logicalRect[3])) {
      // the instrument's dirty bound escaped the logical rectangle: upload the whole logical rectangle
      rect = logicalRect; this.stats.dirtyBoundsFallback = (this.stats.dirtyBoundsFallback || 0) + 1;
    }
    if (rect) this.up(sheet, rect, logicalRect);
    else { // no payload: still apply the logical rectangle's dirty-tile and epoch effects
      this.wetMask |= this.cpuRectMask(sheet, logicalRect); this.syncAct();
      this.post({ op: 'upNoop', logicalRect, mask: this.cpuRectMask(sheet, logicalRect), signedZero: this.cpuRectSignedZero(sheet, logicalRect), wait: false });
      this.stats.emptyCpuUploads = (this.stats.emptyCpuUploads || 0) + 1;
    }
    this.stats.cpuUploadSavedBytes = (this.stats.cpuUploadSavedBytes || 0) +
      (logicalRect[2] * logicalRect[3] - (rect ? rect[2] * rect[3] : 0)) * PLANES(this.K) * 4;
    resetCpuStrokeDirty(sheet);
  }

  /** Bits for the pigments with any mass in the planes of `arrays` (K arrays of n floats, or K slices of a packed rectangle). */
  static maskOf(K, get, count) {
    let m = 0;
    for (let k = 0; k < K; k++) { const a = get(k); for (let i = 0; i < count; i++) if (a[i] !== 0) { m |= 1 << k; break; } }
    return m;
  }
  /** Tell the worker which pigments to work on, when that has changed. */
  syncAct() {
    const m = (this.topMask | this.wetMask) >>> 0;
    if (m === this.sentMask) return;
    this.sentMask = m; this.post({ op: 'act', mask: m });
    let c = 0; for (let k = 0; k < this.K; k++) c += (m >>> k) & 1;
    this.actCount[c] = (this.actCount[c] || 0) + 1; this.stats.actChanges = (this.stats.actChanges || 0) + 1;
  }
  /** What is on a sheet just handed to the GPU, read off its CPU arrays. */
  initMasks(sheet) {
    const K = this.K, n = this.n;
    this.wetMask = GpuLink.maskOf(K, k => sheet.G[k], n) | GpuLink.maskOf(K, k => sheet.D[k], n) | GpuLink.maskOf(K, k => sheet.P[k], n);
    const top = sheet.layers.length ? sheet.layers[sheet.layers.length - 1] : null;
    this.topMask = top ? GpuLink.maskOf(K, k => top[k], n) : 0;
    this.sentMask = -1; this.syncAct();
  }

  // A stroke's `between` runs while its plan is being made (brush.mjs strokeGpu): it may flow the sheet (step, which the
  // plan records) and nothing else. Reading or writing the sheet there would see it as it was before the stroke.
  notPlanning(what) { if (this.planning) throw new Error(`gpu: ${what} inside a GPU stroke's between(); that stroke needs gpuBetween: false`); }
  /** The CPU copy must be current for `rect` before something reads it. */
  ensureFresh(sheet, rect) {
    this.flushDrys(sheet);
    this.notPlanning('a read of the sheet');
    if (this.needFullUp) this.fullUp(sheet);
    // A reader of cells (needCells: the dry-brush marks and drags charge for what the cell holds, dried layers included)
    // must not find the newest layer as the empty placeholder a dry pushed: it comes down once after each dry. A rewet's
    // later lifting from it is left for the next render or thickness to bring down.
    if (this.topPlaceholder && sheet.layers.length) this.syncTop(sheet);
    if (sheet._cpuDemandWindow) {
      sheet._cpuDemandWindow.require(this.validRect(rect));
      return;
    }
    if (!this.stale) return;
    const need = this.fresh.staleBounds(rect); if (need) { this.down(sheet, need); this.fresh.mark(need); }
  }

  /** Fresh W/s/M for a read-only material observation; never advances pigment freshness. */
  ensurePaperFresh(sheet, rect, force = false) {
    if((!force&&process.env.GPU_PAPER_OBSERVE!=='1')||this.paused||this.stroke||sheet._cpuDemandWindow)return this.ensureFresh(sheet,rect);
    this.flushDrys(sheet);this.notPlanning('a read of paper state');
    if(this.needFullUp)this.fullUp(sheet);
    rect=this.validRect(rect);
    if(!this.stale||!this.fresh.staleBounds(rect))return;
    if(!this.paperFresh)this.paperFresh=new FreshMap(this.w,this.h);
    if(this.paperVersion!==this.version){this.paperFresh.stale();this.paperVersion=this.version;}
    const need=this.paperFresh.staleBounds(rect);if(!need)return;
    const started=performance.now();this.call({op:'paperDown',rect:need});
    const [x,y,rw,rh]=need,area=rw*rh;
    for(let row=0;row<rh;row++){const offset=(y+row)*this.w+x,j=row*rw;sheet.W.set(this.rectData.subarray(j,j+rw),offset);sheet.s.set(this.rectData.subarray(area+j,area+j+rw),offset);for(let col=0;col<rw;col++)sheet.M[offset+col]=this.rectData[area*2+j+col];}
    this.paperFresh.mark(need);
    this.stats.paperDown=(this.stats.paperDown??0)+1;this.stats.paperDownBytes=(this.stats.paperDownBytes??0)+area*12;this.stats.paperDownMs=(this.stats.paperDownMs??0)+performance.now()-started;
    this.stats.paperDownFullPlaneEquivalentBytes=(this.stats.paperDownFullPlaneEquivalentBytes??0)+area*PLANES(this.K)*4;
    this.recordTransfer('paperDown',area*12);
  }

  // a rectangle that is not a valid box on the sheet (a NaN in a path) falls back to the whole sheet rather than misreading memory
  validRect(rect) {
    const ok = rect.every(Number.isFinite) && rect[0] >= 0 && rect[1] >= 0 && rect[2] >= 1 && rect[3] >= 1 && rect[0] + rect[2] <= this.w && rect[1] + rect[3] <= this.h;
    return ok ? rect : this.full();
  }
  beginStroke(sheet, rect, { tracked = false, instrument, periodic = false, planOverflow = false, flowEvery = 0 } = {}) {
    this.notPlanning('another stroke');
    rect = this.validRect(rect);
    this.stroke = rect;
    this.stats.cpuStrokes = (this.stats.cpuStrokes || 0) + 1;
    this.stats.cpuStrokeRectCells = (this.stats.cpuStrokeRectCells || 0) + rect[2] * rect[3];
    const prior = this.transferPhase; this.transferPhase = 'cpu-stroke-entry';
    const useDemand=demandPolicy({mode:process.env.GPU_DEMAND_READBACK,tracked,instrument,periodic,planOverflow,flowEvery,rect});
    try {
      if(useDemand && process.env.GPU_DEMAND_READBACK==='fast'){this.flushDrys(sheet);if(this.needFullUp)this.fullUp(sheet);}
      else this.ensureFresh(sheet, rect);
    } finally { this.transferPhase = prior; }
    if (tracked && process.env.GPU_DIRTY_UPLOAD === '1') resetCpuStrokeDirty(sheet);
    if (useDemand) {
      if(process.env.GPU_DEMAND_READBACK!=='1')this.stats.demandAutoStrokes=(this.stats.demandAutoStrokes??0)+1;
      resetCpuStrokeDirty(sheet);
      sheet._cpuDemandWindow = new CpuDemandWindow(this.w,this.h,
        [sheet.W,sheet.s,sheet.M,sheet.ever,...sheet.G,...sheet.P,...sheet.D],
        window => this.down(sheet,window),process.env.GPU_DEMAND_READBACK==='fast'?8:1);
      // ensureFresh above already read `rect`
      sheet._cpuDemandWindow.rect = process.env.GPU_DEMAND_READBACK==='fast'?null:rect.slice();
    }
  }
  endStroke(sheet) {
    const rect = this.stroke; this.stroke = null; if (!rect) return;
    const prior = this.transferPhase; this.transferPhase = 'cpu-stroke-end';
    const demand = sheet._cpuDemandWindow;
    try { this.uploadCpuStroke(sheet, rect); } finally { this.transferPhase = prior; delete sheet._cpuStrokeDirty; delete sheet._cpuDemandWindow; delete sheet._cpuDemandPenAhead; }
    this.dirty = null; if (this.stale && (!demand || demand.rect)) this.fresh.mark(demand ? demand.rect : rect);
  }

  // The brush plans a stroke (brush.mjs strokeGpu) and the GPU lays it, flowing the sheet where the plan says, so the
  // sheet never comes down for it. The plan is one Float32Array: a header, the ground's quantiles, the hairs, the belly
  // and the bead's pool, then one record a step (see stepfull.wgsl for the layout).
  beginPlan(sheet, brush, { K, lanes, nClumps, Q }) {
    this.notPlanning('another stroke');
    if (this.needFullUp) this.fullUp(sheet);
    const HS = 4 + K, H0 = 272, S0 = H0 + (lanes + 2) * HS, SP = 16 + nClumps;
    // the steps grow on from the header; the cells (three words each: index, hair, across) grow apart and are joined at the end
    const plan = { K, lanes, HS, H0, S0, SP, n: 0, cap: 0, F: null, I: null, U: null, nw: 0, wcap: 0, CU: null, CF: null, offs: new Int32Array(lanes + 1), pos: new Int32Array(lanes) };
    plan.grow = (cap) => {
      const buf = new ArrayBuffer((S0 + cap * SP) * 4);
      if (plan.F) new Uint8Array(buf).set(new Uint8Array(plan.F.buffer, 0, (S0 + plan.n * SP) * 4));
      plan.cap = cap; plan.F = new Float32Array(buf); plan.I = new Int32Array(buf); plan.U = new Uint32Array(buf);
    };
    plan.growCells = (cap) => {
      const buf = new ArrayBuffer(cap * 4);
      if (plan.CU) new Uint8Array(buf).set(new Uint8Array(plan.CU.buffer, 0, plan.nw * 4));
      plan.wcap = cap; plan.CU = new Uint32Array(buf); plan.CF = new Float32Array(buf);
    };
    plan.grow(128); plan.growCells(4096);
    plan.step = () => { if (plan.n === plan.cap) plan.grow(plan.cap * 2); return S0 + plan.n++ * SP; };
    // A step's cells, grouped by hair (each hair's in the order given, which is raster order): a table of where each
    // hair's cells start, then an (index, across) pair a cell. Returns where the block starts, in words.
    plan.emit = (idx, lane, acr, cnt) => {
      if (brush.depositDepth) {
        const need=1+3*cnt; while(plan.nw+need>plan.wcap) plan.growCells(plan.wcap*2);
        const base=plan.nw; plan.CU[base]=cnt;
        for(let c=0;c<cnt;c++) {const o=base+1+3*c; plan.CU[o]=idx[c];plan.CU[o+1]=lane[c];plan.CF[o+2]=acr[c];}
        plan.nw+=need; return base;
      }
      const need = lanes + 1 + 2 * cnt; while (plan.nw + need > plan.wcap) plan.growCells(plan.wcap * 2);
      const { offs, pos, CU, CF } = plan, base = plan.nw; offs.fill(0);
      for (let c = 0; c < cnt; c++) offs[lane[c] + 1]++;
      for (let j = 0; j < lanes; j++) offs[j + 1] += offs[j];
      for (let j = 0; j <= lanes; j++) CU[base + j] = offs[j];
      for (let j = 0; j < lanes; j++) pos[j] = offs[j];
      const ent = base + lanes + 1;
      for (let c = 0; c < cnt; c++) { const p = pos[lane[c]]++; CU[ent + 2 * p] = idx[c]; CF[ent + 2 * p + 1] = acr[c]; }
      plan.nw += need; return base;
    };
    const { F, U } = plan, paper = sheet.paper;
    U[0] = lanes; U[1] = K; U[2] = nClumps; F[3] = brush.flat ? 1 : 0; F[4] = brush.capacity; F[5] = brush.free; F[6] = brush.film; F[7] = brush.give;
    F[8] = brush.wetness; F[9] = brush.bridge; F[10] = brush.bridgeSoft; F[11] = brush.breakup; F[12] = brush.fine; F[13] = brush.coarse; F[14] = brush.wetMix;
    U[15] = brush.stiffness; F[16] = paper.relief ?? 0.2; F[17] = Math.min(1, brush.load ?? 1); F[18] = brush.bridgeStreak; F[19] = mergeOf(brush);
    U[21] = sheet.wetting ? 1 : 0; U[23] = brush.rs.s & 65535; U[22] = brush.rs.s >>> 16; F[25] = brush.feed; U[26] = 0; U[27] = SP; U[28] = H0; U[29] = S0; U[30] = HS;
    F[34] = brush.depositDepth || 0;
    F[35] = brush.resP.some(v => Object.is(v, -0)) || brush.hairs.some(h => h.pig.some(v => Object.is(v, -0))) ? 1 : 0;
    F.set(Q, 64);
    for (let j = 0; j < lanes; j++) {
      const hr = brush.hairs[j], b = H0 + j * HS; F[b] = hr.water; F[b + 1] = hr.len; U[b + 2] = hr.clump;
      for (let k = 0; k < K; k++) F[b + 4 + k] = hr.pig[k];
    }
    const bb = H0 + lanes * HS; F[bb] = brush.resW; for (let k = 0; k < K; k++) F[bb + 4 + k] = brush.resP[k];
    // the pigments this brush can lay (a hair or the belly holding any): the sheet's step must work on them from here on
    // (a cont stroke has the same hairs it had, which were counted when they were first planned)
    for (let k = 0; k < K; k++) { let any = brush.resP[k] > 0; for (let j = 0; j < lanes && !any; j++) any = brush.hairs[j].pig[k] > 0; if (any) {this.wetMask |= 1 << k;plan.mask=(plan.mask??0)|(1<<k);} }
    this.syncAct();
    return plan;
  }
  /** A flow the brush's `between` asked for, following the step just planned. */
  markFlow(plan) { if (plan.flows) plan.flows(); else plan.U[plan.S0 + (plan.n - 1) * plan.SP + 6]++; }
  /** `lift`: the cell indices within reach of the last contact, for the bead (or null when the brush stays on the paper). */
  endPlan(sheet, brush, plan, lift, rect) {
    if (!plan.n && !lift) return;
    const { F, U, S0, SP, H0, HS, lanes, K } = plan, nl = lift ? lift.length : 0;
    let hasFlow = false; for (let s = 0; s < plan.n && !hasFlow; s++) if (U[S0 + s * SP + 6]) hasFlow = true;
    const offC = S0 + plan.n * SP, offL = offC + plan.nw;
    U[24] = plan.n; U[31] = offC; U[32] = nl; U[33] = offL;
    const data = new Float32Array(offL + nl), DU = new Uint32Array(data.buffer);
    data.set(F.subarray(0, offC)); DU.set(plan.CU.subarray(0, plan.nw), offC);
    for (let q = 0; q < nl; q++) DU[offL + q] = lift[q];
    // posted, not waited for: the GPU lays it in order with everything else, and the brush's state comes back into a slot of
    // the shared ring when it is done. The brush takes it from there the next time anything needs it (settleBrush).
    if (JITTER_MS()) { const t0 = performance.now(), d = JITTER_MS() *(0.2 + 1.6 * ((this.seq * 2654435761 >>> 0) / 4294967296)); while (performance.now() - t0 < d); } // test only: a random delay, to check timing does not change the result
    const cont = brush._cont | 0; brush._cont = 0;   // 1: the generator carries on from the last stroke; 2: so do the hairs and belly
    if (cont && brush._pend) { this.owners[brush._pend.slot] = null; brush._pend = null; } // its result is not wanted: the new one supersedes it
    const seq = ++this.seq, slot = this.resident ? 0 : seq % RING_SLOTS, held = this.owners[slot];
    if (held && !this.resident) this.settleBrush(held);   // the slot is wanted again: its brush takes its state first
    let state=this.brushKeys.get(brush); if(state===undefined) {state=++this.brushKey;this.brushKeys.set(brush,state);}
    const restore=brush._restore; delete brush._restore;
    if (!this.resident) this.owners[slot] = brush; brush._pend = this.lastPend = { link: this, seq, slot, state, H0, HS, lanes, K, hairs: true };
    const plannedBytes=data.byteLength; // transfer below detaches the source view
    this.post({ op: 'stroke', data, seq, slot, info: { mask:plan.mask??0, planFloats: S0, nSteps: plan.n, sp: SP, s0: S0, rect: this.validRect(rect), lift: !!lift, cont, h0: H0, state, restore }, wait: false }, [data.buffer]);
    if(this.strokePlanMiB>16||(typeof process!=='undefined'&&process.env.GPU_LOCAL_ROW_PLAN==='1')){this.pendingPlanBytes=(this.pendingPlanBytes??0)+plannedBytes;if(this.pendingPlanBytes>=16*1024*1024){this.call({op:'idle',planQueue:true});this.pendingPlanBytes=0;this.stats.planQueueFlushes=(this.stats.planQueueFlushes??0)+1;}}
    if (SYNC_STROKES()) { this.settleBrush(brush); this.call({ op: 'idle' }); } // test: every stroke finishes before the next thing
    // (a flow inside the stroke can lift from the top dried layer, a rewet, as any step can: its CPU copy is stale too)
    this.stale = true; this.fresh.stale(); if (hasFlow) this.topStale = true;
    this.stats.strokes = (this.stats.strokes || 0) + 1; this.stats.strokeSteps = (this.stats.strokeSteps || 0) + plan.n;
  }
  /** Take a posted stroke's result into its brush: hairs, belly and the generator's state. Waits if the GPU has not got there. */
  settleBrush(brush) {
    const p = brush._pend; if (!p) return;
    const t0 = performance.now(), { slot, seq, H0, HS, lanes, K } = p;
    if (this.resident && p.splat && !p.hairs) { brush._pend = null; return; }
    if (this.resident) { this.call({op:'brushState',slot,seq,state:p.state,splat:p.splat}); this.stats.brushReads=(this.stats.brushReads??0)+1; }
    for (let v; (v = Atomics.load(this.done, slot)) !== seq;) {
      if (this.ctrl[2]) { this.ctrl[2] = 0; throw new Error(`gpu worker failed: ${this.errText()}`); }
      if (Atomics.load(this.ctrl, 3) === 2) throw new Error('gpu worker died');
      { const t0 = performance.now(); Atomics.wait(this.done, slot, v, 1000); const wm = this.stats.waitMs ??= {}; wm.brushRing = (wm.brushRing ?? 0) + performance.now() - t0; }
    }
    const R = this.ring, RU = new Uint32Array(R.buffer, R.byteOffset, R.length), o = slot * RING_FLOATS;
    if (p.splat) {   // a splat stroke: the brush's water as the GPU left it, every hair and the belly by the same share
      if (p.hairs && p.W0 > 0) {
        const f = R[o] / p.W0;
        for (const hr of brush.hairs) { hr.water *= f; if (hr.pig) for (let k = 0; k < hr.pig.length; k++) hr.pig[k] *= f; }
        brush.resW *= f; if (brush.resP) for (let k = 0; k < brush.resP.length; k++) brush.resP[k] *= f;
      }
      brush._pend = null; this.owners[slot] = null; this.stats.settleMs = (this.stats.settleMs || 0) + performance.now() - t0;
      return;
    }
    if (p.hairs) {   // not when the brush has been dipped since: the hairs are the dip's
      for (let j = 0; j < lanes; j++) { const hr = brush.hairs[j], b = o + H0 + j * HS; hr.water = R[b]; for (let k = 0; k < K; k++) hr.pig[k] = R[b + 4 + k]; }
      const bb = o + H0 + lanes * HS; brush.resW = R[bb]; for (let k = 0; k < K; k++) brush.resP[k] = R[bb + 4 + k];
    }
    brush.rs.s = RU[o + 23] | (RU[o + 22] << 16);
    brush._pend = null; this.owners[slot] = null; this.stats.settleMs = (this.stats.settleMs || 0) + performance.now() - t0;
  }

  /** Post a planned splat stroke: `recs` [x, y, r, p, spacing, flows after], the stroke's box, the brush's concentration and water. */
  postSplats(sheet, brush, { recs, flowsBefore, rect, conc, W, cap, scale = 1 }) {
    if (this.needFullUp) this.fullUp(sheet);
    const K = this.K, w = this.w, h = this.h;
    for (let k = 0; k < K; k++) if (conc[k] > 0) this.wetMask |= 1 << k;
    this.syncAct();
    const x0 = Math.max(0, rect[0]), y0 = Math.max(0, rect[1]), x1 = Math.min(w - 1, rect[2]), y1 = Math.min(h - 1, rect[3]);
    const rw = Math.max(1, x1 - x0 + 1), rh = Math.max(1, y1 - y0 + 1), clip = sheet.clip ?? null;
    const offRec = 48, offClip = clip && recs.length ? offRec + 6 * recs.length : 0, words = (offClip || offRec + 6 * recs.length) + (offClip ? Math.ceil(rw * rh / 32) : 0);
    const data = new Float32Array(Math.max(64, words)), U = new Uint32Array(data.buffer);
    U[0] = recs.length; U[1] = K; U[2] = 0; data[3] = W; data[4] = cap; data[5] = brush.wetness; data[6] = brush.free; U[7] = sheet.wetting ? 1 : 0;
    U[8] = x0; U[9] = y0; U[10] = rw; U[11] = rh; U[12] = offRec; U[13] = offClip; U[14] = flowsBefore; data[15] = brush.film; data[16] = brush.give; data[17] = scale; data[18] = brush.wetMix ?? 0;
    for (let k = 0; k < K; k++) data[32 + k] = conc[k];
    recs.forEach((q, j) => { const b = offRec + 6 * j; data[b] = q[0]; data[b + 1] = q[1]; data[b + 2] = q[2]; data[b + 3] = q[3]; data[b + 4] = q[4]; U[b + 5] = q[5]; });
    if (offClip) for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) if (clip[(y0 + y) * w + x0 + x]) { const c = y * rw + x; U[offClip + (c >>> 5)] |= 1 << (c & 31); }
    const seq = ++this.seq, slot = this.resident ? 0 : seq % RING_SLOTS, held = this.owners[slot];
    if (held && !this.resident) this.settleBrush(held);
    let state = this.brushKeys.get(brush); if (state === undefined) { state = ++this.brushKey; this.brushKeys.set(brush, state); }
    const restore = this.resident && brush._pend?.splat && brush._pend.hairs ? brush._pend.state : undefined;
    if (!this.resident) this.owners[slot] = brush;
    brush._pend = this.lastPend = { link: this, seq, slot, state, splat: true, W0: W, hairs: true };
    this.post({ op: 'splat', data, seq, slot, info: { mask:this.wetMask, nRec: recs.length, offRec, flowsBefore, rect: [x0, y0, rw, rh], state, restore, seq }, wait: false }, [data.buffer]);
    let flows = flowsBefore; for (const q of recs) flows += q[5];
    this.stale = true; this.fresh.stale(); if (flows) this.topStale = true;
    this.stats.splatStrokes = (this.stats.splatStrokes || 0) + 1; this.stats.splats = (this.stats.splats || 0) + recs.length;
  }

  step(sheet, o) {
    if (this.planning) { this.applyOptions(o); this.markFlow(this.planning); this.stats.steps++; sheet.steps++; return true; }
    if (this.needFullUp) this.fullUp(sheet);
    this.applyOptions(o);
    const prior = this.transferPhase;
    if (this.stroke) this.transferPhase = 'cpu-stroke-flow';
    try {
      if (this.stroke) {
        this.stats.cpuStrokeFlows = (this.stats.cpuStrokeFlows || 0) + 1;
        this.uploadCpuStroke(sheet, this.stroke); // the brush deposited since the last sync
      }
      this.post({ op: 'step', n: 1 }); this.stats.steps++; sheet.steps++;
      this.stale = true; this.topStale = true; this.fresh.stale();
      if (this.stroke) {
        if (sheet._cpuDemandWindow) sheet._cpuDemandWindow.afterFlow();
        else { this.down(sheet, this.stroke); this.fresh.mark(this.stroke); }
      }
    } finally { this.transferPhase = prior; }
    return true;
  }
  flushDrys(sheet = this.sheet) {
    if(!this.queuedDrys || this.drainingDrys)return;
    this.drainingDrys=true;const t=performance.now();
    try {
      this.call({op:'drainDrys'});const count=this.ctrl[1],meta=new Uint32Array(this.rectData.buffer,0,count*6).slice();this.queuedDrys=0;
      for(let q=0;q<count;q++){
        const [steps,hadTop,pushed,mask,archive,oldMask]=meta.subarray(q*6,q*6+6);
        this.stats.drySolverIterations=(this.stats.drySolverIterations??0)+steps;this.stats.drySolverCalls=(this.stats.drySolverCalls??0)+1;
        if(!pushed)continue;
        if(hadTop){this.pendingLayers.push({index:sheet.layers.length-1,mask:oldMask,id:archive});this.stats.deferredLayers=(this.stats.deferredLayers??0)+1;}
        this.topMask=mask;sheet.layers.push(this.layerPlanes(sheet,mask));this.topPlaceholder=true;
      }
      this.boundDeferredLayers(sheet);
      this.stats.dryDrains=(this.stats.dryDrains??0)+1;this.stats.dryDrainMs=(this.stats.dryDrainMs??0)+performance.now()-t;
    } finally {this.drainingDrys=false;}
  }
  /**
   * dry() on the GPU. With `watch` ({ onStep, steps }), onStep(t) is called as the CPU's dry calls it, after step t when the
   * sheet was wet going into it, with the sheet as it stands then (whatever reads it brings down what it needs, as at any other
   * time). `steps`, the t that matter to the watcher, lets the GPU run on between them; without it the dry stops at every step.
   */
  dry(sheet, max, o, params, watch = null) {
    this.notPlanning('a dry');
    if(this.resident && process.env.GPU_ASYNC_DRY==='1' && !watch && max>0 && !this.frameWorkerActive){
      if(this.needFullUp)this.fullUp(sheet);this.applyOptions(o);
      this.post({op:'dryQueued',max,o:this.optPick(o),params,initialTopMask:this.topMask,wait:false});this.queuedDrys++;
      this.stats.maxQueuedDrys=Math.max(this.stats.maxQueuedDrys??0,this.queuedDrys);
      if(this.queuedDrys>=Math.max(1,Math.min(128,Math.floor(this.rectData.length/6))))this.flushDrys(sheet);
      this.stale=true;this.topStale=true;this.fresh.stale();this.stats.drys++;
      this.stats.queuedDrys=(this.stats.queuedDrys??0)+1;
      // the offline painter ignores dry's step count; consumers drain metadata lazily
      return 0;
    }
    this.flushDrys(sheet);
    if (this.needFullUp) this.fullUp(sheet);
    const t = performance.now(); this.applyOptions(o);
    if (!watch) this.call({ op: 'dry', max, o: this.optPick(o), params, topMask: this.topMask });
    else {
      this.call({ op: 'dryBegin', max, o: this.optPick(o), params });
      const at = watch.steps ? [...watch.steps].filter(v => Number.isInteger(v) && v >= 0).sort((a, b) => a - b) : null;
      const advance = until => { this.call({ op: 'dryAdvance', until }); this.stale = true; this.topStale = true; this.fresh.stale(); return { t: this.ctrl[1], done: this.ctrl[8] === 1 }; };
      let done = false;
      for (let q = 0; at ? q < at.length : true; q++) {
        const s = at ? at[q] : q;
        if (s >= max) break;
        // into step s: is the sheet still wet after s steps (the CPU's step(s) would return false and the dry end)?
        if (at) ({ done } = advance(s)); if (done) break;
        ({ done } = advance(s + 1));
        watch.onStep(s); this.stats.dryWatched = (this.stats.dryWatched || 0) + 1;
        if (this.needFullUp) throw new Error('gpu: a dry\'s onStep wrote the sheet; that is not supported with the sheet on the GPU');
      }
      this.call({ op: 'dryEnd', topMask: this.topMask });
    }
    const K = this.K, n = this.n, ctrl = this.ctrl;
    if (ctrl[5]) {
      // the superseded layer comes back for the pigments it holds; the new one gets planes for the pigments it holds and
      // shares the sheet's zero plane for the rest, as sheet.mjs fix does (dried layers are kept for the whole run)
      if (ctrl[4]) {
        if (ctrl[9]) { this.pendingLayers.push({ index: sheet.layers.length - 1, mask: this.topMask, id: ctrl[9] }); this.stats.deferredLayers = (this.stats.deferredLayers ?? 0) + 1; }
        else { const top = sheet.layers[sheet.layers.length - 1]; for (let k = 0; k < K; k++) if ((this.topMask >>> k) & 1) top[k].set(this.layerData.subarray(k * n, (k + 1) * n)); }
      }
      this.topMask = ctrl[7] >>> 0;
      sheet.layers.push(this.layerPlanes(sheet, this.topMask)); this.topPlaceholder = true;
    }
    this.boundDeferredLayers(sheet);
    this.wetMask = 0; this.syncAct(); // dried: nothing is wet or unfixed, and what is in the newest layer is what was just fixed
    this.stale = true; this.topStale = true; this.fresh.stale(); this.stats.drys++; this.stats.dryMs += performance.now() - t;
    this.stats.drySolverIterations=(this.stats.drySolverIterations??0)+ctrl[1];this.stats.drySolverCalls=(this.stats.drySolverCalls??0)+1;
    return ctrl[1];
  }
  /** A dried layer's planes: its own for the pigments in `mask`, the sheet's shared zero plane for the rest. */
  layerPlanes(sheet, mask) {
    const zero = sheet._zeroLayer || (sheet._zeroLayer = new Float32Array(this.n));
    return sheet.pigments.map((_, k) => ((mask >>> k) & 1 ? new Float32Array(this.n) : zero));
  }
  /** Keep immutable archived layers from accumulating for an entire dense ink pass.
   * Reading them releases their GPU buffers and fills the existing CPU placeholders.
   * Layer order, float values, the liftable top and drying physics are unchanged.
   */
  boundDeferredLayers(sheet) {
    let bytes = 0;
    for (const pending of this.pendingLayers) {
      let planes = 0;
      for (let k = 0; k < this.K; k++) planes += (pending.mask >>> k) & 1;
      bytes += Math.max(16, planes * this.n * 4);
    }
    const budget = this.archiveBudgetBytes ?? DEFERRED_ARCHIVE_BUDGET_BYTES;
    this.stats.deferredArchiveBudgetBytes = budget;
    this.stats.maxDeferredArchiveBytes = Math.max(this.stats.maxDeferredArchiveBytes ?? 0, bytes);
    if (bytes < budget) return;
    this.syncLower(sheet);
    this.stats.deferredArchiveDrains = (this.stats.deferredArchiveDrains ?? 0) + 1;
  }
  optPick(o) { const p = {}; for (const k of OPT_KEYS) if (o[k] !== undefined) p[k] = o[k]; return p; }

  /** Make the CPU copy current everywhere (a render, thickness, a direct read). */
  syncAll(sheet) {
    this.flushDrys(sheet);
    this.notPlanning('a read of the whole sheet');
    if (this.paused || this.stroke) return;
    if (this.stale) { this.down(sheet, this.full()); this.stats.fullDown++; this.stale = false; this.fresh.fresh(); sheet.wetDirty = 1; }
    this.syncTop(sheet);
  }
  /** Complete immutable CPU layer placeholders before rendering or editing them. */
  syncLower(sheet, limit = Infinity) {
    this.flushDrys(sheet);
    const eligible = this.pendingLayers.filter(p => p.index < limit);
    if (process.env.GPU_ARCHIVE_BATCH !== '0') {
      const cap = 64 * 1024 * 1024; let at = 0;
      while (at < eligible.length) {
        const batch = []; let bytes = 0;
        while (at < eligible.length) {
          const pending = eligible[at], ks = [];
          for (let k = 0; k < this.K; k++) if ((pending.mask >>> k) & 1) ks.push(k);
          const size = ks.length * this.n * 4;
          if (batch.length && bytes + size > cap) break;
          batch.push({pending, ks}); bytes += size; at++;
        }
        if (bytes > cap) {
          const {pending, ks} = batch[0]; this.call({op:'lowerDown', id:pending.id});
          for (const k of ks) sheet.layers[pending.index][k].set(this.layerData.subarray(k*this.n,(k+1)*this.n));
        } else {
          const output = new SharedArrayBuffer(Math.max(4, bytes));
          this.call({op:'lowerBatch', ids:batch.map(v=>v.pending.id), output});
          const values = new Float32Array(output); let offset = 0;
          for (const {pending, ks} of batch) for (const k of ks) { sheet.layers[pending.index][k].set(values.subarray(offset, offset+this.n)); offset += this.n; }
        }
        this.stats.lowerBytes = (this.stats.lowerBytes ?? 0) + bytes;
        this.stats.lowerDown = (this.stats.lowerDown ?? 0) + batch.length;
        this.stats.lowerBatches = (this.stats.lowerBatches ?? 0) + 1;
      }
    } else {
    for (const pending of this.pendingLayers) {
      if (pending.index >= limit) continue;
      this.call({ op: 'lowerDown', id: pending.id });
      const layer = sheet.layers[pending.index];
      for (let k = 0; k < this.K; k++) if ((pending.mask >>> k) & 1) {
        layer[k].set(this.layerData.subarray(k * this.n, (k + 1) * this.n));
        this.stats.lowerBytes = (this.stats.lowerBytes ?? 0) + this.n * 4;
      }
      this.stats.lowerDown = (this.stats.lowerDown ?? 0) + 1;
    }
    }
    this.pendingLayers = this.pendingLayers.filter(pending => pending.index >= limit);
  }
  invalidateOptical() {
    // CPU edits to archived layers must be recomposed, not shown from the optical archive or its masking checkpoint.
    this.opticalReady=false;
    this.stats.opticalInvalidations=(this.stats.opticalInvalidations??0)+1;
  }
  initOptical(sheet, micro) {
    this.flushDrys(sheet);
    if(this.opticalReady)return;
    this.syncLower(sheet);
    this.call({op:'opticalInit', micro, count:sheet.layers.length, lower:sheet.layers.slice(1,-1)});
    this.opticalReady=true;
  }
  opticalFrame(sheet, base) {
    this.flushDrys(sheet);
    if(this.needFullUp)this.fullUp(sheet);
    this.call({op:'opticalFrame',base});
    this.stats.opticalFrames=(this.stats.opticalFrames??0)+1;
    this.stats.frameBytes=(this.stats.frameBytes??0)+this.n*3;
    this.stats.opticalReadBytes=(this.stats.opticalReadBytes??0)+this.n*12;
    return new Uint8ClampedArray(this.rectData.buffer,0,this.n*3).slice();
  }
  /** The newest dried layer, brought down if the GPU has changed it (a rewet lifts a little of it back). */
  syncTop(sheet) {
    this.flushDrys(sheet);
    if (this.paused || this.stroke) return;
    this.syncLower(sheet);
    if (this.topStale && sheet.layers.length) {
      // only the planes of the pigments the layer holds: the others are zero (a rewet lifts, it never adds)
      const mask = this.topMask >>> 0; this.call({ op: 'topDown', mask }); const top = sheet.layers[sheet.layers.length - 1], n = this.n;
      let planes = 0; for (let k = 0; k < this.K; k++) if ((mask >>> k) & 1) { top[k].set(this.layerData.subarray(k * n, (k + 1) * n)); planes++; }
      this.topStale = false; this.topPlaceholder = false; this.stats.topDown = (this.stats.topDown || 0) + 1; this.stats.topBytes = (this.stats.topBytes || 0) + planes * n * 4;
    }
  }
  /** Explicit regional top-layer coherence; outside rect remains stale. */
  syncTopRect(sheet, rect) {
    this.flushDrys(sheet);
    this.notPlanning('a regional read of the top layer');
    if (this.paused || this.stroke) return;
    this.syncLower(sheet);
    // Pending CPU edits are authoritative until the next upload.
    if (this.needFullUp || !this.topStale || !sheet.layers.length) return;
    rect = this.validRect(rect);
    if (!rect.every(Number.isInteger)) rect = this.full();
    const t = performance.now(), [x0, y0, rw, rh] = rect, a = rw * rh;
    const mask = this.topMask >>> 0, top = sheet.layers[sheet.layers.length - 1];
    this.call({ op: 'topDownRect', rect, mask });
    let planes = 0;
    for (let k = 0; k < this.K; k++) if ((mask >>> k) & 1) {
      for (let y = 0; y < rh; y++) top[k].set(this.layerData.subarray(k * a + y * rw, k * a + (y + 1) * rw), (y0 + y) * this.w + x0);
      planes++;
    }
    // Keep global flags: even a placeholder may be populated only here.
    this.stats.topRectDown = (this.stats.topRectDown || 0) + 1;
    this.stats.topRectBytes = (this.stats.topRectBytes || 0) + planes * a * 4;
    this.stats.topRectMs = (this.stats.topRectMs || 0) + performance.now() - t;
  }
  /**
   * G + D + P per pigment, as K arrays of n floats (valid until the next call), or null when the CPU copy is current and the
   * caller should sum it itself. Brought down from the GPU as sums, a third of the whole sheet's pigment.
   */
  wetSums(sheet) {
    this.flushDrys(sheet);
    this.notPlanning('a read of the pigment sums');
    if (this.paused || this.stroke || this.needFullUp || !this.stale || this.noSums) return null; // the CPU copy is the current one
    if (this.resident && this.sumsVersion === this.version) return this.sums;
    // only the pigments that can hold anything wet or unfixed come down (wetMask and the newest layer's, which a rewet can
    // lift); a plane that held something last time and cannot now is cleared once
    const t = performance.now(), mask = (this.topMask | this.wetMask) >>> 0; this.call({ op: 'sums', mask });
    const K = this.K, n = this.n;
    if (!this.sums) { this.sums = Array.from({ length: K }, () => new Float32Array(n)); this.sumsLive = 0; }
    let planes = 0;
    for (let k = 0; k < K; k++) {
      if ((mask >>> k) & 1) { this.sums[k].set(this.sumData.subarray(k * n, (k + 1) * n)); planes++; } else if ((this.sumsLive >>> k) & 1) this.sums[k].fill(0);
    }
    this.sumsLive = mask; this.sumsVersion = this.version;
    this.stats.sums = (this.stats.sums || 0) + 1; this.stats.sumsMs = (this.stats.sumsMs || 0) + performance.now() - t; this.stats.sumBytes = (this.stats.sumBytes || 0) + planes * n * 4;
    return this.sums;
  }
  /** The CPU wrote the whole sheet (masking, blotting, a CPU-only dry): the next GPU op uploads it. */
  cpuWroteAll() { this.notPlanning('a write of the whole sheet'); this.version++; if (!this.paused) this.needFullUp = true; }
  fullUp(sheet) {
    this.flushDrys(sheet);
    this.needFullUp = false; this.wetMask = 0; this.topMask = 0; this.up(sheet, this.full());
    this.call({ op: 'resist', mask: sheet.resist ? Uint8Array.from(sheet.resist) : null });
    if (sheet.layers.length) {
      const top = sheet.layers[sheet.layers.length - 1], n = this.n; for (let k = 0; k < this.K; k++) this.layerData.set(top[k], k * n); this.topMask = GpuLink.maskOf(this.K, k => top[k], n); this.call({ op: 'topUp', mask:this.topMask });
       this.syncAct();
    }
    if (sheet._fixedBed) this.call({op:'fixedBedUp', bed:fixedBedLower(sheet)});
    this.stale = false; this.fresh.fresh(); this.topStale = false;
  }
  fixedLayersChanged(sheet, changed) {
    // Layer writers already brought their layers current; complete the other lower layers, and never upload stale water.
    this.syncLower(sheet);
    this.call({op:"fixedBedUp", bed:fixedBedLower(sheet)});
    const top = sheet.layers.at(-1);
    if (top && changed.includes(top)) {
      for (let k=0;k<this.K;k++) this.layerData.set(top[k],k*this.n);
      this.topMask=GpuLink.maskOf(this.K,k=>top[k],this.n);
      this.call({op:"topUp",mask:this.topMask});this.syncAct();
    }
  }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  close() { try { this.worker.postMessage({ op: 'close', wait: false }); } catch { /* already gone */ } this.worker.terminate(); }
}

/**
 * Put `sheet` on the GPU if the mode allows and a GPU is there. mode: 'off' | 'auto' | 'on'. Returns
 * { backend: 'gpu' | 'cpu', mode, adapter?, reason? }; with 'on' and no GPU it throws. Blocks while the worker starts.
 */
export function attachGpu(sheet, O, { mode = 'auto', log = m => console.error(m) } = {}) {
  const note = { mode };
  if (mode === 'off') return sheet._gpuInfo = { ...note, backend: 'cpu', fallback: false, reason: '--gpu off' };
  const K = sheet.K, n = sheet.n, ctrlSab = new SharedArrayBuffer(64), errSab = new SharedArrayBuffer(512);
  const adapterMetadata = new SharedArrayBuffer(4096),strokePlanMetadata=new SharedArrayBuffer(32);
  const rectSab = new SharedArrayBuffer(4 * PLANES(K) * n), layerSab = new SharedArrayBuffer(4 * K * n);
  const ringSab = new SharedArrayBuffer(4 * RING_SLOTS * RING_FLOATS), doneSab = new SharedArrayBuffer(4 * RING_SLOTS), sumSab = new SharedArrayBuffer(4 * K * n);
  const ctrl = new Int32Array(ctrlSab);
  const health = deviceHealth(); // a device error in the GPU thread, seen by every later call (device-health.mjs)
  const gpuData = { ctrl: ctrlSab, health, err: errSab, adapterMetadata,strokePlanMetadata, rect: rectSab, layer: layerSab, ring: ringSab, done: doneSab, sum: sumSab };
  // tools/gpu/paint-batch.mjs: this painter is one sheet of a batch; its GPU thread is shared and reached through a port
  const batchPort = threadData?.gpuBatchPort;
  const worker = batchPort ? batchWorker(batchPort, gpuData) : new Worker(fileURLToPath(new URL('./worker.mjs', import.meta.url)), { workerData: gpuData });
  worker.unref();
  let workerDied = null; worker.on('error', e => { workerDied = e; Atomics.store(ctrl, 3, 2); Atomics.store(ctrl, 0, 1); Atomics.notify(ctrl, 0); });
  const shared = { ctrl, health, err: new Uint8Array(errSab), rectData: new Float32Array(rectSab), layerData: new Float32Array(layerSab), ring: new Float32Array(ringSab), done: new Int32Array(doneSab), sumData: new Float32Array(sumSab) };
  const link = new GpuLink(worker, shared, sheet);
  const o = { ...O }; sheet._fixedBed = O.fixedBed > 0;
  const paper = sheet.paper, top = sheet.layers.length ? sheet.layers[sheet.layers.length - 1] : null;
  const clone = a => a && a.slice();
  worker.postMessage({
    op: 'init', O: o,
    sheet: {
      fixedBedLower: O.fixedBed > 0 ? fixedBedLower(sheet) : null,
      w: sheet.w, h: sheet.h, n, K, pigments: sheet.pigments, W: clone(sheet.W), s: clone(sheet.s), M: clone(sheet.M), ever: clone(sheet.ever), resist: clone(sheet.resist),
      G: sheet.G.map(clone), P: sheet.P.map(clone), D: sheet.D.map(clone), edge: new Float32Array(0), layers: [],
      paperPlanes: batchPort ? paperPlanes(paper, n) : undefined,
      paper: { w: sheet.w, h: sheet.h, n, capacity: paper.capacity, grain: paper.grain, fdx: paper.fdx, fdy: paper.fdy, height: paper.height, valley: paper.valley, tooth: paper.tooth, proud: paper.proud },
    },
    top: top ? top.map(clone) : null,
  });
  while (Atomics.load(ctrl, 3) === 0) Atomics.wait(ctrl, 3, 0, 200); // booting
  if (Atomics.load(ctrl, 3) !== 1 || brokenReason(health)) {
    const reason = brokenReason(health) ? `GPU device error while starting: ${brokenReason(health)}` : workerDied ? String(workerDied.message ?? workerDied) : link.errText() || 'GPU unavailable';
    worker.terminate();
    if (mode === 'on') throw new Error(`--gpu on but the GPU sheet is unavailable: ${reason}`);
    log(cpuFallbackWarning(reason));
    return sheet._gpuInfo = { ...note, backend: 'cpu', fallback: true, reason };
  }
  Atomics.store(ctrl, 0, 0);
  const planMeta=new Float64Array(strokePlanMetadata);link.strokePlanCapacity=3900000*(planMeta[1]||16)/16;link.strokePlanMiB=planMeta[1]||16;link.stats.strokePlanBudget={requestedMiB:planMeta[0]||16,effectiveMiB:link.strokePlanMiB,effectiveWords:link.strokePlanMiB*1024*1024/4,gpuBufferBytes:link.strokePlanMiB*1024*1024+sheet.n*4,maxStorageBufferBindingSize:planMeta[2],maxBufferSize:planMeta[3],fallback:planMeta[0]!==planMeta[1]};
  sheet._gpu = link;
  if(link.resident && process.env.GPU_ASYNC_DRY==='1'){
    let layers=sheet.layers;
    Object.defineProperty(sheet,'layers',{enumerable:true,configurable:true,get(){link.flushDrys(sheet);return layers;},set(value){link.flushDrys(sheet);layers=value;}});
  }
  link.lastO = null; link.applyOptions(O); link.initMasks(sheet);
  const adapterEvidence = readAdapterEvidence(new Uint8Array(adapterMetadata));
  const info = { ...note, backend: 'gpu', fallback: false, adapter: 'webgpu (Dawn)', adapterEvidence, tile: 16 };
  sheet._gpuInfo = info; log('[gpu] sheet running on the GPU');
  return info;
}

export const gpuStats = sheet => {
  const link = sheet._gpu; if (!link) return null;
  link.flushDrys(sheet);
  const out = { ...link.stats };
  if(typeof process!=='undefined'&&process.env.GPU_FAST_DRY_CHUNK==='200'){link.call({op:'dryStats'});out.fastDry={requestedChunk:200,actualFastChunk:link.ctrl[4],successfulCalls:link.ctrl[1],counterReadbacks:link.ctrl[12],counterReadWaitMs:link.ctrl[13]/1000,acceleratedIterations:link.ctrl[14],acceleratedChunks:link.ctrl[15],lastWetCounter:link.ctrl[6],timingScope:'Awaited counter map/readback including preceding queued GPU work; excludes fix. Actual iterations may exceed original50-step stop because dry is observed less often; pre-level schedule and final actualwet==0 unchanged.'};}
  if (typeof process !== 'undefined' && (process.env.GPU_PROF === '1' || process.env.GPU_TIMESTAMPS === '1')) { // the worker's GPU time by kind (worker.mjs PROF)
    link.call({ op: 'prof' }); out.gpuProf = JSON.parse(new TextDecoder().decode(new Uint8Array(link.rectData.buffer).slice(0, link.ctrl[1])));
  }
  return out;
};
