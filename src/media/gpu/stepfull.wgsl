// Fixed pigment remains part of the support that loose grains roll over.
// Specialised once per sheet by GpuSheet; older layers live in DEP's third plane, liftable top stays in TOP.
const FIXED_BED: bool = false;
// A whole stepBox (sheet.mjs) as gathers on 16x16 tiles: edge distance, drying and absorption, flow with pigment
// transport, pigment exchange, slide, capillary spread, wet fronts. The JS driver prepends `struct U` and the
// uniform binding (see stepfull.mjs). Tiles that hold or border water are listed each step (tiles_*), the other kernels
// run on that list by indirect dispatch, so a small wet passage costs a small dispatch. marangoni and slope are 0.
//
// Reads of a neighbour's scratch (flux, budget) are guarded by the neighbour's wet mask: scratch outside the active
// tiles is stale, and a face only exists between two wet cells.

@group(0) @binding(1) var<storage, read_write> M: array<u32>;
@group(0) @binding(2) var<storage, read_write> EVER: array<u32>;
@group(0) @binding(3) var<storage, read> RESIST: array<u32>;
@group(0) @binding(4) var<storage, read_write> W: array<f32>;
@group(0) @binding(5) var<storage, read_write> S: array<f32>;
@group(0) @binding(6) var<storage, read_write> S2: array<f32>;
@group(0) @binding(8) var<storage, read> PAPER: array<vec4<f32>>;   // capacity, grain, fdx, fdy
@group(0) @binding(9) var<storage, read> PAPER2: array<vec4<f32>>;  // perm +x, perm +y, unused, unused
@group(0) @binding(10) var<storage, read> PAPER3: array<vec4<f32>>; // tooth, throat, valley-or-height, height
@group(0) @binding(11) var<storage, read_write> EA: array<f32>;
@group(0) @binding(12) var<storage, read_write> EB: array<f32>;
@group(0) @binding(13) var<storage, read_write> G: array<f32>;
@group(0) @binding(14) var<storage, read_write> P: array<f32>;
@group(0) @binding(15) var<storage, read_write> D: array<f32>;
@group(0) @binding(16) var<storage, read_write> TOP: array<f32>;
@group(0) @binding(17) var<storage, read_write> FX: array<f32>;
@group(0) @binding(18) var<storage, read_write> FY: array<f32>;
@group(0) @binding(19) var<storage, read_write> WSC: array<f32>;
@group(0) @binding(20) var<storage, read_write> WENT: array<f32>;
@group(0) @binding(21) var<storage, read_write> QX: array<f32>;
@group(0) @binding(22) var<storage, read_write> QY: array<f32>;
@group(0) @binding(23) var<storage, read_write> SC: array<f32>;
@group(0) @binding(24) var<storage, read_write> DEP: array<f32>;
@group(0) @binding(25) var<storage, read_write> OUTM: array<f32>;
@group(0) @binding(26) var<storage, read_write> OUT4: array<vec4<f32>>;
// OUT4 split across two bindings when K*n*16 bytes exceed the device binding limit. Cells [0, OUT4_CUT)
// of the plane-major array live in OUT4, the rest in OUT4B. Unsplit, OUT4_CUT is the u32 maximum and OUT4B is a 16-byte stub.
@group(0) @binding(44) var<storage, read_write> OUT4B: array<vec4<f32>>;
const OUT4_CUT: u32 = 4294967295u;
fn o4get(q: u32) -> vec4<f32> { if (q < OUT4_CUT) { return OUT4[q]; } return OUT4B[q - OUT4_CUT]; }
fn o4set(q: u32, v: vec4<f32>) { if (q < OUT4_CUT) { OUT4[q] = v; } else { OUT4B[q - OUT4_CUT] = v; } }
@group(0) @binding(27) var<storage, read_write> PN: array<f32>;
@group(0) @binding(28) var<storage, read_write> DD: array<f32>;
@group(0) @binding(29) var<storage, read_write> NEWF: array<u32>;
@group(0) @binding(30) var<storage, read_write> TL: array<u32>;
@group(0) @binding(31) var<storage, read_write> FLAGS: array<atomic<u32>>;
@group(0) @binding(32) var<storage, read_write> FLAGS2: array<atomic<u32>>;
@group(0) @binding(33) var<storage, read_write> CTR: array<atomic<u32>, 16>;
@group(0) @binding(34) var<storage, read_write> ARGS: array<u32, 12>;
@group(0) @binding(35) var<storage, read_write> EDGE: array<f32>;  // the final edge distance: bound to whichever of EA, EB the last pass wrote

// The pigments a step works on: the ones that may hold mass anywhere (see link.mjs pigment mask). A pigment with none takes
// no part in a step (every term it would add is zero), so the per-pigment kernels are dispatched for these alone and
// `klAt(a)` is the a-th of them; u.nAct counts them. Kernels that loop over pigments loop over the same list.
fn klAt(a: u32) -> u32 { return u.kl[a >> 2u][a & 3u]; }
struct Cx { i: u32, x: u32, y: u32, z: u32, ok: bool }
fn cx(wid: vec3<u32>, lid: vec3<u32>) -> Cx {
  if (wid.x >= TL[u.ntiles]) { return Cx(0u, 0u, 0u, 0u, false); }   // direct dispatches are sized above the tile count
  let t = TL[wid.x];
  let x = (t % u.tw) * 16u + lid.x; let y = (t / u.tw) * 16u + lid.y;
  return Cx(y * u.w + x, x, y, klAt(wid.y), x < u.w && y < u.h);
}
fn wetAt(i: u32) -> bool { return M[i] == 1u; }

// Sparse frontier: FLAGS2 holds membership, a compact tile queue, then its count.
// Stamps and wetscan enqueue a tile once; only that queue and its one-tile halo are visited.
fn markDirty(t: u32) {
  if (u.p3 != 0u && atomicExchange(&FLAGS2[2u * u.ntiles + 1u + t], 1u) == 0u) {
    let q = atomicAdd(&FLAGS2[5u * u.ntiles + 1u], 1u);
    atomicStore(&FLAGS2[3u * u.ntiles + 1u + q], t);
  }
}
fn markWet(t: u32) {
  markDirty(t);
  if (atomicExchange(&FLAGS2[t], 1u) == 0u && u.p3 != 0u) {
    let q = atomicAdd(&FLAGS2[2u * u.ntiles], 1u);
    atomicStore(&FLAGS2[u.ntiles + q], t);
  }
}
@compute @workgroup_size(1)
fn sparse_start() {
  atomicStore(&CTR[0], 0u); atomicStore(&CTR[1], 0u); atomicStore(&CTR[6], 0u); atomicStore(&CTR[7], 0u);
  ARGS[6] = (atomicLoad(&FLAGS2[2u * u.ntiles]) + 63u) / 64u;
  ARGS[7] = 1u; ARGS[8] = 1u;
}
@compute @workgroup_size(64)
fn sparse_build(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= atomicLoad(&FLAGS2[2u * u.ntiles])) { return; }
  let t = atomicLoad(&FLAGS2[u.ntiles + g.x]);
  atomicStore(&FLAGS2[t], 0u);
  let tx = i32(t % u.tw); let ty = i32(t / u.tw);
  for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) {
    let x = tx + dx; let y = ty + dy;
    if (x < 0 || y < 0 || x >= i32(u.tw) || y >= i32(u.th)) { continue; }
    let a = u32(y) * u.tw + u32(x);
    markDirty(a);
    if (atomicExchange(&FLAGS[a], 1u) == 0u) { TL[atomicAdd(&CTR[0], 1u)] = a; }
  } }
}

// sparse_start, sparse_build and tiles_args in one workgroup (one dispatch a step instead of three)
var<workgroup> saCount: u32;
@compute @workgroup_size(256)
fn sparse_all(@builtin(local_invocation_index) li: u32) {
  if (li == 0u) {
    atomicStore(&CTR[0], 0u); atomicStore(&CTR[1], 0u); atomicStore(&CTR[6], 0u); atomicStore(&CTR[7], 0u);
    let q = atomicLoad(&FLAGS2[2u * u.ntiles]);
    ARGS[6] = (q + 63u) / 64u; ARGS[7] = 1u; ARGS[8] = 1u;
    saCount = q;
  }
  storageBarrier();
  let count = workgroupUniformLoad(&saCount);
  for (var g = li; g < count; g += 256u) {
    let t = atomicLoad(&FLAGS2[u.ntiles + g]);
    atomicStore(&FLAGS2[t], 0u);
    let tx = i32(t % u.tw); let ty = i32(t / u.tw);
    for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) {
      let x = tx + dx; let y = ty + dy;
      if (x < 0 || y < 0 || x >= i32(u.tw) || y >= i32(u.th)) { continue; }
      let a = u32(y) * u.tw + u32(x);
      markDirty(a);
      if (atomicExchange(&FLAGS[a], 1u) == 0u) { TL[atomicAdd(&CTR[0], 1u)] = a; }
    } }
  }
  storageBarrier(); workgroupBarrier();
  if (li == 0u) {
    let c = atomicLoad(&CTR[0]);
    TL[u.ntiles] = c;
    if (u.p3 == 0u && c > u.cap) { atomicMax(&CTR[4], c); }
    ARGS[0] = c; ARGS[1] = 1u; ARGS[2] = 1u; atomicAdd(&CTR[8], c); atomicAdd(&CTR[10], 1u);
    if (u.p3 != 0u) { atomicStore(&FLAGS2[2u * u.ntiles], 0u); }
    ARGS[3] = c; ARGS[4] = u.nAct; ARGS[5] = 1u;
  }
}

// ---- tile list -----------------------------------------------------------------------------------------------
@compute @workgroup_size(64)
fn tiles_prep(@builtin(global_invocation_id) g: vec3<u32>) {
  let t = g.x;
  if (t == 0u) { atomicStore(&CTR[0], 0u); atomicStore(&CTR[1], 0u); atomicStore(&CTR[6], 0u); atomicStore(&CTR[7], 0u); }
  if (t < u.ntiles) { atomicStore(&FLAGS[t], atomicLoad(&FLAGS2[t])); atomicStore(&FLAGS2[t], 0u); }
}
@compute @workgroup_size(64)
fn tiles_build(@builtin(global_invocation_id) g: vec3<u32>) {
  let t = g.x; if (t >= u.ntiles) { return; }
  let tx = i32(t % u.tw); let ty = i32(t / u.tw);
  var on = false;
  for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) {
    let xx = tx + dx; let yy = ty + dy;
    if (xx < 0 || yy < 0 || xx >= i32(u.tw) || yy >= i32(u.th)) { continue; }
    if (atomicLoad(&FLAGS[u32(yy) * u.tw + u32(xx)]) != 0u) { on = true; }
  } }
  if (on) { let k = atomicAdd(&CTR[0], 1u); TL[k] = t; }
}
@compute @workgroup_size(1)
fn tiles_args() {
  let c = atomicLoad(&CTR[0]);
  TL[u.ntiles] = c;
  if (u.p3 == 0u && c > u.cap) { atomicMax(&CTR[4], c); }   // the host dispatched fewer workgroups than there were tiles: the step is wrong
  ARGS[0] = c; ARGS[1] = 1u; ARGS[2] = 1u; atomicAdd(&CTR[8], c); atomicAdd(&CTR[10], 1u);
  if (u.p3 != 0u) { atomicStore(&FLAGS2[2u * u.ntiles], 0u); }
  ARGS[3] = c; ARGS[4] = u.nAct; ARGS[5] = 1u;
}
var<workgroup> anyWet: atomic<u32>;
fn wetscan_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid);
  if (lid.x == 0u && lid.y == 0u) { atomicStore(&anyWet, 0u); }
  workgroupBarrier();
  if (c.ok) { atomicMax(&CTR[7], bitcast<u32>(W[c.i])); }
  if (c.ok && (M[c.i] == 1u || S[c.i] > 0.02 * PAPER[c.i].x)) { atomicOr(&anyWet, select(1u, 3u, M[c.i] == 1u)); }
  workgroupBarrier();
  if (lid.x == 0u && lid.y == 0u && wid.x < TL[u.ntiles]) {
    let t = TL[wid.x];
    if (u.p3 != 0u) { atomicStore(&FLAGS[t], 0u); }
    let seen = atomicLoad(&anyWet);
    if (seen != 0u) { markWet(t); atomicAdd(&CTR[1], 1u); }
    if ((seen & 2u) != 0u) { atomicAdd(&CTR[6], 1u); atomicAdd(&CTR[9], 1u); }
    if (seen != 0u) { atomicAdd(&CTR[11], 1u); }
  }
}

// Edge distance
fn edgeAt(j: u32, prev: u32) -> f32 {   // prev: 0 = first pass (nothing computed yet), 1 = read EA, 2 = read EB
  if (M[j] == 1u) { if (prev == 0u) { return u.capE; } if (prev == 1u) { return EA[j]; } return EB[j]; }
  return select(0.0, u.capE, EVER[j] == 1u);
}
fn edgeNew(c: Cx, prev: u32) -> f32 {
  var e = u.capE;
  if (prev != 0u) { if (prev == 1u) { e = EA[c.i]; } else { e = EB[c.i]; } }
  e = min(e, select(0.0, edgeAt(c.i - 1u, prev), c.x > 0u) + 1.0);
  e = min(e, select(0.0, edgeAt(c.i - u.w, prev), c.y > 0u) + 1.0);
  e = min(e, select(0.0, edgeAt(c.i + 1u, prev), c.x < u.w - 1u) + 1.0);
  e = min(e, select(0.0, edgeAt(c.i + u.w, prev), c.y < u.h - 1u) + 1.0);
  return e;
}
fn edge_first_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  EB[c.i] = edgeNew(c, 0u);
}
fn edge_a2b_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  EB[c.i] = edgeNew(c, 1u);
}
fn edge_b2a_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  EA[c.i] = edgeNew(c, 2u);
}
// The chain is first -> EB, then b2a -> EA, a2b -> EB, ... ; `EDGE` names whichever holds the last result

// 1. drying and absorption
fn phase1_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  let i = c.i;
  let e = EDGE[i];
  let near = select(0.0, 1.0 - (e - 1.0) / u.edgeWidth, e <= u.edgeWidth);
  let wv = max(0.0, W[i] - u.dt * (u.evap + u.edgeEvap * near));
  let a = min(min(u.dt * u.absorb, max(0.0, PAPER[i].x - S[i])), max(0.0, wv - u.film));
  var wn = wv;
  if (a > 0.0) {
    let aw = a / wv;
    for (var ka = 0u; ka < u.nAct; ka++) {
      let k = klAt(ka); let q = k * u.n + i;
      let gg = G[q] * aw * pigB(k).w;
      G[q] = G[q] - gg; P[q] = P[q] + gg;
    }
    wn = wv - a;
  }
  S[i] = S[i] + a; W[i] = wn;
}

// 2. flow
fn faces_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i;
  var fx = 0.0; var fy = 0.0;
  if (M[i] == 1u) {
    let wi = W[i];
    if (c.x < u.w - 1u && M[i + 1u] == 1u) {
      let wj = W[i + 1u];
      let p = 1.0 - u.ff + u.ff * (0.25 + 1.75 * PAPER2[i].x);
      let m = max(wi, wj) / u.flowDepth;
      let rate = min(0.25, max(0.0, p * u.flow * select(m * m, 1.0, m >= 1.0)));
      fx = rate * (wi - wj);
    }
    if (c.y < u.h - 1u && M[i + u.w] == 1u) {
      let wj = W[i + u.w];
      let p = 1.0 - u.ff + u.ff * (0.25 + 1.75 * PAPER2[i].y);
      let m = max(wi, wj) / u.flowDepth;
      let rate = min(0.25, max(0.0, p * u.flow * select(m * m, 1.0, m >= 1.0)));
      fy = rate * (wi - wj);
    }
  }
  FX[i] = fx; FY[i] = fy;
}
fn wsc_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i;
  if (M[i] != 1u) { WSC[i] = 1.0; return; }
  var o = max(FX[i], 0.0) + max(FY[i], 0.0);
  if (c.x > 0u && M[i - 1u] == 1u) { o += max(-FX[i - 1u], 0.0); }
  if (c.y > 0u && M[i - u.w] == 1u) { o += max(-FY[i - u.w], 0.0); }
  let lim = W[i] * 0.95;
  WSC[i] = select(1.0, lim / o, o > lim);
}
fn pflux(f: f32, wi: f32, wj: f32, gi: f32, gj: f32, si: f32, sj: f32) -> f32 {
  let sgn = select(select(0.0, -1.0, f < 0.0), 1.0, f > 0.0);
  let amt = abs(f) * select(sj, si, f > 0.0);
  let mw = min(wi, wj);
  let mi = wi / u.cd; let mj = wj / u.cd;
  let carryI = select(mi * mi, 1.0, mi >= 1.0); let carryJ = select(mj * mj, 1.0, mj >= 1.0);
  let carryM = min(carryI, carryJ);
  let ci = select(0.0, gi / wi, wi > 1e-6); let cj = select(0.0, gj / wj, wj > 1e-6);
  // paint mixes out into a standing film (sheet.mjs filmDiffuse)
  var fd = 0.0; if (u.filmDiff > 0.0) { fd = min(0.2, u.filmDiff * min(1.0, mw / u.filmDepth)); }
  return sgn * amt * select(cj * carryJ, ci * carryI, f > 0.0) + (u.diffuse * carryM + fd) * (ci - cj) * mw;
}
fn pflux_k_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i; let base = c.z * u.n;
  var qx = 0.0; var qy = 0.0;
  if (M[i] == 1u) {
    let wi = W[i]; let gi = G[base + i];
    if (c.x < u.w - 1u && M[i + 1u] == 1u) { let j = i + 1u; qx = pflux(FX[i], wi, W[j], gi, G[base + j], WSC[i], WSC[j]); }
    if (c.y < u.h - 1u && M[i + u.w] == 1u) { let j = i + u.w; qy = pflux(FY[i], wi, W[j], gi, G[base + j], WSC[i], WSC[j]); }
  }
  QX[base + i] = qx; QY[base + i] = qy;
}
fn ppout_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i; let base = c.z * u.n;
  if (M[i] != 1u) { SC[base + i] = 1.0; return; }
  var o = max(QX[base + i], 0.0) + max(QY[base + i], 0.0);
  if (c.x > 0u && M[i - 1u] == 1u) { o += max(-QX[base + i - 1u], 0.0); }
  if (c.y > 0u && M[i - u.w] == 1u) { o += max(-QY[base + i - u.w], 0.0); }
  let lim = G[base + i] * 0.95;
  SC[base + i] = select(1.0, lim / o, o > lim);
}
fn apply_water(c: Cx, first: bool) {
  let i = c.i;
  if (M[i] != 1u) { return; }
  var dw = 0.0; var v = 0.0;
  var f = FX[i];
  if (f != 0.0) { dw -= select(-1.0, 1.0, f > 0.0) * abs(f) * select(WSC[i + 1u], WSC[i], f > 0.0); v += abs(f); }
  f = FY[i];
  if (f != 0.0) { dw -= select(-1.0, 1.0, f > 0.0) * abs(f) * select(WSC[i + u.w], WSC[i], f > 0.0); v += abs(f); }
  if (c.x > 0u && M[i - 1u] == 1u) { f = FX[i - 1u]; if (f != 0.0) { dw += select(-1.0, 1.0, f > 0.0) * abs(f) * select(WSC[i], WSC[i - 1u], f > 0.0); v += abs(f); } }
  if (c.y > 0u && M[i - u.w] == 1u) { f = FY[i - u.w]; if (f != 0.0) { dw += select(-1.0, 1.0, f > 0.0) * abs(f) * select(WSC[i], WSC[i - u.w], f > 0.0); v += abs(f); } }
  W[i] = max(0.0, W[i] + dw);
  WENT[i] = select(WENT[i] + 0.5 * v, 0.5 * v, first);
}
fn apply_w0_tile(wid: vec3<u32>, lid: vec3<u32>) { let c = cx(wid, lid); if (c.ok) { apply_water(c, true); } }
fn apply_w1_tile(wid: vec3<u32>, lid: vec3<u32>) { let c = cx(wid, lid); if (c.ok) { apply_water(c, false); } }
fn apply_g_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  let i = c.i; let base = c.z * u.n;
  var d = 0.0;
  var q = QX[base + i];
  if (q != 0.0) { d -= q * SC[base + select(i + 1u, i, q > 0.0)]; }
  q = QY[base + i];
  if (q != 0.0) { d -= q * SC[base + select(i + u.w, i, q > 0.0)]; }
  if (c.x > 0u && M[i - 1u] == 1u) { q = QX[base + i - 1u]; if (q != 0.0) { d += q * SC[base + select(i, i - 1u, q > 0.0)]; } }
  if (c.y > 0u && M[i - u.w] == 1u) { q = QY[base + i - u.w]; if (q != 0.0) { d += q * SC[base + select(i, i - u.w, q > 0.0)]; } }
  G[base + i] = max(0.0, G[base + i] + d);
}

// 3. pigment exchange
fn p3a_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u || (RESIST[c.i] & 1u) != 0u) { return; }
  let i = c.i; let Wi = W[i]; let hh = PAPER3[i].z;
  let thin = min(3.0, 0.12 / max(0.04, Wi));
  let ld = Wi / u.liftDepth; let wetting = select(ld * ld, 1.0, ld >= 1.0);
  let rewet = u.hasTop != 0u && Wi > u.film;
  let turnover = select(0.0, min(1.0, WENT[i] / Wi), Wi > 1e-6);
  var settled = 0.0;
  if (u.granFill > 0.0) { for (var ka = 0u; ka < u.nAct; ka++) { settled += D[klAt(ka) * u.n + i]; } }
  for (var ka = 0u; ka < u.nAct; ka++) {
    let k = klAt(ka); let q = k * u.n + i;
    var Gk = G[q]; var Dk = D[q]; var top = 0.0;
    if (rewet) { top = TOP[q]; }
    if (Gk == 0.0 && Dk == 0.0 && !(rewet && top != 0.0)) { continue; }
    let pa = pigA(k); let pb = pigB(k);   // pa: gg, liftOf, scourOf, rep;  pb: rho, omega, floc, mobility
    let filled = select(hh, min(1.0, hh + settled * u.granFill), u.granFill > 0.0);
    let gg = pa.x;
    let down = Gk * max(0.0, 1.0 - filled * gg) * pb.x * u.settle * thin * u.dt;
    let shape = max(0.0, 1.0 + (hh - 1.0) * gg);
    let up = Dk * shape * (pa.y * wetting * u.dt + pa.z * turnover * wetting);
    let dn = min(Gk, max(0.0, down)); let uu = min(Dk, max(0.0, up));
    Dk += dn - uu; Gk += uu - dn;
    if (rewet) { let r = min(top, (top * u.rewetLift * u.dt) / pb.y); TOP[q] = top - r; Gk += r; }
    D[q] = Dk; G[q] = Gk;
  }
  var gs = 0.0;
  for (var ka = 0u; ka < u.nAct; ka++) { gs += G[klAt(ka) * u.n + i]; }
  let hold = u.holdCap * Wi;
  if (u.holdOn != 0u && gs > hold) {
    let f = 1.0 - hold / gs;
    for (var ka = 0u; ka < u.nAct; ka++) { let q = klAt(ka) * u.n + i; let q2 = G[q] * f; G[q] -= q2; D[q] += q2; }
  }
}
fn dep_k_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  var d = 0.0; for (var ka = 0u; ka < u.nAct; ka++) { d += D[klAt(ka) * u.n + c.i]; }
  DEP[c.i] = u.slideFill * d;
  if (FIXED_BED) { DEP[u.n + c.i] = computeFixedSupport(c.i); }
}
fn computeFixedSupport(i: u32) -> f32 {
  if (!FIXED_BED) { return 0.0; }
  var d = DEP[2u * u.n + i];
  if (u.hasTop != 0u) { for (var k = 0u; k < u.K; k++) { d += TOP[k * u.n + i]; } }
  return u.slideFill * d;
}
// The deposition pass caches support once per wet cell, after top-layer
// lifting, in DEP's second plane. Repeated neighbor reads keep the same f32 value.
fn fixedSupport(i: u32) -> f32 {
  if (!FIXED_BED) { return 0.0; }
  return DEP[u.n + i];
}
fn surf(j: u32, fl: f32) -> f32 { return (1.0 - fl) * PAPER3[j].w + fl * PAPER3[j].x + DEP[j] + fixedSupport(j); }
fn slide_out_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  let i = c.i; let q = c.z * u.n + i;
  OUTM[q] = 0.0; o4set(q, vec4<f32>(0.0));
  let Wi = W[i]; let Dk = D[q]; let pa = pigA(c.z); let pb = pigB(c.z);
  let gg = pa.x;
  if (Wi <= 0.0 || gg <= 0.0 || Dk <= 0.0) { return; }
  let film = min(3.0, 0.12 / max(0.04, Wi)) * select(Wi / u.film, 1.0, Wi > u.film);
  let here = surf(i, pb.z); let rep = pa.w;
  var ex = vec4<f32>(0.0);
  if (c.x < u.w - 1u && M[i + 1u] == 1u) { ex.x = max(0.0, here - surf(i + 1u, pb.z) - rep); }
  if (c.x > 0u && M[i - 1u] == 1u) { ex.y = max(0.0, here - surf(i - 1u, pb.z) - rep); }
  if (c.y < u.h - 1u && M[i + u.w] == 1u) { ex.z = max(0.0, here - surf(i + u.w, pb.z) - rep); }
  if (c.y > 0u && M[i - u.w] == 1u) { ex.w = max(0.0, here - surf(i - u.w, pb.z) - rep); }
  let sum = ex.x + ex.y + ex.z + ex.w;
  if (sum <= 0.0) { return; }
  var moved = Dk * min(0.2, u.slide * gg * film * sum * u.dt);
  // slideCap (sheet.mjs): no move may close more than slideCap of the slope it rolls down, so grains do not overfill a
  // neighbour and roll back the next step (the checkerboard in granulated washes)
  if (u.slideCap > 0.0 && u.slideFill > 0.0) {
    for (var e = 0u; e < 4u; e++) { if (ex[e] > 0.0) { moved = min(moved, u.slideCap * ex[e] / (u.slideFill * (1.0 + ex[e] / sum))); } }
  }
  OUTM[q] = moved; o4set(q, moved * ex / sum);
}
fn slide_apply_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  let i = c.i; let base = c.z * u.n;
  var d = -OUTM[base + i];
  if (c.x < u.w - 1u && M[i + 1u] == 1u) { d += o4get(base + i + 1u).y; }
  if (c.x > 0u && M[i - 1u] == 1u) { d += o4get(base + i - 1u).x; }
  if (c.y < u.h - 1u && M[i + u.w] == 1u) { d += o4get(base + i + u.w).w; }
  if (c.y > 0u && M[i - u.w] == 1u) { d += o4get(base + i - u.w).z; }
  if (d != 0.0) { D[base + i] = max(0.0, D[base + i] + d); }
}

// 4. capillary spread
// donor a to receiver b in direction dir (0 +x, 1 -x, 2 +y, 3 -y); zero when nothing moves
fn capflux(a: u32, b: u32, dir: u32) -> f32 {
  let pa = PAPER[a]; let sa = S[a];
  if (sa <= u.capEps * pa.x) { return 0.0; }
  let pbb = PAPER[b]; let sb = S[b];
  if (sa <= sb) { return 0.0; }
  let along = select(abs(pa.w) * pa.y, abs(pa.z) * pa.y, dir < 2u);
  let rate = 0.5 + along;
  let open = select((1.0 - u.sizing) * (0.4 + 0.6 * along), 1.0, sb > u.capDelta * pbb.x);
  let ds = (max(0.0, min(sa - sb, pbb.x - sb)) / 4.0) * u.capStep * rate * open;
  return max(ds, 0.0);
}
fn cap_s_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i; var v = S[i];
  if (c.x < u.w - 1u) { v -= capflux(i, i + 1u, 0u); v += capflux(i + 1u, i, 1u); }
  if (c.x > 0u) { v -= capflux(i, i - 1u, 1u); v += capflux(i - 1u, i, 0u); }
  if (c.y < u.h - 1u) { v -= capflux(i, i + u.w, 2u); v += capflux(i + u.w, i, 3u); }
  if (c.y > 0u) { v -= capflux(i, i - u.w, 3u); v += capflux(i - u.w, i, 2u); }
  S2[i] = v;
}
// pigment in the pores moved by the same fluxes; the share the fibres catch goes to the deposit
fn pmove(a: u32, b: u32, dir: u32, base: u32, out: ptr<function, f32>, inn: ptr<function, f32>, dep: ptr<function, f32>, asDonor: bool) {
  let ds = capflux(a, b, dir);
  if (ds <= 0.0) { return; }
  let q = P[base + a] * min(1.0, ds / S[a]);
  if (q == 0.0) { return; }
  if (asDonor) { *out += q; }
  else {
    let catchF = select(u.wickFilter, 0.0, S[b] > u.capDelta * PAPER[b].x);
    *inn += q * (1.0 - catchF); *dep += q * catchF;
  }
}
fn cap_p_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i; let base = c.z * u.n;
  var o = 0.0; var inn = 0.0; var dep = 0.0;
  if (c.x < u.w - 1u) { pmove(i, i + 1u, 0u, base, &o, &inn, &dep, true); pmove(i + 1u, i, 1u, base, &o, &inn, &dep, false); }
  if (c.x > 0u) { pmove(i, i - 1u, 1u, base, &o, &inn, &dep, true); pmove(i - 1u, i, 0u, base, &o, &inn, &dep, false); }
  if (c.y < u.h - 1u) { pmove(i, i + u.w, 2u, base, &o, &inn, &dep, true); pmove(i + u.w, i, 3u, base, &o, &inn, &dep, false); }
  if (c.y > 0u) { pmove(i, i - u.w, 3u, base, &o, &inn, &dep, true); pmove(i - u.w, i, 2u, base, &o, &inn, &dep, false); }
  PN[base + i] = P[base + i] - o + inn; DD[base + i] = dep;
}

// 5. wet fronts
// The CPU leaves a trace of pore water alone outside its wet boxes, which reach two cells past the wet cells; a cell within
// two cells of a wet one (M, or pores over 2% full) is the nearest cheap match.
fn nearWet(x: u32, y: u32) -> bool {
  for (var dy = -2; dy <= 2; dy++) { for (var dx = -2; dx <= 2; dx++) {
    let xx = i32(x) + dx; let yy = i32(y) + dy;
    if (xx < 0 || yy < 0 || xx >= i32(u.w) || yy >= i32(u.h)) { continue; }
    let j = u32(yy) * u.w + u32(xx);
    if (M[j] == 1u || S[j] > 0.02 * PAPER[j].x) { return true; }
  } }
  return false;
}
// nearWet's 5x5 test from a workgroup copy of the tile and its two-cell halo (one load per cell, not 25)
var<workgroup> nwF: array<u32, 400>;
fn nearWetS(lid: vec3<u32>) -> bool {
  for (var dy = 0u; dy < 5u; dy++) { for (var dx = 0u; dx < 5u; dx++) {
    if (nwF[(lid.y + dy) * 20u + lid.x + dx] != 0u) { return true; }
  } }
  return false;
}
fn p5a_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let li = lid.y * 16u + lid.x;
  if (wid.x < TL[u.ntiles]) {
    let t = TL[wid.x]; let x0 = i32((t % u.tw) * 16u) - 2; let y0 = i32((t / u.tw) * 16u) - 2;
    for (var q = li; q < 400u; q += 256u) {
      let gx = x0 + i32(q % 20u); let gy = y0 + i32(q / 20u); var f = 0u;
      if (gx >= 0 && gy >= 0 && gx < i32(u.w) && gy < i32(u.h)) { let j = u32(gy) * u.w + u32(gx); if (M[j] == 1u || S[j] > 0.02 * PAPER[j].x) { f = 1u; } }
      nwF[q] = f;
    }
  }
  workgroupBarrier();
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i;
  if (u.nAct > 0u && DD[klAt(0u) * u.n + i] >= 0.0) {   // below zero: cap_sp moved nothing here (PN = P, DD = 0)
    for (var ka = 0u; ka < u.nAct; ka++) { let q = klAt(ka) * u.n + i; P[q] = max(0.0, PN[q]); D[q] += DD[q]; }
  }
  var s = max(0.0, S2[i]);
  if (W[i] <= u.wetEps && s > 0.0 && (M[i] == 1u || nearWetS(lid))) {
    var d = min(s, u.dt * u.paperDry);
    if (s - d <= 0.02 * PAPER[i].x) { d = s; }
    let f = d / s; s -= d;
    for (var ka = 0u; ka < u.nAct; ka++) { let q = klAt(ka) * u.n + i; let qq = P[q] * f; P[q] -= qq; D[q] += qq; }
  }
  S2[i] = s;
}
// the value a raster-order walk sees for cell j when it is at cell i: cells before i are final, cells after are not
fn sSeen(j: u32, i: u32) -> f32 { return select(S[j], S2[j], j < i); }
// water (M) within R cells of (x, y) in each of the four directions (sheet.mjs heldHole with ever = M)
fn heldHole(x: u32, y: u32, R: u32) -> bool {
  for (var d = 0u; d < 4u; d++) {
    var held = false;
    for (var k = 1u; k <= R; k++) {
      var xx = i32(x); var yy = i32(y);
      if (d == 0u) { xx += i32(k); } else if (d == 1u) { xx -= i32(k); } else if (d == 2u) { yy += i32(k); } else { yy -= i32(k); }
      if (xx < 0 || yy < 0 || xx >= i32(u.w) || yy >= i32(u.h)) { break; }
      if (M[u32(yy) * u.w + u32(xx)] != 0u) { held = true; break; }
    }
    if (!held) { return false; }
  }
  return true;
}
fn p5b_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i; NEWF[i] = 0u;
  let pi = PAPER[i]; let si = S2[i];
  var nb = array<u32, 4>(0u, 0u, 0u, 0u); var nbOk = array<bool, 4>(false, false, false, false);
  if (c.x < u.w - 1u) { nb[0] = i + 1u; nbOk[0] = true; }
  if (c.x > 0u) { nb[1] = i - 1u; nbOk[1] = true; }
  if (c.y < u.h - 1u) { nb[2] = i + u.w; nbOk[2] = true; }
  if (c.y > 0u) { nb[3] = i - u.w; nbOk[3] = true; }
  if (M[i] == 0u) {
    var feeding = false; var wn = 0.0; var ws = 0.0; var hn = 0.0; var fed = false;
    // encloseEase (sheet.mjs): a dry cell held by water on more sides fills more easily, need x (1 - e (sides - 1) / 3)
    var sides = 0.0;
    for (var d = 0u; d < 4u; d++) { if (nbOk[d] && M[nb[d]] != 0u) { sides += 1.0; } }
    let ease = select(1.0, max(0.0, 1.0 - u.enclose * (sides - 1.0) / 3.0), u.enclose > 0.0);
    for (var d = 0u; d < 4u; d++) {
      if (!nbOk[d]) { continue; }
      let j = nb[d]; if (M[j] == 0u) { continue; }
      wn += 1.0; ws += W[j]; hn += PAPER3[j].z; if (W[j] > u.film) { feeding = true; }
      // a wet neighbour's front reaching this cell
      if (W[j] > u.wetEps) {
        let jx = i32(c.x); let jy = i32(c.y);
        let ix = i32(j % u.w); let iy = i32(j / u.w);
        let damp = select(0.0, min(1.0, sSeen(i, j) / (u.capSigma * pi.x)), EVER[i] == 1u);
        let aligned = abs(pi.z * f32(jx - ix) + pi.w * f32(jy - iy)) * pi.y;
        let throat = PAPER3[i].y;
        let need = (u.spill + u.spillHeight * PAPER3[i].z) * (1.0 - u.dampEase * damp) * exp(damp * (u.pinning * 2.0 * throat - u.pinFibre * aligned)) * ease;
        if (W[j] > need) { fed = true; }
      }
    }
    var newly = fed;
    if (feeding && EVER[i] == 1u && si > u.capSigma * pi.x) { newly = true; }
    else if (wn >= 4.0 && ws / wn > u.film) { newly = true; }
    // holeFill (sheet.mjs): a dry hollow the standing wash surrounds (water within holeFill cells on all four sides)
    // fills where it is lower than the wet paper beside it
    else if (u.holeFill > 0.0 && wn > 0.0 && ws / wn > u.film && PAPER3[i].z < hn / wn && heldHole(c.x, c.y, u32(u.holeFill))) { newly = true; }
    if (newly) { NEWF[i] = 1u; }
    return;
  }
  // wet cell: dries out when thin all round
  if (W[i] <= u.wetEps && si < u.capSigma * pi.x) {
    var thinAround = true;
    for (var d = 0u; d < 4u; d++) { if (nbOk[d] && M[nb[d]] == 1u && W[nb[d]] > 3.0 * u.wetEps) { thinAround = false; } }
    if (thinAround && W[i] == 0.0) { NEWF[i] = 2u; }
  }
}
fn p5c_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i; let f = NEWF[i];
  S[i] = S2[i];
  if (f == 1u) { M[i] = 1u; EVER[i] = 1u; }
  if (f == 2u) {
    for (var ka = 0u; ka < u.nAct; ka++) { let q = klAt(ka) * u.n + i; D[q] += G[q]; G[q] = 0.0; }
    M[i] = 0u;
  }
  NEWF[i] = 0u;
}

// The step in fewer passes (stepfull.mjs stepsInPass)
// The same arithmetic as the kernels above, in 18 dispatches a step instead of 29: the edge passes and phase 1 in one (the
// edge distance worked out in workgroup memory over the tile and a halo), faces with their scale, each pigment's flux with
// its scale, water and pigment applied together, the deposit sum with the exchange, the capillary spread of water and of
// pigment together (each face's flux worked out once, not once per pigment). Per-pigment kernels loop over the pigments
// in the thread instead of a dispatch row per pigment, so what a cell reads of the water and the paper is read once.
@group(0) @binding(41) var<storage, read_write> FXY: array<vec2<f32>>;   // the faces' water flux, +x and +y
@group(0) @binding(42) var<storage, read_write> QXY: array<vec2<f32>>;   // each pigment's flux over the faces

const EMAX = 30u;   // the edge region's side: a 16-cell tile and a halo of edgeWidth + 1 up to 7
var<workgroup> eCur: array<f32, 900>;
var<workgroup> eNxt: array<f32, 900>;
var<workgroup> eWet: array<u32, 900>;
var<workgroup> eCount: u32;
var<workgroup> eAnyWet: atomic<u32>;
var<workgroup> eAny: u32;
fn edge_phase1_tile(wid: vec3<u32>, lid: vec3<u32>, li: u32) {
  // a workgroup past the tile list leaves at once (direct dispatches are sized above the count), all its threads together
  if (li == 0u) { eCount = TL[u.ntiles]; atomicStore(&eAnyWet, 0u); }
  if (wid.x >= workgroupUniformLoad(&eCount)) { return; }
  let c = cx(wid, lid);
  // a tile with no wet cell has nothing to dry or absorb here (pores only): leave before loading the region
  if (c.ok && M[c.i] == 1u) { atomicOr(&eAnyWet, 1u); }
  workgroupBarrier();
  if (li == 0u) { eAny = atomicLoad(&eAnyWet); }
  if (workgroupUniformLoad(&eAny) == 0u) { return; }
  let t = TL[wid.x];
  let NP = u32(u.capE); let R = 16u + 2u * NP;
  let x0 = i32((t % u.tw) * 16u) - i32(NP); let y0 = i32((t / u.tw) * 16u) - i32(NP);
  // edgeAt(j, 0) for every cell of the region: a wet cell or one the wash has reached reads capE, dry paper 0, off the sheet 0
  for (var q = li; q < R * R; q += 256u) {
    let gx = x0 + i32(q % R); let gy = y0 + i32(q / R);
    var v = 0.0; var wet = 0u;
    if (gx >= 0 && gy >= 0 && gx < i32(u.w) && gy < i32(u.h)) {
      let j = u32(gy) * u.w + u32(gx);
      wet = select(0u, 1u, M[j] == 1u);
      v = select(0.0, u.capE, M[j] == 1u || EVER[j] == 1u);
    }
    eCur[q] = v; eWet[q] = wet;
  }
  workgroupBarrier();
  // edgeWidth + 1 passes of edgeNew; a wet cell takes the least of its own and its neighbours' last values plus one
  for (var p = 0u; p < NP; p++) {
    for (var q = li; q < R * R; q += 256u) {
      let rx = q % R; let ry = q / R;
      var e = eCur[q];
      if (eWet[q] == 1u && rx > 0u && ry > 0u && rx < R - 1u && ry < R - 1u) {
        e = min(e, eCur[q - 1u] + 1.0);
        e = min(e, eCur[q - R] + 1.0);
        e = min(e, eCur[q + 1u] + 1.0);
        e = min(e, eCur[q + R] + 1.0);
      }
      eNxt[q] = e;
    }
    workgroupBarrier();
    for (var q = li; q < R * R; q += 256u) { eCur[q] = eNxt[q]; }
    workgroupBarrier();
  }
  if (!c.ok || M[c.i] != 1u) { return; }
  // phase 1: drying and absorption
  let i = c.i;
  let e = eCur[(lid.y + NP) * R + lid.x + NP];
  let near = select(0.0, 1.0 - (e - 1.0) / u.edgeWidth, e <= u.edgeWidth);
  let wv = max(0.0, W[i] - u.dt * (u.evap + u.edgeEvap * near));
  let a = min(min(u.dt * u.absorb, max(0.0, PAPER[i].x - S[i])), max(0.0, wv - u.film));
  var wn = wv;
  if (a > 0.0) {
    let aw = a / wv;
    for (var ka = 0u; ka < u.nAct; ka++) {
      let k = klAt(ka); let q = k * u.n + i;
      let gg = G[q] * aw * pigB(k).w;
      G[q] = G[q] - gg; P[q] = P[q] + gg;
    }
    wn = wv - a;
  }
  S[i] = S[i] + a; W[i] = wn;
}

// the flux over the +x face of cell a (to a + 1) and the +y face (to a + w), as `faces` works them out
fn faceX(a: u32) -> f32 {
  let wi = W[a]; let wj = W[a + 1u];
  let p = 1.0 - u.ff + u.ff * (0.25 + 1.75 * PAPER2[a].x);
  let m = max(wi, wj) / u.flowDepth;
  let rate = min(0.25, max(0.0, p * u.flow * select(m * m, 1.0, m >= 1.0)));
  return rate * (wi - wj);
}
fn faceY(a: u32) -> f32 {
  let wi = W[a]; let wj = W[a + u.w];
  let p = 1.0 - u.ff + u.ff * (0.25 + 1.75 * PAPER2[a].y);
  let m = max(wi, wj) / u.flowDepth;
  let rate = min(0.25, max(0.0, p * u.flow * select(m * m, 1.0, m >= 1.0)));
  return rate * (wi - wj);
}
fn faces_wsc_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i;
  if (M[i] != 1u) { return; }   // never read: every reader of FXY and WSC checks M on both sides first
  var fx = 0.0; var fy = 0.0;
  if (c.x < u.w - 1u && M[i + 1u] == 1u) { fx = faceX(i); }
  if (c.y < u.h - 1u && M[i + u.w] == 1u) { fy = faceY(i); }
  FXY[i] = vec2<f32>(fx, fy);
  var o = max(fx, 0.0) + max(fy, 0.0);
  if (c.x > 0u && M[i - 1u] == 1u) { o += max(-faceX(i - 1u), 0.0); }
  if (c.y > 0u && M[i - u.w] == 1u) { o += max(-faceY(i - u.w), 0.0); }
  let lim = W[i] * 0.95;
  WSC[i] = select(1.0, lim / o, o > lim);
}
fn pflux_sc_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i;
  if (M[i] != 1u) { return; }   // never read: apply_both reads QXY and SC only across faces between two wet cells
  let wi = W[i]; let si = WSC[i]; let f = FXY[i];
  let okR = c.x < u.w - 1u && M[i + 1u] == 1u; let okD = c.y < u.h - 1u && M[i + u.w] == 1u;
  let okL = c.x > 0u && M[i - 1u] == 1u; let okU = c.y > 0u && M[i - u.w] == 1u;
  var wR = 0.0; var sR = 0.0; var wD = 0.0; var sD = 0.0; var wL = 0.0; var sL = 0.0; var fL = 0.0; var wU = 0.0; var sU = 0.0; var fU = 0.0;
  if (okR) { wR = W[i + 1u]; sR = WSC[i + 1u]; }
  if (okD) { wD = W[i + u.w]; sD = WSC[i + u.w]; }
  if (okL) { wL = W[i - 1u]; sL = WSC[i - 1u]; fL = FXY[i - 1u].x; }
  if (okU) { wU = W[i - u.w]; sU = WSC[i - u.w]; fU = FXY[i - u.w].y; }
  for (var ka = 0u; ka < u.nAct; ka++) {
    let base = klAt(ka) * u.n; let gi = G[base + i];
    var qx = 0.0; var qy = 0.0;
    if (okR) { qx = pflux(f.x, wi, wR, gi, G[base + i + 1u], si, sR); }
    if (okD) { qy = pflux(f.y, wi, wD, gi, G[base + i + u.w], si, sD); }
    QXY[base + i] = vec2<f32>(qx, qy);
    var o = max(qx, 0.0) + max(qy, 0.0);
    if (okL) { o += max(-pflux(fL, wL, wi, G[base + i - 1u], gi, sL, si), 0.0); }
    if (okU) { o += max(-pflux(fU, wU, wi, G[base + i - u.w], gi, sU, si), 0.0); }
    let lim = gi * 0.95;
    SC[base + i] = select(1.0, lim / o, o > lim);
  }
}
fn apply_both(c: Cx, first: bool) {
  let i = c.i;
  if (M[i] != 1u) { return; }
  // water (apply_water)
  var dw = 0.0; var v = 0.0;
  let fo = FXY[i];
  var f = fo.x;
  if (f != 0.0) { dw -= select(-1.0, 1.0, f > 0.0) * abs(f) * select(WSC[i + 1u], WSC[i], f > 0.0); v += abs(f); }
  f = fo.y;
  if (f != 0.0) { dw -= select(-1.0, 1.0, f > 0.0) * abs(f) * select(WSC[i + u.w], WSC[i], f > 0.0); v += abs(f); }
  let okL = c.x > 0u && M[i - 1u] == 1u; let okU = c.y > 0u && M[i - u.w] == 1u;
  if (okL) { f = FXY[i - 1u].x; if (f != 0.0) { dw += select(-1.0, 1.0, f > 0.0) * abs(f) * select(WSC[i], WSC[i - 1u], f > 0.0); v += abs(f); } }
  if (okU) { f = FXY[i - u.w].y; if (f != 0.0) { dw += select(-1.0, 1.0, f > 0.0) * abs(f) * select(WSC[i], WSC[i - u.w], f > 0.0); v += abs(f); } }
  W[i] = max(0.0, W[i] + dw);
  WENT[i] = select(WENT[i] + 0.5 * v, 0.5 * v, first);
  // each pigment (apply_g)
  for (var ka = 0u; ka < u.nAct; ka++) {
    let base = klAt(ka) * u.n;
    var d = 0.0;
    let qo = QXY[base + i];
    var q = qo.x;
    if (q != 0.0) { d -= q * SC[base + select(i + 1u, i, q > 0.0)]; }
    q = qo.y;
    if (q != 0.0) { d -= q * SC[base + select(i + u.w, i, q > 0.0)]; }
    if (okL) { q = QXY[base + i - 1u].x; if (q != 0.0) { d += q * SC[base + select(i, i - 1u, q > 0.0)]; } }
    if (okU) { q = QXY[base + i - u.w].y; if (q != 0.0) { d += q * SC[base + select(i, i - u.w, q > 0.0)]; } }
    G[base + i] = max(0.0, G[base + i] + d);
  }
}
fn apply_f0_tile(wid: vec3<u32>, lid: vec3<u32>) { let c = cx(wid, lid); if (c.ok) { apply_both(c, true); } }
fn apply_f1_tile(wid: vec3<u32>, lid: vec3<u32>) { let c = cx(wid, lid); if (c.ok) { apply_both(c, false); } }

// p3a with dep_k after it (the deposit's sum the slide reads, worked out once the exchange is done)
fn p3a_dep_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  let i = c.i;
  if ((RESIST[i] & 1u) == 0u) {
    let Wi = W[i]; let hh = PAPER3[i].z;
    let thin = min(3.0, 0.12 / max(0.04, Wi));
    let ld = Wi / u.liftDepth; let wetting = select(ld * ld, 1.0, ld >= 1.0);
    let rewet = u.hasTop != 0u && Wi > u.film;
    let turnover = select(0.0, min(1.0, WENT[i] / Wi), Wi > 1e-6);
    var settled = 0.0;
    if (u.granFill > 0.0) { for (var ka = 0u; ka < u.nAct; ka++) { settled += D[klAt(ka) * u.n + i]; } }
    for (var ka = 0u; ka < u.nAct; ka++) {
      let k = klAt(ka); let q = k * u.n + i;
      var Gk = G[q]; var Dk = D[q]; var top = 0.0;
      if (rewet) { top = TOP[q]; }
      if (Gk == 0.0 && Dk == 0.0 && !(rewet && top != 0.0)) { continue; }
      let pa = pigA(k); let pb = pigB(k);
      let filled = select(hh, min(1.0, hh + settled * u.granFill), u.granFill > 0.0);
      let gg = pa.x;
      let down = Gk * max(0.0, 1.0 - filled * gg) * pb.x * u.settle * thin * u.dt;
      let shape = max(0.0, 1.0 + (hh - 1.0) * gg);
      let up = Dk * shape * (pa.y * wetting * u.dt + pa.z * turnover * wetting);
      let dn = min(Gk, max(0.0, down)); let uu = min(Dk, max(0.0, up));
      Dk += dn - uu; Gk += uu - dn;
      if (rewet) { let r = min(top, (top * u.rewetLift * u.dt) / pb.y); TOP[q] = top - r; Gk += r; }
      D[q] = Dk; G[q] = Gk;
    }
    var gs = 0.0;
    for (var ka = 0u; ka < u.nAct; ka++) { gs += G[klAt(ka) * u.n + i]; }
    let hold = u.holdCap * Wi;
    if (u.holdOn != 0u && gs > hold) {
      let f = 1.0 - hold / gs;
      for (var ka = 0u; ka < u.nAct; ka++) { let q = klAt(ka) * u.n + i; let q2 = G[q] * f; G[q] -= q2; D[q] += q2; }
    }
  }
  if (u.slide > 0.0) { var d = 0.0; for (var ka = 0u; ka < u.nAct; ka++) { d += D[klAt(ka) * u.n + i]; } DEP[i] = u.slideFill * d; if (FIXED_BED) { DEP[u.n + i] = computeFixedSupport(i); } }
}

// the slide with the pigments looped in the thread (slide_out, slide_apply)
fn slide_out_all_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  let i = c.i; let Wi = W[i];
  let okR = c.x < u.w - 1u && M[i + 1u] == 1u; let okL = c.x > 0u && M[i - 1u] == 1u;
  let okD = c.y < u.h - 1u && M[i + u.w] == 1u; let okU = c.y > 0u && M[i - u.w] == 1u;
  let p0 = PAPER3[i];
  var pR = vec4<f32>(0.0); var pL = vec4<f32>(0.0); var pD = vec4<f32>(0.0); var pU = vec4<f32>(0.0);
  if (okR) { pR = PAPER3[i + 1u]; }
  if (okL) { pL = PAPER3[i - 1u]; }
  if (okD) { pD = PAPER3[i + u.w]; }
  if (okU) { pU = PAPER3[i - u.w]; }
  // the deposit's rise to each neighbour, summed from each pigment's own difference (dep_k's sums differ by less than
  // their own rounding where the slope is gentle; the CPU sums in double)
  var gR = 0.0; var gL = 0.0; var gD = 0.0; var gU = 0.0;
  for (var ka = 0u; ka < u.nAct; ka++) {
    let base = klAt(ka) * u.n; let di = D[base + i];
    if (okR) { gR += di - D[base + i + 1u]; }
    if (okL) { gL += di - D[base + i - 1u]; }
    if (okD) { gD += di - D[base + i + u.w]; }
    if (okU) { gU += di - D[base + i - u.w]; }
  }
  gR *= u.slideFill; gL *= u.slideFill; gD *= u.slideFill; gU *= u.slideFill;
  if (FIXED_BED) {
    let base = fixedSupport(i);
    if (okR) { gR += base - fixedSupport(i + 1u); }
    if (okL) { gL += base - fixedSupport(i - 1u); }
    if (okD) { gD += base - fixedSupport(i + u.w); }
    if (okU) { gU += base - fixedSupport(i - u.w); }
  }
  for (var ka = 0u; ka < u.nAct; ka++) {
    let k = klAt(ka); let q = k * u.n + i;
    OUTM[q] = 0.0; o4set(q, vec4<f32>(0.0));
    let Dk = D[q]; let pa = pigA(k); let pb = pigB(k);
    let gg = pa.x;
    if (Wi <= 0.0 || gg <= 0.0 || Dk <= 0.0) { continue; }
    let film = min(3.0, 0.12 / max(0.04, Wi)) * select(Wi / u.film, 1.0, Wi > u.film);
    // The drop to each lower neighbour, as differences of the surface's parts: the CPU works the surfaces out in double and
    // subtracts them, and two f32 surfaces near 1 subtracted lose the few digits a small slope has. The parts' own
    // differences keep them.
    let fl = pb.z; let f1 = 1.0 - fl; let rep = pa.w;
    var ex = vec4<f32>(0.0);
    if (okR) { ex.x = max(0.0, (f1 * (p0.w - pR.w) + fl * (p0.x - pR.x) + gR) - rep); }
    if (okL) { ex.y = max(0.0, (f1 * (p0.w - pL.w) + fl * (p0.x - pL.x) + gL) - rep); }
    if (okD) { ex.z = max(0.0, (f1 * (p0.w - pD.w) + fl * (p0.x - pD.x) + gD) - rep); }
    if (okU) { ex.w = max(0.0, (f1 * (p0.w - pU.w) + fl * (p0.x - pU.x) + gU) - rep); }
    let sum = ex.x + ex.y + ex.z + ex.w;
    if (sum <= 0.0) { continue; }
    var moved = Dk * min(0.2, u.slide * gg * film * sum * u.dt);
    if (u.slideCap > 0.0 && u.slideFill > 0.0) {
      for (var e = 0u; e < 4u; e++) { if (ex[e] > 0.0) { moved = min(moved, u.slideCap * ex[e] / (u.slideFill * (1.0 + ex[e] / sum))); } }
    }
    OUTM[q] = moved; o4set(q, moved * ex / sum);
  }
}
fn slide_apply_all_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  let i = c.i;
  let okR = c.x < u.w - 1u && M[i + 1u] == 1u; let okL = c.x > 0u && M[i - 1u] == 1u;
  let okD = c.y < u.h - 1u && M[i + u.w] == 1u; let okU = c.y > 0u && M[i - u.w] == 1u;
  for (var ka = 0u; ka < u.nAct; ka++) {
    // summed in the order the CPU's raster walk adds into its buffer: the cell above, the cell to the left, the cell's
    // own move, the cell to the right, the cell below
    let base = klAt(ka) * u.n;
    var d = 0.0;
    if (okU) { d += o4get(base + i - u.w).z; }
    if (okL) { d += o4get(base + i - 1u).x; }
    d -= OUTM[base + i];
    if (okR) { d += o4get(base + i + 1u).y; }
    if (okD) { d += o4get(base + i + u.w).w; }
    if (d != 0.0) { D[base + i] = max(0.0, D[base + i] + d); }
  }
}

// cap_s and cap_p together: each of the eight fluxes worked out once, then the water and every pigment moved by them
fn cap_sp_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i;
  // out to and in from +x, -x, +y, -y, in cap_s's order
  var oF = vec4<f32>(0.0); var iF = vec4<f32>(0.0); var nb = vec4<u32>(0u); var okN = vec4<bool>(false);
  if (c.x < u.w - 1u) { nb.x = i + 1u; okN.x = true; oF.x = capflux(i, i + 1u, 0u); iF.x = capflux(i + 1u, i, 1u); }
  if (c.x > 0u) { nb.y = i - 1u; okN.y = true; oF.y = capflux(i, i - 1u, 1u); iF.y = capflux(i - 1u, i, 0u); }
  if (c.y < u.h - 1u) { nb.z = i + u.w; okN.z = true; oF.z = capflux(i, i + u.w, 2u); iF.z = capflux(i + u.w, i, 3u); }
  if (c.y > 0u) { nb.w = i - u.w; okN.w = true; oF.w = capflux(i, i - u.w, 3u); iF.w = capflux(i - u.w, i, 2u); }
  let si = S[i];
  var v = si;
  for (var e = 0u; e < 4u; e++) { if (okN[e]) { v -= oF[e]; v += iF[e]; } }
  S2[i] = v;
  // pmove: the donor's share of its pore pigment; a receiver's fibres catch a share where its pores were near empty
  let catchF = select(u.wickFilter, 0.0, si > u.capDelta * PAPER[i].x);
  var sN = vec4<f32>(0.0);
  var moves = false;
  for (var e = 0u; e < 4u; e++) { if (okN[e] && iF[e] > 0.0) { sN[e] = S[nb[e]]; } if (okN[e] && (oF[e] > 0.0 || iF[e] > 0.0)) { moves = true; } }
  if (!moves) { if (u.nAct > 0u) { DD[klAt(0u) * u.n + i] = -1.0; } return; }
  for (var ka = 0u; ka < u.nAct; ka++) {
    let base = klAt(ka) * u.n; let pi = P[base + i];
    var o = 0.0; var inn = 0.0; var dep = 0.0;
    for (var e = 0u; e < 4u; e++) {
      if (!okN[e]) { continue; }
      if (oF[e] > 0.0) { let q = pi * min(1.0, oF[e] / si); if (q != 0.0) { o += q; } }
      if (iF[e] > 0.0) { let q = P[base + nb[e]] * min(1.0, iF[e] / sN[e]); if (q != 0.0) { inn += q * (1.0 - catchF); dep += q * catchF; } }
    }
    PN[base + i] = pi - o + inn; DD[base + i] = dep;
  }
}


// dry() support
fn level_k_tile(wid: vec3<u32>, lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  var m = 0.0;
  if (c.x < u.w - 1u && M[c.i + 1u] == 1u) { m = max(m, abs(W[c.i] - W[c.i + 1u])); }
  if (c.y < u.h - 1u && M[c.i + u.w] == 1u) { m = max(m, abs(W[c.i] - W[c.i + u.w])); }
  if (m > 0.0) { atomicMax(&CTR[2], bitcast<u32>(m)); }
}
// The touched-tile union includes the previous top layer, so fix_b also clears
// its pixels outside the new layer. A second compact queue avoids overwriting
// work items another workgroup has not consumed yet.
@compute @workgroup_size(1)
fn fix_args() {
  ARGS[9] = atomicLoad(&FLAGS2[5u * u.ntiles + 1u]); ARGS[10] = 1u; ARGS[11] = 1u;
  atomicStore(&FLAGS2[5u * u.ntiles + 2u], 0u);
}
fn fixCoord(g: vec3<u32>, wid: vec3<u32>, lid: vec3<u32>) -> vec2<u32> {
  if (u.p3 == 0u) { return g.xy; }
  let tile = atomicLoad(&FLAGS2[3u * u.ntiles + 1u + wid.x]);
  return vec2<u32>((tile % u.tw) * 16u + lid.x, (tile / u.tw) * 16u + lid.y);
}
@compute @workgroup_size(16, 16)
fn fix_a(@builtin(global_invocation_id) g: vec3<u32>, @builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let pos = fixCoord(g, wid, lid); if (pos.x >= u.w || pos.y >= u.h) { return; }
  let i = pos.y * u.w + pos.x; var any = false;
  for (var k = 0u; k < u.K; k++) { let q = k * u.n + i; D[q] += P[q]; P[q] = 0.0; if (D[q] > 0.0) { any = true; atomicOr(&CTR[5], 1u << k); } }
  if (any) { atomicOr(&CTR[3], 1u); }
}
var<workgroup> topTile: atomic<u32>;
@compute @workgroup_size(16, 16)
fn fix_b(@builtin(global_invocation_id) g: vec3<u32>, @builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  if (lid.x == 0u && lid.y == 0u) { atomicStore(&topTile, 0u); }
  workgroupBarrier();
  let pos = fixCoord(g, wid, lid);
  if (pos.x < u.w && pos.y < u.h) {
    let i = pos.y * u.w + pos.x;
    for (var k = 0u; k < u.K; k++) { let q = k * u.n + i; if (FIXED_BED && u.hasTop != 0u) { DEP[2u * u.n + i] += TOP[q]; } TOP[q] = D[q]; D[q] = 0.0; if (TOP[q] != 0.0) { atomicStore(&topTile, 1u); } }
    EVER[i] = 0u;
  }
  workgroupBarrier();
  if (u.p3 != 0u && lid.x == 0u && lid.y == 0u) {
    let t = atomicLoad(&FLAGS2[3u * u.ntiles + 1u + wid.x]);
    let keep = atomicLoad(&topTile); atomicStore(&FLAGS2[2u * u.ntiles + 1u + t], keep);
    if (keep != 0u) { let q = atomicAdd(&FLAGS2[5u * u.ntiles + 2u], 1u); atomicStore(&FLAGS2[4u * u.ntiles + 1u + q], t); }
  }
}

// what is wet, in the pores or deposited and not yet fixed, per pigment: the sum the painter's thickness and a frame's top layer
// are made of, so the whole of G, P and D need not come down (into DD, which the steps use as scratch)
@compute @workgroup_size(16, 16)
fn gdp_sum(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  for (var k = 0u; k < u.K; k++) { let q = k * u.n + i; DD[q] = G[q] + D[q] + P[q]; }
}

// Brush sync: a rectangle of the sheet to and from one packed buffer
// planes: W, s, M, ever, G[K], P[K], D[K]
@group(0) @binding(36) var<uniform> rc: vec4<u32>;   // x0, y0, width, height
@group(0) @binding(37) var<storage, read_write> PACK: array<f32>;
fn markRectWet(i: u32, tile: u32) {
  if (M[i] == 1u || S[i] > 0.02 * PAPER[i].x) { markWet(tile); }
}
// Apply a full CPU upload's sparse-frontier effects without copying unchanged pigment planes through PACK.
@compute @workgroup_size(16, 16)
fn mark_rect(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= rc.z || g.y >= rc.w) { return; }
  let x = rc.x + g.x; let y = rc.y + g.y;
  let i = y * u.w + x; let tile = (y / 16u) * u.tw + x / 16u;
  markDirty(tile); markRectWet(i, tile);
}
// Dedicated upload metadata, never the physical counters. Reduction observes
// the GPU's post-overlay logical state, including cells absent from CPU cache.
@group(0) @binding(43) var<storage, read_write> UPLOAD_META: array<atomic<u32>>;
@compute @workgroup_size(16, 16)
fn upload_metadata_rect(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= rc.z || g.y >= rc.w) { return; }
  let i = (rc.y + g.y) * u.w + rc.x + g.x;
  var mask = 0u;
  var negativeZero = bitcast<u32>(W[i]) == 0x80000000u || bitcast<u32>(S[i]) == 0x80000000u;
  for (var k = 0u; k < u.K; k++) {
    let q = k * u.n + i;
    // Bit semantics equal JS !== 0 for both zeros, infinities and every NaN.
    if ((bitcast<u32>(G[q]) & 0x7fffffffu) != 0u ||
        (bitcast<u32>(P[q]) & 0x7fffffffu) != 0u ||
        (bitcast<u32>(D[q]) & 0x7fffffffu) != 0u) { mask |= 1u << k; }
    negativeZero = negativeZero || bitcast<u32>(G[q]) == 0x80000000u ||
      bitcast<u32>(P[q]) == 0x80000000u || bitcast<u32>(D[q]) == 0x80000000u;
  }
  atomicOr(&UPLOAD_META[0], mask);
  if (negativeZero) { atomicOr(&UPLOAD_META[1], 1u); }
}
@compute @workgroup_size(16, 16)
fn pack_rect(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= rc.z || g.y >= rc.w) { return; }
  let i = (rc.y + g.y) * u.w + rc.x + g.x; let a = rc.z * rc.w; let j = g.y * rc.z + g.x;
  PACK[j] = W[i]; PACK[a + j] = S[i]; PACK[2u * a + j] = f32(M[i]); PACK[3u * a + j] = f32(EVER[i]);
  for (var k = 0u; k < u.K; k++) {
    PACK[(4u + k) * a + j] = G[k * u.n + i]; PACK[(4u + u.K + k) * a + j] = P[k * u.n + i]; PACK[(4u + 2u * u.K + k) * a + j] = D[k * u.n + i];
  }
}
@compute @workgroup_size(16, 16)
fn unpack_rect(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= rc.z || g.y >= rc.w) { return; }
  let x = rc.x + g.x; let y = rc.y + g.y;
  let i = y * u.w + x; let a = rc.z * rc.w; let j = g.y * rc.z + g.x;
  markDirty((y / 16u) * u.tw + x / 16u);
  W[i] = PACK[j]; S[i] = PACK[a + j]; M[i] = u32(PACK[2u * a + j]); EVER[i] = u32(PACK[3u * a + j]);
  for (var k = 0u; k < u.K; k++) {
    G[k * u.n + i] = PACK[(4u + k) * a + j]; P[k * u.n + i] = PACK[(4u + u.K + k) * a + j]; D[k * u.n + i] = PACK[(4u + 2u * u.K + k) * a + j];
  }
  markRectWet(i, (y / 16u) * u.tw + x / 16u);
}

// A brush stroke on the sheet (brush.mjs strokeImpl, the per-cell half)
// The CPU plans the stroke (positions, widths, wander, and which cells each step touches under which hair) in double
// arithmetic, so edge cases match. One workgroup runs the steps in order with the hairs in workgroup memory: one thread
// feeds them from the shared belly, then each thread walks its hairs' cells in raster order. A cell belongs to one hair.
//
// BSTR layout (u32 words; floats bitcast): header 0..63, quantiles of the ground at 64.., hairs, belly, pool, the step
// records, the cells of each step (a table of where each hair's cells start, then index and across for each cell), the
// cells of the lift-off. From SB: the paper's capacity, per cell, which keeps the stroke kernels inside the adapter's ten
// storage buffers a stage.
const SB = 4194304u;
@group(0) @binding(39) var<storage, read_write> BSTR: array<f32>;
@group(0) @binding(40) var<storage, read> BPAP: array<vec4<f32>>;   // height, tooth, valley, proud

const H_LANES = 0u; const H_K = 1u; const H_NCL = 2u; const H_FLAT = 3u; const H_CAPA = 4u; const H_FREE = 5u; const H_FILM = 6u;
const H_GIVE = 7u; const H_WET = 8u; const H_BRIDGE = 9u; const H_BSOFT = 10u; const H_BREAK = 11u; const H_FINE = 12u;
const H_COARSE = 13u; const H_WETMIX = 14u; const H_L = 15u; const H_RELIEF = 16u; const H_LOAD = 17u; const H_BSTREAK = 18u;
const H_MERGE = 19u; const H_WETTING = 21u; const H_RNG = 23u; const H_NSTEPS = 24u;
const H_FEED = 25u; const H_CUR = 26u; const H_SP = 27u; const H_OFFH = 28u; const H_OFFS = 29u; const H_HS = 30u;
const H_OFFC = 31u; const H_NLIFT = 32u; const H_OFFL = 33u;
const H_OFFQ = 64u;
// the hairs' state, in workgroup memory for the run (the default limit is 16 KB): per hair water, length, clump (bits), a
// spare word, then each pigment; the belly and the bead's pool follow the hairs. (hairs + 2) * (4 + pigments) must fit.
var<workgroup> wh: array<f32, 4000>;

fn bu(i: u32) -> u32 { return bitcast<u32>(BSTR[i]); }
fn bi(i: u32) -> i32 { return bitcast<i32>(BSTR[i]); }
// The header's constants in each thread's registers for the dispatch (hdr_load): the loop writes BSTR, so the compiler
// cannot keep them in registers itself.
var<private> pHS: u32; var<private> pLanes: u32; var<private> pK: u32; var<private> pCapa: f32; var<private> pFlat: bool; var<private> pFree: f32;
var<private> pFilm: f32; var<private> pGive: f32; var<private> pWet: f32; var<private> pBridge: f32; var<private> pBSoft: f32; var<private> pBreak: f32;
var<private> pFine: f32; var<private> pCoarse: f32; var<private> pWetMix: f32; var<private> pL: i32; var<private> pRelief: f32; var<private> pLoad: f32;
var<private> pDepth: f32;
var<private> pBStreak: f32; var<private> pWetting: bool; var<private> pFeed: f32; var<private> pMerge: f32;
var<private> pRng: u32;   // the brush's generator (rnd), held for the dispatch and written back by hdr_store
fn hdr_load() {
  pDepth = BSTR[34u];
  pHS = bu(H_HS); pLanes = bu(H_LANES); pK = bu(H_K); pCapa = BSTR[H_CAPA]; pFlat = BSTR[H_FLAT] != 0.0; pFree = BSTR[H_FREE];
  pFilm = BSTR[H_FILM]; pGive = BSTR[H_GIVE]; pWet = BSTR[H_WET]; pBridge = BSTR[H_BRIDGE]; pBSoft = BSTR[H_BSOFT]; pBreak = BSTR[H_BREAK];
  pFine = BSTR[H_FINE]; pCoarse = BSTR[H_COARSE]; pWetMix = BSTR[H_WETMIX]; pL = i32(bu(H_L)); pRelief = BSTR[H_RELIEF]; pLoad = BSTR[H_LOAD];
  pBStreak = BSTR[H_BSTREAK]; pWetting = bu(H_WETTING) != 0u; pFeed = BSTR[H_FEED]; pMerge = BSTR[H_MERGE];
  pRng = bu(H_RNG) | (bu(22u) << 16u);
}
// the generator's state back into the header, as two 16-bit halves (a word that held the whole of it could read as a NaN)
fn hdr_store() { BSTR[H_RNG] = bitcast<f32>(pRng & 65535u); BSTR[22u] = bitcast<f32>(pRng >> 16u); }
fn hb(j: u32) -> u32 { return j * pHS; }   // hair j in wh; j = lanes is the belly, lanes + 1 the bead's pool

fn load_hairs(li: u32) {
  let n = (bu(H_LANES) + 2u) * bu(H_HS); let o = bu(H_OFFH);
  for (var q = li; q < n; q += 64u) { wh[q] = BSTR[o + q]; }
}
fn store_hairs(li: u32) {
  let n = (bu(H_LANES) + 2u) * bu(H_HS); let o = bu(H_OFFH);
  for (var q = li; q < n; q += 64u) { BSTR[o + q] = wh[q]; }
}

fn rnd() -> f32 {   // the brush's generator: s = s * 16807 mod 2^31 - 1, by Schrage's method (no 64-bit product); thread 0 only
  let s = i32(pRng);
  let hi = s / 127773; let lo = s % 127773;
  var t = 16807 * lo - 2836 * hi;
  if (t <= 0) { t += 2147483647; }
  pRng = u32(t);
  return f32(t) / 2147483647.0;
}
fn smooth01(x: f32) -> f32 { if (x <= 0.0) { return 0.0; } if (x >= 1.0) { return 1.0; } return x * x * (3.0 - 2.0 * x); }
fn jround(x: f32) -> f32 { return floor(x + 0.5); }

// water (and its share of the pigment) from hair `a` to hair `b`
fn move_mass(a: u32, b: u32, water: f32) {
  let ha = hb(a); let hh = hb(b);
  if (water <= 0.0 || wh[ha] <= 0.0) { return; }
  let f = min(1.0, water / wh[ha]); let K = pK;
  for (var k = 0u; k < K; k++) { let q = wh[ha + 4u + k] * f; wh[ha + 4u + k] -= q; wh[hh + 4u + k] += q; }
  let wq = wh[ha] * f; wh[ha] -= wq; wh[hh] += wq;
}

// The belly feeds each hair up to the dip's level; a dry hair takes a little from a neighbour. The order is strokeImpl's,
// hair by hair, and each transfer moves the same share of water and of every pigment, so the work splits without changing
// any arithmetic. Thread 0 walks the water, which decides every transfer and draws the generator, and logs each share.
// Then the pigment: when no hair took from a neighbour this step (the usual case), each pigment's thread runs the belly's
// own chain for a block of 64 hairs and every hair takes its share in parallel; otherwise one thread per pigment replays
// the whole log in order.
const FEED_MAX = 576u;   // hairs; brush.mjs onGpu keeps a GPU brush within it
const QLOG = 1024u;      // fScr: the pigment shares of a block of 64 hairs (16 pigments x 64), then each hair's target water
var<workgroup> fFeed: array<f32, FEED_MAX>;   // share of the belly hair j took (0: none)
var<workgroup> fMove: array<f32, FEED_MAX>;   // share hair j took from hair fNb[j] (0: none)
var<workgroup> fNb: array<u32, FEED_MAX>;
var<workgroup> fScr: array<f32, 1600>;        // [0, lanes): each hair's water for the walk; [0, QLOG): the shares; [QLOG, QLOG + lanes): targets
var<workgroup> fAnyMove: u32;
var<workgroup> w_lanes: u32;
var<workgroup> w_flag: u32;   // a step's two decisions, read by all threads in one uniform load: 1 a hair took from a neighbour, 2 a flow follows
// each hair's water (the walk reads it from here, so its loads need not wait on its own stores) and, once a dispatch, its target
fn feed_note(li: u32, targets: bool) {
  let lanes = pLanes; let capa = pCapa; let load = pLoad;
  for (var j = li; j < lanes; j += 64u) { let h = hb(j); fScr[j] = wh[h]; if (targets) { fScr[QLOG + j] = capa * wh[h + 1u] * load; } }
}
fn feed_water() {
  let lanes = pLanes; let capa = pCapa; let feed = pFeed; let bel = hb(lanes);
  var bw = wh[bel]; var any = 0u;
  var hwN = fScr[0]; var tgN = fScr[QLOG];
  for (var j = 0u; j < lanes; j++) {
    let h = hb(j);
    var hw = hwN; let tgt = tgN;
    if (j + 1u < lanes) { hwN = fScr[j + 1u]; tgN = fScr[QLOG + j + 1u]; }
    var ff = 0.0;
    if (hw < tgt && bw > 0.0) {
      let wat = min(bw, (tgt - hw) * feed);
      if (wat > 0.0 && bw > 0.0) {
        let f = min(1.0, wat / bw);
        let wq = bw * f; bw -= wq; hw += wq; ff = f;
      }
    }
    fFeed[j] = ff;
    var mv = 0.0; var nbu = j;
    if (hw < 0.05 * capa) {
      if (rnd() < 0.05) {
        var nb = i32(j) + 1; if (rnd() < 0.5) { nb = i32(j) - 1; }
        nbu = u32(max(0, min(i32(lanes) - 1, nb)));
        // move_mass(nbu, j, wh[hb(nbu)] * 0.2), the water, with the giver's water as it stands now: the next hair's is
        // still in hwN (only this hair can have touched it), the last one's is back in wh
        var wa = hw;
        if (nbu > j) { wa = hwN; } else if (nbu < j) { wa = wh[hb(nbu)]; }
        let water = wa * 0.2;
        if (!(water <= 0.0 || wa <= 0.0)) {
          let f = min(1.0, water / wa);
          let wq = wa * f;
          if (nbu == j) { hw -= wq; hw += wq; } else if (nbu > j) { hwN -= wq; hw += wq; } else { wh[hb(nbu)] = wa - wq; hw += wq; }
          mv = f; any = 1u;
        }
      }
    }
    wh[h] = hw;
    fMove[j] = mv; fNb[j] = nbu;
  }
  wh[bel] = bw; fAnyMove = any;
}
// the whole log on pigment k, in order (a step where a hair took from a neighbour)
fn feed_pig(k: u32) {
  let lanes = pLanes; let bel = hb(lanes) + 4u + k;
  var bp = wh[bel];
  for (var j = 0u; j < lanes; j++) {
    let h = hb(j) + 4u + k;
    let f = fFeed[j];
    if (f > 0.0) { let q = bp * f; bp -= q; wh[h] += q; }
    let m = fMove[j];
    if (m > 0.0) { let a = hb(fNb[j]) + 4u + k; let q = wh[a] * m; wh[a] -= q; wh[h] += q; }
  }
  wh[bel] = bp;
}
// the pigment of a step's feed, all threads (see above); `lanesU` and `moved` are uniform
override FULL_BRUSH_PIGMENTS: bool = false;
// Inactive +0 lanes are no-ops. Signed-zero inputs retain the full reference loop.
fn brushPigmentCount() -> u32 { return select(u.nAct, pK, FULL_BRUSH_PIGMENTS); }
fn brushPigmentAt(a: u32) -> u32 { if (FULL_BRUSH_PIGMENTS) { return a; } return klAt(a); }
fn feed_pigments(li: u32, lanesU: u32, moved: bool) {
  if (moved) {
    if (li < brushPigmentCount()) { feed_pig(brushPigmentAt(li)); }
    workgroupBarrier();
    return;
  }
  let K = pK; var bp = 0.0;
  if (li < brushPigmentCount()) { bp = wh[hb(lanesU) + 4u + brushPigmentAt(li)]; }
  for (var c0 = 0u; c0 < lanesU; c0 += 64u) {
    let cn = min(64u, lanesU - c0);
    if (li < brushPigmentCount()) {
      for (var jj = 0u; jj < cn; jj++) { let f = fFeed[c0 + jj]; var q = 0.0; if (f > 0.0) { q = bp * f; bp -= q; } fScr[brushPigmentAt(li) * 64u + jj] = q; }
    }
    workgroupBarrier();
    if (li < cn) { let j = c0 + li; if (fFeed[j] > 0.0) { let h = hb(j) + 4u; for (var ka = 0u; ka < brushPigmentCount(); ka++) { let k = brushPigmentAt(ka); wh[h + k] += fScr[k * 64u + li]; } } }
    workgroupBarrier();
  }
  if (li < brushPigmentCount()) { wh[hb(lanesU) + 4u + brushPigmentAt(li)] = bp; }
}

// the tooth under a hair, averaged along the stroke behind its tip (brush.mjs groundAt)
fn ground_at(xx: i32, yy: i32, tx: f32, ty: f32, L: i32, fine: f32, coarse: f32) -> f32 {
  let w = i32(u.w); let h = i32(u.h);
  var sum = 0.0; var cnt = 0.0;
  for (var m = 0; m <= L; m++) {
    let bx = i32(jround(f32(xx) - tx * f32(m))); let by = i32(jround(f32(yy) - ty * f32(m)));
    if (bx < 0 || by < 0 || bx >= w || by >= h) { break; }
    let p = BPAP[u32(by * w + bx)]; sum += p.x - (1.0 - coarse) * p.y; cnt += 1.0;
  }
  let i = u32(yy * w + xx); let p0 = BPAP[i];
  return sum / select(cnt, 1.0, cnt == 0.0) + fine * (p0.x - p0.z);
}

// one cell under one hair: the film, the wet mix, the thirst, the soak (sheet.mjs soak)
fn hair_cell(j: u32, sb: u32, i: u32, across: f32, tx: f32, ty: f32) {
  let xx = i32(i % u.w); let yy = i32(i / u.w);
  let qp = BSTR[sb]; let fringe = BSTR[sb + 1u];
  let sideL = BSTR[sb + 2u]; let sideR = BSTR[sb + 3u];
  let side = select(sideR, sideL, across < 0.0);
  let h = hb(j); let K = pK;
  let len = wh[h + 1u]; let capa = pCapa; let flat = pFlat; let free = pFree;
  let outer = smooth01((abs(across) - (side - fringe)) / fringe);
  if (pDepth > 0.0 && pLoad >= free) { move_mass(pLanes, j, max(0.0, capa * len - wh[h])); }
  let hw = wh[h];
  if (hw <= 1e-6) { return; }
  if (!flat && qp * (0.6 + 0.4 * len) < 0.18 + 0.5 * (1.0 - len)) { return; }
  var cl = capa * len; if (cl == 0.0) { cl = 1.0; }
  let sat = hw / cl;
  let cidx = bitcast<u32>(wh[h + 2u]);
  let wander = BSTR[sb + 16u + cidx];
  let fill = min(1.0, sat / free);
  let empty = max(0.0, min(1.0, max(0.0, 1.0 - sat / free) * wander - (0.15 * (qp - 0.7) - 0.6 * outer) * min(1.0, 1.5 * (1.0 - fill))));
  var contact = smooth01(side + 0.5 - abs(across));
  if (contact <= 0.0) { return; }
  let bridge = pBridge;
  let pp = BPAP[i];
  if (bridge > 0.0 && bridge < 1.0) {
    let relief = pRelief;
    let reach = select(bridge, bridge + (1.0 - bridge) * fill, pDepth > 0.0) * relief * (0.45 + 0.55 * fill) * (0.55 + 0.45 * qp) * (1.0 + pBStreak * (wander - 1.0));
    let bridgeContact = smooth01((pp.x - pp.y + reach) / (pBSoft * relief) + 0.5);
    contact *= select(bridgeContact, fill + (1.0 - fill) * bridgeContact, pDepth > 0.0);
    if (contact <= 0.0) { return; }
  }
  if (empty > 0.0) {
    let cov = pow(1.0 - empty, pBreak); let qi = (1.0 - cov) * 200.0;
    let lo = min(199u, u32(floor(qi)));
    let q0 = BSTR[H_OFFQ + lo]; let q1 = BSTR[H_OFFQ + lo + 1u];
    let g = q0 + (q1 - q0) * (qi - f32(lo));
    contact *= smooth01((ground_at(xx, yy, tx, ty, pL, pFine, pCoarse) - g) / 0.03 + 0.5);
    if (contact <= 0.0) { return; }
  }
  let wetMix = pWetMix;
  if (wetMix != 0.0 && W[i] > 0.03) {
    let water = W[i]; let exch = min(wh[h], water) * wetMix * contact;
    for (var ka = 0u; ka < brushPigmentCount(); ka++) { let k = brushPigmentAt(ka);
      let delta = exch * (wh[h + 4u + k] / wh[h] - G[k * u.n + i] / water);
      wh[h + 4u + k] -= delta; G[k * u.n + i] += delta;
    }
  }
  let Wi = W[i];
  let freeL = max(0.0, (sat - free) / (1.0 - free));
  let want = pWet * freeL * (0.6 + 0.4 * qp);
  if (sat < free && Wi > 0.05 && M[i] == 1u) {   // a thirsty brush drinks from wetter paper, pigment and all
    let take = min(min((Wi - 0.05) * 0.3 * contact * (1.0 - fill), Wi * 0.5), capa * len - wh[h]);
    if (take <= 0.0) { return; }
    let f = take / Wi; W[i] = Wi - take; wh[h] += take;
    for (var ka = 0u; ka < brushPigmentCount(); ka++) { let k = brushPigmentAt(ka); let g = G[k * u.n + i] * f; G[k * u.n + i] -= g; wh[h + 4u + k] += g; }
    return;
  }
  let gx = u32(max(0, min(i32(u.w) - 1, xx + i32(bu(sb + 4u)) - 1000000))); let gy = u32(max(0, min(i32(u.h) - 1, yy + i32(bu(sb + 5u)) - 1000000)));
  let gp = BPAP[gy * u.w + gx];
  let grain = 0.7 + 1.2 * gp.w + 0.3 * gp.z;
  var give = min(wh[h], contact * (pFilm * grain * (0.7 + 0.3 * qp) * (1.0 - min(1.0, Wi / 0.2)) + pGive * max(0.0, want - Wi) * qp));
  if (pDepth > 0.0) { give = min(wh[h], contact * max(0.0, pDepth * (0.7 + 0.3 * qp) - Wi) * (fill + (1.0 - fill) * grain)); }
  if (give <= 0.0) { return; }
  // paint still damp in the paper trades places with the new: the hair takes up some of it (brush.mjs mergePickup)
  if (pMerge > 0.0) {
    let mcap = BSTR[SB + i]; let msi = S[i];
    if (mcap > 0.0 && msi > 0.0) {
      var mall = 0.0; for (var mk = 0u; mk < K; mk++) { mall += D[mk * u.n + i]; }
      var mine = 0.0; for (var ka = 0u; ka < brushPigmentCount(); ka++) { mine += D[brushPigmentAt(ka) * u.n + i]; }
      let sim = select(0.0, mine / mall, mall > 0.0);
      let mwet = clamp((0.02 - W[i]) / 0.015, 0.0, 1.0);   // damp paint only, not a standing film (brush.mjs mergePickup)
      let ft = min(1.0, pMerge * min(1.0, msi / mcap) * give / msi) * sim * sim * sim * sim * mwet * clamp((abs(across) / max(side, 1e-6) - 0.5) / 0.3, 0.0, 1.0);
      for (var ka = 0u; ka < brushPigmentCount(); ka++) { let k = brushPigmentAt(ka); let q = D[k * u.n + i] * ft; if (q > 0.0) { D[k * u.n + i] -= q; wh[h + 4u + k] += q; } }
    }
  }
  let f = give / wh[h];
  wh[h] -= give;
  // soak: empty pores drink what they can at once, filtering their share of the pigment onto the fibres; the rest stands
  let pcap = BSTR[SB + i];
  let masked = (RESIST[i] & 1u) == 1u;
  var into = 0.0; var fr = 0.0;
  if (!masked) {
    let room = max(0.0, pcap - S[i]) * select(1.0, 0.3, M[i] == 1u);
    into = min(room, give); fr = into / give;
    S[i] += into;
    if (pWetting && into > 0.0) { EVER[i] = 1u; }
  }
  let stand = give - into; let gs = 1.0 - fr;
  for (var ka = 0u; ka < brushPigmentCount(); ka++) { let k = brushPigmentAt(ka);
    let pg = wh[h + 4u + k] * f; wh[h + 4u + k] -= pg;
    if (!masked) { D[k * u.n + i] += pg * fr; }
    if (stand > 0.0) { G[k * u.n + i] += pg * gs; }
  }
  if (stand > 0.0) { W[i] += stand; M[i] = 1u; EVER[i] = 1u; }
  markDirty((u32(yy) / 16u) * u.tw + u32(xx) / 16u);
  if (M[i] == 1u || S[i] > 0.02 * pcap) { markWet((u32(yy) / 16u) * u.tw + u32(xx) / 16u); }
}

var<workgroup> w_cur: u32;
var<workgroup> w_n: u32;

// Run the planned steps from the current one up to and including the next step that has a flow after it (the host runs
// the flow between dispatches), or to the end.
@compute @workgroup_size(64)
fn stroke_run(@builtin(local_invocation_index) li: u32) {
  if (li == 0u) { w_cur = bu(H_CUR); w_n = bu(H_NSTEPS); w_lanes = bu(H_LANES); }
  hdr_load();
  load_hairs(li);
  workgroupBarrier();
  feed_note(li, true);
  // a step's decisions come in one uniform load (w_flag): every workgroupUniformLoad is a barrier
  var cur = workgroupUniformLoad(&w_cur); let nst = workgroupUniformLoad(&w_n); let lanesU = workgroupUniformLoad(&w_lanes);
  let lanes = bu(H_LANES); let sp = bu(H_SP); let offs = bu(H_OFFS); let offc = bu(H_OFFC);
  loop {
    if (cur >= nst) { break; }
    let sb = offs + cur * sp;
    if (li == 0u) { feed_water(); w_flag = fAnyMove | select(0u, 2u, bu(sb + 6u) != 0u); }
    let flag = workgroupUniformLoad(&w_flag);
    feed_pigments(li, lanesU, (flag & 1u) != 0u);
    let blk = offc + bu(sb + 7u); let ent = blk + lanes + 1u;
    let tx = BSTR[sb + 9u]; let ty = BSTR[sb + 10u];
    if (pDepth > 0.0) {
      // Metered contact draws from the shared belly at every cell. Preserve CPU
      // raster order; parallel hair traversal changes which hair exhausts it.
      if (li == 0u) { for(var e=0u;e<bu(blk);e++) {
        let q=blk+1u+3u*e; hair_cell(bu(q+1u),sb,bu(q),BSTR[q+2u],tx,ty);
      } }

    } else {
    for (var j = li; j < lanes; j += 64u) {
      let e1 = bu(blk + j + 1u);
      for (var e = bu(blk + j); e < e1; e++) { hair_cell(j, sb, bu(ent + 2u * e), BSTR[ent + 2u * e + 1u], tx, ty); }
      fScr[j] = wh[hb(j)];   // the hair's water for the next step's walk (the shares are done with by now)
    }
    }
    workgroupBarrier();
    for(var j=li;j<lanes;j+=64u) { fScr[j]=wh[hb(j)]; }
    storageBarrier(); workgroupBarrier();
    cur += 1u;
    if ((flag & 2u) != 0u) { break; }
  }
  store_hairs(li);
  if (li == 0u) { BSTR[H_CUR] = bitcast<f32>(cur); hdr_store(); }
}

// Lifting off: a hair with free liquid leaves a bead at the last contact, shared over the wet cells of the planned list.
var<workgroup> w_cnt: atomic<u32>;
@compute @workgroup_size(64)
fn stroke_end(@builtin(local_invocation_index) li: u32) {
  hdr_load();
  let lanes = pLanes; let K = pK;
  let pool = lanes + 1u; let hp = hb(pool);
  load_hairs(li);
  if (li == 0u) { atomicStore(&w_cnt, 0u); }
  workgroupBarrier();
  if (li == 0u) {
    wh[hp] = 0.0; for (var k = 0u; k < K; k++) { wh[hp + 4u + k] = 0.0; }
    let capa = BSTR[H_CAPA];
    for (var j = 0u; j < lanes; j++) {
      let hj = hb(j); var cl = capa * wh[hj + 1u]; if (cl == 0.0) { cl = 1.0; }
      if (wh[hj] / cl > BSTR[H_FREE]) { move_mass(j, pool, min(wh[hj], 0.0015 * select(capa, pDepth, pDepth > 0.0))); }
    }
  }
  workgroupBarrier();
  let nl = bu(H_NLIFT); let ol = bu(H_OFFL);
  for (var q = li; q < nl; q += 64u) { if (M[bu(ol + q)] == 1u) { atomicAdd(&w_cnt, 1u); } }
  workgroupBarrier();
  let cnt = atomicLoad(&w_cnt);
  if (wh[hp] > 0.0 && cnt > 0u) {
    let fc = 1.0 / f32(cnt);
    for (var q = li; q < nl; q += 64u) {
      let i = bu(ol + q);
      if (M[i] == 1u) {
        W[i] += wh[hp] * fc; EVER[i] = 1u;
        for (var k = 0u; k < K; k++) { G[k * u.n + i] += wh[hp + 4u + k] * fc; }
        markWet(((i / u.w) / 16u) * u.tw + (i % u.w) / 16u);
      }
    }
  } else if (wh[hp] > 0.0 && li == 0u) {   // lifted off the sheet, or over dry paper: the bead goes back to the belly
    move_mass(pool, lanes, wh[hp]);
  }
  workgroupBarrier();
  store_hairs(li);
}

// Splats (--washsplat; brush.mjs splatStroke is the CPU's own)
// The plan in BSTR: a header (count, pigments, the next splat, the brush's water and capacity, its wetness and free-liquid
// threshold, wetting, the stroke's box, where the splats and the clip bits start), the brush's concentration from word 32,
// then six words a splat (x, y, r, pressure, spacing, flows after). One workgroup lays them in order, each over its disc in
// parallel, and takes the water given out of the brush before the next.
const SP_N = 0u; const SP_K = 1u; const SP_CUR = 2u; const SP_W = 3u; const SP_CAP = 4u; const SP_WET = 5u; const SP_FREE = 6u;
const SP_WETTING = 7u; const SP_RX = 8u; const SP_RY = 9u; const SP_RW = 10u; const SP_RH = 11u; const SP_REC = 12u; const SP_CLIP = 13u;
const SP_FILM = 15u; const SP_GIVE = 16u; const SP_SCALE = 17u; const SP_MIX = 18u; const SP_CONC = 32u;
var<workgroup> spUsed: array<f32, 256>;
var<workgroup> spCur: u32;
var<workgroup> spN: u32;
var<workgroup> spStop: u32;
var<workgroup> spA: f32;    // the water a hair aims for here (want); 0: the brush has nothing free to give
var<workgroup> spC: f32;    // the share of a touch this splat is
fn sstep(e0: f32, e1: f32, x: f32) -> f32 { let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
@compute @workgroup_size(256)
fn splat_run(@builtin(local_invocation_index) li: u32) {
  if (li == 0u) { spCur = bu(SP_CUR); spN = bu(SP_N); }
  let n = workgroupUniformLoad(&spN);
  let K = bu(SP_K); let offR = bu(SP_REC); let offC = bu(SP_CLIP);
  let rx = i32(bu(SP_RX)); let ry = i32(bu(SP_RY)); let rw = i32(bu(SP_RW)); let rh = i32(bu(SP_RH));
  let wetting = bu(SP_WETTING) != 0u;
  loop {
    let cur = workgroupUniformLoad(&spCur);
    if (cur >= n) { break; }
    let rb = offR + cur * 6u;
    let x = BSTR[rb]; let y = BSTR[rb + 1u]; let r = BSTR[rb + 2u]; let p = BSTR[rb + 3u]; let sp = BSTR[rb + 4u];
    if (li == 0u) {
      let Wb = BSTR[SP_W]; let cap = BSTR[SP_CAP]; let free = BSTR[SP_FREE];
      let sat = select(0.0, Wb / cap, cap > 0.0); let freeL = max(0.0, (sat - free) / (1.0 - free));
      spA = select(0.0, BSTR[SP_WET] * freeL * (0.6 + 0.4 * p), Wb > 0.0);
      spC = select(0.0, BSTR[SP_SCALE] * sp / (1.25 * r), Wb > 0.0);
    }
    workgroupBarrier();
    let want = spA; let cs = spC; let film = BSTR[SP_FILM]; let giveR = BSTR[SP_GIVE];
    var used = 0.0;
    if (cs > 0.0) {
      let bx0 = max(rx, i32(floor(x - r))); let bx1 = min(rx + rw - 1, i32(ceil(x + r)));
      let by0 = max(ry, i32(floor(y - r))); let by1 = min(ry + rh - 1, i32(ceil(y + r)));
      let bw = bx1 - bx0 + 1; let bh = by1 - by0 + 1;
      if (bw > 0 && bh > 0) {
        for (var q = li; q < u32(bw * bh); q += 256u) {
          let xx = bx0 + i32(q % u32(bw)); let yy = by0 + i32(q / u32(bw));
          let i = u32(yy) * u.w + u32(xx);
          if (offC != 0u) { let c = u32((yy - ry) * rw + (xx - rx)); if (((bu(offC + (c >> 5u)) >> (c & 31u)) & 1u) == 0u) { continue; } }
          let fall = sstep(r, 0.25 * r, distance(vec2<f32>(f32(xx) + 0.5, f32(yy) + 0.5), vec2<f32>(x, y)));
          if (fall <= 0.0) { continue; }
          let wm = BSTR[SP_MIX];
          if (wm != 0.0 && W[i] > 0.03) {   // wetMix: the paint traded with a wet film (brush.mjs splatCpu)
            let water = W[i]; let ex = water * wm * fall * cs;
            for (var k = 0u; k < K; k++) { let q = k * u.n + i; G[q] = max(0.0, G[q] + ex * (BSTR[SP_CONC + k] - G[q] / water)); }
          }
          let Wi = W[i];
          let give = fall * cs * (film * (0.7 + 0.3 * p) * (1.0 - min(1.0, Wi / 0.2)) + giveR * max(0.0, want - Wi) * p);
          if (give <= 0.0) { continue; }
          // soak (sheet.mjs): empty pores drink what they can, filtering their share of the paint onto the fibres
          let pcap = BSTR[SB + i]; let masked = (RESIST[i] & 1u) == 1u;
          var into = 0.0; var fr = 0.0;
          if (!masked) {
            let room = max(0.0, pcap - S[i]) * select(1.0, 0.3, M[i] == 1u);
            into = min(room, give); fr = into / give; S[i] += into;
            if (wetting && into > 0.0) { EVER[i] = 1u; }
          }
          let stand = give - into; let gs = 1.0 - fr;
          for (var k = 0u; k < K; k++) {
            let pg = BSTR[SP_CONC + k] * give;
            if (!masked) { D[k * u.n + i] += pg * fr; }
            if (stand > 0.0) { G[k * u.n + i] += pg * gs; }
          }
          if (stand > 0.0) { W[i] += stand; M[i] = 1u; EVER[i] = 1u; }
          markDirty((u32(yy) / 16u) * u.tw + u32(xx) / 16u);
  if (M[i] == 1u || S[i] > 0.02 * pcap) { markWet((u32(yy) / 16u) * u.tw + u32(xx) / 16u); }
          used += give;
        }
      }
    }
    spUsed[li] = used;
    storageBarrier(); workgroupBarrier();
    if (li == 0u) {
      var t = 0.0; for (var j = 0u; j < 256u; j++) { t += spUsed[j]; }
      BSTR[SP_W] = max(0.0, BSTR[SP_W] - t); spCur = cur + 1u; spStop = bu(rb + 5u);
    }
    if (workgroupUniformLoad(&spStop) != 0u) { break; }
  }
  let fin = workgroupUniformLoad(&spCur);
  if (li == 0u) { BSTR[SP_CUR] = bitcast<f32>(fin); }
}

// Fixed worker groups consume only the compact active list. Direct dispatch
// avoids one Dawn indirect-argument validation pass per physics kernel.
var<workgroup> passTileCount: u32;
@compute @workgroup_size(16, 16)
fn edge_phase1(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { edge_phase1_tile(wid, lid, li); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    edge_phase1_tile(vec3<u32>(tile, wid.y, wid.z), lid, li);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn faces_wsc(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { faces_wsc_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    faces_wsc_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn pflux_sc(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { pflux_sc_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    pflux_sc_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn apply_f0(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { apply_f0_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    apply_f0_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn apply_f1(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { apply_f1_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    apply_f1_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn p3a_dep(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { p3a_dep_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    p3a_dep_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn slide_out_all(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { slide_out_all_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    slide_out_all_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn slide_apply_all(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { slide_apply_all_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    slide_apply_all_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn cap_sp(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { cap_sp_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    cap_sp_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn p5a(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { p5a_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    p5a_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn p5b(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { p5b_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    p5b_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn p5c(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { p5c_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    p5c_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn wetscan(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { wetscan_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    wetscan_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn edge_first(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { edge_first_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    edge_first_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn edge_a2b(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { edge_a2b_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    edge_a2b_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn edge_b2a(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { edge_b2a_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    edge_b2a_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn phase1(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { phase1_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    phase1_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn faces(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { faces_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    faces_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn wsc(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { wsc_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    wsc_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn pflux_k(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { pflux_k_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    pflux_k_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn ppout(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { ppout_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    ppout_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn apply_w0(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { apply_w0_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    apply_w0_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn apply_w1(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { apply_w1_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    apply_w1_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn apply_g(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { apply_g_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    apply_g_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn p3a(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { p3a_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    p3a_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn dep_k(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { dep_k_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    dep_k_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn slide_out(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { slide_out_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    slide_out_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn slide_apply(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { slide_apply_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    slide_apply_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn cap_s(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { cap_s_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    cap_s_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn cap_p(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { cap_p_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    cap_p_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}
@compute @workgroup_size(16, 16)
fn level_k(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (u.p3 != 2u) { level_k_tile(wid, lid); return; }
  if (lid.x == 0u && lid.y == 0u) { passTileCount = TL[u.ntiles]; }
  workgroupBarrier();
  let count = workgroupUniformLoad(&passTileCount);
  for (var tile = wid.x; tile < count; tile += u32(u.padB)) {
    level_k_tile(vec3<u32>(tile, wid.y, wid.z), lid);
    workgroupBarrier();
  }
}

// Metered strokes already visit contacts serially to preserve belly supply order.
// A single invocation removes the otherwise idle workgroup's barriers at every
// contact step. Pigment chains retain exactly the same per-pigment arithmetic.
@compute @workgroup_size(1)
fn stroke_metered() {
  hdr_load();let count=(pLanes+2u)*pHS;let h0=bu(H_OFFH);
  for(var q=0u;q<count;q++){wh[q]=BSTR[h0+q];}
  for(var j=0u;j<pLanes;j++){let h=hb(j);fScr[j]=wh[h];fScr[QLOG+j]=pCapa*wh[h+1u]*pLoad;}
  var cur=bu(H_CUR);let nst=bu(H_NSTEPS);let sp=bu(H_SP);let offs=bu(H_OFFS);let offc=bu(H_OFFC);
  loop {
    if(cur>=nst){break;}let sb=offs+cur*sp;feed_water();
    for(var k=0u;k<pK;k++){feed_pig(k);}
    let blk=offc+bu(sb+7u);let tx=BSTR[sb+9u];let ty=BSTR[sb+10u];
    for(var e=0u;e<bu(blk);e++){let q=blk+1u+3u*e;hair_cell(bu(q+1u),sb,bu(q),BSTR[q+2u],tx,ty);}
    for(var j=0u;j<pLanes;j++){fScr[j]=wh[hb(j)];}
    cur++;if(bu(sb+6u)!=0u){break;}
  }
  for(var q=0u;q<count;q++){BSTR[h0+q]=wh[q];}
  BSTR[H_CUR]=bitcast<f32>(cur);hdr_store();
}

// Fast ordinary dry only, dispatched after a whole-frontier maximum-water gate.
// Visit the whole sheet to clear residual pore traces outside the active tiles.
@compute @workgroup_size(256)
fn quiet_dry_tail(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x; if (i >= u.n) { return; }
  W[i] = 0.0; S[i] = 0.0; S2[i] = 0.0; M[i] = 0u;
  for (var ka = 0u; ka < u.nAct; ka++) {
    let q = klAt(ka) * u.n + i;
    D[q] += G[q] + P[q]; G[q] = 0.0; P[q] = 0.0;
  }
}

// Separate bookkeeping keeps each compute stage within Metal's 10-buffer limit.
// Dispatched after settlement, before any counter readback or fixation.
@compute @workgroup_size(256)
fn quiet_dry_clear(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x; if (i >= u.n) { return; }
  NEWF[i] = 0u;
  if (i < u.ntiles) { atomicStore(&FLAGS2[i], 0u); atomicStore(&FLAGS[i], 0u); }
  if (i == 0u) {
    atomicStore(&CTR[1], 0u); atomicStore(&CTR[6], 0u); atomicStore(&CTR[7], 0u);
    atomicStore(&FLAGS2[2u * u.ntiles], 0u);
  }
}
