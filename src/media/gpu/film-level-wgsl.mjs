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
// conductances k0 p h^3 and H the surface (W + slope height, lowered by the meniscus near a dry side, falling with the
// board's tilt). The CPU solves it by IC(0) conjugate gradients to a residual a millionth of the first; here each box
// runs its own conjugate gradients (preconditioned by Gauss-Seidel within each tile, lvPrecond) to the same residual (alpha and beta per box, from the tiles'
// partial sums), so the solutions agree to that residual. The CPU stops at 2000 iterations; the host encodes u.lvIt
// a step, and a box that runs out is counted (LVS[4]) and the host gives the next steps more. The water each face
// carries over the step then moves with its pigment in the box's substeps (no donor gives more than half its water, at
// most 64), each under the 95% donor budgets. The host encodes u.lvSubs rounds; a box needing more takes u.lvSubs
// (counted in LVS[6]). The surface enters only as differences between neighbours, taken part by part (depth, relief,
// the meniscus's lowering, which LVA holds, and the tilt), so a board's fall over a large sheet or a film's depth near
// its relief does not lose the digits its slope has in float32.
export const LV_BMAX = 1024;
/** Words of the LVX buffer for a w x h sheet with `ntiles` 16x16 tiles. */
export function lvxWords(w, h, ntiles) {
  const nt32 = Math.ceil(w / 32) * Math.ceil(h / 32);
  return 16 + 11 * nt32 + 17 * LV_BMAX + ntiles;
}
// LVX (u32): [0] boxes, [1] tiles in LT, [2] more boxes than LV_BMAX; then per 32-cell tile 10 words (wet, x0, y0, x1,
// y1, deposit sum, wet count, label, mask of 16-cell children with a level cell, -), the cluster stack, per box 16
// words (x0, y0, x1, y1, deposit sum, wet count, fill, LT offset, LT tiles, alpha, beta, rz, tol, iterations, state,
// substeps), the cluster-to-box map, then LT: the tiles holding level cells, grouped by box.
// LVS (atomic u32): [3] most CG iterations a solve took, [4] solves stopped at u.lvIt, [5] most substeps a box asked
// for, [6] boxes that got fewer than they asked for, [7] solves, [11] the most boxes; per box at 16 + 2 b, the largest explicit face flux
// (most) and the largest outflow over water (worst), as f32 bits.
// State bits: 1 the box levels, 2 its CG is done.
export const filmLevelWgsl = ({ channel = 'klAt', count = 'u.nAct' } = {}) => `
@group(0) @binding(51) var<storage, read_write> LVT: array<u32>;
@group(0) @binding(52) var<storage, read_write> LVX: array<u32>;
@group(0) @binding(53) var<storage, read_write> LVS: array<atomic<u32>>;
@group(0) @binding(54) var<storage, read_write> LVA: array<vec4<f32>>;   // H, conductance of the west face, of the north face, diagonal
@group(0) @binding(55) var<storage, read_write> LVB: array<vec4<f32>>;   // d, r, z, q
@group(0) @binding(56) var<storage, read_write> LVP: array<f32>;         // p, two planes in turn
@group(0) @binding(57) var<storage, read_write> LVF: array<vec4<f32>>;   // west face flux (+x), north face flux (+y), water scale, meniscus distance
@group(0) @binding(58) var<storage, read_write> LVR: array<f32>;         // per LT tile 8: pq, then rr and rz for even and odd iterations
override LVPAR: u32 = 0u;
override LVROUND: u32 = 0u;
override LVK0: bool = false;
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
fn lvT32(i: u32) -> u32 { return ((i / u.w) / 32u) * lvTw32() + (i % u.w) / 32u; }
fn lvBoxOf(i: u32) -> u32 { return LVX[lvTR(lvT32(i)) + 7u]; }
fn lvLevel(i: u32) -> bool { return M[i] == 1u && W[i] > 0.0; }
// the hollow fill of a wet cell's box (sheet.mjs slideFillFor)
fn fillAt(i: u32) -> f32 {
  if (u.fillRef <= 0.0) { return u.slideFill; }
  return bitcast<f32>(LVX[lvBX(lvBoxOf(i)) + 6u]);
}
fn lvState(b: u32) -> u32 { return LVX[lvBX(b) + 14u]; }

var<workgroup> lvSum: array<f32, 256>;
var<workgroup> lvSum2: array<f32, 256>;
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
        if (W[i] > 0.0) { atomicStore(&lvAt[6], 1u); }
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
  if (li == 0u) {
    // clusters of wet tiles touching on a side or corner, found in tile order (sheet.mjs wetBoxes)
    let st = lvCL(); var nb = 0u; let m = u32(u.poreReach); let th32 = (u.h + 31u) / 32u;
    LVX[2] = 0u;
    for (var t0 = 0u; t0 < nt; t0++) {
      if (LVX[lvTR(t0)] == 0u || LVX[lvTR(t0) + 7u] != LV_NONE) { continue; }
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
    for (var t = 0u; t < nt; t++) { let r = lvTR(t); if (LVX[r] != 0u) { let b = LVX[lvRM() + LVX[r + 7u]]; LVX[r + 7u] = b; LVX[lvBX(b) + 8u] += countOneBits(LVX[r + 8u]); } }
    var off = 0u;
    for (var b = 0u; b < nb; b++) { let B = lvBX(b); LVX[B + 7u] = off; off += LVX[B + 8u]; LVX[B + 8u] = 0u; }
    for (var t = 0u; t < nt; t++) {
      let r = lvTR(t); let lm = LVX[r + 8u]; if (LVX[r] == 0u || lm == 0u) { continue; }
      let B = lvBX(LVX[r + 7u]); let tx = t % tw32; let ty = t / tw32;
      for (var c = 0u; c < 4u; c++) {
        if ((lm & (1u << c)) == 0u) { continue; }
        LVX[lvLT() + LVX[B + 7u] + LVX[B + 8u]] = (2u * ty + (c >> 1u)) * u.tw + 2u * tx + (c & 1u); LVX[B + 8u] += 1u;
      }
    }
    LVX[0] = nb; LVX[1] = off;
    atomicMax(&LVS[11], nb);
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
      let h = 0.5 * (W[i] + W[i - 1u]); let p = 1.0 - u.ff + u.ff * (0.25 + 1.75 * PAPER2[i - 1u].x);
      cw = u.lvK0 * p * h * h * h; most = max(most, cw * abs(lvDh(i, i - 1u) - u.lvTx));
    }
    if (c.y > 0u && lvLevel(i - u.w)) {
      let h = 0.5 * (W[i] + W[i - u.w]); let p = 1.0 - u.ff + u.ff * (0.25 + 1.75 * PAPER2[i - u.w].y);
      cn = u.lvK0 * p * h * h * h; most = max(most, cn * abs(lvDh(i, i - u.w) - u.lvTy));
    }
    atomicMax(&LVS[16u + 2u * b], bitcast<u32>(most));
    // the line's cells: a side not on a wet cell of the box
    let edge = !(c.x > 0u && lvLevel(i - 1u)) || !(c.y > 0u && lvLevel(i - u.w)) || !(c.x + 1u < u.w && lvLevel(i + 1u)) || !(c.y + 1u < u.h && lvLevel(i + u.w));
    LVA[i] = vec4<f32>(0.0, cw, cn, 0.0);   // x: the meniscus's lowering of H (lv_dist)
    LVF[i] = vec4<f32>(0.0, 0.0, 1.0, select(1e9, 0.0, edge)); LVB[i] = vec4<f32>(0.0);
  }
}
// the meniscus: the distance in cells through the wet cells from the line (relaxed in place, u.lvR - 1 times; a value
// is always a path's length, so in place it is exact below the reach), then the surface lowered within meniscusMm
@compute @workgroup_size(16, 16)
fn lv_dist(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let count = LVX[1];
  for (var j = wid.x; j < count; j += nw.x) {
    let c = lvCellOf(LVX[lvLT() + j], lid); if (c.z == 0u) { continue; }
    let i = c.y * u.w + c.x; if (!lvLevel(i)) { continue; }
    var d = LVF[i].w;
    if (c.x > 0u && lvLevel(i - 1u)) { d = min(d, LVF[i - 1u].w + 1.0); }
    if (c.y > 0u && lvLevel(i - u.w)) { d = min(d, LVF[i - u.w].w + 1.0); }
    if (c.x + 1u < u.w && lvLevel(i + 1u)) { d = min(d, LVF[i + 1u].w + 1.0); }
    if (c.y + 1u < u.h && lvLevel(i + u.w)) { d = min(d, LVF[i + u.w].w + 1.0); }
    LVF[i].w = d;
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
      }
    }
    let z = lvPrecond(li, lid, r, diag, cp, has);
    if (has) { LVA[i].w = diag; LVB[i] = vec4<f32>(LVB[i].x, r, z, 0.0); LVP[i] = 0.0; LVP[u.n + i] = 0.0; bb = r * r; rz = r * z; }
    lvSum[li] = bb; lvSum2[li] = rz;
    workgroupBarrier();
    lvReduce2(li);
    if (li == 0u) { LVR[8u * j + 3u] = lvSum[0]; LVR[8u * j + 4u] = lvSum2[0]; }
    workgroupBarrier();
  }
}
// The sums over box b's tiles of their partials in slots sa and sc of LVR, left in lvSum[0] and lvSum2[0]: always in the
// same order, so every workgroup that sums a box gets the same floats.
fn lvBoxSums(b: u32, li: u32, sa: u32, sc: u32) {
  let B = lvBX(b); let off = LVX[B + 7u]; let n = LVX[B + 8u];
  var a = 0.0; var c = 0.0;
  for (var q = li; q < n; q += 256u) { a += LVR[8u * (off + q) + sa]; c += LVR[8u * (off + q) + sc]; }
  lvSum[li] = a; lvSum2[li] = c;
  workgroupBarrier();
  lvReduce2(li);
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
    if (li == 0u) {
      let bb = lvSum[0]; let tol = max(1e-24, 1e-12 * bb);
      LVX[B + 9u] = 0u; LVX[B + 10u] = 0u; LVX[B + 11u] = bitcast<u32>(lvSum2[0]); LVX[B + 12u] = bitcast<u32>(tol); LVX[B + 13u] = 0u;
      LVX[B + 14u] = select(1u, 3u, bb <= tol);
      atomicAdd(&LVS[7], 1u);
    }
    workgroupBarrier();
  }
}
fn lvRunning(b: u32) -> bool { return lvState(b) == 1u; }
// Each CG iteration k is two dispatches, lv_cg_a and lv_cg_c (LVPAR = k & 1); lv_cg_d closes the last one. A box's
// alpha and beta come from the sums of its tiles' partials, which every workgroup holding one of the box's tiles takes
// itself (lvBoxSums, in one order, so the same floats) instead of a per-box dispatch between them. Iteration k's rr and rz
// partials are in LVR slots 1 + 2 LVPAR and 2 + 2 LVPAR, so the next iteration reads them while it writes its own; the
// workgroup holding the box's first tile writes the box's words (LVX), which no other workgroup reads in the same dispatch.
var<workgroup> lvGo: u32;
var<workgroup> lvCoef: f32;
@compute @workgroup_size(16, 16)
fn lv_cg_a(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { lvCount = LVX[1]; }
  let count = workgroupUniformLoad(&lvCount);
  let po = LVPAR * u.n; let pn = (1u - LVPAR) * u.n; let prev = 1u - LVPAR;
  for (var j = wid.x; j < count; j += nw.x) {
    let t = LVX[lvLT() + j];
    if (li == 0u) { let bx = LVX[lvTR(((t / u.tw) / 2u) * lvTw32() + (t % u.tw) / 2u) + 7u]; lvBox = select(LV_NONE, bx, lvRunning(bx)); }
    let b = workgroupUniformLoad(&lvBox);
    if (b == LV_NONE) { continue; }
    var beta = bitcast<f32>(LVX[lvBX(b) + 10u]);
    if (!LVK0) {
      // the close of iteration k - 1 (as lv_cg_d): beta, and whether the box is done
      lvBoxSums(b, li, 1u + 2u * prev, 2u + 2u * prev);
      if (li == 0u) {
        let B = lvBX(b); let rr = lvSum[0]; let next = lvSum2[0];
        let it = LVX[B + 13u] + 1u; let met = rr <= bitcast<f32>(LVX[B + 12u]); let done = met || f32(it) >= u.lvIt;
        lvCoef = next / bitcast<f32>(LVX[B + 11u]); lvGo = select(1u, 0u, done);
        if (j == LVX[B + 7u]) {
          LVX[B + 10u] = bitcast<u32>(lvCoef); atomicMax(&LVS[3], it);
          if (done) { LVX[B + 14u] = 3u; if (!met) { atomicAdd(&LVS[4], 1u); } }
        }
      }
      if (workgroupUniformLoad(&lvGo) == 0u) { continue; }
      beta = lvCoef;
    }
    var pq = 0.0;
    let c = lvCellOf(t, lid);
    if (c.z != 0u) {
      let i = c.y * u.w + c.x;
      if (lvLevel(i)) {
        let f = lvFaces(i, c.x, c.y);
        let p = LVB[i].z + beta * LVP[po + i];
        var q = LVA[i].w * p;
        for (var e = 0u; e < 4u; e++) { if (f[e].y != 0.0) { let k = lvNb(i, e); q -= f[e].y * (LVB[k].z + beta * LVP[po + k]); } }
        LVP[pn + i] = p; LVB[i].w = q; pq = p * q;
      }
    }
    lvSum[li] = pq; lvSum2[li] = 0.0;
    workgroupBarrier();
    lvReduce2(li);
    if (li == 0u) { LVR[8u * j] = lvSum[0]; }
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn lv_cg_c(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { lvCount = LVX[1]; }
  let count = workgroupUniformLoad(&lvCount);
  let pn = (1u - LVPAR) * u.n; let prev = 1u - LVPAR;
  for (var j = wid.x; j < count; j += nw.x) {
    let t = LVX[lvLT() + j];
    if (li == 0u) { let bx = LVX[lvTR(((t / u.tw) / 2u) * lvTw32() + (t % u.tw) / 2u) + 7u]; lvBox = select(LV_NONE, bx, lvRunning(bx)); }
    let b = workgroupUniformLoad(&lvBox);
    if (b == LV_NONE) { continue; }
    // alpha (as lv_cg_b did): this iteration's pq over the box's last rz
    lvBoxSums(b, li, 0u, 2u + 2u * prev);
    if (li == 0u) {
      let B = lvBX(b); let pq = lvSum[0]; let rz = lvSum2[0];
      lvCoef = rz / pq; lvGo = select(0u, 1u, pq > 0.0);
      if (j == LVX[B + 7u]) {
        if (!(pq > 0.0)) { LVX[B + 14u] = 3u; }
        else { LVX[B + 9u] = bitcast<u32>(lvCoef); LVX[B + 11u] = bitcast<u32>(rz); LVX[B + 13u] = LVX[B + 13u] + select(1u, 0u, LVK0); }
      }
    }
    if (workgroupUniformLoad(&lvGo) == 0u) { continue; }
    let alpha = lvCoef;
    var rr = 0.0; var rz = 0.0; var has = false; var v = vec4<f32>(0.0); var diag = 1.0; var cp = vec4<f32>(0.0); var i = 0u;
    let c = lvCellOf(t, lid);
    if (c.z != 0u) {
      i = c.y * u.w + c.x;
      if (lvLevel(i)) {
        v = LVB[i]; diag = LVA[i].w; cp = lvInTile(lvFaces(i, c.x, c.y), lid); has = true;
        v.x = v.x + alpha * LVP[pn + i]; v.y = v.y - alpha * v.w;
      }
    }
    let z = lvPrecond(li, lid, v.y, diag, cp, has);
    if (has) { v.z = z; LVB[i] = v; rr = v.y * v.y; rz = v.y * z; }
    lvSum[li] = rr; lvSum2[li] = rz;
    workgroupBarrier();
    lvReduce2(li);
    if (li == 0u) { LVR[8u * j + 1u + 2u * LVPAR] = lvSum[0]; LVR[8u * j + 2u + 2u * LVPAR] = lvSum2[0]; }
    workgroupBarrier();
  }
}
// the close of the last iteration (LVPAR its parity)
@compute @workgroup_size(256)
fn lv_cg_d(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  let nb = lvBoxCount(li);
  for (var b = wid.x; b < nb; b += nw.x) {
    if (li == 0u) { lvBox = select(0u, 1u, lvRunning(b)); }
    if (workgroupUniformLoad(&lvBox) == 0u) { continue; }
    lvBoxSums(b, li, 1u + 2u * LVPAR, 2u + 2u * LVPAR);
    if (li == 0u) {
      let B = lvBX(b); let rr = lvSum[0]; let next = lvSum2[0];
      LVX[B + 10u] = bitcast<u32>(next / bitcast<f32>(LVX[B + 11u])); LVX[B + 11u] = bitcast<u32>(next);
      let it = LVX[B + 13u] + 1u; LVX[B + 13u] = it;
      atomicMax(&LVS[3], it);
      if (rr <= bitcast<f32>(LVX[B + 12u])) { LVX[B + 14u] = 3u; }
      else if (f32(it) >= u.lvIt) { LVX[B + 14u] = 3u; atomicAdd(&LVS[4], 1u); }
    }
    workgroupBarrier();
  }
}
// the water each face carries over the step, from the new surface: stored at the face's +x / +y cell, towards +x / +y
@compute @workgroup_size(16, 16)
fn lv_flux(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let count = LVX[1];
  for (var j = wid.x; j < count; j += nw.x) {
    let c = lvCellOf(LVX[lvLT() + j], lid); if (c.z == 0u) { continue; }
    let i = c.y * u.w + c.x; if (!lvLevel(i) || lvState(lvBoxOf(i)) == 0u) { continue; }
    let a = LVA[i]; let di = LVB[i].x;
    var fw = 0.0; var fn_ = 0.0;
    if (a.y != 0.0) { fw = a.y * (lvDh(i - 1u, i) + (LVA[i - 1u].x - a.x) + u.lvTx + (LVB[i - 1u].x - di)); }
    if (a.z != 0.0) { fn_ = a.z * (lvDh(i - u.w, i) + (LVA[i - u.w].x - a.x) + u.lvTy + (LVB[i - u.w].x - di)); }
    LVF[i] = vec4<f32>(fw, fn_, 1.0, 0.0);
  }
}
// what a cell gives over the step: x, the faces to the west, north, east and south (signed out of the cell)
fn lvOut(i: u32, x: u32, y: u32) -> vec4<f32> {
  var o = vec4<f32>(-LVF[i].x, -LVF[i].y, 0.0, 0.0);
  if (LVA[i].y == 0.0) { o.x = 0.0; }
  if (LVA[i].z == 0.0) { o.y = 0.0; }
  if (x + 1u < u.w && lvLevel(i + 1u) && LVA[i + 1u].y != 0.0) { o.z = LVF[i + 1u].x; }
  if (y + 1u < u.h && lvLevel(i + u.w) && LVA[i + u.w].z != 0.0) { o.w = LVF[i + u.w].y; }
  return o;
}
fn lvPos(v: vec4<f32>) -> f32 { return max(0.0, v.x) + max(0.0, v.y) + max(0.0, v.z) + max(0.0, v.w); }
@compute @workgroup_size(16, 16)
fn lv_out(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let count = LVX[1];
  for (var j = wid.x; j < count; j += nw.x) {
    let c = lvCellOf(LVX[lvLT() + j], lid); if (c.z == 0u) { continue; }
    let i = c.y * u.w + c.x; if (!lvLevel(i)) { continue; }
    let b = lvBoxOf(i); if (lvState(b) == 0u) { continue; }
    let out = lvPos(lvOut(i, c.x, c.y)); let wk = W[i];
    if (out > 0.0 && wk > u.wetEps) { atomicMax(&LVS[17u + 2u * b], bitcast<u32>(out / wk)); }
  }
}
@compute @workgroup_size(64)
fn lv_subs(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>) {
  for (var b = gid.x; b < LVX[0]; b += 64u * nw.x) {
    let B = lvBX(b); if (LVX[B + 14u] == 0u) { continue; }
    let worst = bitcast<f32>(atomicLoad(&LVS[17u + 2u * b]));
    let want = u32(min(64.0, max(1.0, ceil(worst / 0.5))));
    atomicMax(&LVS[5], want);
    if (f32(want) > u.lvSubs) { atomicAdd(&LVS[6], 1u); }
    LVX[B + 15u] = min(want, u32(u.lvSubs));
  }
}
// one substep (round LVROUND of the box's): the donors' water scale, each pigment's concentration and pigment scale
@compute @workgroup_size(16, 16)
fn lv_s1(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let count = LVX[1];
  for (var j = wid.x; j < count; j += nw.x) {
    let c = lvCellOf(LVX[lvLT() + j], lid); if (c.z == 0u) { continue; }
    let i = c.y * u.w + c.x; if (!lvLevel(i)) { continue; }
    let B = lvBX(lvBoxOf(i)); let subs = LVX[B + 15u];
    if (LVX[B + 14u] == 0u || LVROUND >= subs) { continue; }
    let wk = W[i]; let out = lvPos(lvOut(i, c.x, c.y)) / f32(subs);
    let scale = select(1.0, (0.95 * wk) / out, out > 0.95 * wk);
    LVF[i].z = scale;
    for (var ka = 0u; ka < ${count}; ka++) {
      let q = ${channel}(ka) * u.n + i; let g = G[q];
      let conc = select(0.0, g / wk, wk > 1e-12); let pout = out * scale * conc;
      o4set(q, vec4<f32>(conc, select(1.0, (0.95 * g) / pout, pout > 0.95 * g), 0.0, 0.0));
    }
  }
}
@compute @workgroup_size(16, 16)
fn lv_s2(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let count = LVX[1];
  for (var j = wid.x; j < count; j += nw.x) {
    let c = lvCellOf(LVX[lvLT() + j], lid); if (c.z == 0u) { continue; }
    let i = c.y * u.w + c.x; if (!lvLevel(i)) { continue; }
    let B = lvBX(lvBoxOf(i)); let subs = LVX[B + 15u];
    if (LVX[B + 14u] == 0u || LVROUND >= subs) { continue; }
    // each face's water out of the cell this substep (signed), from its donor's scale
    let o = lvOut(i, c.x, c.y) / f32(subs);
    var a = vec4<f32>(0.0); var donor = vec4<u32>(i);
    var dW = 0.0;
    for (var e = 0u; e < 4u; e++) {
      let f = o[e]; if (f == 0.0) { continue; }
      let k = lvNb(i, e); donor[e] = select(k, i, f > 0.0);
      a[e] = f * LVF[donor[e]].z; dW -= a[e];
    }
    for (var ka = 0u; ka < ${count}; ka++) {
      let base = ${channel}(ka) * u.n; var dG = 0.0;
      for (var e = 0u; e < 4u; e++) { if (a[e] != 0.0) { let s = o4get(base + donor[e]); dG -= a[e] * s.x * s.y; } }
      if (dG != 0.0) { G[base + i] = max(0.0, G[base + i] + dG); }
    }
    if (dW != 0.0) { W[i] = max(0.0, W[i] + dW); }
  }
}
`.replaceAll('klAt(', `${channel}(`).replaceAll('u.nAct', count);
