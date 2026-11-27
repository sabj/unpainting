// The host side of the GPU boxes and levelling (film-level-wgsl.mjs), shared by the painter's GPU sheet (stepfull.mjs)
// and the Paint Lab's (demos/lab/gpu/gpu-sheet.js): the buffers' sizes, the uniforms, the kernels a step encodes and
// the budgets read back between steps.
import { LV_BMAX, lvxWords } from './film-level-wgsl.mjs';
import { LV_ITMAX } from './film-level-cg-wgsl.mjs';

// rho g / (3 mu) in 1/(mm s), as film-level.mjs KAPPA
const KAPPA = 1000 * 9.81 / (3 * 1e-3) / 1e3;
// the kernels' overrides, made once, so the sheet finds each pipeline by the object (stepfull.mjs lvPipe)
const MEN = [0, 1].map(LVPAR => [{ LVPAR, LVMEN: 0 }, { LVPAR, LVMEN: 1 }]);
const PAR = [{ LVPAR: 0, LVK0: 1 }, { LVPAR: 0 }, { LVPAR: 1 }];
const LIGHT = { LVLIGHT: 1 };
const ROUNDS = Array.from({ length: 64 }, (_, r) => ({ LVROUND: r }));
export const levelOn = o => (o.level ?? 1) > 0;
const backRunOn = o => (o.levelFloor ?? 0) > 0 && (o.invade ?? 0) > 0;
const fillOn = o => (o.slide ?? 0) > 0 && (o.fillRef ?? 0.4) > 0;

/** Initial parallel budgets. Both CG and transport continue in the same step when a box needs more. */
// Start with 24 parallel iterations; same-step continuation preserves convergence for harder solves.
export const levelBudget = (tiles = 0) => ({ tiles, iters: 24, subs: tiles >= 256 ? 16 : 6, boxes: 16, total: null, recent: [], light: false, since: 0, lightSteps: 0 });

// Budgets concern scheduling alone: every solve/transport still finishes in this step at the same tolerance.
// Keep each dt regime's learned demand through stroke / levelling / fast-dry transitions.
export function selectLevelRegime(lv, dt, tiles = lv.tiles ?? 0) {
  const key = dt <= 0.25 ? 'stroke' : dt <= 1.25 ? 'level' : 'fast';
  if (key === lv.regime) return;
  const regimes = lv.regimes ??= {};
  if (lv.regime) regimes[lv.regime] = { iters: lv.iters, subs: lv.subs, recent: lv.recent };
  const initial = levelBudget(tiles);
  const budget = regimes[key] ??= { iters: key === 'stroke' ? 12 : initial.iters, subs: initial.subs, recent: [] };
  Object.assign(lv, budget); lv.regime = key; lv.tiles = tiles;
}

/** Bytes of each buffer for a w x h sheet of n cells and `ntiles` 16x16 tiles; the per-cell fields only with `on`. */
export function levelBuffers(w, h, n, ntiles, on) {
  const cell = on ? n * 16 : 16;
  return { LVT: ntiles * 32, LVX: lvxWords(w, h, ntiles) * 4, LVS: (16 + 2 * LV_BMAX) * 4, LVI: (6 + 3 * 64) * 4, LVR: ntiles * 64, LVA: cell, LVB: cell, LVF: cell, LVP: on ? n * 8 : 16 };
}

/** The levelling's uniforms for a step of dt on mm cells (film-level.mjs levelFilm). `o.tiltX`, `o.tiltY`: sheet.tilt. */
export function levelUniforms(o, dt, mm, lv) {
  const dm = o.meniscusMm ?? 0.5;
  return {
    holdDepth: o.holdDepth ?? 0.01, coSettle: o.coSettle ?? 0.8, fillRef: o.fillRef ?? 0.4,   // (as sheet.mjs DEFAULTS)
    lvBoxes: lv.boxes, lvK0: (o.level ?? 1) * KAPPA * dt / (mm * mm), lvTx: (o.tiltX ?? 0) * mm, lvTy: (o.tiltY ?? 0) * mm,
    lvFloor: o.levelFloor ?? 0, brC: (o.invade ?? 0) * dt / mm, brPush: o.push ?? 0, brHead: Math.max(o.levelFloor ?? 0, o.puddle ?? 0), lvTan: o.meniscus ?? 0.05, lvDm: dm, lvR: Math.ceil(dm / mm), lvIt: lv.iters, lvSubs: lv.subs,
  };
}

/**
 * One step's boxes and, with levelling on, its levelling: `run(name, workgroups, overrides)` dispatches a kernel. The solve
 * uses direct dispatches: the tile kernels on `tiles` workgroups looping over the level tiles, the per-box kernels
 * on lv.boxes looping over the boxes. A light step uses LVI indirect arguments from this step's lv_boxes (the optional
 * fourth argument to run is the byte offset), so newly mobile film still levels before any transport is applied.
 * Transport encodes its parallel budget, gated by this step's lv_subs arguments. A per-box workgroup finishes any
 * remaining rounds before backrun. A previous readback never truncates a request or changes its denominator.
 */
export function encodeLevel(run, o, mm, lv, tiles) {
  const level = levelOn(o);
  if (!level && !fillOn(o)) return;
  // light: the last read had no level tile, but redistribution can expose one without a host write. Ask the GPU about
  // the current step, rather than omitting its solve until the next read. Empty-film steps dispatch no solver work.
  lv.since++;
  if (lv.regime) (lv.pendingRegimes ??= new Set()).add(lv.regime);
  const light = level && lv.light;
  if (light) lv.lightSteps++;
  run('lv_tiles', tiles); run('lv_boxes', 1, light ? LIGHT : undefined);
  if (!level) return;
  const R = Math.ceil((o.meniscusMm ?? 0.5) / mm), relax = Math.max(1, R - 1), boxes = lv.boxes;
  const tile = (name, constants) => run(name, tiles, constants, light ? 0 : undefined);
  const box = (name, constants) => run(name, boxes, constants, light ? 12 : undefined);
  tile('lv_init');
  for (let r = 0; r < relax; r++) tile('lv_dist', MEN[r & 1][r === relax - 1 ? 1 : 0]);
  tile('lv_rhs'); box('lv_cg0');
  const iterations = light ? Math.min(1, lv.iters) : lv.iters;
  // Three dispatches an iteration: lv_cg_a (SpMV), lv_cg_c (update + tile RBGS), lv_cg_d (close + coarse-tile RBGS).
  // Early-exit via LVS[12] skips converged iterations in one atomic load.
  for (let it = 0; it < iterations; it++) {
    const par = it === 0 ? PAR[0] : PAR[1 + (it & 1)];
    const closePar = PAR[1 + (it & 1)];
    tile('lv_cg_a', par); tile('lv_cg_c', par); box('lv_cg_d', closePar);
  }
  if (iterations > 0) {
    const last = PAR[1 + ((iterations - 1) & 1)];
    box('lv_cg_continue', last);
  }
  tile('lv_flux'); tile('lv_out');
  // Direct even on a light step: the producer must clear stale indirect arguments when no film remains. It cannot
  // consume LVI as indirect arguments while binding that same buffer as writable storage.
  run('lv_subs', 1);
  // Direct transport dispatches avoid Dawn's per-indirect-dispatch validation pass; unused rounds exit on LVS[13].
  // A quiet step encodes zero parallel transport rounds and gates continuation/backrun on LVI.
  const rounds = light ? 0 : lv.subs;
  for (let r = 0; r < rounds; r++) {
    run('lv_s1', tiles, ROUNDS[r]); run('lv_s2', tiles, ROUNDS[r]);
  }
  if (rounds < 64) run('lv_transport_continue', boxes, ROUNDS[rounds], light ? 12 : undefined);
  // the back-runs (backrun.mjs), after the levelling, as the CPU runs backRun after levelFilm
  // (lv_br_a runs whenever the film levelled: it also clears the rounds' marks, film-level-wgsl.mjs lvRound)
  const brOffset = light ? 0 : undefined;
  run('lv_br_a', tiles, null, brOffset); if (backRunOn(o)) { run('lv_br_b', tiles, null, brOffset); run('lv_br_c', tiles, null, brOffset); }
}

/**
 * What the last steps needed, from the first 12 words of LVS (the most CG iterations and substeps, the solves that
 * needed continuation or failed to converge, the most boxes): counted into lv.total. A box that exhausts the parallel
 * budget continues on the GPU before flux/transport. Numerical failure or the safety ceiling fails this status read.
 * The parallel budget grows to avoid that exceptional work on later steps. Returns
 * whether a budget changed (the uniforms must be written again). The caller clears LVS words 3 to 11.
 */
export function adaptLevel(lv, v, written = false) {
  if (lv.failure) throw new Error(lv.failure);
  if (v[2]) {
    lv.failure = `GPU film box discovery exceeded ${LV_BMAX} disconnected wet components`;
    throw new Error(lv.failure);
  }
  const st = { iterations: v[3], short: v[4], subs: v[5], fewer: v[6], solves: v[7], boxes: v[11], levelSteps: v[8], recovered: v[9], continued: v[10] };
  const t = lv.total ??= { iterations: 0, short: 0, subs: 0, fewer: 0, solves: 0, boxes: 0, levelSteps: 0, recovered: 0, continued: 0 };
  t.iterations = Math.max(t.iterations, st.iterations); t.subs = Math.max(t.subs, st.subs); t.boxes = Math.max(t.boxes, st.boxes);
  t.short += st.short; t.fewer += st.fewer; t.solves += st.solves; t.levelSteps += st.levelSteps; t.recovered += st.recovered; t.continued += st.continued;
  if (st.short) {
    lv.failure = `GPU film levelling failed to converge (${st.short} boxes, ${st.iterations} iterations; safety limit ${LV_ITMAX})`;
    throw new Error(lv.failure);
  }
  // light while every step since the last read had no level tile and the sheet was not written since they were encoded
  // (only for a caller that says when it writes the sheet: lv.tracksWrites, as stepfull.mjs does)
  lv.light = !!lv.tracksWrites && !written && lv.since > 0 && st.levelSteps === 0; lv.since = 0;
  let changed = false;
  if (st.boxes > lv.boxes && lv.boxes < LV_BMAX) { lv.boxes = Math.min(LV_BMAX, 2 * st.boxes); changed = true; }
  // Status may arrive after setOptions selected another dt. Train the regime that actually encoded the steps.
  // A mixed batch's maxima can grow its budgets, but cannot teach either regime a smaller budget.
  const keys = [...(lv.pendingRegimes ?? [])];
  if (lv.regime && keys.length === 0) keys.push(lv.regime);
  if (keys.length === 0) changed = adaptBudget(lv, st, true, lv.tiles ?? 0) || changed;
  for (const key of keys) {
    const budget = key === lv.regime ? lv : lv.regimes[key];
    const tuned = adaptBudget(budget, st, keys.length === 1, lv.tiles ?? 0);
    if (key === lv.regime) changed = tuned || changed;
  }
  lv.pendingRegimes?.clear();
  return changed;
}

function adaptBudget(budget, st, singleRegime, tiles) {
  let changed = false;
  if (st.iterations > 0.8 * budget.iters && budget.iters < LV_ITMAX) {
    budget.iters = Math.min(LV_ITMAX, Math.max(budget.iters + 8, Math.ceil(1.25 * st.iterations) + 4)); changed = true;
  }
  if (st.subs > budget.subs) { budget.subs = Math.min(64, Math.ceil(1.25 * st.subs) + 1); changed = true; }
  // A clearly overprovisioned budget can shrink after one read; otherwise use two. Never shrink without solves.
  if (singleRegime && st.solves) {
    (budget.recent ??= []).push([st.iterations, st.subs]);
    if (budget.recent.length > 2) budget.recent.shift();
    if (!changed && (budget.recent.length === 2 || st.iterations < 0.5 * budget.iters)) {
      const iters = Math.max(4, Math.ceil(1.15 * Math.max(...budget.recent.map(r => r[0]))) + 2);
      const subs = Math.max(tiles >= 256 ? 8 : 1, Math.ceil(1.2 * Math.max(...budget.recent.map(r => r[1]))) + 1);
      if (iters < budget.iters) { budget.iters = iters; changed = true; }
      if (subs < budget.subs) { budget.subs = subs; changed = true; }
    }
  }
  return changed;
}
