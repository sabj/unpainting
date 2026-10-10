// Sheet physics kernels adapted from src/media/gpu/stepfull.wgsl.
// Buffers are the sheet's fields, resident on the GPU; see gpu-sheet.js for the bindings and dispatch.
export const WGSL = String.raw`// A whole stepBox (sheet.mjs) as gathers on 16x16 tiles: edge distance, drying and absorption, flow with pigment
// transport, pigment exchange, slide, capillary spread, wet fronts. The JS driver prepends 'struct U' and the
// uniform binding (see gpu-sheet.js). Tiles that hold or border water are listed each step (tiles_*), the other kernels
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
@group(0) @binding(27) var<storage, read_write> PN: array<f32>;
@group(0) @binding(28) var<storage, read_write> DD: array<f32>;
@group(0) @binding(29) var<storage, read_write> NEWF: array<u32>;
@group(0) @binding(30) var<storage, read_write> TL: array<u32>;
@group(0) @binding(31) var<storage, read_write> FLAGS: array<u32>;
@group(0) @binding(32) var<storage, read_write> FLAGS2: array<atomic<u32>>;
@group(0) @binding(33) var<storage, read_write> CTR: array<atomic<u32>, 12>;
@group(0) @binding(34) var<storage, read_write> ARGS: array<u32, 9>;
@group(0) @binding(35) var<storage, read_write> EDGE: array<f32>;  // the final edge distance: bound to whichever of EA, EB the last pass wrote

@group(0) @binding(40) var<storage, read_write> PIG: array<atomic<u32>>;

struct Cx { i: u32, x: u32, y: u32, z: u32, ok: bool }
fn cx(wid: vec3<u32>, lid: vec3<u32>) -> Cx {
  if (wid.x >= TL[u.ntiles]) { return Cx(0u, 0u, 0u, 0u, false); }   // direct dispatches are sized above the tile count
  let t = TL[wid.x];
  let x = (t % u.tw) * 16u + lid.x; let y = (t / u.tw) * 16u + lid.y;
  return Cx(y * u.w + x, x, y, physicalChannel(wid.y), x < u.w && y < u.h);
}
fn wetAt(i: u32) -> bool { return M[i] == 1u; }

// ---- tile list -----------------------------------------------------------------------------------------------
@compute @workgroup_size(64)
fn tiles_prep(@builtin(global_invocation_id) g: vec3<u32>) {
  let t = g.x;
  if (t == 0u) { atomicStore(&CTR[0], 0u); atomicStore(&CTR[1], 0u); atomicStore(&CTR[5], 0u); atomicStore(&CTR[7], 0u); }
  if (t < u.ntiles) { FLAGS[t] = atomicLoad(&FLAGS2[t]); atomicStore(&FLAGS2[t], 0u); }
}
@compute @workgroup_size(64)
fn tiles_build(@builtin(global_invocation_id) g: vec3<u32>) {
  let t = g.x; if (t >= u.ntiles) { return; }
  let tx = i32(t % u.tw); let ty = i32(t / u.tw);
  var on = false;
  for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) {
    let xx = tx + dx; let yy = ty + dy;
    if (xx < 0 || yy < 0 || xx >= i32(u.tw) || yy >= i32(u.th)) { continue; }
    if (FLAGS[u32(yy) * u.tw + u32(xx)] != 0u) { on = true; }
  } }
  if (on) { let k = atomicAdd(&CTR[0], 1u); TL[k] = t; }
}
@compute @workgroup_size(1)
fn tiles_args() {
  // A latched surface batch preserves the terminal counts/list and zero dispatches.
  if (atomicLoad(&CTR[8]) != 0u && atomicLoad(&CTR[11]) != 0u) { return; }
  let c = atomicLoad(&CTR[0]);
  TL[u.ntiles] = c;
  if (c > u.cap && atomicLoad(&CTR[8]) == 0u) { atomicMax(&CTR[4], c); }   // the host dispatched fewer workgroups than there were tiles: the step is wrong
  ARGS[0] = c; ARGS[1] = 1u; ARGS[2] = 1u;
  ARGS[3] = c; ARGS[4] = u.p3; ARGS[5] = 1u;
}
var<workgroup> anyWet: atomic<u32>;
@compute @workgroup_size(16, 16)
fn wetscan(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid);
  if (lid.x == 0u && lid.y == 0u) { atomicStore(&anyWet, 0u); }
  workgroupBarrier();
  // bit 1: wet, on the surface or in damp pores; bit 2: water standing on the surface (the CPU sheet's M)
  if (c.ok && (M[c.i] == 1u || S[c.i] > 0.02 * PAPER[c.i].x)) { atomicOr(&anyWet, select(1u, 3u, M[c.i] == 1u)); }
  if (c.ok && W[c.i] != 0.0) { atomicOr(&anyWet, 4u); }
  workgroupBarrier();
  let seen = atomicLoad(&anyWet);
  if (lid.x == 0u && lid.y == 0u && (seen & 3u) != 0u) {
    let t = TL[wid.x];
    atomicOr(&FLAGS2[t], 1u); atomicAdd(&CTR[1], 1u);
    if ((seen & 2u) != 0u) { atomicAdd(&CTR[5], 1u); }
  }
  if (lid.x == 0u && lid.y == 0u && (seen & 4u) != 0u) { atomicAdd(&CTR[7], 1u); }
}

// Surface-dry batches retain the old host observation quantum exactly. The
// existing tile counters are complete after wetscan's dispatch. Later queued
// global and cell dispatches receive zero work; tiles_args also preserves them.
@compute @workgroup_size(1)
fn surface_boundary() {
  if (atomicLoad(&CTR[8]) == 0u || atomicLoad(&CTR[11]) != 0u) { return; }
  let ran = atomicAdd(&CTR[9], 1u) + 1u;
  let quantum = atomicLoad(&CTR[10]);
  if (ran % quantum == 0u && (atomicLoad(&CTR[5]) == 0u || atomicLoad(&CTR[1]) == 0u)) {
    atomicStore(&CTR[11], 1u);
    ARGS[0] = 0u; ARGS[3] = 0u; ARGS[6] = 0u;
  }
}

// Conservative pigment presence: exact nonzero masses, no threshold. Keep observed
// bits so skipped scratch planes can never be reused after their pigment disappears.
@compute @workgroup_size(16, 16)
fn pigment_scan(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let q = c.z * u.n + c.i;
  if (G[q] != 0.0 || P[q] != 0.0 || D[q] != 0.0 || TOP[q] != 0.0) { atomicOr(&PIG[TL[wid.x]], 1u << c.z); }
}
@compute @workgroup_size(64)
fn pigment_masks(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= u.ntiles) { return; }
  let tx = i32(g.x % u.tw); let ty = i32(g.x / u.tw); var bits = 0u;
  // A whole tile halo covers all neighbour gathers and both flow iterations.
  for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) {
    let x = tx + dx; let y = ty + dy;
    if (x >= 0 && y >= 0 && x < i32(u.tw) && y < i32(u.th)) { bits |= atomicLoad(&PIG[u32(y) * u.tw + u32(x)]); }
  } }
  TL[u.ntiles + 1u + g.x] = bits;
}
fn hasPigment(c: Cx, k: u32) -> bool { return u.p2 == 0u || (TL[u.ntiles + 1u + (c.y / 16u) * u.tw + c.x / 16u] & (1u << k)) != 0u; }

// ---- edge distance ---------------------------------------------------------------------------------------------
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
@compute @workgroup_size(16, 16)
fn edge_first(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  EB[c.i] = edgeNew(c, 0u);
}
@compute @workgroup_size(16, 16)
fn edge_a2b(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  EB[c.i] = edgeNew(c, 1u);
}
@compute @workgroup_size(16, 16)
fn edge_b2a(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  EA[c.i] = edgeNew(c, 2u);
}
// The chain is first -> EB, then b2a -> EA, a2b -> EB, ... ; 'EDGE' names whichever holds the last result

// ---- 1. drying and absorption ------------------------------------------------------------------------------------
@compute @workgroup_size(16, 16)
fn phase1(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  let i = c.i;
  let e = EDGE[i];
  let near = select(0.0, 1.0 - (e - 1.0) / u.edgeWidth, e <= u.edgeWidth);
  let wv = max(0.0, W[i] - u.dt * (u.evap + u.edgeEvap * near));
  let a = min(min(u.dt * u.absorb, max(0.0, PAPER[i].x - S[i])), max(0.0, wv - u.film));
  var wn = wv;
  if (a > 0.0) {
    let aw = a / wv;
    for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; }
      let q = k * u.n + i;
      let gg = G[q] * aw * pigB(k).w;
      G[q] = G[q] - gg; P[q] = P[q] + gg;
    }
    wn = wv - a;
  }
  S[i] = S[i] + a; W[i] = wn;
}

// ---- 2. flow ----------------------------------------------------------------------------------------------------
@compute @workgroup_size(16, 16)
fn faces(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
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
@compute @workgroup_size(16, 16)
fn wsc(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
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
  return sgn * amt * select(cj * carryJ, ci * carryI, f > 0.0) + u.diffuse * (ci - cj) * mw * carryM;
}
@compute @workgroup_size(16, 16)
fn pflux_k(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || !hasPigment(c, c.z)) { return; }
  let i = c.i; let base = c.z * u.n;
  var qx = 0.0; var qy = 0.0;
  if (M[i] == 1u) {
    let wi = W[i]; let gi = G[base + i];
    if (c.x < u.w - 1u && M[i + 1u] == 1u) { let j = i + 1u; qx = pflux(FX[i], wi, W[j], gi, G[base + j], WSC[i], WSC[j]); }
    if (c.y < u.h - 1u && M[i + u.w] == 1u) { let j = i + u.w; qy = pflux(FY[i], wi, W[j], gi, G[base + j], WSC[i], WSC[j]); }
  }
  QX[base + i] = qx; QY[base + i] = qy;
}
@compute @workgroup_size(16, 16)
fn ppout(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || !hasPigment(c, c.z)) { return; }
  let i = c.i; let base = c.z * u.n;
  if (M[i] != 1u) { SC[base + i] = 1.0; return; }
  var o = max(QX[base + i], 0.0) + max(QY[base + i], 0.0);
  if (c.x > 0u && M[i - 1u] == 1u) { o += max(-QX[base + i - 1u], 0.0); }
  if (c.y > 0u && M[i - u.w] == 1u) { o += max(-QY[base + i - u.w], 0.0); }
  let lim = G[base + i] * 0.95;
  SC[base + i] = select(1.0, lim / o, o > lim);
}
// Flux and its outgoing limiter use the same frozen W/G/WSC inputs. Incoming
// left/up flux is recomputed with the original function and operand order.
@compute @workgroup_size(16, 16)
fn pflux_out(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || !hasPigment(c, c.z)) { return; }
  let i = c.i; let base = c.z * u.n;
  var qx = 0.0; var qy = 0.0;
  if (M[i] == 1u) {
    let wi = W[i]; let gi = G[base + i];
    if (c.x < u.w - 1u && M[i + 1u] == 1u) { let j = i + 1u; qx = pflux(FX[i], wi, W[j], gi, G[base + j], WSC[i], WSC[j]); }
    if (c.y < u.h - 1u && M[i + u.w] == 1u) { let j = i + u.w; qy = pflux(FY[i], wi, W[j], gi, G[base + j], WSC[i], WSC[j]); }
  }
  QX[base + i] = qx; QY[base + i] = qy;
  if (M[i] != 1u) { SC[base + i] = 1.0; return; }
  var o = max(qx, 0.0) + max(qy, 0.0);
  if (c.x > 0u && M[i - 1u] == 1u) { let j = i - 1u; o += max(-pflux(FX[j], W[j], W[i], G[base + j], G[base + i], WSC[j], WSC[i]), 0.0); }
  if (c.y > 0u && M[i - u.w] == 1u) { let j = i - u.w; o += max(-pflux(FY[j], W[j], W[i], G[base + j], G[base + i], WSC[j], WSC[i]), 0.0); }
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
@compute @workgroup_size(16, 16)
fn apply_w0(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) { let c = cx(wid, lid); if (c.ok) { apply_water(c, true); } }
@compute @workgroup_size(16, 16)
fn apply_w1(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) { let c = cx(wid, lid); if (c.ok) { apply_water(c, false); } }
@compute @workgroup_size(16, 16)
fn apply_g(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || !hasPigment(c, c.z) || M[c.i] != 1u) { return; }
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

// ---- 3. pigment exchange ---------------------------------------------------------------------------------------
@compute @workgroup_size(16, 16)
fn p3a(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u || RESIST[c.i] != 0u) { return; }
  let i = c.i; let Wi = W[i]; let hh = PAPER3[i].z;
  let thin = min(3.0, 0.12 / max(0.04, Wi));
  let ld = Wi / u.liftDepth; let wetting = select(ld * ld, 1.0, ld >= 1.0);
  let rewet = u.hasTop != 0u && Wi > u.film;
  let turnover = select(0.0, min(1.0, WENT[i] / Wi), Wi > 1e-6);
  var settled = 0.0;
  if (u.granFill > 0.0) { for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } settled += D[k * u.n + i]; } }
  for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; }
    let q = k * u.n + i;
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
  for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } gs += G[k * u.n + i]; }
  let hold = u.holdCap * Wi;
  if (u.holdOn != 0u && gs > hold) {
    let f = 1.0 - hold / gs;
    for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } let q = k * u.n + i; let q2 = G[q] * f; G[q] -= q2; D[q] += q2; }
  }
}
@compute @workgroup_size(16, 16)
fn dep_k(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  var d = 0.0; for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } d += D[k * u.n + c.i]; }
  DEP[c.i] = u.slideFill * d;
}
fn surf(j: u32, fl: f32) -> f32 { return (1.0 - fl) * PAPER3[j].w + fl * PAPER3[j].x + DEP[j]; }
@compute @workgroup_size(16, 16)
fn slide_out(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || !hasPigment(c, c.z) || M[c.i] != 1u) { return; }
  let i = c.i; let q = c.z * u.n + i;
  OUTM[q] = 0.0; OUT4[q] = vec4<f32>(0.0);
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
  let moved = Dk * min(0.2, u.slide * gg * film * sum * u.dt);
  OUTM[q] = moved; OUT4[q] = moved * ex / sum;
}
@compute @workgroup_size(16, 16)
fn slide_apply(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || !hasPigment(c, c.z) || M[c.i] != 1u) { return; }
  let i = c.i; let base = c.z * u.n;
  var d = -OUTM[base + i];
  if (c.x < u.w - 1u && M[i + 1u] == 1u) { d += OUT4[base + i + 1u].y; }
  if (c.x > 0u && M[i - 1u] == 1u) { d += OUT4[base + i - 1u].x; }
  if (c.y < u.h - 1u && M[i + u.w] == 1u) { d += OUT4[base + i + u.w].w; }
  if (c.y > 0u && M[i - u.w] == 1u) { d += OUT4[base + i - u.w].z; }
  if (d != 0.0) { D[base + i] = max(0.0, D[base + i] + d); }
}

// ---- 4. capillary spread ---------------------------------------------------------------------------------------
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
@compute @workgroup_size(16, 16)
fn cap_s(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
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
@compute @workgroup_size(16, 16)
fn cap_p(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || !hasPigment(c, c.z)) { return; }
  let i = c.i; let base = c.z * u.n;
  var o = 0.0; var inn = 0.0; var dep = 0.0;
  if (c.x < u.w - 1u) { pmove(i, i + 1u, 0u, base, &o, &inn, &dep, true); pmove(i + 1u, i, 1u, base, &o, &inn, &dep, false); }
  if (c.x > 0u) { pmove(i, i - 1u, 1u, base, &o, &inn, &dep, true); pmove(i - 1u, i, 0u, base, &o, &inn, &dep, false); }
  if (c.y < u.h - 1u) { pmove(i, i + u.w, 2u, base, &o, &inn, &dep, true); pmove(i + u.w, i, 3u, base, &o, &inn, &dep, false); }
  if (c.y > 0u) { pmove(i, i - u.w, 3u, base, &o, &inn, &dep, true); pmove(i - u.w, i, 2u, base, &o, &inn, &dep, false); }
  PN[base + i] = P[base + i] - o + inn; DD[base + i] = dep;
}

// Both capillary passes read the old pore-water field. Reuse their eight face
// fluxes in one cell invocation; neither pass reads the other's output.
fn pmove_flux(a: u32, b: u32, ds: f32, base: u32, out: ptr<function, f32>, inn: ptr<function, f32>, dep: ptr<function, f32>, asDonor: bool) {
  if (ds <= 0.0) { return; }
  let q = P[base + a] * min(1.0, ds / S[a]);
  if (q == 0.0) { return; }
  if (asDonor) { *out += q; }
  else {
    let catchF = select(u.wickFilter, 0.0, S[b] > u.capDelta * PAPER[b].x);
    *inn += q * (1.0 - catchF); *dep += q * catchF;
  }
}
@compute @workgroup_size(16, 16)
fn cap_sp(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i;
  var ds = array<f32, 8>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  var v = S[i];
  if (c.x < u.w - 1u) { ds[0] = capflux(i, i + 1u, 0u); ds[1] = capflux(i + 1u, i, 1u); v -= ds[0]; v += ds[1]; }
  if (c.x > 0u) { ds[2] = capflux(i, i - 1u, 1u); ds[3] = capflux(i - 1u, i, 0u); v -= ds[2]; v += ds[3]; }
  if (c.y < u.h - 1u) { ds[4] = capflux(i, i + u.w, 2u); ds[5] = capflux(i + u.w, i, 3u); v -= ds[4]; v += ds[5]; }
  if (c.y > 0u) { ds[6] = capflux(i, i - u.w, 3u); ds[7] = capflux(i - u.w, i, 2u); v -= ds[6]; v += ds[7]; }
  S2[i] = v;
  for (var a = 0u; a < u.p3; a++) {
    let k = physicalChannel(a); if (!hasPigment(c, k)) { continue; }
    let base = k * u.n;
    var o = 0.0; var inn = 0.0; var dep = 0.0;
    if (c.x < u.w - 1u) { pmove_flux(i, i + 1u, ds[0], base, &o, &inn, &dep, true); pmove_flux(i + 1u, i, ds[1], base, &o, &inn, &dep, false); }
    if (c.x > 0u) { pmove_flux(i, i - 1u, ds[2], base, &o, &inn, &dep, true); pmove_flux(i - 1u, i, ds[3], base, &o, &inn, &dep, false); }
    if (c.y < u.h - 1u) { pmove_flux(i, i + u.w, ds[4], base, &o, &inn, &dep, true); pmove_flux(i + u.w, i, ds[5], base, &o, &inn, &dep, false); }
    if (c.y > 0u) { pmove_flux(i, i - u.w, ds[6], base, &o, &inn, &dep, true); pmove_flux(i - u.w, i, ds[7], base, &o, &inn, &dep, false); }
    PN[base + i] = P[base + i] - o + inn; DD[base + i] = dep;
  }
}

// ---- 5. wet fronts ---------------------------------------------------------------------------------------------
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
@compute @workgroup_size(16, 16)
fn p5a(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i;
  for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } let q = k * u.n + i; P[q] = max(0.0, PN[q]); D[q] += DD[q]; }
  var s = max(0.0, S2[i]);
  if (W[i] <= u.wetEps && s > 0.0 && (M[i] == 1u || nearWet(c.x, c.y))) {
    var d = min(s, u.dt * u.paperDry);
    if (s - d <= 0.02 * PAPER[i].x) { d = s; }
    let f = d / s; s -= d;
    for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } let q = k * u.n + i; let qq = P[q] * f; P[q] -= qq; D[q] += qq; }
  }
  S2[i] = s;
}
// the value a raster-order walk sees for cell j when it is at cell i: cells before i are final, cells after are not
fn sSeen(j: u32, i: u32) -> f32 { return select(S[j], S2[j], j < i); }
@compute @workgroup_size(16, 16)
fn p5b(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i; NEWF[i] = 0u;
  let pi = PAPER[i]; let si = S2[i];
  var nb = array<u32, 4>(0u, 0u, 0u, 0u); var nbOk = array<bool, 4>(false, false, false, false);
  if (c.x < u.w - 1u) { nb[0] = i + 1u; nbOk[0] = true; }
  if (c.x > 0u) { nb[1] = i - 1u; nbOk[1] = true; }
  if (c.y < u.h - 1u) { nb[2] = i + u.w; nbOk[2] = true; }
  if (c.y > 0u) { nb[3] = i - u.w; nbOk[3] = true; }
  if (M[i] == 0u) {
    var feeding = false; var wn = 0.0; var ws = 0.0; var fed = false;
    for (var d = 0u; d < 4u; d++) {
      if (!nbOk[d]) { continue; }
      let j = nb[d]; if (M[j] == 0u) { continue; }
      wn += 1.0; ws += W[j]; if (W[j] > u.film) { feeding = true; }
      // a wet neighbour's front reaching this cell
      if (W[j] > u.wetEps) {
        let jx = i32(c.x); let jy = i32(c.y);
        let ix = i32(j % u.w); let iy = i32(j / u.w);
        let damp = select(0.0, min(1.0, sSeen(i, j) / (u.capSigma * pi.x)), EVER[i] == 1u);
        let aligned = abs(pi.z * f32(jx - ix) + pi.w * f32(jy - iy)) * pi.y;
        let throat = PAPER3[i].y;
        let need = (u.spill + u.spillHeight * PAPER3[i].z) * (1.0 - u.dampEase * damp) * exp(damp * (u.pinning * 2.0 * throat - u.pinFibre * aligned));
        if (W[j] > need) { fed = true; }
      }
    }
    var newly = fed;
    if (feeding && EVER[i] == 1u && si > u.capSigma * pi.x) { newly = true; }
    else if (wn >= 4.0 && ws / wn > u.film) { newly = true; }
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
@compute @workgroup_size(16, 16)
fn p5c(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i; let f = NEWF[i];
  S[i] = S2[i];
  if (f == 1u) { M[i] = 1u; EVER[i] = 1u; }
  if (f == 2u) {
    for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } let q = k * u.n + i; D[q] += G[q]; G[q] = 0.0; }
    M[i] = 0u;
  }
  NEWF[i] = 0u;
}

// ---- dry() support -----------------------------------------------------------------------------------------------
@compute @workgroup_size(16, 16)
fn level_k(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  var m = 0.0;
  if (c.x < u.w - 1u && M[c.i + 1u] == 1u) { m = max(m, abs(W[c.i] - W[c.i + 1u])); }
  if (c.y < u.h - 1u && M[c.i + u.w] == 1u) { m = max(m, abs(W[c.i] - W[c.i + u.w])); }
  if (m > 0.0) { atomicMax(&CTR[2], bitcast<u32>(m)); }
}
// whole-sheet: pores into the deposit, and whether any deposit exists
@compute @workgroup_size(16, 16)
fn fix_a(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x; var any = false;
  for (var k = 0u; k < u.K; k++) { let q = k * u.n + i; D[q] += P[q]; P[q] = 0.0; if (D[q] > 0.0) { any = true; } }
  if (any) { atomicOr(&CTR[3], 1u); }
}
@compute @workgroup_size(16, 16)
fn fix_b(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  for (var k = 0u; k < u.K; k++) { let q = k * u.n + i; TOP[q] = D[q]; D[q] = 0.0; }
  EVER[i] = 0u;
}

// ---- brush sync: a rectangle of the sheet to and from one packed buffer -----------------------------------------
// planes: W, s, M, ever, G[K], P[K], D[K]
@group(0) @binding(36) var<uniform> rc: vec4<u32>;   // x0, y0, width, height
@group(0) @binding(37) var<storage, read_write> PACK: array<f32>;
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
  W[i] = PACK[j]; S[i] = PACK[a + j]; M[i] = u32(PACK[2u * a + j]); EVER[i] = u32(PACK[3u * a + j]);
  for (var k = 0u; k < u.K; k++) {
    G[k * u.n + i] = PACK[(4u + k) * a + j]; P[k * u.n + i] = PACK[(4u + u.K + k) * a + j]; D[k * u.n + i] = PACK[(4u + 2u * u.K + k) * a + j];
  }
  if (M[i] == 1u || S[i] > 0.02 * PAPER[i].x) { atomicOr(&FLAGS2[(y / 16u) * u.tw + x / 16u], 1u); }
}
`;
