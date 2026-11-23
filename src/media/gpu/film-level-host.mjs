// The host side of the GPU boxes and levelling (film-level-wgsl.mjs), shared by the painter's GPU sheet (stepfull.mjs)
// and the Paint Lab's (demos/lab/gpu/gpu-sheet.js): the buffers' sizes, the uniforms, the kernels a step encodes and
// the budgets read back between steps.
import { LV_BMAX, lvxWords } from './film-level-wgsl.mjs';

// rho g / (3 mu) in 1/(mm s), as film-level.mjs KAPPA; the most CG iterations a step may encode
const KAPPA = 1000 * 9.81 / (3 * 1e-3) / 1e3, LV_ITMAX = 8192;
// the kernels' overrides, made once, so the sheet finds each pipeline by the object (stepfull.mjs lvPipe)
const MEN = [{ LVMEN: 0 }, { LVMEN: 1 }], PAR = [{ LVPAR: 0, LVK0: 1 }, { LVPAR: 0 }, { LVPAR: 1 }];
const ROUNDS = Array.from({ length: 64 }, (_, r) => ({ LVROUND: r }));
export const levelOn = o => (o.level ?? 1) > 0;
const fillOn = o => (o.slide ?? 0) > 0 && (o.fillRef ?? 0.4) > 0;

/** The budgets a sheet starts with: CG iterations and substep rounds encoded a step, workgroups for the per-box kernels. */
export const levelBudget = () => ({ iters: 128, subs: 64, boxes: 16, total: null, recent: [] });

/** Bytes of each buffer for a w x h sheet of n cells and `ntiles` 16x16 tiles; the per-cell fields only with `on`. */
export function levelBuffers(w, h, n, ntiles, on) {
  const cell = on ? n * 16 : 16;
  return { LVT: ntiles * 32, LVX: lvxWords(w, h, ntiles) * 4, LVS: (16 + 2 * LV_BMAX) * 4, LVR: ntiles * 32, LVA: cell, LVB: cell, LVF: cell, LVP: on ? n * 8 : 16 };
}

/** The levelling's uniforms for a step of dt on mm cells (film-level.mjs levelFilm). `o.tiltX`, `o.tiltY`: sheet.tilt. */
export function levelUniforms(o, dt, mm, lv) {
  const dm = o.meniscusMm ?? 0.5;
  return {
    holdDepth: o.holdDepth ?? 0.01, coSettle: o.coSettle ?? 0.8, fillRef: o.fillRef ?? 0.4,   // (as sheet.mjs DEFAULTS)
    lvBoxes: lv.boxes, lvK0: (o.level ?? 1) * KAPPA * dt / (mm * mm), lvTx: (o.tiltX ?? 0) * mm, lvTy: (o.tiltY ?? 0) * mm,
    lvTan: o.meniscus ?? 0.05, lvDm: dm, lvR: Math.ceil(dm / mm), lvIt: lv.iters, lvSubs: lv.subs,
  };
}

/**
 * One step's boxes and, with levelling on, its levelling: `run(name, workgroups, overrides)` dispatches a kernel. Every
 * dispatch is direct (an indirect one costs Dawn a validation pass, and doubled the step): the tile kernels on `tiles`
 * workgroups looping over the level tiles, the per-box kernels on lv.boxes looping over the boxes.
 */
export function encodeLevel(run, o, mm, lv, tiles) {
  const level = levelOn(o);
  if (!level && !fillOn(o)) return;
  run('lv_tiles', tiles); run('lv_boxes', 1);
  if (!level) return;
  const R = Math.ceil((o.meniscusMm ?? 0.5) / mm), relax = Math.max(1, R - 1), boxes = lv.boxes;
  run('lv_init', tiles);
  for (let r = 0; r < relax; r++) run('lv_dist', tiles, MEN[r === relax - 1 ? 1 : 0]);
  run('lv_rhs', tiles); run('lv_cg0', boxes);
  // two dispatches an iteration: the box sums between them are taken in the tile kernels (film-level-wgsl.mjs lv_cg_a)
  for (let it = 0; it < lv.iters; it++) {
    const par = it === 0 ? PAR[0] : PAR[1 + (it & 1)];
    run('lv_cg_a', tiles, par); run('lv_cg_c', tiles, par);
  }
  if (lv.iters > 0) run('lv_cg_d', boxes, PAR[1 + ((lv.iters - 1) & 1)]);
  run('lv_flux', tiles); run('lv_out', tiles); run('lv_subs', boxes);
  for (let r = 0; r < lv.subs; r++) { run('lv_s1', tiles, ROUNDS[r]); run('lv_s2', tiles, ROUNDS[r]); }
}

/**
 * What the last steps needed, from the first 12 words of LVS (the most CG iterations and substeps, the solves that ran
 * short, the most boxes): counted into lv.total, and the budgets grown while a step uses most of them. A short solve keeps
 * the iterate it reached, as the CPU's does at 2000; one counted here grows the budget for the next steps. Returns
 * whether a budget changed (the uniforms must be written again). The caller clears LVS words 3 to 11.
 */
export function adaptLevel(lv, v) {
  const st = { iterations: v[3], short: v[4], subs: v[5], fewer: v[6], solves: v[7], boxes: v[11] };
  const t = lv.total ??= { iterations: 0, short: 0, subs: 0, fewer: 0, solves: 0, boxes: 0 };
  t.iterations = Math.max(t.iterations, st.iterations); t.subs = Math.max(t.subs, st.subs); t.boxes = Math.max(t.boxes, st.boxes);
  t.short += st.short; t.fewer += st.fewer; t.solves += st.solves;
  let grew = false;
  if ((st.short || st.iterations > 0.75 * lv.iters) && lv.iters < LV_ITMAX) { lv.iters = Math.min(LV_ITMAX, 2 * lv.iters); grew = true; }
  if ((st.fewer || st.subs > 0.75 * lv.subs) && lv.subs < 64) { lv.subs = Math.min(64, 2 * lv.subs); grew = true; }
  if (st.boxes > lv.boxes && lv.boxes < LV_BMAX) { lv.boxes = Math.min(LV_BMAX, 2 * st.boxes); grew = true; }
  // Every iteration and round encoded is a dispatch a step, needed or not (most of the step's time on a small sheet), so
  // the budgets come down again to twice the most the last 16 reads with solves needed (no lower than 64 iterations and
  // 8 rounds). A solve or a box that then runs short is counted and grows them at once.
  if (st.solves) { (lv.recent ??= []).push([st.iterations, st.subs]); if (lv.recent.length > 16) lv.recent.shift(); }
  if (!grew && lv.recent?.length >= 4) {
    const pow2 = v => 2 ** Math.ceil(Math.log2(Math.max(1, v)));
    const it = Math.max(64, 2 * pow2(Math.max(...lv.recent.map(r => r[0])))), sb = Math.max(8, 2 * pow2(Math.max(...lv.recent.map(r => r[1]))));
    if (it < lv.iters || sb < lv.subs) { lv.iters = Math.min(lv.iters, it); lv.subs = Math.min(lv.subs, sb); grew = true; }
  }
  return grew;
}
