// Sheet physics kernels adapted from src/media/gpu/stepfull.wgsl.
// Buffers are the sheet's fields, resident on the GPU; see gpu-sheet.js for the bindings and dispatch.
import { edgeFeedWgsl } from '../media/gpu/edge-feed-wgsl.js';
import { filmLevelWgsl } from '../media/gpu/film-level-wgsl.js';
export const WGSL = String.raw`// A whole stepBox (sheet.mjs) as gathers on 16x16 tiles: the pinned-edge feed, drying and absorption, flow with pigment
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
  let radius = i32(u.poreHalo);   // pore subcycles reach further than a tile
  for (var dy = -radius; dy <= radius; dy++) { for (var dx = -radius; dx <= radius; dx++) {
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
  let radius = i32(u.poreHalo);
  for (var dy = -radius; dy <= radius; dy++) { for (var dx = -radius; dx <= radius; dx++) {
    let x = tx + dx; let y = ty + dy;
    if (x >= 0 && y >= 0 && x < i32(u.tw) && y < i32(u.th)) { bits |= atomicLoad(&PIG[u32(y) * u.tw + u32(x)]); }
  } }
  TL[u.ntiles + 1u + g.x] = bits;
}
// Scratch audit: QX/QY/SC and OUTM/OUT4 are cleared before pigment culling
// because apply_g/slide_apply gather neighbours. PN/DD are cell-local, produced
// by cap_p/cap_sp and consumed under the same frozen mask in p5a/cap_commit;
// absent channels are cleared there too. Edge-feed EFC has no pigment culling:
// ef_begin fills every active channel and ef_apply guards EFS donor water.
fn hasPigment(c: Cx, k: u32) -> bool { return u.p2 == 0u || (TL[u.ntiles + 1u + (c.y / 16u) * u.tw + c.x / 16u] & (1u << k)) != 0u; }

// ---- 1. drying and absorption ------------------------------------------------------------------------------------
@compute @workgroup_size(16, 16)
fn phase1(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  let i = c.i;
  WENT[i] = 0.0;
  // the faster drying at a pinned edge is the edge feed's (media/gpu/edge-feed-wgsl.js), run before
  let wv = max(0.0, W[i] - u.dt * u.evap);
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
fn concAt(i: u32) -> f32 {
  let wi = W[i];
  if (wi <= 1e-6) { return 0.0; }
  var s = 0.0;
  for (var a = 0u; a < u.p3; a++) { s += G[physicalChannel(a) * u.n + i]; }
  return s / wi;
}
fn faceDrive(i: u32, j: u32, wi: f32, wj: f32, p: f32, rate: f32) -> f32 {
  let hi = wi + u.slope * PAPER3[i].z;
  var f = rate * (hi - wj - u.slope * PAPER3[j].z);
  if (u.mar != 0.0) { f += p * u.mar * (concAt(i) - concAt(j)) * min(wi, wj); }
  return f;
}
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
      if (u.slope != 0.0 || u.mar != 0.0) { fx = faceDrive(i, i + 1u, wi, wj, p, rate); }
    }
    if (c.y < u.h - 1u && M[i + u.w] == 1u) {
      let wj = W[i + u.w];
      let p = 1.0 - u.ff + u.ff * (0.25 + 1.75 * PAPER2[i].y);
      let m = max(wi, wj) / u.flowDepth;
      let rate = min(0.25, max(0.0, p * u.flow * select(m * m, 1.0, m >= 1.0)));
      fy = rate * (wi - wj);
      if (u.slope != 0.0 || u.mar != 0.0) { fy = faceDrive(i, i + u.w, wi, wj, p, rate); }
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
  // paint mixes out into a standing film (sheet.js filmDiffuse); the current carries the donor's concentration
  var fd = 0.0; if (u.filmDiff > 0.0) { fd = min(0.2, u.filmDiff * min(1.0, mw / u.filmDepth)); }
  return sgn * amt * select(cj, ci, f > 0.0) + (u.diffuse * carryM + fd) * (ci - cj) * mw;
}
@compute @workgroup_size(16, 16)
fn pflux_k(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i; let base = c.z * u.n;
  // Neighbour gathers must never consume scratch left by a culled pigment tile.
  QX[base + i] = 0.0; QY[base + i] = 0.0; SC[base + i] = 1.0;
  if (!hasPigment(c, c.z)) { return; }
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
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i; let base = c.z * u.n;
  // Neighbour gathers must never consume scratch left by a culled pigment tile.
  SC[base + i] = 1.0;
  if (!hasPigment(c, c.z)) { return; }
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
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i; let base = c.z * u.n;
  // Neighbour gathers must never consume scratch left by a culled pigment tile.
  QX[base + i] = 0.0; QY[base + i] = 0.0; SC[base + i] = 1.0;
  if (!hasPigment(c, c.z)) { return; }
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
  if (f != 0.0) { dw -= select(-1.0, 1.0, f > 0.0) * abs(f) * select(WSC[i + 1u], WSC[i], f > 0.0); v += abs(f) * select(WSC[i + 1u], WSC[i], f > 0.0); }
  f = FY[i];
  if (f != 0.0) { dw -= select(-1.0, 1.0, f > 0.0) * abs(f) * select(WSC[i + u.w], WSC[i], f > 0.0); v += abs(f) * select(WSC[i + u.w], WSC[i], f > 0.0); }
  if (c.x > 0u && M[i - 1u] == 1u) { f = FX[i - 1u]; if (f != 0.0) { dw += select(-1.0, 1.0, f > 0.0) * abs(f) * select(WSC[i], WSC[i - 1u], f > 0.0); v += abs(f) * select(WSC[i], WSC[i - 1u], f > 0.0); } }
  if (c.y > 0u && M[i - u.w] == 1u) { f = FY[i - u.w]; if (f != 0.0) { dw += select(-1.0, 1.0, f > 0.0) * abs(f) * select(WSC[i], WSC[i - u.w], f > 0.0); v += abs(f) * select(WSC[i], WSC[i - u.w], f > 0.0); } }
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
// Grain-water closure shared with grain-water.mjs. The first 0.03 mm is held
// among fibres; connected-film conductance grows as free depth cubed.
fn grainMobilityG(Wi: f32) -> f32 {
  let h = max(0.0, Wi - 0.03); let h3 = h * h * h;
  return h3 / (h3 + 0.06 * 0.06 * 0.06);
}
fn grainSlideG(Wi: f32) -> f32 {
  let h = max(0.0, Wi - 0.03);
  return 0.12 * h * h / (h * h * h + 0.06 * 0.06 * 0.06);
}
// Vertical landing, connected-film hollow capture and Brownian deposition, as in settling.mjs.
fn hollowAt(i: u32) -> f32 { let p = PAPER3[i]; return max(0.0, (u.toothLo + u.toothSpan * p.x - p.w) / u.hollowUnit); }
fn settleShareG(v: f32, df: f32, gg: f32, hol: f32, Wi: f32) -> f32 {
  let h = max(0.001, Wi); let l = min(h, 0.02);
  let x = (v / h + v * gg * hol * grainMobilityG(Wi) / 0.06 + df / (l * l)) * u.dt;
  if (x < 0.01) { return x * (1.0 - x * (0.5 - x / 6.0)); }
  return 1.0 - exp(-x);
}
@compute @workgroup_size(16, 16)
fn p3a(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u || RESIST[c.i] != 0u) { return; }
  let i = c.i; let Wi = W[i]; let hh = PAPER3[i].z; let hol = hollowAt(i);
  let ld = Wi / u.liftDepth; let wetting = select(ld * ld, 1.0, ld >= 1.0);
  let rewet = u.hasTop != 0u && Wi > u.film;
  let turnover = select(0.0, min(1.0, WENT[i] / Wi * (u.mmPerCell / 0.25)), Wi > 1e-6);   // scour per mm the water travels
  var settled = 0.0;
  if (u.granFill > 0.0) { for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } settled += D[k * u.n + i]; } }
  // the suspension's mean Stokes speed by mass (sheet.js coSettle: a mix's fine particles ride down on the coarse ones)
  var vMix = 0.0;
  if (u.coSettle > 0.0) {
    var gm = 0.0;
    for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } let g = G[k * u.n + i]; vMix += g * pigB(k).x; gm += g; }
    vMix = select(0.0, vMix / gm, gm > 0.0);
  }
  for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; }
    let q = k * u.n + i;
    var Gk = G[q]; var Dk = D[q]; var top = 0.0;
    if (rewet) { top = TOP[q]; }
    if (Gk == 0.0 && Dk == 0.0 && !(rewet && top != 0.0)) { continue; }
    let pa = pigA(k); let pb = pigB(k);   // pa: gg, liftOf, scourOf, rep;  pb: Stokes speed (mm/s, times settle), omega, floc, mobility
    let gg = pa.x;
    let down = Gk * settleShareG(select(pb.x, (1.0 - u.coSettle) * pb.x + u.coSettle * vMix, u.coSettle > 0.0), pigC(k).x, gg, select(hol, hol * max(0.0, 1.0 - settled * u.granFill), u.granFill > 0.0), Wi);
    let shape = max(0.0, 1.0 + (hh - 1.0) * gg);
    let up = Dk * shape * (pa.y * wetting * u.dt + pa.z * turnover * grainMobilityG(Wi));
    let dn = min(Gk, max(0.0, down)); let uu = min(Dk, max(0.0, up));
    Dk += dn - uu; Gk += uu - dn;
    if (rewet) { let r = min(top, (top * u.rewetLift * u.dt) / pb.y); TOP[q] = top - r; Gk += r; }
    D[q] = Dk; G[q] = Gk;
  }
  var gs = 0.0;
  for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } gs += G[k * u.n + i]; }
  let hold = u.holdCap * Wi;
  if (u.holdOn != 0u && Wi < u.holdDepth && gs > hold) {   // only a film thinner than holdDepth strands its paint
    let f = 1.0 - hold / gs;
    for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } let q = k * u.n + i; let q2 = G[q] * f; G[q] -= q2; D[q] += q2; }
  }
}
@compute @workgroup_size(16, 16)
fn dep_k(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  var d = 0.0; for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } d += D[k * u.n + c.i]; }
  DEP[c.i] = d;   // the deposit's height, unscaled: the slide scales it by its box's fill (fillAt)
  if (FIXED_BED) {
    var support = DEP[2u * u.n + c.i];
    if (u.hasTop != 0u) { for (var k = 0u; k < u.K; k++) { support += TOP[k * u.n + c.i]; } }
    DEP[u.n + c.i] = support;
  }
}
fn surf(j: u32, fl: f32, fill: f32) -> f32 {
  var support = 0.0; if (FIXED_BED) { support = DEP[u.n + j]; }
  return (1.0 - fl) * PAPER3[j].w + fl * PAPER3[j].x + fill * (DEP[j] + support);
}
@compute @workgroup_size(16, 16)
fn slide_out(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u) { return; }
  let i = c.i; let q = c.z * u.n + i;
  // OUT4 is also levelling/backrun scratch: its .y may be 1 even for absent pigment.
  // Every wet neighbour is in TL (poreHalo >= 1); clear every active channel before culling.
  OUTM[q] = 0.0; OUT4[q] = vec4<f32>(0.0);
  if (!hasPigment(c, c.z)) { return; }
  let Wi = W[i]; let Dk = D[q]; let pa = pigA(c.z); let pb = pigB(c.z);
  let gg = pa.x;
  if (Wi <= 0.0 || gg <= 0.0 || Dk <= 0.0) { return; }
  let film = grainSlideG(Wi);
  let fill = fillAt(i); let here = surf(i, pb.z, fill); let rep = pa.w;
  var ex = vec4<f32>(0.0);
  if (c.x < u.w - 1u && M[i + 1u] == 1u) { ex.x = max(0.0, here - surf(i + 1u, pb.z, fill) - rep); }
  if (c.x > 0u && M[i - 1u] == 1u) { ex.y = max(0.0, here - surf(i - 1u, pb.z, fill) - rep); }
  if (c.y < u.h - 1u && M[i + u.w] == 1u) { ex.z = max(0.0, here - surf(i + u.w, pb.z, fill) - rep); }
  if (c.y > 0u && M[i - u.w] == 1u) { ex.w = max(0.0, here - surf(i - u.w, pb.z, fill) - rep); }
  let sum = ex.x + ex.y + ex.z + ex.w;
  if (sum <= 0.0) { return; }
  var moved = Dk * min(0.2, u.slide * pigC(c.z).y * gg * film * sum * u.dt);
  if (u.slideCap > 0.0 && fill > 0.0) {
    for (var e = 0u; e < 4u; e++) { if (ex[e] > 0.0) { moved = min(moved, u.slideCap * ex[e] / (fill * (1.0 + ex[e] / sum))); } }
  }
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
  // the fibres catch pore pigment at a dry front and it stays on the wet side, where the water left it
  let catchF = select(u.wickFilter, 0.0, EVER[b] != 0u && S[b] > u.capDelta * PAPER[b].x);
  if (asDonor) { *out += q; *dep += q * catchF; }
  else { *inn += q * (1.0 - catchF); }
}
@compute @workgroup_size(16, 16)
fn cap_p(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i; let base = c.z * u.n;
  PN[base + i] = 0.0; DD[base + i] = 0.0;
  if (!hasPigment(c, c.z)) { return; }
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
  // the fibres catch pore pigment at a dry front and it stays on the wet side, where the water left it
  let catchF = select(u.wickFilter, 0.0, EVER[b] != 0u && S[b] > u.capDelta * PAPER[b].x);
  if (asDonor) { *out += q; *dep += q * catchF; }
  else { *inn += q * (1.0 - catchF); }
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
    let k = physicalChannel(a); let base = k * u.n;
    PN[base + i] = 0.0; DD[base + i] = 0.0;
    if (!hasPigment(c, k)) { continue; }
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
    if (d > 0.0 && s - d <= 0.02 * PAPER[i].x) { d = s; }   // as sheet.mjs: with no drying (paperDry 0) a trace stays
    let f = d / s; s -= d;
    for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } let q = k * u.n + i; let qq = P[q] * f; P[q] -= qq; D[q] += qq; }
  }
  S2[i] = s;
}
// the value a raster-order walk sees for cell j when it is at cell i: cells before i are final, cells after are not
fn sSeen(j: u32, i: u32) -> f32 { return select(S[j], S2[j], j < i); }
// water (M) within R cells of (x, y) in each of the four directions (sheet.js heldHole)
fn heldHole(x: u32, y: u32, R: u32) -> bool {
  for (var d = 0u; d < 4u; d++) {
    var held = false;
    for (var k = 1u; k <= R; k++) {
      var xx = i32(x); var yy = i32(y);
      if (d == 0u) { xx += i32(k); } else if (d == 1u) { xx -= i32(k); } else if (d == 2u) { yy += i32(k); } else { yy -= i32(k); }
      if (xx < 0 || yy < 0 || xx >= i32(u.w) || yy >= i32(u.h)) { break; }
      let j = u32(yy) * u.w + u32(xx);
      if (M[j] != 0u) { held = true; break; }
    }
    if (!held) { return false; }
  }
  return true;
}
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
    var feeding = false; var wn = 0.0; var ws = 0.0; var hn = 0.0; var fed = false;
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
  let si = W[c.i] + u.slope * PAPER3[c.i].z;
  if (c.x < u.w - 1u && M[c.i + 1u] == 1u) { m = max(m, abs(si - W[c.i + 1u] - u.slope * PAPER3[c.i + 1u].z)); }
  if (c.y < u.h - 1u && M[c.i + u.w] == 1u) { m = max(m, abs(si - W[c.i + u.w] - u.slope * PAPER3[c.i + u.w].z)); }
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
  for (var k = 0u; k < u.K; k++) { let q = k * u.n + i;
    if (FIXED_BED && u.hasTop != 0u) { DEP[2u * u.n + i] += TOP[q]; }
    TOP[q] = D[q]; D[q] = 0.0; }
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

// ---- pore subcycles: publish one pass before the next gathers it (no drying or wet fronts here) ------------------
@compute @workgroup_size(16, 16)
fn cap_commit(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok) { return; }
  let i = c.i;
  for (var k = 0u; k < u.K; k++) { if (!hasPigment(c, k)) { continue; } let q = k * u.n + i; P[q] = max(0.0, PN[q]); D[q] += DD[q]; DD[q] = 0.0; }
  S[i] = max(0.0, S2[i]);
}
// a latched surface batch (surface_boundary) leaves the rest of its queued steps alone, the edge feed's too
fn efHalted() -> bool { return atomicLoad(&CTR[8]) != 0u && atomicLoad(&CTR[11]) != 0u; }
// what the boxes and levelling (media/gpu/film-level-wgsl.js) ask of the sheet: the lab keeps OUT4 whole; fixed-bed support uses DEP's third plane
fn o4get(q: u32) -> vec4<f32> { return OUT4[q]; }
fn o4set(q: u32, v: vec4<f32>) { OUT4[q] = v; }
const FIXED_BED: bool = false;
` + edgeFeedWgsl({ channel: 'physicalChannel', count: 'u.p3' }) + filmLevelWgsl({ channel: 'physicalChannel', count: 'u.p3' }) + String.raw`

// Interactive edge drying reads only the frozen mask, writes only its own water.
// No pigment is removed: existing levelling/flow feeds the thinned pinned rim.
fn realtimeEdge(x: u32, y: u32) -> bool {
  let i = y * u.w + x;
  return x == 0u || y == 0u || x + 1u == u.w || y + 1u == u.h ||
    (x > 0u && M[i - 1u] == 0u) || (x + 1u < u.w && M[i + 1u] == 0u) ||
    (y > 0u && M[i - u.w] == 0u) || (y + 1u < u.h && M[i + u.w] == 0u);
}
@compute @workgroup_size(16, 16)
fn ef_realtime(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let c = cx(wid, lid); if (!c.ok || M[c.i] != 1u || W[c.i] <= 0.0) { return; }
  var band = select(0.0, 1.0, realtimeEdge(c.x, c.y));
  if (band == 0.0) {
    if ((c.x > 0u && realtimeEdge(c.x - 1u, c.y)) ||
        (c.x + 1u < u.w && realtimeEdge(c.x + 1u, c.y)) ||
        (c.y > 0u && realtimeEdge(c.x, c.y - 1u)) ||
        (c.y + 1u < u.h && realtimeEdge(c.x, c.y + 1u))) { band = 0.35; }
  }
  W[c.i] = max(0.0, W[c.i] - u.dt * u.edgeEvap * 0.65 * band);
}
// Publish bounded partial CG iterates to the unchanged conservative flux kernels.
@compute @workgroup_size(64)
fn lv_realtime_close(@builtin(global_invocation_id) id: vec3<u32>) {
  for (var b = id.x; b < LVX[0]; b += 64u) {
    let B = lvBX(b);
    if (LVX[B + 14u] == 1u) { LVX[B + 14u] = 3u; }
  }
}
@compute @workgroup_size(64)
fn lv_realtime_subs(@builtin(global_invocation_id) id: vec3<u32>) {
  for (var b = id.x; b < LVX[0]; b += 64u) {
    let B = lvBX(b); LVX[B + 15u] = min(2u, LVX[B + 15u]);
  }
}

`;
