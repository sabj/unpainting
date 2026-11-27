// Shared drying schedule and coupled brush-contact engine for the two-grid solver
// (coarse water on `cw x ch` + fine pigment on `FW x FH = cw*N x ch*N`), dual-purpose CPU + Metal GPU.
import { Worker } from 'node:worker_threads';
import { createSheet, step, fix, DEFAULTS } from '../sheet.mjs';
import { stroke, strokeReach } from '../brush.mjs';
import { attachFine, fineTotals, fineBytes, fineWaterTotal } from '../fine-pigment.mjs';
import { resetEdgeFeed } from '../edge-feed.mjs';
import { compactLowerLayers } from '../layer-storage.mjs';
import { invalidatePaperCertificate } from '../paper-certificate.mjs';
import { timeChunks, DRY_TAIL_CHUNK_DT, levelEvery, thinDryWarmup, fastLevelPlan, planStepAt } from '../time-chunks.mjs';
import { deviceHealth, brokenReason, assertHealthy, markBroken } from './device-health.mjs';
import { readAdapterEvidence } from './adapter-evidence.mjs';
import { cpuFallbackWarning } from './backend-record.mjs';

const TIMEOUT_MS = 30 * 60 * 1000;

function surfaceLevel(sheet, slope = 0) {
  const { w, h, W, M } = sheet, height = sheet.paper.surface || sheet.paper.valley || sheet.paper.height;
  let most = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!M[i]) continue;
    if (x < w - 1 && M[i + 1]) most = Math.max(most, Math.abs((W[i] + slope * height[i]) - (W[i + 1] + slope * height[i + 1])));
    if (y < h - 1 && M[i + w]) most = Math.max(most, Math.abs((W[i] + slope * height[i]) - (W[i + w] + slope * height[i + w])));
  }
  return most;
}

function isQuietTail(sheet, o) {
  const capEps = o.capEps ?? DEFAULTS.capEps, paperDry = o.paperDry ?? DEFAULTS.paperDry;
  const { M, W, s, n, paper } = sheet, cap = paper.capacity;
  for (let i = 0; i < n; i++) {
    if (M[i] || W[i] !== 0 || s[i] > capEps * cap[i] || (!(paperDry > 0) && s[i] > 0)) return false;
  }
  return true;
}

function applyQuietTailFine(F) {
  const s = F.sheet;
  for (let i = 0; i < s.n; i++) {
    s.evaporated = (s.evaporated ?? 0) + s.s[i];
    s.s[i] = 0;
  }
  s.wetDirty = 1;
  for (let k = 0; k < F.K; k++) {
    const P = F.P[k], D = F.D[k];
    for (let f = 0; f < F.fn; f++) { if (P[f]) { D[f] += P[f]; P[f] = 0; } }
  }
}

function hasWetCells(sheet) {
  const { M, s, n, paper } = sheet, cap = paper.capacity;
  let count = 0;
  for (let i = 0; i < n; i++) if (M[i] || s[i] > 0.02 * cap[i]) count++;
  return count;
}

function evaporateFineInPlace(F) {
  const s = F.sheet;
  for (let i = 0; i < s.n; i++) {
    s.evaporated = (s.evaporated ?? 0) + s.W[i] + s.s[i];
    s.W[i] = 0; s.s[i] = 0; s.M[i] = 0;
  }
  s.wetDirty = 1;
  for (let k = 0; k < F.K; k++) {
    const G = F.G[k], P = F.P[k], D = F.D[k];
    for (let f = 0; f < F.fn; f++) { D[f] += G[f] + P[f]; G[f] = 0; P[f] = 0; }
  }
  if (F.blockMaskCount.some(v => v !== 0)) { F.M.fill(0); F.blockMaskCount.fill(0); F.maskVersion++; }
}

/**
 * Shared two-grid drying loop using the exact `drysteps` schedule (`fastLevelPlan`, `thinDryWarmup`,
 * `DRY_TAIL_CHUNK_DT`, `quietDryTail`). Runs on CPU when `transport` is null, or keeps fine pigment
 * resident on Metal WebGPU across the entire dry when `transport` is a `GpuFineTransport`.
 * Does NOT call `fix(s)` / `F.fix()` so callers can manage shared fixed-layer allocation cleanly.
 */
export async function runTwoGridDry(F, transport, max, o, { level = 60, levelMax = 4000, levelTol = 0.02, dt = 2, analyticTail = false, onStep = null } = {}) {
  const s = F.sheet;
  const base = o !== DEFAULTS ? { ...DEFAULTS, ...o } : DEFAULTS;
  F.o = base;
  const every = levelEvery(analyticTail && !onStep);
  const plan = analyticTail && !onStep ? fastLevelPlan(base.dt, level, levelMax) : null;
  const levelAt = plan ? plan.levelStep : level, levelMaxAt = plan ? plan.levelMaxStep : levelMax;
  const oLevel = { ...base, dt: base.dt }, oFast = { ...base, dt };
  const keepResident = Boolean(transport && typeof transport.syncHost === 'function' && !onStep);
  const stepOpts = keepResident ? { keepResident: true } : null;

  let t = 0, fast = false, warmup = null, coarseMs = 0, fineMs = 0, subSteps = 0;
  const sync = async () => {
    const start = performance.now();
    try { await transport.syncHost(F); }
    finally { fineMs += performance.now() - start; }
  };
  try {
    for (; t < max; t++) {
      if (!fast && analyticTail && !onStep && t === every) {
        let maxWater = 0; for (let i = 0; i < s.n; i++) if (s.W[i] > maxWater) maxWater = s.W[i];
        warmup = thinDryWarmup(maxWater, base.levelFloor, base.dt, level - t, base.wetEps);
      }
      if (warmup?.steps === 0) fast = true;
      const onCheck = plan && !warmup
        ? (t >= levelAt && (t >= levelMaxAt || (t - levelAt) % plan.postCheckEvery === 0))
        : (t >= levelAt && (t >= levelMaxAt || t % every === 0));
      if (!fast && onCheck && (t >= levelMaxAt || surfaceLevel(s, base.slope ?? 0) < levelTol)) fast = true;
      if (analyticTail && !onStep && isQuietTail(s, base)) {
        if (keepResident) await sync();
        applyQuietTailFine(F);
        break;
      }
      const seg = !fast && !warmup && plan ? planStepAt(plan, t) : null;
      const cur = fast ? oFast : warmup ? { ...base, dt: warmup.dt } : seg && seg.dt !== base.dt ? { ...base, dt: seg.dt } : oLevel;
      const chunkDt = fast && analyticTail ? (warmup?.tailChunkDt ?? DRY_TAIL_CHUNK_DT) : undefined;
      const chunks = timeChunks(cur.dt, chunkDt);
      const sub = chunks > 1 ? { ...cur, dt: cur.dt / chunks } : cur;
      let wet = false;
      for (let c = 0; c < chunks; c++) {
        const t0 = performance.now();
        wet = step(s, sub, null, chunkDt);
        const t1 = performance.now();
        coarseMs += t1 - t0;
        if (!wet) break;
        if (transport) await F.stepAsync(transport, stepOpts);
        else F.step();
        fineMs += performance.now() - t1;
        subSteps++;
      }
      if (!wet) break;
      if (warmup && !fast) warmup.steps--;
      if (onStep) onStep(t);
    }
    if (keepResident) await sync();
  } catch (err) {
    if (keepResident) { try { await sync(); } catch {} }
    throw err;
  }
  const stillWet = hasWetCells(s);
  if (stillWet) evaporateFineInPlace(F);
  return { steps: t, subSteps, stillWet, coarseMs, fineMs };
}

/**
 * Synchronous CPU two-grid dry (avoids async/microtask overhead when running on CPU).
 */
function runTwoGridDryCpu(F, max, o, { level = 60, levelMax = 4000, levelTol = 0.02, dt = 2, analyticTail = false, onStep = null } = {}) {
  const s = F.sheet;
  const base = o !== DEFAULTS ? { ...DEFAULTS, ...o } : DEFAULTS;
  F.o = base;
  const every = levelEvery(analyticTail && !onStep);
  const plan = analyticTail && !onStep ? fastLevelPlan(base.dt, level, levelMax) : null;
  const levelAt = plan ? plan.levelStep : level, levelMaxAt = plan ? plan.levelMaxStep : levelMax;
  const oLevel = { ...base, dt: base.dt }, oFast = { ...base, dt };

  let t = 0, fast = false, warmup = null, coarseMs = 0, fineMs = 0, subSteps = 0;
  for (; t < max; t++) {
    if (!fast && analyticTail && !onStep && t === every) {
      let maxWater = 0; for (let i = 0; i < s.n; i++) if (s.W[i] > maxWater) maxWater = s.W[i];
      warmup = thinDryWarmup(maxWater, base.levelFloor, base.dt, level - t, base.wetEps);
    }
    if (warmup?.steps === 0) fast = true;
    const onCheck = plan && !warmup
      ? (t >= levelAt && (t >= levelMaxAt || (t - levelAt) % plan.postCheckEvery === 0))
      : (t >= levelAt && (t >= levelMaxAt || t % every === 0));
    if (!fast && onCheck && (t >= levelMaxAt || surfaceLevel(s, base.slope ?? 0) < levelTol)) fast = true;
    if (analyticTail && !onStep && isQuietTail(s, base)) {
      applyQuietTailFine(F);
      break;
    }
    const seg = !fast && !warmup && plan ? planStepAt(plan, t) : null;
    const cur = fast ? oFast : warmup ? { ...base, dt: warmup.dt } : seg && seg.dt !== base.dt ? { ...base, dt: seg.dt } : oLevel;
    const chunkDt = fast && analyticTail ? (warmup?.tailChunkDt ?? DRY_TAIL_CHUNK_DT) : undefined;
    const chunks = timeChunks(cur.dt, chunkDt);
    const sub = chunks > 1 ? { ...cur, dt: cur.dt / chunks } : cur;
    let wet = false;
    for (let c = 0; c < chunks; c++) {
      const t0 = performance.now();
      wet = step(s, sub, null, chunkDt);
      const t1 = performance.now();
      coarseMs += t1 - t0;
      if (!wet) break;
      F.step();
      fineMs += performance.now() - t1;
      subSteps++;
    }
    if (!wet) break;
    if (warmup && !fast) warmup.steps--;
    if (onStep) onStep(t);
  }
  const stillWet = hasWetCells(s);
  if (stillWet) evaporateFineInPlace(F);
  return { steps: t, subSteps, stillWet, coarseMs, fineMs };
}

/**
 * Coupled fine-grid brush contact supporting `row`, `tuft`, and `section` brushes, fine clips,
 * fine resist masks, and optional in-stroke `between` callbacks that advance the coupled two-grid solver.
 */
function strokeFineCoupled(F, brush, path, { clip = null, resist = null, resistStrength = null, between = null, onAfterBetween = null, tape = null, tapeRes = null, ...options } = {}) {
  if (F._gpuResident) throw new Error('two grids: sync resident GPU state before brush contact');
  if (F.L.steps) throw new Error('two grids: consume the coarse step before brush contact');
  if (clip && clip.length !== F.fn) throw new Error('two grids: brush clip must use the fine grid');
  const s = F.sheet, N = F.N, nn = N * N;
  const view = F.contact ??= createSheet(F.paper, []);
  Object.assign(view, {
    pigments: s.pigments, K: F.K, G: F.G, P: F.P, D: F.D,
    layers: F.layers, W: F.wa, s: F.sa, wetting: s.wetting,
    _tape: tape ?? null, _tapeRes: tapeRes ?? undefined,
    resist: resist ?? null, resistStrength: resistStrength ?? null,
    resistFrom: resist ? (s.resistFrom ?? F.layers.length) : null,
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, r = brush.radius;
  for (const q of path) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); r = Math.max(r, q.r ?? r); }
  if (!path.length) return;
  const reach = strokeReach(brush, F.paper, r), blocks = [];
  const left = Math.max(0, Math.floor((x0 - reach) / N)), top = Math.max(0, Math.floor((y0 - reach) / N));
  const right = Math.min(s.w - 1, Math.floor((x1 + reach) / N)), bottom = Math.min(s.h - 1, Math.floor((y1 + reach) / N));
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) blocks.push(y * s.w + x);

  const loadFromCoarse = () => {
    F.prepareContact(blocks);
    view.clip = clip;
    if (!clip && s.clip) view.clip = F.contactClip ??= new Uint8Array(F.fn);
    for (const c of blocks) {
      const partial = F.blockMaskCount[c] > 0 && F.blockMaskCount[c] < nn;
      for (let a = 0; a < nn; a++) {
        const f = F.blockCells[c * nn + a];
        F.wb[f] = view.W[f]; F.sb[f] = view.s[f];
        view.M[f] = s.M[c] && (!partial || F.M[f]) ? 1 : 0;
        view.ever[f] = s.ever[c];
        if (!clip && s.clip) view.clip[f] = s.clip[c];
      }
    }
  };

  const restrictToCoarse = () => {
    let maskChanged = false, everChanged = false;
    for (const c of blocks) {
      let wSum = 0, ds = 0, wetCount = 0, everCount = 0, ever = 0;
      for (let a = 0; a < nn; a++) {
        const f = F.blockCells[c * nn + a];
        const m = view.M[f] || view.W[f] > 0 ? 1 : 0;
        if (F.M[f] !== m) { F.M[f] = m; maskChanged = true; }
        if (m) {
          wSum += view.W[f]; wetCount++;
          if (!F.ever[f]) { F.ever[f] = 1; everChanged = true; }
        }
        if (F.ever[f]) everCount++;
        ds += view.s[f] - F.sb[f]; ever |= view.ever[f];
      }
      F.blockMaskCount[c] = wetCount; F.blockEverCount[c] = everCount;
      s.W[c] = wetCount > 0 ? wSum / wetCount : 0;
      s.s[c] = Math.max(0, s.s[c] + ds / nn);
      s.M[c] = wetCount > 0 ? 1 : 0;
      s.ever[c] = ever;
    }
    if (maskChanged) F.maskVersion++;
    if (everChanged) F.everVersion++;
    s.wetDirty = 1;
    invalidatePaperCertificate(s);
  };

  loadFromCoarse();
  let restricted = false;
  const wrappedBetween = between ? steps => {
    restrictToCoarse();
    restricted = true;
    try {
      between(steps);
      onAfterBetween?.();
    } finally {
      loadFromCoarse();
      restricted = false;
    }
  } : undefined;

  try {
    return stroke(brush, view, path, wrappedBetween ? { ...options, between: wrappedBetween } : options);
  } finally {
    if (!restricted) restrictToCoarse();
  }
}

/**
 * Allocate SAB-backed or plain arrays for `coarseSheet` and `F` so the GPU worker shares
 * zero-copy typed-array memory with the main thread.
 */
function buildSharedTwoGrid(coarsePaper, finePaper, pigments, opts, N, shared) {
  const mkF32 = len => shared ? new Float32Array(new SharedArrayBuffer(len * 4)) : new Float32Array(len);
  const mkF64 = len => shared ? new Float64Array(new SharedArrayBuffer(len * 8)) : new Float64Array(len);
  const mkU8 = len => shared ? new Uint8Array(new SharedArrayBuffer(len)) : new Uint8Array(len);
  const mkU16 = len => shared ? new Uint16Array(new SharedArrayBuffer(len * 2)) : new Uint16Array(len);

  const coarse = createSheet(coarsePaper, pigments);
  const cn = coarse.n;
  if (shared) {
    coarse.W = mkF32(cn); coarse.s = mkF32(cn); coarse.M = mkU8(cn);
    coarse.ever = mkU8(cn); coarse.edge = mkF32(cn); coarse.edgePending = mkF64(cn);
  }
  const F = attachFine(coarse, finePaper, N, opts);
  const fn = F.fn;
  if (shared) {
    F.G = pigments.map(() => mkF32(fn));
    F.P = pigments.map(() => mkF32(fn));
    F.D = pigments.map(() => mkF32(fn));
    F.M = mkU8(fn); F.ever = mkU8(fn);
    F.blockMaskCount = mkU16(cn); F.blockEverCount = mkU16(cn);
  }
  const sabs = shared ? {
    coarseW: coarse.W.buffer, coarseS: coarse.s.buffer, coarseM: coarse.M.buffer,
    coarseEver: coarse.ever.buffer, coarseEdge: coarse.edge.buffer, coarseEdgePending: coarse.edgePending.buffer,
    fineG: F.G.map(a => a.buffer), fineP: F.P.map(a => a.buffer), fineD: F.D.map(a => a.buffer),
    fineM: F.M.buffer, fineEver: F.ever.buffer,
    blockMaskCount: F.blockMaskCount.buffer, blockEverCount: F.blockEverCount.buffer,
  } : null;
  return { coarse, F, sabs };
}

/**
 * Dual-purpose two-grid engine: uses a dedicated Metal WebGPU worker (`GpuFineTransport`) when
 * `gpuMode` is `'on'` (or `'auto'` when a GPU adapter is present), and CPU `fine-pigment.mjs`
 * when `gpuMode` is `'off'` (or `'auto'` without an adapter). Exposes a synchronous API compatible
 * with `paint-plate.mjs`.
 */
export function createTwoGridSheet({ coarsePaper, finePaper, pigments, opts, N, gpuMode = 'auto' }) {
  const wantGpu = gpuMode !== 'off';
  const health = deviceHealth();
  let worker = null, ctrl = null, errBuf = null, statsBuf = null, adapterBuf = null;
  let backendInfo = { backend: 'cpu', mode: gpuMode, fallback: false, reason: 'explicit --gpu off' };

  const { coarse, F, sabs } = buildSharedTwoGrid(coarsePaper, finePaper, pigments, opts, N, wantGpu);

  const decodeErr = () => {
    const end = errBuf.indexOf(0);
    return new TextDecoder().decode(errBuf.subarray(0, end < 0 ? errBuf.length : end));
  };

  if (wantGpu) {
    ctrl = new Int32Array(new SharedArrayBuffer(32));
    errBuf = new Uint8Array(new SharedArrayBuffer(4096));
    statsBuf = new Float64Array(new SharedArrayBuffer(64));
    adapterBuf = new Uint8Array(new SharedArrayBuffer(2048));
    worker = new Worker(new URL('./two-grid-worker.mjs', import.meta.url), {
      workerData: {
        ctrl: ctrl.buffer, err: errBuf.buffer, stats: statsBuf.buffer,
        health: health.buffer, adapterMetadata: adapterBuf.buffer,
        coarsePaper, finePaper, pigments, opts, N, sabs,
      },
    });
    worker.unref();
    worker.on('error', e => { markBroken(health, e.message); Atomics.store(ctrl, 3, 2); Atomics.notify(ctrl, 3); });
    worker.on('exit', code => {
      if (Atomics.load(ctrl, 3) === 0) {
        markBroken(health, `two-grid worker exited with code ${code}`);
        Atomics.store(ctrl, 3, 2); Atomics.notify(ctrl, 3);
      }
    });
    while (Atomics.load(ctrl, 3) === 0) {
      if (Atomics.wait(ctrl, 3, 0, TIMEOUT_MS) === 'timed-out') {
        worker.terminate();
        throw new Error('two-grid GPU worker timed out during init');
      }
    }
    const status = Atomics.load(ctrl, 3);
    if (status !== 1) {
      const reason = decodeErr() || brokenReason(health) || 'WebGPU unavailable';
      try { worker.terminate(); } catch {}
      worker = null;
      if (gpuMode === 'on') throw new Error(`--gpu on (twogrid N=${N}): ${reason}`);
      console.warn(cpuFallbackWarning(reason));
      backendInfo = { backend: 'cpu', mode: gpuMode, fallback: true, reason };
    } else {
      const adapterEvidence = readAdapterEvidence(adapterBuf);
      backendInfo = {
        backend: 'gpu', mode: gpuMode, fallback: false, adapter: 'webgpu',
        ...(adapterEvidence ? { adapterEvidence } : {}),
      };
    }
  }

  let gpuResident = false;
  let inStroke = false;
  let closed = false;
  const stats = { steps: 0, subSteps: 0, drys: 0, strokes: 0, coarseMs: 0, fineMs: 0, dryMs: 0, gpuBufferBytes: 0 };

  function callWorker(msg) {
    if (!worker || closed) throw new Error('two-grid GPU worker is not running');
    assertHealthy(health);
    Atomics.store(ctrl, 0, 0);
    ctrl[2] = 0;
    worker.postMessage(msg);
    while (Atomics.wait(ctrl, 0, 0, TIMEOUT_MS) === 'timed-out') {
      throw new Error(`two-grid GPU worker did not answer '${msg.op}'`);
    }
    if (ctrl[2]) {
      const reason = decodeErr() || brokenReason(health) || `two-grid GPU op '${msg.op}' failed`;
      markBroken(health, reason);
      throw new Error(reason);
    }
    assertHealthy(health);
  }

  function syncHost() {
    if (!worker || !gpuResident) return;
    callWorker({ op: 'syncHost' });
    gpuResident = false;
  }

  function fixAndSyncTop() {
    syncHost();
    resetEdgeFeed(coarse);
    for (let k = 0; k < F.K; k++) {
      const P = F.P[k], D = F.D[k], G = F.G[k];
      for (let i = 0; i < F.fn; i++) { D[i] += P[i] + G[i]; P[i] = 0; G[i] = 0; }
    }
    if (F.blockMaskCount.some(v => v !== 0)) { F.M.fill(0); F.blockMaskCount.fill(0); F.maskVersion++; }
    if (F.blockEverCount.some(v => v !== 0)) { F.ever.fill(0); F.blockEverCount.fill(0); F.everVersion++; }
    let pushed = false;
    if (F.D.some(d => d.some(v => v !== 0))) {
      const zero = F.zeroLayer ??= new Float32Array(F.fn);
      const layer = F.D.map(d => {
        if (!d.some(v => v !== 0)) return zero;
        const copy = worker ? new Float32Array(new SharedArrayBuffer(F.fn * 4)) : new Float32Array(F.fn);
        copy.set(d);
        return copy;
      });
      F.layers.push(layer);
      coarse.ever.fill(0);
      for (const d of F.D) d.fill(0);
      pushed = true;
      // Crop immutable lower fine layers to their tight bounding boxes so N=4/N=8 memory stays bounded.
      if (F.layers.length > 2) {
        compactLowerLayers({
          w: F.FW, h: F.FH, n: F.fn, K: F.K, G: F.G, D: F.D, P: F.P,
          layers: F.layers, _zeroLayer: F.zeroLayer, resistFrom: F.resistFrom ?? undefined,
        }, { from: 1 });
      }
    }
    if (worker) {
      const top = F.layers.at(-1);
      const planes = top ? top.map(a => a.buffer instanceof SharedArrayBuffer ? a.buffer : null) : null;
      callWorker({ op: 'setTop', planes, maskVersion: F.maskVersion, everVersion: F.everVersion, resetEdge: true });
    }
    return pushed;
  }

  function stepOnce(o = opts, chunkDt = undefined) {
    const stepOpts = o !== DEFAULTS ? { ...DEFAULTS, ...o } : DEFAULTS;
    // During in-stroke `between` callbacks the brush is actively mutating host F.G/F.D;
    // stepping on CPU over the small active brush box avoids full-sheet GPU upload+readback round-trips.
    if (worker && !inStroke) {
      callWorker({ op: 'step', o: stepOpts, chunkDt, maskVersion: F.maskVersion, everVersion: F.everVersion });
      F.maskVersion = ctrl[4]; F.everVersion = ctrl[5];
      const wet = ctrl[1] !== 0;
      if (wet) gpuResident = true;
      stats.steps++;
      stats.subSteps += Math.max(1, ctrl[6]);
      return wet;
    }
    F.o = stepOpts;
    const chunks = timeChunks(stepOpts.dt, chunkDt);
    const sub = chunks > 1 ? { ...stepOpts, dt: stepOpts.dt / chunks } : stepOpts;
    let wet = false;
    for (let c = 0; c < chunks; c++) {
      const t0 = performance.now();
      wet = step(coarse, sub, null, chunkDt);
      const t1 = performance.now();
      stats.coarseMs += t1 - t0;
      if (!wet) break;
      F.step();
      stats.fineMs += performance.now() - t1;
      stats.subSteps++;
    }
    stats.steps++;
    return wet;
  }

  function drySheet(max = 40000, o = opts, dryOpts = {}) {
    const t0 = performance.now();
    const stepOpts = o !== DEFAULTS ? { ...DEFAULTS, ...o } : DEFAULTS;
    let count = 0, stillWet = 0;
    if (dryOpts?.onStep) {
      // Watched dry (e.g. --wetframes): drive step-by-step on main thread so onStep fires on schedule.
      const { level = 60, levelMax = 4000, levelTol = 0.02, dt = 2, onStep } = dryOpts;
      let fast = false;
      const slow = { ...stepOpts, dt: stepOpts.dt }, quick = { ...stepOpts, dt };
      for (; count < max; count++) {
        if (!fast && count >= level && (count >= levelMax || (count % levelEvery(false) === 0 && surfaceLevel(coarse, stepOpts.slope ?? 0) < levelTol))) fast = true;
        if (!stepOnce(fast ? quick : slow)) break;
        onStep(count);
      }
      syncHost();
      stillWet = hasWetCells(coarse);
      if (stillWet) evaporateFineInPlace(F);
    } else if (worker) {
      callWorker({
        op: 'dry', max, o: stepOpts,
        dryOpts: {
          level: dryOpts.level ?? 60, levelMax: dryOpts.levelMax ?? 4000,
          levelTol: dryOpts.levelTol ?? 0.02, dt: dryOpts.dt ?? 2,
          analyticTail: Boolean(dryOpts.analyticTail),
        },
        maskVersion: F.maskVersion, everVersion: F.everVersion,
      });
      count = ctrl[1];
      F.maskVersion = ctrl[4]; F.everVersion = ctrl[5];
      stillWet = ctrl[6];
      gpuResident = false; // worker calls syncHost before ack
    } else {
      const res = runTwoGridDryCpu(F, max, stepOpts, dryOpts);
      count = res.steps; stillWet = res.stillWet;
      stats.coarseMs += res.coarseMs; stats.fineMs += res.fineMs; stats.subSteps += res.subSteps;
    }
    fix(coarse);
    fixAndSyncTop();
    stats.drys++;
    stats.dryMs += performance.now() - t0;
    return { steps: count, stillWet };
  }

  function setResist(coarseMask, coarseStrength, fineMask, fineStrength) {
    syncHost();
    if (!coarseMask) {
      coarse.resist = null; coarse.resistStrength = null; coarse.resistFrom = null;
      F.resist = null; F.resistStrength = null; F.resistFrom = null;
      if (worker) callWorker({ op: 'setResist', resist: null, strength: null, resistFrom: null });
      return;
    }
    const rSab = worker ? new Uint8Array(new SharedArrayBuffer(coarse.n)) : new Uint8Array(coarse.n);
    rSab.set(coarseMask);
    let sSab = null;
    if (coarseStrength) {
      sSab = worker ? new Float32Array(new SharedArrayBuffer(coarse.n * 4)) : new Float32Array(coarse.n);
      sSab.set(coarseStrength);
    }
    coarse.resist = rSab; coarse.resistStrength = sSab; coarse.resistFrom = F.layers.length;
    F.resist = fineMask; F.resistStrength = fineStrength; F.resistFrom = F.layers.length;
    if (worker) {
      callWorker({ op: 'setResist', resist: rSab.buffer, strength: sSab ? sSab.buffer : null, resistFrom: F.layers.length });
    }
  }

  function liftResistFine() {
    syncHost();
    const r = F.resist; if (!r) return;
    const from = F.resistFrom ?? F.layers.length, st = F.resistStrength ?? null;
    for (let f = 0; f < F.fn; f++) {
      if (!r[f]) continue;
      if (st && st[f] < 1) {
        const keep = 1 - st[f];
        for (let k = 0; k < F.K; k++) { F.G[k][f] *= keep; F.D[k][f] *= keep; F.P[k][f] *= keep; }
        for (let L = from; L < F.layers.length; L++) for (let k = 0; k < F.K; k++) {
          if (F.layers[L][k] !== F.zeroLayer) F.layers[L][k][f] *= keep;
        }
      } else {
        for (let k = 0; k < F.K; k++) { F.G[k][f] = 0; F.D[k][f] = 0; F.P[k][f] = 0; }
        for (let L = from; L < F.layers.length; L++) for (let k = 0; k < F.K; k++) {
          if (F.layers[L][k] !== F.zeroLayer) F.layers[L][k][f] = 0;
        }
        F.M[f] = 0;
      }
    }
    // Recompute blockMaskCount & clear coarse resist water
    const nn = N * N;
    let maskChanged = false;
    for (let c = 0; c < coarse.n; c++) {
      let cnt = 0;
      for (let a = 0; a < nn; a++) if (F.M[F.blockCells[c * nn + a]]) cnt++;
      if (F.blockMaskCount[c] !== cnt) { F.blockMaskCount[c] = cnt; maskChanged = true; }
      if (coarse.resist?.[c]) {
        if (coarse.resistStrength && coarse.resistStrength[c] < 1) coarse.W[c] *= 1 - coarse.resistStrength[c];
        else { coarse.W[c] = 0; coarse.M[c] = 0; }
      }
    }
    if (maskChanged) F.maskVersion++;
    coarse.wetDirty = 1;
    setResist(null, null, null, null);
    if (F.layers.length > 2) {
      compactLowerLayers({
        w: F.FW, h: F.FH, n: F.fn, K: F.K, G: F.G, D: F.D, P: F.P,
        layers: F.layers, _zeroLayer: F.zeroLayer,
      }, { from: 1 });
    }
    // Update top layer on worker in case layers[from..] included the top layer.
    if (worker) {
      const top = F.layers.at(-1);
      const planes = top ? top.map(a => a.buffer instanceof SharedArrayBuffer ? a.buffer : null) : null;
      callWorker({ op: 'setTop', planes, maskVersion: F.maskVersion, everVersion: F.everVersion, resetEdge: false });
    }
  }

  function syncTopToWorker() {
    if (!worker) return;
    syncHost();
    const top = F.layers.at(-1);
    let planes = null;
    if (top) {
      planes = top.map((a, k) => {
        if (a === F.zeroLayer) return null;
        if (a.buffer instanceof SharedArrayBuffer) return a.buffer;
        const sab = new Float32Array(new SharedArrayBuffer(F.fn * 4));
        sab.set(a);
        top[k] = sab;
        return sab.buffer;
      });
    }
    callWorker({ op: 'setTop', planes, maskVersion: F.maskVersion, everVersion: F.everVersion, resetEdge: false });
  }

  function getStats() {
    if (worker && !closed) {
      try {
        callWorker({ op: 'stats' });
        stats.gpuBufferBytes = statsBuf[0];
        stats.coarseMs = statsBuf[1];
        stats.fineMs = statsBuf[2];
        stats.subSteps = statsBuf[3];
      } catch {}
    }
    return {
      ...stats,
      backend: backendInfo.backend,
      N,
      waterWidth: coarse.w, waterHeight: coarse.h,
      fineWidth: F.FW, fineHeight: F.FH,
      fineMB: +(fineBytes(F) / 2 ** 20).toFixed(2),
      gpuBufferMB: +(stats.gpuBufferBytes / 2 ** 20).toFixed(2),
    };
  }

  function close() {
    if (closed) return;
    closed = true;
    if (worker) {
      try {
        Atomics.store(ctrl, 0, 0);
        worker.postMessage({ op: 'close' });
        Atomics.wait(ctrl, 0, 0, 5000);
      } catch {}
      try { worker.terminate(); } catch {}
      worker = null;
    }
  }

  return {
    F, coarse, N, health, backendInfo,
    isGpu: Boolean(worker),
    syncHost, step: stepOnce, dry: drySheet, fixAndSyncTop,
    strokeFine: (brush, path, strokeOpts) => {
      syncHost();
      stats.strokes++;
      inStroke = true;
      try {
        return strokeFineCoupled(F, brush, path, {
          ...strokeOpts,
          onAfterBetween: syncHost,
          resist: F.resist ?? null,
          resistStrength: F.resistStrength ?? null,
        });
      } finally {
        inStroke = false;
      }
    },
    setResist, liftResist: liftResistFine, syncTopToWorker,
    totals: k => fineTotals(F, k),
    waterTotal: () => fineWaterTotal(F),
    getStats, close,
  };
}
