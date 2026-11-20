// The pinned-edge feed's transport on the GPU (edge-feed.mjs, from "the outgoing rate is independent of dt" on). The
// host computes the geometry (edge-geometry.mjs) and uploads, for the cells the feed works on, a compact list (EFL:
// count, then cell and box index pairs) and per cell the extra evaporation rate and the pressure solve's face fluxes
// (EFG: ex, flux to +x, flux to +y, the cell's outgoing demand). Each step then runs ef_reset, ef_begin and ROUNDS
// rounds of ef_prep and ef_apply: a round is one substep of edgeFeed, its length the box's remaining time or the least
// 0.5 W / rate over the box's cells with water, so no donor gives more than half its water. A box whose time is spent
// leaves the later rounds as no-ops; the last round takes all the time left (counted in EFB[2]: none in practice).
// EFB, per box b at 16 + b * (EF_RMAX + 1): whether the box has surface water, then the least substep of each round
// (f32 bits, atomicMin). EFB[0] boxes, [1] rounds encoded, [2] forced last rounds, [3] the most rounds a step needed.
// The geometry depends on the footprint (cells the wash has wet) and on the boxes round the wet and damp cells. Each
// step ef_watch counts the one and bounds the other, and ef_watch_end compares them with what they were when the
// geometry was made (EFB[10..15)) and raises EFB[4] when they differ, so the host makes it again (stepfull efSteps).
// EFB[5..10): this step's footprint count and wet box x0, y0, x1, y1.
export const EF_RMAX = 32;
export const EF_BMAX = 256;
// The host shader names its pigment list (`channel(a)` the a-th pigment worked on, `count` of them) and defines
// efHalted(): true where a queued step must do nothing (the Lab's surface batches).
export const edgeFeedWgsl = ({ channel = 'klAt', count = 'u.nAct' } = {}) => `
@group(0) @binding(45) var<storage, read> EFL: array<u32>;
@group(0) @binding(46) var<storage, read> EFG: array<vec4<f32>>;
@group(0) @binding(47) var<storage, read_write> EFS: array<vec4<f32>>;   // W0, rho, unmet demand, evaporated by the feed
@group(0) @binding(48) var<storage, read_write> EFC: array<f32>;         // each pigment's concentration at the substep's start
@group(0) @binding(49) var<storage, read_write> EFB: array<atomic<u32>>;
@group(0) @binding(50) var<storage, read_write> EFP: array<u32>;         // what the host reads to make the geometry: 4 bits a cell
override ROUND: u32 = 0u;
const EF_RMAX: u32 = ${EF_RMAX}u;
fn efBox(b: u32) -> u32 { return 16u + b * (EF_RMAX + 1u); }
// the box's time left at the start of round r, as edgeFeed's loop spends it
fn efRemaining(b: u32, r: u32) -> f32 {
  var rem = u.dt;
  for (var q = 0u; q < r; q++) { rem = rem - min(rem, bitcast<f32>(atomicLoad(&EFB[efBox(b) + 1u + q]))); }
  return rem;
}
fn efActive(b: u32, r: u32) -> bool { return atomicLoad(&EFB[efBox(b)]) != 0u && efRemaining(b, r) > 1e-12; }
fn efSub(b: u32, r: u32) -> f32 {
  let rem = efRemaining(b, r);
  if (r + 1u >= atomicLoad(&EFB[1])) { return rem; }
  return min(rem, bitcast<f32>(atomicLoad(&EFB[efBox(b) + 1u + r])));
}
fn efCandidate(i: u32, b: u32, r: u32, water: f32) {
  let g = EFG[i]; let rate = g.w + g.x;
  if (rate > 0.0 && water > 2.0 * u.wetEps) { atomicMin(&EFB[efBox(b) + 1u + r], bitcast<u32>(0.5 * water / rate)); }
}
@compute @workgroup_size(256)
fn ef_reset(@builtin(local_invocation_index) li: u32) {
  if (efHalted()) { return; }
  let words = atomicLoad(&EFB[0]) * (EF_RMAX + 1u);
  for (var q = li; q < words; q += 256u) { atomicStore(&EFB[16u + q], select(0x7f800000u, 0u, q % (EF_RMAX + 1u) == 0u)); }
}
@compute @workgroup_size(256)
fn ef_begin(@builtin(global_invocation_id) gid: vec3<u32>) {
  let q = gid.x; if (q >= EFL[0] || efHalted()) { return; }
  let i = EFL[1u + 2u * q]; let b = EFL[2u + 2u * q];
  if (W[i] > 0.0) { atomicOr(&EFB[efBox(b)], 1u); }
  efCandidate(i, b, 0u, W[i]);
}
@compute @workgroup_size(256)
fn ef_prep(@builtin(global_invocation_id) gid: vec3<u32>) {
  let q = gid.x; if (q >= EFL[0] || efHalted()) { return; }
  let i = EFL[1u + 2u * q]; let b = EFL[2u + 2u * q];
  if (!efActive(b, ROUND)) { return; }
  atomicMax(&EFB[3], ROUND + 1u);
  let sub = efSub(b, ROUND);
  if (q == 0u && ROUND + 1u == atomicLoad(&EFB[1])) {
    for (var bb = 0u; bb < atomicLoad(&EFB[0]); bb++) {
      if (efActive(bb, ROUND) && bitcast<f32>(atomicLoad(&EFB[efBox(bb) + 1u + ROUND])) < efRemaining(bb, ROUND)) { atomicAdd(&EFB[2], 1u); }
    }
  }
  let w0 = W[i]; let dem = EFG[i].w;
  var s = EFS[i];
  s.x = w0; s.y = select(1.0, min(1.0, 0.5 * w0 / (sub * dem)), dem > 0.0);
  EFS[i] = s;
  for (var ka = 0u; ka < u.nAct; ka++) {
    let k = klAt(ka);
    EFC[k * u.n + i] = select(0.0, G[k * u.n + i] / w0, w0 > 1e-12);
  }
}
@compute @workgroup_size(256)
fn ef_apply(@builtin(global_invocation_id) gid: vec3<u32>) {
  let q = gid.x; if (q >= EFL[0] || efHalted()) { return; }
  let i = EFL[1u + 2u * q]; let b = EFL[2u + 2u * q];
  if (!efActive(b, ROUND)) { return; }
  let sub = efSub(b, ROUND);
  let x = i % u.w;
  // the four faces: neighbour, flux from this cell towards it; the flux of a face is stored at its -x / -y cell
  var nbr = array<u32, 4>(0u, 0u, 0u, 0u);
  var flux = array<f32, 4>(0.0, 0.0, 0.0, 0.0);
  if (x + 1u < u.w) { nbr[0] = i + 1u; flux[0] = EFG[i].y; }
  if (x > 0u) { nbr[1] = i - 1u; flux[1] = -EFG[i - 1u].y; }
  if (i + u.w < u.n) { nbr[2] = i + u.w; flux[2] = EFG[i].z; }
  if (i >= u.w) { nbr[3] = i - u.w; flux[3] = -EFG[i - u.w].z; }
  // signed volume each face moves out of this cell this substep, and from whom
  var vol = array<f32, 4>(0.0, 0.0, 0.0, 0.0);
  var src = array<u32, 4>(i, i, i, i);
  let own = EFS[i];
  var inner = 0.0;
  for (var e = 0u; e < 4u; e++) {
    let f = flux[e]; if (f == 0.0) { continue; }
    let donor = select(nbr[e], i, f > 0.0);
    let v = sub * abs(f) * EFS[donor].y;
    if (!(v > 0.0)) { continue; }
    src[e] = donor; vol[e] = select(v, -v, f > 0.0);
    inner = inner + vol[e];
  }
  for (var ka = 0u; ka < u.nAct; ka++) {
    let k = klAt(ka); var cout = 0.0;
    for (var e = 0u; e < 4u; e++) { if (vol[e] != 0.0) { cout = cout + vol[e] * EFC[k * u.n + src[e]]; } }
    if (cout != 0.0) { let p = k * u.n + i; G[p] = max(0.0, G[p] + cout); }
  }
  let water = max(0.0, own.x + inner);
  var pending = own.z + sub * EFG[i].x;
  let ev = min(water, pending); pending = pending - ev;
  let wn = water - ev;
  W[i] = wn;
  if (wn > 0.0) { M[i] = 1u; }
  EFS[i] = vec4<f32>(own.x, own.y, pending, own.w + (water - wn));
  if (ROUND + 1u < atomicLoad(&EFB[1])) { efCandidate(i, b, ROUND + 1u, wn); }
}
@compute @workgroup_size(256)
fn ef_watch(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x; if (i >= u.n || efHalted()) { return; }
  if (M[i] == 1u || EVER[i] == 1u) { atomicAdd(&EFB[5], 1u); }
  if (M[i] == 1u || S[i] > 0.02 * PAPER[i].x) {
    let x = i % u.w; let y = i / u.w;
    atomicMin(&EFB[6], x); atomicMin(&EFB[7], y); atomicMax(&EFB[8], x); atomicMax(&EFB[9], y);
  }
}
// the wet mask, the footprint and the damp pores (sheet.mjs wetBoxes) of eight cells a word: bit 1 M, 2 ever, 4 M or damp
@compute @workgroup_size(256)
fn ef_pack(@builtin(global_invocation_id) gid: vec3<u32>) {
  let q = gid.x; if (q * 8u >= u.n) { return; }
  var v = 0u;
  for (var k = 0u; k < 8u; k++) {
    let i = q * 8u + k; if (i >= u.n) { break; }
    var b = 0u;
    if (M[i] == 1u) { b = 5u; }
    if (EVER[i] == 1u) { b = b | 2u; }
    if (S[i] > 0.02 * PAPER[i].x) { b = b | 4u; }
    v = v | (b << (4u * k));
  }
  EFP[q] = v;
}
@compute @workgroup_size(1)
fn ef_watch_end() {
  if (efHalted()) { return; }
  var moved = false;
  for (var k = 0u; k < 5u; k++) { if (atomicLoad(&EFB[5u + k]) != atomicLoad(&EFB[10u + k])) { moved = true; } }
  if (moved) { atomicStore(&EFB[4], 1u); }
  atomicStore(&EFB[5], 0u); atomicStore(&EFB[6], 0xffffffffu); atomicStore(&EFB[7], 0xffffffffu); atomicStore(&EFB[8], 0u); atomicStore(&EFB[9], 0u);
}
`.replaceAll('klAt(', `${channel}(`).replaceAll('u.nAct', count);
