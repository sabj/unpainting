// Generated from src/media/gpu/film-level-wgsl.mjs by tools/lab/sync-site-media.mjs. Edit the source.
import { filmLevelCgWgsl } from './film-level-cg-wgsl.js';
import { filmLevelTransportWgsl } from './film-level-transport-wgsl.js';
import { FILM_RESIDUAL_SQUARED } from '../film-accuracy.js';

// The CPU step's boxes, each box's hollow fill and the film's levelling, on the GPU (sheet.mjs wetBoxes and slideFillFor,
// film-level.mjs levelFilm).
//
// Boxes. lv_tiles sums each active 16x16 tile (the wet or damp cells' extent, the wet cells' deposit and count, whether
// it holds a cell the film levels), lv_boxes (one workgroup) gathers the tiles into the CPU's 32-cell tiles, joins them
// into clusters, grows each cluster's extent by the pore reach, merges overlapping boxes in the CPU's order, and labels
// every 32-cell tile with its box. A wet cell's box is its tile's label. Each box's fill is slideFill, scaled by
// (fillRef / mean deposit)^2 where its mean deposit is above fillRef.
//
// Levelling. In each box the wet cells (M and W > 0) level by (I + L) d = -L H, with L the Laplacian of the faces'
// conductances k0 p h^3 (free depth above lvFloor, half-cell resistances in series: film-mobility.mjs) and H the surface (W + slope height, lowered by the meniscus near a dry side, falling with the
// board's tilt). The CPU solves it by IC(0) conjugate gradients to the shared relative residual; here each box
// runs its own conjugate gradients (preconditioned by Gauss-Seidel within each tile, lvPrecond) to the same residual (alpha and beta per box, from the tiles'
// partial sums), so the solutions agree to that residual. The host encodes a parallel iteration budget; a box that
// needs more continues in one workgroup before transport (LVS[10]). A numerical failure or the safety ceiling is
// counted in LVS[4] and fails the next status read. Only converged boxes produce flux. The water each face
// carries over the step then moves with its pigment in the box's substeps (no donor gives more than half its water, at
// most 64), each under the 95% donor budgets. The host encodes an adaptive parallel budget; lv_subs writes this step's
// indirect arguments so unused rounds dispatch no workgroups. One group per box finishes any remaining rounds
// before backrun, using the same donor helpers and storage barriers between rounds. An older budget never shortens
// the transport. The surface enters only as differences between neighbours, taken part by part (depth, relief,
// the meniscus's lowering, which LVA holds, and the tilt), so a board's fall over a large sheet or a film's depth near
// its relief does not lose the digits its slope has in float32.
import { filmMobilityWgsl } from '../film-mobility.js';

export const LV_BMAX = 1024;
/** Words of the LVX buffer for a w x h sheet with `ntiles` 16x16 tiles. */
export function lvxWords(w, h, ntiles) {
  const nt32 = Math.ceil(w / 32) * Math.ceil(h / 32);
  return 16 + 11 * nt32 + 17 * LV_BMAX + 2 * ntiles;
}
// LVX (u32): [0] boxes, [1] tiles in LT, [2] more boxes than LV_BMAX; then per 32-cell tile 10 words (wet, x0, y0, x1,
// y1, deposit sum, wet count, label, mask of 16-cell children with a level cell, -), the cluster stack, per box 16
// words (x0, y0, x1, y1, deposit sum, wet count, fill, LT offset, LT tiles, alpha, beta, rz, tol, iterations, state,
// substeps), the cluster-to-box map, then LT: the tiles holding level cells, grouped by box.
// LVS (atomic u32): [2] sticky box overflow (fails the next status read); [8] steps with a level tile, [9] those found during a light step (solved in that same step), [10] boxes
// continued beyond the parallel budget; [3] most CG iterations a solve took, [4] failed solves, [5] most substeps a box asked
// for, [6] reserved (formerly truncated transport boxes), [7] solves, [11] the most boxes; per box at 16 + 2 b, the largest explicit face flux
// (most) and the largest outflow over water (worst), as f32 bits.
// State: 0 inactive, 1 running CG, 3 converged, 4 failed (never transported).
export const filmLevelWgsl = ({ channel = 'klAt', count = 'u.nAct' } = {}) => `
${filmMobilityWgsl()}
@group(0) @binding(51) var<storage, read_write> LVT: array<u32>;
@group(0) @binding(52) var<storage, read_write> LVX: array<u32>;
@group(0) @binding(53) var<storage, read_write> LVS: array<atomic<u32>>;
@group(0) @binding(54) var<storage, read_write> LVA: array<vec4<f32>>;   // H, conductance of the west face, of the north face, diagonal
@group(0) @binding(55) var<storage, read_write> LVB: array<vec4<f32>>;   // d, r, z, q
@group(0) @binding(56) var<storage, read_write> LVP: array<f32>;         // two distance planes before rhs, then p in turn
@group(0) @binding(57) var<storage, read_write> LVF: array<vec4<f32>>;   // west face flux (+x), north face flux (+y), water scale, transport mark
@group(0) @binding(58) var<storage, read_write> LVR: array<f32>;         // per LT tile 8: pq, then rr and rz for even and odd iterations
@group(0) @binding(59) var<storage, read_write> LVI: array<u32, 198>;    // tile/box args (lv_boxes), then 64 transport args (lv_subs)
override LVPAR: u32 = 0u;
override LVROUND: u32 = 0u;
override LVK0: bool = false;
override LVLIGHT: bool = false;
override LVMEN: bool = false;
const LV_BMAX: u32 = ${LV_BMAX}u;
const LV_NONE: u32 = 0xffffffffu;
fn lvTw32() -> u32 { return (u.w + 31u) / 32u; }
fn lvNt32() -> u32 { return lvTw32() * ((u.h + 31u) / 32u); }
fn lvTR(t: u32) -> u32 { return 16u + 10u * t; }
fn lvCL() -> u32 { return 16u + 10u * lvNt32(); }
fn lvBX(b: u32) -> u32 { return 16u + 11u * lvNt32() + 16u * b; }
fn lvRM() -> u32 { return 16u + 11u * lvNt32() + 16u * LV_BMAX; }
fn lvLT() -> u32 { return lvRM() + LV_BMAX; }
fn lvTM() -> u32 { return lvLT() + u.ntiles; }
fn lvT32(i: u32) -> u32 { return ((i / u.w) / 32u) * lvTw32() + (i % u.w) / 32u; }
fn lvBoxOf(i: u32) -> u32 { return LVX[lvTR(lvT32(i)) + 7u]; }
fn lvLevel(i: u32) -> bool { return M[i] == 1u && W[i] > u.lvFloor; }   // film-level.mjs levelFloor: damp paint does not level
// a cell whose water moves in this step's transport rounds: lv_flux marks it (LVF w -1) from the water at the step's
// start, as the CPU lists its cells once; the rounds change W, and a cell they took below the floor still trades.
// lv_br_a clears the mark on every wet tile after the rounds.
fn lvRound(i: u32) -> bool { return M[i] == 1u && LVF[i].w < 0.0; }
// the hollow fill of a wet cell's box (sheet.mjs slideFillFor)
fn fillAt(i: u32) -> f32 {
  if (u.fillRef <= 0.0 || LVX[2] != 0u) { return u.slideFill; }
  return bitcast<f32>(LVX[lvBX(lvBoxOf(i)) + 6u]);
}
fn lvState(b: u32) -> u32 { return LVX[lvBX(b) + 14u]; }

var<workgroup> lvSum: array<f32, 256>;
var<workgroup> lvSum2: array<f32, 256>;
var<workgroup> lvSum3: array<f32, 256>;
var<workgroup> lvAt: array<atomic<u32>, 8>;
var<workgroup> lvCount: u32;
var<workgroup> lvBox: u32;
// two sums over the workgroup's 256 threads, left in lvSum[0] and lvSum2[0]
fn lvReduce2(li: u32) {
  for (var k = 128u; k > 0u; k = k >> 1u) {
    if (li < k) { lvSum[li] += lvSum[li + k]; lvSum2[li] += lvSum2[li + k]; }
    workgroupBarrier();
  }
}
fn lvReduce3(li: u32) {
  for (var k = 128u; k > 0u; k = k >> 1u) {
    if (li < k) { lvSum[li] += lvSum[li + k]; lvSum2[li] += lvSum2[li + k]; lvSum3[li] += lvSum3[li + k]; }
    workgroupBarrier();
  }
}

// ---- boxes ----
@compute @workgroup_size(16, 16)
fn lv_tiles(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { lvCount = TL[u.ntiles]; }
  let count = workgroupUniformLoad(&lvCount);
  let wantFill = u.fillRef > 0.0 && u.slide > 0.0;
  for (var j = wid.x; j < count; j += nw.x) {
    if (li < 8u) { atomicStore(&lvAt[li], select(0u, LV_NONE, li == 1u || li == 2u)); }
    workgroupBarrier();
    let t = TL[j]; let x = (t % u.tw) * 16u + lid.x; let y = (t / u.tw) * 16u + lid.y;
    var s = 0.0;
    if (x < u.w && y < u.h) {
      let i = y * u.w + x;
      if (M[i] == 1u || S[i] > 0.02 * PAPER[i].x) {
        atomicStore(&lvAt[0], 1u); atomicMin(&lvAt[1], x); atomicMin(&lvAt[2], y); atomicMax(&lvAt[3], x); atomicMax(&lvAt[4], y);
      }
      if (M[i] == 1u) {
        atomicAdd(&lvAt[5], 1u);
        if (lvLevel(i)) { atomicStore(&lvAt[6], 1u); }
        if (wantFill) {
          for (var ka = 0u; ka < ${count}; ka++) { s += D[${channel}(ka) * u.n + i]; }
          if (FIXED_BED) { s += DEP[2u * u.n + i]; if (u.hasTop != 0u) { for (var k = 0u; k < u.K; k++) { s += TOP[k * u.n + i]; } } }
        }
      }
    }
    lvSum[li] = s; lvSum2[li] = 0.0;
    workgroupBarrier();
    lvReduce2(li);
    if (li == 0u) {
      let r = 8u * t;
      LVT[r] = atomicLoad(&lvAt[0]); LVT[r + 1u] = atomicLoad(&lvAt[1]); LVT[r + 2u] = atomicLoad(&lvAt[2]);
      LVT[r + 3u] = atomicLoad(&lvAt[3]); LVT[r + 4u] = atomicLoad(&lvAt[4]); LVT[r + 5u] = bitcast<u32>(lvSum[0]);
      LVT[r + 6u] = atomicLoad(&lvAt[5]); LVT[r + 7u] = atomicLoad(&lvAt[6]);
    }
    workgroupBarrier();
  }
}
fn lvOverlap(a: u32, b: u32) -> bool {
  let A = lvBX(a); let B = lvBX(b);
  return LVX[A] <= LVX[B + 2u] && LVX[B] <= LVX[A + 2u] && LVX[A + 1u] <= LVX[B + 3u] && LVX[B + 1u] <= LVX[A + 3u];
}
// the wet tiles in tile order (lv_boxes): each thread counts a run of tiles, the counts are summed, each thread writes
// its run's wet tiles at its offset, into word 9 of the k-th tile's record (unused). The one thread that then finds the
// boxes walks only the wet tiles, as the loops over all tiles did (they skipped the dry ones).
var<workgroup> lvWl: array<u32, 256>;
var<workgroup> lvWn: u32;
@compute @workgroup_size(256)
fn lv_boxes(@builtin(local_invocation_index) li: u32) {
  let nt = lvNt32(); let tw32 = lvTw32();
  // the 16-cell tiles of each 32-cell tile, in the CPU's tiles; each tile read is cleared for the next step
  for (var t = li; t < nt; t += 256u) {
    let tx = t % tw32; let ty = t / tw32; let r = lvTR(t);
    var flag = 0u; var x0 = LV_NONE; var y0 = LV_NONE; var x1 = 0u; var y1 = 0u; var sum = 0.0; var cnt = 0u; var lmask = 0u;
    for (var c = 0u; c < 4u; c++) {
      let sx = 2u * tx + (c & 1u); let sy = 2u * ty + (c >> 1u);
      if (sx >= u.tw || sy >= u.th) { continue; }
      let q = 8u * (sy * u.tw + sx);
      if (LVT[q] != 0u) { flag = 1u; x0 = min(x0, LVT[q + 1u]); y0 = min(y0, LVT[q + 2u]); x1 = max(x1, LVT[q + 3u]); y1 = max(y1, LVT[q + 4u]); }
      sum += bitcast<f32>(LVT[q + 5u]); cnt += LVT[q + 6u];
      if (LVT[q + 7u] != 0u) { lmask = lmask | (1u << c); }
      for (var k = 0u; k < 8u; k++) { LVT[q + k] = 0u; }
    }
    LVX[r] = flag; LVX[r + 1u] = x0; LVX[r + 2u] = y0; LVX[r + 3u] = x1; LVX[r + 4u] = y1;
    LVX[r + 5u] = bitcast<u32>(sum); LVX[r + 6u] = cnt; LVX[r + 7u] = LV_NONE; LVX[r + 8u] = lmask;
  }
  storageBarrier(); workgroupBarrier();
  let span = (nt + 255u) / 256u; let ra = min(nt, li * span); let re = min(nt, ra + span);
  var wc = 0u; for (var t = ra; t < re; t++) { if (LVX[lvTR(t)] != 0u) { wc += 1u; } }
  lvWl[li] = wc;
  workgroupBarrier();
  if (li == 0u) { var o = 0u; for (var k = 0u; k < 256u; k++) { let v = lvWl[k]; lvWl[k] = o; o += v; } lvWn = o; }
  workgroupBarrier();
  var wo = lvWl[li]; for (var t = ra; t < re; t++) { if (LVX[lvTR(t)] != 0u) { LVX[lvTR(wo) + 9u] = t; wo += 1u; } }
  storageBarrier(); workgroupBarrier();
  for (var t = li; t < u.ntiles; t += 256u) { LVX[lvTM() + t] = LV_NONE; }
  storageBarrier(); workgroupBarrier();
  if (li == 0u) {
    atomicStore(&LVS[12], 0u); atomicStore(&LVS[13], 0u); atomicStore(&LVS[14], 0u);
    let nw = lvWn;
    // clusters of wet tiles touching on a side or corner, found in tile order (sheet.mjs wetBoxes)
    let st = lvCL(); var nb = 0u; let m = u32(u.poreReach); let th32 = (u.h + 31u) / 32u;
    LVX[2] = 0u;
    for (var w = 0u; w < nw; w++) {
      let t0 = LVX[lvTR(w) + 9u];
      if (LVX[lvTR(t0) + 7u] != LV_NONE) { continue; }
      if (nb >= LV_BMAX) { LVX[2] = 1u; break; }
      var top = 0u; LVX[st] = t0; top = 1u; LVX[lvTR(t0) + 7u] = nb;
      var ax = LV_NONE; var ay = LV_NONE; var bx = 0u; var by = 0u; var sum = 0.0; var cnt = 0u;
      while (top > 0u) {
        top -= 1u; let q = LVX[st + top]; let r = lvTR(q);
        ax = min(ax, LVX[r + 1u]); ay = min(ay, LVX[r + 2u]); bx = max(bx, LVX[r + 3u]); by = max(by, LVX[r + 4u]);
        sum += bitcast<f32>(LVX[r + 5u]); cnt += LVX[r + 6u];
        let qx = i32(q % tw32); let qy = i32(q / tw32);
        for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) {
          let xx = qx + dx; let yy = qy + dy;
          if (xx < 0 || yy < 0 || xx >= i32(tw32) || yy >= i32(th32)) { continue; }
          let v = u32(yy) * tw32 + u32(xx); let rv = lvTR(v);
          if (LVX[rv] != 0u && LVX[rv + 7u] == LV_NONE) { LVX[rv + 7u] = nb; LVX[st + top] = v; top += 1u; }
        } }
      }
      let B = lvBX(nb);
      LVX[B] = select(0u, ax - m, ax >= m); LVX[B + 1u] = select(0u, ay - m, ay >= m);
      LVX[B + 2u] = min(u.w - 1u, bx + m); LVX[B + 3u] = min(u.h - 1u, by + m);
      LVX[B + 4u] = bitcast<u32>(sum); LVX[B + 5u] = cnt;
      LVX[lvRM() + nb] = nb;
      nb += 1u;
    }
    // An incomplete discovery cannot be remapped: later wet tiles still carry LV_NONE. Disable all solver work
    // and report a sticky failure; never publish a partial set of boxes as a successful physical step.
    if (LVX[2] != 0u) {
      LVX[0] = 0u; LVX[1] = 0u; atomicStore(&LVS[2], 1u);
      LVI[0] = 0u; LVI[1] = 1u; LVI[2] = 1u; LVI[3] = 0u; LVI[4] = 1u; LVI[5] = 1u;
    } else {
      let nc = nb;
      // boxes that overlap once grown are merged, in the CPU's order
      var i = 0u;
      loop {
        if (i >= nb) { break; }
        var merged = false;
        for (var j = i + 1u; j < nb; j++) {
          if (!lvOverlap(i, j)) { continue; }
          let A = lvBX(i); let Bj = lvBX(j);
          LVX[A] = min(LVX[A], LVX[Bj]); LVX[A + 1u] = min(LVX[A + 1u], LVX[Bj + 1u]);
          LVX[A + 2u] = max(LVX[A + 2u], LVX[Bj + 2u]); LVX[A + 3u] = max(LVX[A + 3u], LVX[Bj + 3u]);
          LVX[A + 4u] = bitcast<u32>(bitcast<f32>(LVX[A + 4u]) + bitcast<f32>(LVX[Bj + 4u])); LVX[A + 5u] += LVX[Bj + 5u];
          for (var k = j; k + 1u < nb; k++) { for (var e = 0u; e < 6u; e++) { LVX[lvBX(k) + e] = LVX[lvBX(k + 1u) + e]; } }
          for (var c = 0u; c < nc; c++) { let v = LVX[lvRM() + c]; if (v == j) { LVX[lvRM() + c] = i; } else if (v > j) { LVX[lvRM() + c] = v - 1u; } }
          nb -= 1u; merged = true; break;
        }
        if (merged) { if (i > 0u) { i -= 1u; } continue; }
        i += 1u;
      }
      // each box's fill (slideFillFor), and its level tiles, grouped by box in tile order
      for (var b = 0u; b < nb; b++) {
        let B = lvBX(b); let cnt = LVX[B + 5u]; let mean = select(0.0, bitcast<f32>(LVX[B + 4u]) / f32(cnt), cnt > 0u);
        let fr = u.fillRef;
        LVX[B + 6u] = bitcast<u32>(select(u.slideFill, u.slideFill * (fr / mean) * (fr / mean), fr > 0.0 && u.slide > 0.0 && mean > fr));
        LVX[B + 8u] = 0u; LVX[B + 14u] = 0u;
      }
      for (var w = 0u; w < nw; w++) { let r = lvTR(LVX[lvTR(w) + 9u]); let b = LVX[lvRM() + LVX[r + 7u]]; LVX[r + 7u] = b; LVX[lvBX(b) + 8u] += countOneBits(LVX[r + 8u]); }
      var off = 0u;
      for (var b = 0u; b < nb; b++) { let B = lvBX(b); LVX[B + 7u] = off; off += LVX[B + 8u]; LVX[B + 8u] = 0u; }
      for (var w = 0u; w < nw; w++) {
        let t = LVX[lvTR(w) + 9u]; let r = lvTR(t); let lm = LVX[r + 8u]; if (lm == 0u) { continue; }
        let B = lvBX(LVX[r + 7u]); let tx = t % tw32; let ty = t / tw32;
        for (var c = 0u; c < 4u; c++) {
          if ((lm & (1u << c)) == 0u) { continue; }
          let t16 = (2u * ty + (c >> 1u)) * u.tw + 2u * tx + (c & 1u);
          let ltIdx = LVX[B + 7u] + LVX[B + 8u];
          LVX[lvLT() + ltIdx] = t16; LVX[lvTM() + t16] = ltIdx; LVX[B + 8u] += 1u;
        }
      }
      LVX[0] = nb; LVX[1] = off;
      atomicMax(&LVS[11], nb);
      // The light path dispatches no levelling work only when THIS step has no level tiles. Redistribution may bring
      // mobile film back without a host write; it must solve now, before the rest of the step transports or dries it.
      LVI[0] = min(off, 256u); LVI[1] = 1u; LVI[2] = 1u;
      LVI[3] = select(0u, min(nb, u32(u.lvBoxes)), off > 0u); LVI[4] = 1u; LVI[5] = 1u;
      // steps with a level tile; LVLIGHT counts same-step recoveries for the host's light-mode observation
      if (off > 0u) { atomicAdd(&LVS[8], 1u); if (LVLIGHT) { atomicAdd(&LVS[9], 1u); } }
    }
  }
  storageBarrier(); workgroupBarrier();
  for (var b = li; b < LV_BMAX; b += 256u) { atomicStore(&LVS[16u + 2u * b], 0u); atomicStore(&LVS[17u + 2u * b], 0u); }
}

// ---- levelling: the LT tiles, one at a time per workgroup ----
fn lvCellOf(t: u32, lid: vec3<u32>) -> vec3<u32> {
  let x = (t % u.tw) * 16u + lid.x; let y = (t / u.tw) * 16u + lid.y;
  return vec3<u32>(x, y, select(0u, 1u, x < u.w && y < u.h));
}
// H at cell i less H at cell j, without the meniscus or the tilt, as the differences of its parts: the CPU's surfaces
// are doubles, and two float32 surfaces near each other lose the digits their difference has (the box's explicit
// face flux, compared with 1e-7 to skip a level box, is a few ulps of a surface)
fn lvDh(i: u32, j: u32) -> f32 { return (W[i] - W[j]) + u.slope * (PAPER3[i].z - PAPER3[j].z); }
@compute @workgroup_size(16, 16)
fn lv_init(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  let count = LVX[1];
  for (var j = wid.x; j < count; j += nw.x) {
    let c = lvCellOf(LVX[lvLT() + j], lid); if (c.z == 0u) { continue; }
    let i = c.y * u.w + c.x; if (!lvLevel(i)) { continue; }
    let b = lvBoxOf(i);
    var cw = 0.0; var cn = 0.0; var most = 0.0;
    if (c.x > 0u && lvLevel(i - 1u)) {
      let p = 1.0 - u.ff + u.ff * (0.25 + 1.75 * PAPER2[i - 1u].x);
      cw = u.lvK0 * p * filmMobility(W[i], W[i - 1u], u.lvFloor); most = max(most, cw * abs(lvDh(i, i - 1u) - u.lvTx));
    }
    if (c.y > 0u && lvLevel(i - u.w)) {
      let p = 1.0 - u.ff + u.ff * (0.25 + 1.75 * PAPER2[i - u.w].y);
      cn = u.lvK0 * p * filmMobility(W[i], W[i - u.w], u.lvFloor); most = max(most, cn * abs(lvDh(i, i - u.w) - u.lvTy));
    }
    atomicMax(&LVS[16u + 2u * b], bitcast<u32>(most));
    // the line's cells: a side not on a wet cell of the box
    let edge = !(c.x > 0u && lvLevel(i - 1u)) || !(c.y > 0u && lvLevel(i - u.w)) || !(c.x + 1u < u.w && lvLevel(i + 1u)) || !(c.y + 1u < u.h && lvLevel(i + u.w));
    LVA[i] = vec4<f32>(0.0, cw, cn, 0.0);   // x: the meniscus's lowering of H (lv_dist)
    LVF[i] = vec4<f32>(0.0, 0.0, 1.0, 0.0); LVB[i] = vec4<f32>(0.0);
    LVP[i] = select(1e9, 0.0, edge);
  }
}
// The meniscus: each pass reads only the previous distance plane and writes the other. After R - 1 passes every
// distance below the reach is exact, including across workgroup boundaries. rhs then reuses both planes for CG.
@compute @workgroup_size(16, 16)
fn lv_dist(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let count = LVX[1];
  for (var j = wid.x; j < count; j += nw.x) {
    let c = lvCellOf(LVX[lvLT() + j], lid); if (c.z == 0u) { continue; }
    let i = c.y * u.w + c.x; if (!lvLevel(i)) { continue; }
    let src = LVPAR * u.n; let dst = (1u - LVPAR) * u.n;
    var d = LVP[src + i];
    if (c.x > 0u && lvLevel(i - 1u)) { d = min(d, LVP[src + i - 1u] + 1.0); }
    if (c.y > 0u && lvLevel(i - u.w)) { d = min(d, LVP[src + i - u.w] + 1.0); }
    if (c.x + 1u < u.w && lvLevel(i + 1u)) { d = min(d, LVP[src + i + 1u] + 1.0); }
    if (c.y + 1u < u.h && lvLevel(i + u.w)) { d = min(d, LVP[src + i + u.w] + 1.0); }
    LVP[dst + i] = d;
    if (LVMEN && u.lvTan > 0.0 && d < u.lvR) {
      let dmm = (d + 0.5) * u.mmPerCell;
      if (dmm < u.lvDm) { LVA[i].x = LVA[i].x + u.lvTan * (u.lvDm - dmm); }
    }
  }
}
fn lvActive(b: u32) -> bool { return bitcast<f32>(atomicLoad(&LVS[16u + 2u * b])) > 1e-7; }
// the faces of a level cell: neighbour and conductance, west, north, east, south (conductance 0 where there is no face)
fn lvFaces(i: u32, x: u32, y: u32) -> array<vec2<f32>, 4> {
  var f = array<vec2<f32>, 4>(vec2<f32>(0.0), vec2<f32>(0.0), vec2<f32>(0.0), vec2<f32>(0.0));
  let a = LVA[i];
  f[0].y = a.y; f[1].y = a.z;
  if (x + 1u < u.w && lvLevel(i + 1u)) { f[2].y = LVA[i + 1u].y; }
  if (y + 1u < u.h && lvLevel(i + u.w)) { f[3].y = LVA[i + u.w].z; }
  return f;
}
// H at the cell minus H at each neighbour (tilt as the difference it makes)
fn lvDiffs(i: u32, f: array<vec2<f32>, 4>) -> vec4<f32> {
  let h = LVA[i].x; var d = vec4<f32>(0.0);
  if (f[0].y != 0.0) { d.x = lvDh(i, i - 1u) + (h - LVA[i - 1u].x) - u.lvTx; }
  if (f[1].y != 0.0) { d.y = lvDh(i, i - u.w) + (h - LVA[i - u.w].x) - u.lvTy; }
  if (f[2].y != 0.0) { d.z = lvDh(i, i + 1u) + (h - LVA[i + 1u].x) + u.lvTx; }
  if (f[3].y != 0.0) { d.w = lvDh(i, i + u.w) + (h - LVA[i + u.w].x) + u.lvTy; }
  return d;
}
// The preconditioner: symmetric Gauss-Seidel within the 16x16 tile in red-black order (red, black, red, ... red: the
// same sequence read either way, so a symmetric operator, fixed for the solve), from zero. Faces leaving the tile are left
// out (block Jacobi between tiles). Four sweeps take a third of the iterations Jacobi takes, as IC(0) does on the CPU.
const LV_SWEEPS: u32 = 4u;
var<workgroup> lvZ: array<f32, 256>;
fn lvPrecond(li: u32, lid: vec3<u32>, r: f32, diag: f32, c: vec4<f32>, has: bool) -> f32 {
  lvZ[li] = 0.0;
  workgroupBarrier();
  let red = ((lid.x + lid.y) & 1u) == 0u; var z = 0.0;
  for (var s = 0u; s < 2u * LV_SWEEPS + 1u; s++) {
    if (has && red == ((s & 1u) == 0u)) {
      var v = r;
      if (c.x != 0.0) { v += c.x * lvZ[li - 1u]; }
      if (c.y != 0.0) { v += c.y * lvZ[li - 16u]; }
      if (c.z != 0.0) { v += c.z * lvZ[li + 1u]; }
      if (c.w != 0.0) { v += c.w * lvZ[li + 16u]; }
      z = v / diag; lvZ[li] = z;
    }
    workgroupBarrier();
  }
  return z;
}
// a level cell's couplings within its tile: west, north, east, south
fn lvInTile(f: array<vec2<f32>, 4>, lid: vec3<u32>) -> vec4<f32> {
  return vec4<f32>(select(0.0, f[0].y, lid.x > 0u), select(0.0, f[1].y, lid.y > 0u), select(0.0, f[2].y, lid.x < 15u), select(0.0, f[3].y, lid.y < 15u));
}
fn lvNb(i: u32, e: u32) -> u32 { return select(select(select(i + u.w, i + 1u, e == 2u), i - u.w, e == 1u), i - 1u, e == 0u); }
@compute @workgroup_size(16, 16)
fn lv_rhs(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { lvCount = LVX[1]; }
  let count = workgroupUniformLoad(&lvCount);
  for (var j = wid.x; j < count; j += nw.x) {
    let t = LVX[lvLT() + j];
    var bb = 0.0; var rz = 0.0; var has = false; var r = 0.0; var diag = 1.0; var cp = vec4<f32>(0.0); var i = 0u;
    var cdCell = 0.0; var cwE = 0.0; var cnE = 0.0; var ceE = 0.0; var csE = 0.0;
    let c = lvCellOf(t, lid);
    if (c.z != 0u) {
      i = c.y * u.w + c.x;
      if (lvLevel(i) && lvActive(lvBoxOf(i))) {
        // r = -L H - (I + L) d, from each face's difference of H + d (d is 0: lv_init)
        let f = lvFaces(i, c.x, c.y); let dh = lvDiffs(i, f); let d = LVB[i].x;
        var dd = vec4<f32>(0.0);
        if (f[0].y != 0.0) { dd.x = d - LVB[i - 1u].x; }
        if (f[1].y != 0.0) { dd.y = d - LVB[i - u.w].x; }
        if (f[2].y != 0.0) { dd.z = d - LVB[i + 1u].x; }
        if (f[3].y != 0.0) { dd.w = d - LVB[i + u.w].x; }
        diag = 1.0 + f[0].y + f[1].y + f[2].y + f[3].y;
        r = -(f[0].y * (dh.x + dd.x) + f[1].y * (dh.y + dd.y) + f[2].y * (dh.z + dd.z) + f[3].y * (dh.w + dd.w)) - d;
        cp = lvInTile(f, lid); has = true;
        cdCell = 1.0;
        if (lid.x == 0u) { cwE = f[0].y; cdCell += cwE; }
        if (lid.y == 0u) { cnE = f[1].y; cdCell += cnE; }
        if (lid.x == 15u) { ceE = f[2].y; cdCell += ceE; }
        if (lid.y == 15u) { csE = f[3].y; cdCell += csE; }
      }
    }
    let z = lvPrecond(li, lid, r, diag, cp, has);
    if (has) { LVA[i].w = diag; LVB[i] = vec4<f32>(LVB[i].x, r, z, 0.0); LVP[i] = 0.0; LVP[u.n + i] = 0.0; bb = r * r; rz = r * z; }
    lvSum[li] = bb; lvSum2[li] = rz; lvSum3[li] = select(0.0, r, has);
    workgroupBarrier();
    lvReduce3(li);
    let bb0 = lvSum[0]; let rz0 = lvSum2[0]; let rTile = lvSum3[0];
    workgroupBarrier();
    lvSum[li] = cdCell; lvSum2[li] = 0.0;
    workgroupBarrier();
    lvReduce2(li);
    let cd0 = lvSum[0];
    workgroupBarrier();
    if (lid.x == 0u) { lvSum[lid.y] = cwE; }
    if (lid.y == 0u) { lvSum[16u + lid.x] = cnE; }
    if (lid.x == 15u) { lvSum[32u + lid.y] = ceE; }
    if (lid.y == 15u) { lvSum[48u + lid.x] = csE; }
    workgroupBarrier();
    if (li == 0u) {
      var sw = 0.0; var sn = 0.0; var se = 0.0; var ss = 0.0;
      for (var k = 0u; k < 16u; k++) { sw += lvSum[k]; sn += lvSum[16u + k]; se += lvSum[32u + k]; ss += lvSum[48u + k]; }
      let base = 16u * j;
      LVR[base + 3u] = bb0; LVR[base + 4u] = rz0; LVR[base + 5u] = rTile; LVR[base + 6u] = 0.0;
      LVR[base + 8u] = cd0; LVR[base + 9u] = sw; LVR[base + 10u] = sn; LVR[base + 11u] = se; LVR[base + 12u] = ss;
    }
    workgroupBarrier();
  }
}
// The sums over box b's tiles of their partials in slots sa and sc of LVR, left in lvSum[0] and lvSum2[0]: always in the
// same order, so every workgroup that sums a box gets the same floats.
fn lvBoxSums(b: u32, li: u32, sa: u32, sc: u32) {
  let B = lvBX(b); let off = LVX[B + 7u]; let n = LVX[B + 8u];
  var a = 0.0; var c = 0.0;
  for (var q = li; q < n; q += 256u) { a += LVR[16u * (off + q) + sa]; c += LVR[16u * (off + q) + sc]; }
  lvSum[li] = a; lvSum2[li] = c;
  workgroupBarrier();
  lvReduce2(li);
}
// Coarse-tile symmetric red-black Gauss-Seidel (2-level additive Schwarz: M^-1 = M_tile^-1 + P A_c^-1 P^T).
// Guaranteed SPD on any mask; returns r_tile . z_coarse in lvSum[0].
var<workgroup> lvCOff: u32;
var<workgroup> lvCN: u32;
var<workgroup> lvRun: u32;
var<workgroup> lvCw: array<f32, 256>;
var<workgroup> lvCn: array<f32, 256>;
fn lvCoarseSolve(b: u32, li: u32) -> f32 {
  let B = lvBX(b);
  if (li == 0u) { lvCOff = LVX[B + 7u]; lvCN = LVX[B + 8u]; }
  let off = workgroupUniformLoad(&lvCOff); let n = workgroupUniformLoad(&lvCN);
  if (n <= 1u) {
    if (li == 0u && n == 1u) { LVR[16u * off + 6u] = 0.0; }
    workgroupBarrier();
    return 0.0;
  }
  for (var q = li; q < n; q += 256u) { LVR[16u * (off + q) + 6u] = 0.0; }
  storageBarrier(); workgroupBarrier();
  let halfSweeps = select(13u, 9u, n <= 64u);
  for (var s = 0u; s < halfSweeps; s++) {
    let par = s & 1u;
    for (var q = li; q < n; q += 256u) {
      let j = off + q; let t = LVX[lvLT() + j]; let tx = t % u.tw; let ty = t / u.tw;
      if (((tx + ty) & 1u) != par) { continue; }
      let base = 16u * j; let d = LVR[base + 8u];
      if (d <= 0.0) { continue; }
      var v = LVR[base + 5u];
      if (tx > 0u) { let cw = LVR[base + 9u]; if (cw != 0.0) { let nj = LVX[lvTM() + t - 1u]; if (nj >= off && nj < off + n) { v += cw * LVR[16u * nj + 6u]; } } }
      if (ty > 0u) { let cn = LVR[base + 10u]; if (cn != 0.0) { let nj = LVX[lvTM() + t - u.tw]; if (nj >= off && nj < off + n) { v += cn * LVR[16u * nj + 6u]; } } }
      if (tx + 1u < u.tw) { let ce = LVR[base + 11u]; if (ce != 0.0) { let nj = LVX[lvTM() + t + 1u]; if (nj >= off && nj < off + n) { v += ce * LVR[16u * nj + 6u]; } } }
      if (ty + 1u < u.th) { let cs = LVR[base + 12u]; if (cs != 0.0) { let nj = LVX[lvTM() + t + u.tw]; if (nj >= off && nj < off + n) { v += cs * LVR[16u * nj + 6u]; } } }
      LVR[base + 6u] = v / d;
    }
    storageBarrier(); workgroupBarrier();
  }
  var rzc = 0.0;
  for (var q = li; q < n; q += 256u) { let base = 16u * (off + q); rzc += LVR[base + 5u] * LVR[base + 6u]; }
  lvSum[li] = rzc; lvSum2[li] = 0.0;
  workgroupBarrier();
  lvReduce2(li);
  return lvSum[0];
}
// The per-box kernels: each workgroup takes boxes wid.x, wid.x + workgroups, ... (any number of workgroups covers them)
var<workgroup> lvBoxN: u32;
fn lvBoxCount(li: u32) -> u32 { if (li == 0u) { lvBoxN = LVX[0]; } return workgroupUniformLoad(&lvBoxN); }
@compute @workgroup_size(256)
fn lv_cg0(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  let nb = lvBoxCount(li);
  for (var b = wid.x; b < nb; b += nw.x) {
    let B = lvBX(b);
    if (li == 0u) { lvBox = select(0u, 1u, lvActive(b) && LVX[B + 8u] > 0u); }
    if (workgroupUniformLoad(&lvBox) == 0u) { if (li == 0u) { LVX[B + 14u] = 0u; } continue; }
    lvBoxSums(b, li, 3u, 4u);
    let bb = lvSum[0]; let rzLoc = lvSum2[0];
    let tol = max(1e-24, 0.1 * ${FILM_RESIDUAL_SQUARED} * bb);
    if (li == 0u) { lvRun = select(1u, 0u, bb <= tol); }
    if (workgroupUniformLoad(&lvRun) == 0u) {
      if (li == 0u) {
        LVX[B + 9u] = 0u; LVX[B + 10u] = 0u; LVX[B + 11u] = bitcast<u32>(rzLoc); LVX[B + 12u] = bitcast<u32>(tol); LVX[B + 13u] = 0u;
        LVX[B + 14u] = 3u; atomicAdd(&LVS[7], 1u);
      }
      workgroupBarrier();
      continue;
    }
    let rzCoarse = lvCoarseSolve(b, li);
    if (li == 0u) {
      let rz0 = rzLoc + rzCoarse;
      LVX[B + 9u] = 0u; LVX[B + 10u] = 0u; LVX[B + 11u] = bitcast<u32>(rz0); LVX[B + 15u] = bitcast<u32>(rz0); LVX[B + 12u] = bitcast<u32>(tol); LVX[B + 13u] = 0u;
      LVX[B + 14u] = 1u; atomicAdd(&LVS[7], 1u); atomicAdd(&LVS[12], 1u);
    }
    workgroupBarrier();
  }
}
${filmLevelCgWgsl}
// the water each face carries over the step, from the new surface: stored at the face's +x / +y cell, towards +x / +y
@compute @workgroup_size(16, 16)
fn lv_flux(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let count = LVX[1];
  for (var j = wid.x; j < count; j += nw.x) {
    let c = lvCellOf(LVX[lvLT() + j], lid); if (c.z == 0u) { continue; }
    let i = c.y * u.w + c.x; if (!lvLevel(i) || lvState(lvBoxOf(i)) != 3u) { continue; }   // (W as at the step's start)
    let a = LVA[i]; let di = LVB[i].x;
    var fw = 0.0; var fn_ = 0.0;
    if (a.y != 0.0) { fw = a.y * (lvDh(i - 1u, i) + (LVA[i - 1u].x - a.x) + u.lvTx + (LVB[i - 1u].x - di)); }
    if (a.z != 0.0) { fn_ = a.z * (lvDh(i - u.w, i) + (LVA[i - u.w].x - a.x) + u.lvTy + (LVB[i - u.w].x - di)); }
    LVF[i] = vec4<f32>(fw, fn_, 1.0, -1.0);   // w -1: this cell's water moves in this step's rounds (lvRound)
  }
}
// what a cell gives over the step: x, the faces to the west, north, east and south (signed out of the cell)
fn lvOut(i: u32, x: u32, y: u32) -> vec4<f32> {
  var o = vec4<f32>(-LVF[i].x, -LVF[i].y, 0.0, 0.0);
  if (LVA[i].y == 0.0) { o.x = 0.0; }
  if (LVA[i].z == 0.0) { o.y = 0.0; }
  if (x + 1u < u.w && lvRound(i + 1u) && LVA[i + 1u].y != 0.0) { o.z = LVF[i + 1u].x; }
  if (y + 1u < u.h && lvRound(i + u.w) && LVA[i + u.w].z != 0.0) { o.w = LVF[i + u.w].y; }
  return o;
}
fn lvPos(v: vec4<f32>) -> f32 { return max(0.0, v.x) + max(0.0, v.y) + max(0.0, v.z) + max(0.0, v.w); }
@compute @workgroup_size(16, 16)
fn lv_out(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let count = LVX[1];
  for (var j = wid.x; j < count; j += nw.x) {
    let c = lvCellOf(LVX[lvLT() + j], lid); if (c.z == 0u) { continue; }
    let i = c.y * u.w + c.x; if (!lvRound(i)) { continue; }
    let b = lvBoxOf(i); if (lvState(b) == 0u) { continue; }
    let out = lvPos(lvOut(i, c.x, c.y)); let wk = W[i];
    if (out > 0.0 && wk > u.wetEps) { atomicMax(&LVS[17u + 2u * b], bitcast<u32>(out / wk)); }
  }
}
var<workgroup> lvRounds: atomic<u32>;
@compute @workgroup_size(64)
fn lv_subs(@builtin(local_invocation_index) li: u32) {
  // One group covers every box and replaces all arguments, including the empty-film case. No previous step's
  // active transport dispatch can survive. Each box retains its own denominator, as on the CPU.
  if (li == 0u) { atomicStore(&lvRounds, 0u); }
  workgroupBarrier();
  for (var b = li; b < LVX[0]; b += 64u) {
    let B = lvBX(b); if (LVX[B + 14u] != 3u) { continue; }
    let worst = bitcast<f32>(atomicLoad(&LVS[17u + 2u * b]));
    let want = u32(min(64.0, max(1.0, ceil(worst / 0.5))));
    atomicMax(&LVS[5], want);
    LVX[B + 15u] = want;
    atomicMax(&lvRounds, want);
  }
  workgroupBarrier();
  if (li == 0u) {
    let rounds = atomicLoad(&lvRounds);
    atomicStore(&LVS[13], rounds);
    for (var r = 0u; r < 64u; r++) {
      LVI[6u + 3u * r] = select(0u, min(LVX[1], 256u), r < rounds);
      LVI[7u + 3u * r] = 1u; LVI[8u + 3u * r] = 1u;
    }
  }
}
${filmLevelTransportWgsl({ channel, count })}
// ---- back-runs (backrun.mjs), on the wet tiles after the levelling: lv_br_a each damp cell's intake from the puddles
// beside it (LVB, by direction: 0 +x, 1 -x, 2 +y, 3 -y, as backrun.mjs DX, DY) and its push (LVF: x the push share s,
// y the share of its loose paint that leaves it, z the fraction of exposed tooth); lv_br_b each pigment's push per unit of intake
// (OUT4 x) and a puddle's concentration (OUT4 y); lv_br_c applies the water and the paint. Every read of a neighbour is of state written in an earlier
// kernel, so the cells' order does not matter, as on the CPU. A neighbour is read only where M is set: a cell without
// water lies in no wet tile, and its LVB and LVF are stale.
fn brIn(x: u32, y: u32, e: u32) -> bool {
  if (e == 0u) { return x + 1u < u.w; } if (e == 1u) { return x > 0u; } if (e == 2u) { return y + 1u < u.h; } return y > 0u;
}
fn brNb(i: u32, e: u32) -> u32 { if (e == 0u) { return i + 1u; } if (e == 1u) { return i - 1u; } if (e == 2u) { return i + u.w; } return i - u.w; }
fn brOpp(e: u32) -> u32 { return e ^ 1u; }
fn brExposed(i: u32) -> f32 {
  if (M[i] != 1u || W[i] <= 0.0 || W[i] >= u.brHead || (RESIST[i] & 1u) != 0u) { return 0.0; }
  return (u.brHead - W[i]) / u.brHead;
}
@compute @workgroup_size(16, 16)
fn lv_br_a(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let count = TL[u.ntiles];
  for (var j = wid.x; j < count; j += nw.x) {
    let c = lvCellOf(TL[j], lid); if (c.z == 0u) { continue; }
    let i = c.y * u.w + c.x;
    var q = vec4<f32>(0.0); var s = 0.0; var go = 0.0; let damp = brExposed(i);
    if (damp > 0.0) {
      let share = damp * 0.25 * min(1.0, u.brC * clamp(1.5 - PAPER3[i].z, 0.5, 1.5));
      for (var e = 0u; e < 4u; e++) {
        if (!brIn(c.x, c.y, e)) { continue; }
        let k = brNb(i, e);
        if (M[k] == 1u && W[k] > u.brHead) {
          let aligned = abs(select(PAPER[i].w, PAPER[i].z, e < 2u)) * PAPER[i].y;
          let entry = u.brHead * exp(max(0.0, 2.0 * u.pinning * PAPER3[i].y - u.pinFibre * aligned));
          q[e] = share * max(0.0, W[k] - entry);
        }
      }
      let Q = q.x + q.y + q.z + q.w;
      if (Q > 0.0) {
        atomicStore(&LVS[14], 1u);
        s = u.brPush * Q / (Q + W[i]);
        var moved = 0.0;
        for (var e = 0u; e < 4u; e++) { let o = brOpp(e); if (q[e] > 0.0 && brIn(c.x, c.y, o)) { moved += (q[e] / Q) * brExposed(brNb(i, o)); } }
        go = s * moved;
      }
    }
    LVB[i] = q; LVF[i] = vec4<f32>(s, go, damp, 0.0);
  }
}
@compute @workgroup_size(16, 16)
fn lv_br_b(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  if (atomicLoad(&LVS[14]) == 0u) { return; }
  let count = TL[u.ntiles];
  for (var j = wid.x; j < count; j += nw.x) {
    let c = lvCellOf(TL[j], lid); if (c.z == 0u) { continue; }
    let i = c.y * u.w + c.x; if (M[i] != 1u) { continue; }
    let q = LVB[i]; let Q = q.x + q.y + q.z + q.w; let s = LVF[i].x;
    for (var ka = 0u; ka < u.nAct; ka++) {
      let qq = klAt(ka) * u.n + i;
      // x: the paint it pushes on per unit of intake; y: a puddle's concentration, carried with the water it gives
      o4set(qq, vec4<f32>(select(0.0, s * (G[qq] + D[qq]) / Q, Q > 0.0), select(0.0, (G[qq] + u.brPush * D[qq]) / W[i], W[i] > u.lvFloor), 0.0, 0.0));
    }
  }
}
@compute @workgroup_size(16, 16)
fn lv_br_c(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  if (atomicLoad(&LVS[14]) == 0u) { return; }
  let count = TL[u.ntiles];
  for (var j = wid.x; j < count; j += nw.x) {
    let c = lvCellOf(TL[j], lid); if (c.z == 0u) { continue; }
    let i = c.y * u.w + c.x; if (M[i] != 1u) { continue; }
    let q = LVB[i]; let f = LVF[i]; let Q = q.x + q.y + q.z + q.w;
    // water: a damp cell takes its intake; a puddle gives what its damp neighbours took from it
    var dw = 0.0;
    if (Q > 0.0) { dw = Q; }
    else if (W[i] > u.lvFloor) {
      for (var e = 0u; e < 4u; e++) { if (!brIn(c.x, c.y, e)) { continue; } let k = brNb(i, e); if (M[k] == 1u) { dw -= LVB[k][brOpp(e)]; } }
    }
    // paint: what leaves, and what the invaded neighbours push on into a damp cell
    for (var ka = 0u; ka < u.nAct; ka++) {
      let base = klAt(ka) * u.n; var inc = 0.0;
      if (f.z > 0.0) {
        for (var e = 0u; e < 4u; e++) {
          if (!brIn(c.x, c.y, e)) { continue; }
          let k = brNb(i, e); if (M[k] != 1u) { continue; }
          let ok = o4get(base + k);
          if (q[e] > 0.0) { inc += q[e] * ok.y; }   // the puddle's paint, carried in with its water
          let v = LVB[k][e]; if (v > 0.0) { inc += f.z * v * ok.x; }
        }
      }
      if (dw < 0.0) { let fr = dw / W[i]; G[base + i] = max(0.0, G[base + i] * (1.0 + fr)); D[base + i] = max(0.0, D[base + i] * (1.0 + u.brPush * fr)); }   // a puddle: its water left with its paint
      else if (f.y > 0.0 || inc > 0.0) {
        G[base + i] = max(0.0, G[base + i] * (1.0 - f.y) + inc); D[base + i] = max(0.0, D[base + i] * (1.0 - f.y));
      }
    }
    if (dw != 0.0) { W[i] = max(0.0, W[i] + dw); }
  }
}
`.replaceAll('klAt(', `${channel}(`).replaceAll('u.nAct', count);
