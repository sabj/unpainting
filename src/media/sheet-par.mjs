// Threads for the sheet's step (sheet.mjs): a persistent worker pool on SharedArrayBuffers runs each large box in row
// bands through the phases in sheet-kernel.mjs, bit-identical to the serial step. Whole-sheet jobs use the same pool
// (jobs-kernel.mjs). Node only: sheet.mjs loads this on setThreads(n > 1).
import { Worker, MessageChannel } from 'node:worker_threads';
import os from 'node:os';
import { useRenderThreads, useRenderCellsThreads } from './km.mjs';
import { useFlowThreads } from './wash.mjs';
import { useUnmixThreads } from '../crop/pigments.mjs';
import { useBlurThreads } from '../keyframes/density.mjs';
import { runJob } from './jobs-kernel.mjs';
import {
  runChunk, claim, openPhase, PH, GEN, PHASE, SHEET, DONE, ERR, NT, READY, NCH, BOX, IT, ITERS, LAST, NA, N3, NGROUP, BAND, MAXT, MAXC,
  ACT, ACT3, GROUP, GREP, MV, AF, DF, TF, CTRL_LEN, MAXK, P, PK, PKS, PRM_LEN,
} from './sheet-kernel.mjs';

export const SPIN = 2000;
// chunks per thread: enough that a slow thread's share is picked up by the others, few enough that the halo rows each
// chunk recomputes stay small
const CHUNKS = 3;
// Below these a step is cheaper serially than the eleven meetings it takes in bands.
let MIN_AREA = 4096, MIN_WET = 2048, MIN_ROWS = 6, MIN_BAND_WET = 1024;
/** For tests: step boxes of any size in bands of any size. */
export const tune = ({ minArea = MIN_AREA, minWet = MIN_WET, minRows = MIN_ROWS, minBandWet = MIN_BAND_WET } = {}) => { MIN_AREA = minArea; MIN_WET = minWet; MIN_ROWS = minRows; MIN_BAND_WET = minBandWet; };

let POOL = null;
export const shared = (Ctor, n) => new Ctor(new SharedArrayBuffer(Ctor.BYTES_PER_ELEMENT * Math.max(1, n)));
export const isShared = a => a != null && a.buffer instanceof SharedArrayBuffer;
const sharedCopy = a => { const b = shared(a.constructor, a.length); b.set(a); return b; };

/** Start the pool: `n` threads in all, the main thread and n - 1 workers. */
export function start(n, { opticsOnly = false } = {}) {
  if (POOL) stop();
  const T = Math.max(1, Math.min(MAXT, Math.floor(n)));
  if (T > os.availableParallelism()) console.warn(`sheet: ${T} threads on ${os.availableParallelism()} cores`);
  const ctrl = shared(Int32Array, CTRL_LEN), prm = shared(Float64Array, PRM_LEN);
  ctrl[NT] = T;
  const workers = [];
  for (let p = 1; p < T; p++) {
    const { port1, port2 } = new MessageChannel();
    const wk = new Worker(new URL('./sheet-worker.mjs', import.meta.url), { workerData: { ctrl, prm, p, port: port2 }, transferList: [port2] });
    wk.unref(); port1.unref();
    wk.on('error', e => { console.error('sheet worker', p, e); ctrl[ERR] = 1; });
    workers.push({ wk, port: port1 });
  }
  // the workers start on their own threads; wait for each to be listening before the first step can need it
  const t0 = Date.now(); let r;
  while ((r = Atomics.load(ctrl, READY)) < T - 1) { if (Date.now() - t0 > 30000) throw new Error(`sheet: ${r} of ${T - 1} workers started`); Atomics.wait(ctrl, READY, r, 100); }
  POOL = { T, ctrl, prm, workers, gen: Atomics.load(ctrl, GEN), ctxs: new WeakMap(), live: [], nextId: 1, stats: { par: 0, serial: 0, render: 0, flow: 0, tiles: 0, thick: 0 } };
  if (T > 1) {
    useRenderThreads(renderLayers);
    if (process.env.KM_PARALLEL_CELLS === '1') useRenderCellsThreads(renderCellsParallel);
    if (!opticsOnly) { useFlowThreads(flowField); useUnmixThreads(unmix); useBlurThreads(blur); }
  }
  return T;
}

export function stop() {
  if (!POOL) return;
  const { ctrl } = POOL;
  ctrl[PHASE] = PH.QUIT; Atomics.store(ctrl, GEN, (POOL.gen + 1) | 0); Atomics.notify(ctrl, GEN);
  for (const { wk } of POOL.workers) wk.terminate();
  useRenderThreads(null); useRenderCellsThreads(null); useFlowThreads(null); useUnmixThreads(null); useBlurThreads(null);
  POOL = null;
}

export const threads = () => (POOL ? POOL.T : 1);
export const stats = () => (POOL ? { ...POOL.stats } : null);

function post(msg) { for (const { port } of POOL.workers) port.postMessage(msg); }

// A sheet the workers know. The sheet's own arrays, its scratch and the paper's are all shared; a sheet with any
// array that is not (made before the pool started, or handed a plain array since) is stepped serially.
const LIVE = 4;
function ctxFor(sheet, H) {
  const { W, s, M, ever, edge, G, P: Pp, D, paper } = sheet, sc = H.scratch;
  let C = POOL.ctxs.get(sheet);
  if (C && C.sc === sc && POOL.live.includes(C.id)) return C;
  const own = [W, s, M, ever, edge, ...G, ...Pp, ...D];
  const scr = [sc.fx, sc.fy, sc.out, sc.C, sc.wsc, sc.dW, sc.went, ...sc.qx, ...sc.qy, ...sc.pout, ...sc.dG, sc.sNext, ...sc.PNext, ...sc.dDep, ...sc.dSlide, sc.dep, sc.wl, sc.wrow, sc.wf, sc.rlo, sc.rhi, sc.dlo, sc.dhi, sc.wlo, sc.whi, sc.plo, sc.phi];
  if (![...own, ...scr].every(isShared)) return null;
  const pp = paperShared(paper), perm = PERMS.get(H.perm) || (PERMS.set(H.perm, { px: sharedCopy(H.perm.px), py: sharedCopy(H.perm.py) }), PERMS.get(H.perm));
  C = {
    id: POOL.nextId++, sc, w: sheet.w, h: sheet.h, n: sheet.n, K: sheet.K,
    W, s, M, ever, edge, G, P: Pp, D,
    fx: sc.fx, fy: sc.fy, out: sc.out, Cc: sc.C, wsc: sc.wsc, dW: sc.dW, went: sc.went, qx: sc.qx, qy: sc.qy, pout: sc.pout, dG: sc.dG,
    sNext: sc.sNext, PNext: sc.PNext, dDep: sc.dDep, dSlide: sc.dSlide, dep: sc.dep,
    wl: sc.wl, wrow: sc.wrow, wf: sc.wf, rlo: sc.rlo, rhi: sc.rhi, dlo: sc.dlo, dhi: sc.dhi, wlo: sc.wlo, whi: sc.whi, plo: sc.plo, phi: sc.phi,
    wcnt: shared(Int32Array, sheet.h), sSnap: shared(Float32Array, sheet.n), Wd: shared(Float32Array, sheet.n),
    Gd: sheet.G.map(() => shared(Float32Array, sheet.n)), mark: shared(Uint8Array, sheet.n), cpact: shared(Int32Array, MAXC * (MAXK + 1)),
    ...pp, px: perm.px, py: perm.py, throats: null, top: null, resist: null, surf: [],
    _topSrc: undefined, _resistBuf: null, _throatsSrc: null,
  };
  const { ctrl, prm, id, sc: _sc, _topSrc, _resistBuf, _throatsSrc, ...fields } = C;
  post({ t: 'reg', id: C.id, fields });
  POOL.ctxs.set(sheet, C);
  POOL.live.push(C.id);
  // workers keep a few sheets; the oldest is forgotten, and stepped again only after it is sent again
  while (POOL.live.length > LIVE) post({ t: 'drop', id: POOL.live.shift() });
  C.ctrl = POOL.ctrl; C.prm = POOL.prm;
  return C;
}
const PAPERS = new WeakMap(), PERMS = new WeakMap();
function paperShared(paper) {
  if (PAPERS.has(paper)) return PAPERS.get(paper);
  const h = paper.valley || paper.height;
  const out = { capacity: sharedCopy(paper.capacity), fdx: sharedCopy(paper.fdx), fdy: sharedCopy(paper.fdy), grain: sharedCopy(paper.grain), height: sharedCopy(h), fibreH: sharedCopy(paper.height), tooth: paper.tooth ? sharedCopy(paper.tooth) : null };
  PAPERS.set(paper, out); return out;
}
const set = (C, key, value) => { C[key] = value; post({ t: 'set', id: C.id, key, value }); };

// the per-step state a worker has to be told about: the layer below, the masking film, the throat table, the surfaces
function sync(C, sheet, H) {
  const L = sheet.layers.length ? sheet.layers[sheet.layers.length - 1] : null;
  if (L !== C._topSrc) {
    if (L && !L.every(isShared)) return false;
    C._topSrc = L; set(C, 'top', L);
  }
  // the masking film is copied in every step it is on: a caller may change a mask it has already laid
  const r = sheet.resist;
  let v = null;
  if (r) {
    if (isShared(r) || r.length !== sheet.n) v = r;
    else { if (!C._resistBuf) C._resistBuf = shared(Uint8Array, sheet.n); C._resistBuf.set(r); v = C._resistBuf; }
  }
  if (v !== C.resist) set(C, 'resist', v);
  if (H.throats !== C._throatsSrc) { C._throatsSrc = H.throats; set(C, 'throats', isShared(H.throats) ? H.throats : sharedCopy(H.throats)); }
  return true;
}

// One phase: open it for `nChunks` chunks, wake the workers, take chunks on this thread too, and wait until every chunk
// is done. A worker still asleep when the chunks run out is not waited for.
function run(phase, nChunks) {
  const { ctrl } = POOL, C = CUR, g = (POOL.gen = (POOL.gen + 1) | 0);
  ctrl[PHASE] = phase;
  Atomics.store(ctrl, DONE, 0);
  openPhase(ctrl, g, nChunks);
  Atomics.store(ctrl, GEN, g);
  Atomics.notify(ctrl, GEN);
  let err = null;
  try {
    for (let c; (c = claim(ctrl, g)) >= 0; ) {
      if (phase === PH.JOB) runJob(JOB, c, nChunks); else runChunk(C, c, phase);
      Atomics.add(ctrl, DONE, 1);
    }
  } catch (e) { err = e; }
  let d, spins = 0;
  while ((d = Atomics.load(ctrl, DONE)) < nChunks && !err) {
    if (ctrl[ERR]) break;
    if (++spins > SPIN) { Atomics.wait(ctrl, DONE, d, 50); if (spins > SPIN + 1200) throw new Error(`sheet: phase ${phase} waited a minute for ${nChunks - d} chunks`); }
  }
  if (err) throw err;
  if (ctrl[ERR]) throw new Error('sheet: a worker failed a step');
}
let CUR = null, JOB = null;

// a whole-sheet job (jobs-kernel.mjs), split across every thread
function job(args) { JOB = args; post({ t: 'job', args }); run(PH.JOB, Math.min(MAXC, CHUNKS * POOL.T)); JOB = null; }
const MIN_CELLS = 65536;
const typed = a => ArrayBuffer.isView(a) && !(a instanceof DataView);
// The jobs' shared buffers are kept and reused, one per role: idle workers seldom collect garbage, so fresh buffers
// per call pile up.
const BUFS = new Map();
function buf(key, Ctor, n) {
  let b = BUFS.get(key);
  if (!b || b.length !== n || b.constructor !== Ctor) { b = shared(Ctor, n); BUFS.set(key, b); }
  return b;
}
const into = (key, a) => { if (isShared(a)) return a; const b = buf(key, a.constructor, a.length); b.set(a); return b; };

/** km.mjs renderLayers in shares of cells; null where it declines. */
function renderLayers(layers, pigments, paperRGB, n, scale) {
  if (!POOL || POOL.T < 2 || n < MIN_CELLS || !typed(paperRGB) || !layers.every(L => L.every(typed))) return null;
  // the sheet's dried layers are shared already; the wet one on top, or a lone layer, is copied into a kept buffer
  if (layers.filter(L => !L.every(isShared)).length > 2) return null;
  const L = layers.map((layer, l) => layer.map((a, k) => into(`layer${l === layers.length - 1 ? 'top' : l}.${k}`, a)));
  const out = buf('rgb', Uint8ClampedArray, n * 3);
  job({ kind: 'render', layers: L, Kp: pigments.map(p => p.K), Sp: pigments.map(p => p.S), paperRGB: into('paper', paperRGB), n, scale, out });
  POOL.stats.render++;
  return out.slice();
}

// Cached composites use the same cell arithmetic, with optional double-precision
// initial/saved composites. JOB prevents reentering the pool from the main share.
function renderCellsParallel(layers, Kp, Sp, paperRGB, c0, c1, scale, extra, out, init, keep, micro) {
  if (process.env.KM_PARALLEL_CELLS !== '1' || JOB || !POOL || POOL.T < 2 || extra || c0 !== 0 || c1 < MIN_CELLS || paperRGB.length !== c1 * 3) return false;
  if (![paperRGB, out, init, keep, micro?.t].filter(Boolean).every(typed) || !layers.every(L => L.every(typed))) return false;
  const L = layers.map((layer, l) => layer.map((a, k) => into(`cells.layer${l}.${k}`, a)));
  const rgb = out ? buf('cells.rgb', out.constructor, out.length) : null;
  const initial = init ? into('cells.init', init) : null;
  const saved = keep ? (keep === init ? initial : buf('cells.keep', keep.constructor, keep.length)) : null;
  job({ kind: 'render', layers: L, Kp, Sp, paperRGB: into('cells.paper', paperRGB), n: c1, scale,
    out: rgb, init: initial, keep: saved, micro: micro ? {t: into('cells.micro', micro.t), amp: micro.amp} : null });
  if (out) out.set(rgb);
  if (keep && keep !== saved) keep.set(saved);
  POOL.stats.render++;
  return true;
}

/** sheet.mjs wetBoxes' whole-sheet scan for wet tiles, in rows of tiles; false where it declines. */
export function tileScan(sheet, T, TILE) {
  if (!POOL || POOL.T < 2 || sheet.n < MIN_CELLS || !isShared(T.on) || !isShared(sheet.M) || !isShared(sheet.s)) return false;
  const { capacity } = paperShared(sheet.paper);
  job({ kind: 'tiles', M: sheet.M, s: sheet.s, capacity, on: T.on, w: sheet.w, h: sheet.h, tw: T.tw, th: T.th, TILE });
  POOL.stats.tiles++;
  return true;
}

/** sheet.mjs thickness in shares of cells; null where it declines. */
export function thickness(sheet) {
  const { G, D, P: Pp, layers, n } = sheet;
  if (!POOL || POOL.T < 2 || n < MIN_CELLS || ![...G, ...D, ...Pp].every(isShared) || !layers.every(L => L.every(isShared))) return null;
  const out = G.map((_, k) => buf(`thick${k}`, Float32Array, n).fill(0));
  job({ kind: 'thick', layers, G, D, P: Pp, out, n });
  POOL.stats.thick++;
  return out.map(a => a.slice());
}

/** density.mjs gaussian in bands of rows; null where it declines. */
function blur(src, w, h, k, r) {
  if (!POOL || POOL.T < 2 || w * h < MIN_CELLS || !typed(src)) return null;
  const n = w * h, s = into('blurSrc', src), tmp = buf('blurTmp', Float32Array, n), out = buf('blurOut', Float32Array, n);
  job({ kind: 'blurH', src: s, tmp, w, h, k, r }); job({ kind: 'blurV', tmp, out, w, h, k, r });
  return out.slice();
}

/** pigments.mjs unmix in shares of the pixels; null where it declines. */
function unmix(D, n, k, Gf, P0, P1, P2, L, iterations) {
  if (!POOL || POOL.T < 2 || n < 4096 || !typed(D)) return null;
  const A = buf('unmixA', Float32Array, n * k);
  job({ kind: 'unmix', D: into('unmixD', D), A, n, k, Gf, P0, P1, P2, L, iterations });
  return A.slice();
}

/** wash.mjs flowField in bands of rows; null where it declines. */
function flowField(field, w, h, rng = {}) {
  if (!POOL || POOL.T < 2 || w * h < MIN_CELLS || h < 5 || !typed(field)) return null;
  const n = w * h, f = into('field', field);
  // zeroed as the serial call's fresh arrays are: the passes leave the borders and flat cells unwritten
  const [gx, gy, fx, fy, coh] = ['gx', 'gy', 'fx', 'fy', 'coh'].map(k => buf(k, Float32Array, n).fill(0));
  job({ kind: 'grad', field: f, w, h, gx, gy, lo: rng.glo, hi: rng.ghi });
  job({ kind: 'tensor', gx, gy, w, h, fx, fy, coh, lo: rng.tlo, hi: rng.thi });
  POOL.stats.flow++;
  return { fx: fx.slice(), fy: fy.slice(), coh: coh.slice() };
}

function params(C, sheet, o) {
  const prm = POOL.prm, pigments = sheet.pigments, K = sheet.K, dt = o.dt ?? 1;
  const v = {
    dt, edgeWidth: o.edgeWidth, evap: o.evap, edgeEvap: o.edgeEvap, absorb: o.absorb, film: o.film,
    ff: o.fibreFlow ?? 0.6, flowDepth: o.flowDepth ?? 0.12, flow: o.flow, slope: o.slope, mar: o.marangoni ?? 0,
    diffuse: Math.min(0.25, Math.max(0, o.diffuse)), cd: o.carryDepth ?? 0.08, filmDiff: Math.max(0, o.filmDiffuse ?? 0), filmDepth: o.filmDepth ?? 0.03, gran: o.gran ?? 1, liftDepth: o.liftDepth ?? 0.15,
    scour: o.scour ?? 0, holdCap: o.hold ?? Infinity, settle: o.settle, lift: o.lift, looseLift: o.looseLift, rewetLift: o.rewetLift,
    granFill: o.granFill ?? 0, slide: o.slide ?? 0, fill: o.slideFill ?? 1, repose: o.repose ?? 0,
    capStep: Math.min(2 / 3, Math.max(0, o.capRate * dt * 10)), sizing: o.sizing ?? 0.85, filter: o.wickFilter ?? 0.2,
    capEps: o.capEps, capDelta: o.capDelta, wetEps: o.wetEps, paperDry: o.paperDry, capSigma: o.capSigma, spill: o.spill,
    spillHeight: o.spillHeight, dampEase: o.dampEase, pinning: o.pinning ?? 0, pinFibre: o.pinFibre ?? 0,
    hasTop: C.top ? 1 : 0, hasResist: C.resist ? 1 : 0, enclose: o.encloseEase ?? 0, slideCap: o.slideCap ?? 0,
    holeSpan: o.holeSpan ?? 0, holeFill: o.holeFill ?? 0,
  };
  for (const k in P) prm[P[k]] = v[k] === undefined ? NaN : v[k];
  const f32 = new Float32Array(2);
  for (let k = 0; k < K; k++) {
    const pg = pigments[k], b = PK + k * PKS;
    f32[0] = pg.wick ?? Math.max(0.05, Math.min(0.9, 1 - pg.gamma)); f32[1] = pg.floc ?? 0;
    const rho = +pg.rho, omega = +pg.omega, gamma = +pg.gamma, gg = gamma * v.gran;
    prm[b] = f32[0]; prm[b + 1] = rho; prm[b + 2] = omega; prm[b + 3] = gamma; prm[b + 4] = gg;
    prm[b + 5] = (rho / omega) * v.lift * v.looseLift; prm[b + 6] = v.scour / omega; prm[b + 7] = v.repose / gg; prm[b + 8] = f32[1];
  }
  return v;
}

/** Step one box in bands. Returns false, having changed nothing, where the box is better stepped serially. */
export function stepBox(sheet, o, box, H) {
  if (!POOL || POOL.T < 2) return false;
  const [x0, y0, x1, y1] = box, { ctrl, T } = POOL, K = sheet.K;
  if ((x1 - x0 + 1) * (y1 - y0 + 1) < MIN_AREA || K > MAXK || !(o.flowIters >= 1) || !Number.isFinite(o.edgeWidth) || o.edgeWidth > 16) return false;
  const C = ctxFor(sheet, H); if (!C || !sync(C, sheet, H)) { POOL.stats.serial++; return false; }
  CUR = C;
  const v = params(C, sheet, o), iters = o.flowIters;
  ctrl[SHEET] = C.id; ctrl[BOX] = x0; ctrl[BOX + 1] = y0; ctrl[BOX + 2] = x1; ctrl[BOX + 3] = y1;
  const rows = y1 - y0 + 1;
  run(PH.A, Math.min(rows, MAXC, CHUNKS * T));
  const { wrow, wcnt, dlo, dhi } = C;
  let nw = 0; for (let y = y0; y <= y1; y++) { wrow[y] = nw; nw += wcnt[y]; } wrow[y1 + 1] = nw;
  if (nw < MIN_WET) { POOL.stats.serial++; return false; }
  // bands of about equal work, the wet cells and the damp spans the pores walk, a few to a thread; a band is at least
  // six rows and a thousand wet cells, since each one works out a few rows either side of it again
  const nB = Math.min(MAXC, CHUNKS * T, Math.floor(rows / MIN_ROWS), Math.floor(nw / MIN_BAND_WET));
  if (nB < 2) { POOL.stats.serial++; return false; }
  let total = 0; for (let y = y0; y <= y1; y++) total += 4 * wcnt[y] + (dhi[y] >= 0 ? dhi[y] - dlo[y] + 1 : 0);
  let acc = 0, p = 0; ctrl[BAND] = y0;
  for (let y = y0; y <= y1; y++) {
    acc += 4 * wcnt[y] + (dhi[y] >= 0 ? dhi[y] - dlo[y] + 1 : 0);
    while (p < nB - 1 && acc >= (total * (p + 1)) / nB && y < y1) { ctrl[BAND + 2 * p + 1] = y; p++; ctrl[BAND + 2 * p] = y + 1; }
  }
  ctrl[BAND + 2 * p + 1] = y1;
  const nC = p + 1;
  POOL.stats.par++;
  for (let k = 0; k < K; k++) { ctrl[AF + k] = 0; ctrl[DF + k] = 0; ctrl[TF + k] = 0; }
  run(PH.B, nC);
  let nA = 0; for (let k = 0; k < K; k++) if (ctrl[AF + k]) ctrl[ACT + nA++] = k;
  ctrl[NA] = nA; ctrl[ITERS] = iters;
  for (let it = 0; it < iters; it++) {
    ctrl[IT] = it; ctrl[LAST] = it === iters - 1 ? 1 : 0;
    if (v.mar) run(PH.F0, nC);
    run(PH.F1, nC); run(PH.F2, nC); run(PH.F3, nC);
  }
  // the pigments settling can touch, and the surfaces their grains roll over, as stepBox lists them
  let n3 = 0; for (let k = 0; k < K; k++) if (ctrl[AF + k] || ctrl[DF + k] || ctrl[TF + k]) ctrl[ACT3 + n3++] = k;
  ctrl[N3] = n3;
  let nG = 0;
  if (v.slide > 0) {
    const prm = POOL.prm;
    for (let n = 0; n < n3; n++) {
      const k = ctrl[ACT3 + n], gg = prm[PK + k * PKS + 4]; if (gg <= 0) continue;
      const fk = prm[PK + k * PKS + 8];
      let m = 0; while (m < nG && prm[PK + ctrl[GREP + m] * PKS + 8] !== fk) m++;
      if (m === nG) { ctrl[GREP + nG++] = k; if (C.surf.length < nG) set(C, 'surf', [...C.surf, shared(Float64Array, sheet.n)]); }
      ctrl[GROUP + k] = m;
    }
  }
  ctrl[NGROUP] = nG;
  run(PH.S3, nC);
  if (v.slide > 0) { for (let k = 0; k < K; k++) ctrl[MV + k] = 0; run(PH.SL, nC); }
  run(PH.AP, nC);
  run(PH.P5, nC);
  run(PH.PM, nC);
  return true;
}
