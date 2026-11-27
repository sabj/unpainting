// Generated from src/media/gpu/edge-feed-wgsl.mjs by tools/lab/sync-site-media.mjs. Edit the source.
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
// EFB[5..10): this step's footprint count and wet box x0, y0, x1, y1. EFB[15]: the latest round any cell offered a
// substep for this step (efCandidate). A box is active in round r > 0 only if round r - 1's substep was offered (else that
// round took all its time), so rounds past EFB[15] + 1 leave at once (efLate): the rounds encoded past the need cost
// almost nothing, and no box's sums change.
export const EF_RMAX = 32;
export const EF_BMAX = 256;
export const EF_TAIL = 16 + EF_BMAX * (EF_RMAX + 1);
// The host shader names its pigment list (`channel(a)` the a-th pigment worked on, `count` of them) and defines
// efHalted(): true where a queued step must do nothing (the Lab's surface batches).
export const edgeFeedWgsl = ({ channel = 'klAt', count = 'u.nAct', parallel = false } = {}) => `
@group(0) @binding(45) var<storage, read> EFL: array<u32>;
@group(0) @binding(46) var<storage, read> EFG: array<vec4<f32>>;
// Scalar struct members are separate memory locations; apply writes z/w while neighbours read x/y.
// Keep the existing 16-byte state/readback layout and storage-binding count in the painter and Lab.
struct EfState { x: f32, y: f32, z: f32, w: f32 }
@group(0) @binding(47) var<storage, read_write> EFS: array<EfState>;   // W0, rho, unmet demand, evaporated by the feed
@group(0) @binding(48) var<storage, read_write> EFC: array<f32>;         // each pigment's concentration at the substep's start
@group(0) @binding(49) var<storage, read_write> EFB: array<atomic<u32>>;
@group(0) @binding(50) var<storage, read_write> EFP: array<u32>;         // what the host reads to make the geometry: 4 bits a cell
override ROUND: u32 = 0u;
const EF_RMAX: u32 = ${EF_RMAX}u;
const EF_TAIL: u32 = ${EF_TAIL}u;
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
  if (rate > 0.0 && water > 2.0 * u.wetEps) {
    atomicMin(&EFB[efBox(b) + 1u + r], bitcast<u32>(0.5 * water / rate));
    if (r > atomicLoad(&EFB[15])) { atomicMax(&EFB[15], r); }
  }
}
fn efLate(r: u32) -> bool { return r > atomicLoad(&EFB[15]) + 1u; }
@compute @workgroup_size(256)
fn ef_reset(@builtin(local_invocation_index) li: u32) {
  if (efHalted()) { return; }
  if (li == 0u) { atomicStore(&EFB[15], 0u); }
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
fn efPrepCell(q: u32, r: u32) {
  let i = EFL[1u + 2u * q]; let b = EFL[2u + 2u * q];
  if (!efActive(b, r)) { return; }
  atomicMax(&EFB[3], r + 1u);
  let sub = efSub(b, r);
  if (q == 0u && r + 1u == atomicLoad(&EFB[1])) {
    for (var bb = 0u; bb < atomicLoad(&EFB[0]); bb++) {
      if (efActive(bb, r) && bitcast<f32>(atomicLoad(&EFB[efBox(bb) + 1u + r])) < efRemaining(bb, r)) { atomicAdd(&EFB[2], 1u); }
    }
  }
  efPrep(i, sub);
}
fn efPrep(i: u32, sub: f32) {
  let w0 = W[i]; let dem = EFG[i].w;
  var s = EFS[i];
  s.x = w0; s.y = select(1.0, min(1.0, 0.5 * w0 / (sub * dem)), dem > 0.0);
  EFS[i] = s;
  // Only outgoing donors can supply pigment. Tiny-water donors retain zero concentration,
  // guarded below, so their stale EFC entries are never read.
  if (w0 > 1e-12 && dem > 0.0) {
    for (var ka = 0u; ka < u.nAct; ka++) {
      let k = klAt(ka);
      EFC[k * u.n + i] = G[k * u.n + i] / w0;
    }
  }
}
fn efApplyCell(q: u32, r: u32) {
  let i = EFL[1u + 2u * q]; let b = EFL[2u + 2u * q];
  if (!efActive(b, r)) { return; }
  let total = atomicLoad(&EFB[1]);
  let rem = efRemaining(b, r);
  let sub = select(min(rem, bitcast<f32>(atomicLoad(&EFB[efBox(b) + 1u + r]))), rem, r + 1u >= total);
  let wn = efApply(i, sub);
  if (r + 1u < total && rem - sub > 1e-12) { efCandidate(i, b, r + 1u, wn); }
}
fn efApply(i: u32, sub: f32) -> f32 {
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
    for (var e = 0u; e < 4u; e++) { if (vol[e] != 0.0 && EFS[src[e]].x > 1e-12) { cout = cout + vol[e] * EFC[k * u.n + src[e]]; } }
    if (cout != 0.0) { let p = k * u.n + i; G[p] = max(0.0, G[p] + cout); }
  }
  let water = max(0.0, own.x + inner);
  var pending = own.z + sub * EFG[i].x;
  let ev = min(water, pending); pending = pending - ev;
  let wn = water - ev;
  W[i] = wn;
  if (wn > 0.0) { M[i] = 1u; }
  EFS[i].z = pending;
  EFS[i].w = own.w + (water - wn);
  return wn;
}
@compute @workgroup_size(256)
fn ef_prep(@builtin(global_invocation_id) gid: vec3<u32>) {
  let q = gid.x; if (q >= EFL[0] || efLate(ROUND) || efHalted()) { return; }
  efPrepCell(q, ROUND);
}
@compute @workgroup_size(256)
fn ef_apply(@builtin(global_invocation_id) gid: vec3<u32>) {
  let q = gid.x; if (q >= EFL[0] || efLate(ROUND) || efHalted()) { return; }
  efApplyCell(q, ROUND);
}
// Finish any remaining edge-feed rounds beyond the host's parallel budget in this same step.
// One workgroup checks whether any box still has time left; if not, it returns immediately with zero cell work.
var<workgroup> efMore: u32;
var<workgroup> efTotal: u32;
var<workgroup> efCnt: u32;
@compute @workgroup_size(256)
fn ef_continue(@builtin(local_invocation_index) li: u32) {
  if (li == 0u) {
    efTotal = select(atomicLoad(&EFB[1]), 0u, efHalted());
    efCnt = EFL[0];
  }
  let total = workgroupUniformLoad(&efTotal);
  let count = workgroupUniformLoad(&efCnt);
  if (count == 0u) { return; }
  for (var r = ROUND; r < total; r++) {
    if (li == 0u) {
      var any = 0u;
      let nb = atomicLoad(&EFB[0]);
      for (var bb = 0u; bb < nb; bb++) { if (efActive(bb, r)) { any = 1u; break; } }
      efMore = any;
    }
    if (workgroupUniformLoad(&efMore) == 0u) { break; }
    for (var q = li; q < count; q += 256u) { efPrepCell(q, r); }
    storageBarrier(); workgroupBarrier();
    for (var q = li; q < count; q += 256u) { efApplyCell(q, r); }
    storageBarrier(); workgroupBarrier();
  }
}
// Run reset, begin and all active rounds in one workgroup dispatch when the edge-feed cell list is compact.
// Keeps W, G, EFG, EFS and EFB resident in L1/L2 and collapses up to 66 dispatches into 1 with identical arithmetic.
@compute @workgroup_size(256)
fn ef_small(@builtin(local_invocation_index) li: u32) {
  if (li == 0u) {
    let halted = efHalted();
    efTotal = select(atomicLoad(&EFB[1]), 0u, halted);
    efCnt = select(EFL[0], 0u, halted);
    if (!halted) { atomicStore(&EFB[15], 0u); }
  }
  let total = workgroupUniformLoad(&efTotal);
  let count = workgroupUniformLoad(&efCnt);
  if (count == 0u) { return; }
  let words = atomicLoad(&EFB[0]) * (EF_RMAX + 1u);
  for (var q = li; q < words; q += 256u) { atomicStore(&EFB[16u + q], select(0x7f800000u, 0u, q % (EF_RMAX + 1u) == 0u)); }
  storageBarrier(); workgroupBarrier();
  for (var q = li; q < count; q += 256u) {
    let i = EFL[1u + 2u * q]; let b = EFL[2u + 2u * q];
    if (W[i] > 0.0) { atomicOr(&EFB[efBox(b)], 1u); }
    efCandidate(i, b, 0u, W[i]);
  }
  storageBarrier(); workgroupBarrier();
  for (var r = 0u; r < total; r++) {
    if (li == 0u) {
      var any = 0u;
      let nb = atomicLoad(&EFB[0]);
      for (var bb = 0u; bb < nb; bb++) { if (efActive(bb, r)) { any = 1u; break; } }
      efMore = any;
    }
    if (workgroupUniformLoad(&efMore) == 0u) { break; }
    for (var q = li; q < count; q += 256u) { efPrepCell(q, r); }
    storageBarrier(); workgroupBarrier();
    for (var q = li; q < count; q += 256u) { efApplyCell(q, r); }
    storageBarrier(); workgroupBarrier();
  }
}
// (gathered in the workgroup first, then one global atomic a workgroup: the same counts and bounds, without every wet
// cell of the sheet contending for the same five words)
var<workgroup> efWa: array<atomic<u32>, 6>;
@compute @workgroup_size(256)
fn ef_watch(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { atomicStore(&efWa[0], 0u); atomicStore(&efWa[1], 0xffffffffu); atomicStore(&efWa[2], 0xffffffffu); atomicStore(&efWa[3], 0u); atomicStore(&efWa[4], 0u); atomicStore(&efWa[5], 0u); }
  workgroupBarrier();
  let i = gid.x;
  if (i < u.n && !efHalted()) {
    let inFoot = M[i] == 1u || EVER[i] == 1u;
    let isDamp = M[i] == 1u || S[i] > 0.02 * PAPER[i].x;
    if (inFoot) {
      atomicAdd(&efWa[0], 1u);
      if (isDamp) { atomicAdd(&efWa[5], 1u); }
    }
    if (isDamp) {
      let x = i % u.w; let y = i / u.w;
      atomicMin(&efWa[1], x); atomicMin(&efWa[2], y); atomicMax(&efWa[3], x); atomicMax(&efWa[4], y);
    }
  }
  workgroupBarrier();
  if (li == 0u) {
    let c = atomicLoad(&efWa[0]); if (c > 0u) { atomicAdd(&EFB[5], c); }
    if (arrayLength(&EFB) >= EF_TAIL + 3u) {
      let fd = atomicLoad(&efWa[5]); if (fd > 0u) { atomicAdd(&EFB[EF_TAIL + 1u], fd); }
    }
    if (atomicLoad(&efWa[1]) != 0xffffffffu) {
      atomicMin(&EFB[6], atomicLoad(&efWa[1])); atomicMin(&EFB[7], atomicLoad(&efWa[2])); atomicMax(&EFB[8], atomicLoad(&efWa[3])); atomicMax(&EFB[9], atomicLoad(&efWa[4]));
    }
  }
}
// the wet mask, the footprint, the damp pores (sheet.mjs wetBoxes) and surface water of eight cells a word: bit 1 M,
// 2 ever, 4 M or damp, 8 water standing
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
    if (W[i] > 0.0) { b = b | 8u; }
    v = v | (b << (4u * k));
  }
  EFP[q] = v;
}
@compute @workgroup_size(1)
fn ef_watch_end() {
  if (efHalted()) { return; }
  var moved = false;
  let hasTail = arrayLength(&EFB) >= EF_TAIL + 3u;
  if (hasTail && atomicLoad(&EFB[EF_TAIL]) == 1u) {
    if (atomicLoad(&EFB[5]) != atomicLoad(&EFB[10]) || atomicLoad(&EFB[EF_TAIL + 1u]) != atomicLoad(&EFB[EF_TAIL + 2u])) { moved = true; }
  } else {
    for (var k = 0u; k < 5u; k++) { if (atomicLoad(&EFB[5u + k]) != atomicLoad(&EFB[10u + k])) { moved = true; } }
  }
  if (moved) { atomicStore(&EFB[4], 1u); }
  atomicStore(&EFB[5], 0u); atomicStore(&EFB[6], 0xffffffffu); atomicStore(&EFB[7], 0xffffffffu); atomicStore(&EFB[8], 0u); atomicStore(&EFB[9], 0u);
  if (hasTail) { atomicStore(&EFB[EF_TAIL + 1u], 0u); }
}
${parallel ? edgeParallelWgsl : ''}
`.replaceAll('klAt(', `${channel}(`).replaceAll('u.nAct', count);

// Painter-only parallel schedule. The default shader keeps the Lab's buffers and entry points unchanged.
// EF_META caches a box's remaining time/substep once per round; EF_ARGS is never bound by its indirect consumers.
const edgeParallelWgsl = `
@group(0) @binding(60) var<storage, read_write> EF_META: array<vec4<f32>>;
@group(0) @binding(61) var<storage, read_write> EF_ARGS: array<u32>;
var<workgroup> efMin: array<atomic<u32>, ${EF_BMAX}>;
var<workgroup> efWet: array<atomic<u32>, ${EF_BMAX}>;
var<workgroup> efAny: atomic<u32>;
fn efLocalReset(li: u32) {
  atomicStore(&efMin[li], 0x7f800000u); atomicStore(&efWet[li], 0u);
  if (li == 0u) { atomicStore(&efAny, 0u); }
  workgroupBarrier();
}
fn efLocalCandidate(i: u32, b: u32, water: f32) {
  let g = EFG[i]; let rate = g.w + g.x;
  if (rate > 0.0 && water > 2.0 * u.wetEps) {
    atomicMin(&efMin[b], bitcast<u32>(0.5 * water / rate));
    atomicOr(&efAny, 1u);
  }
}
fn efPublish(li: u32, r: u32) {
  workgroupBarrier();
  if (li < atomicLoad(&EFB[0])) {
    let candidate = atomicLoad(&efMin[li]);
    if (candidate != 0x7f800000u) { atomicMin(&EFB[efBox(li) + 1u + r], candidate); }
  }
  if (li == 0u && atomicLoad(&efAny) != 0u && r > 0u) { atomicMax(&EFB[15], r); }
}
@compute @workgroup_size(256)
fn ef_begin_parallel(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  efLocalReset(li);
  let q = gid.x;
  if (q < EFL[0] && !efHalted()) {
    let i = EFL[1u + 2u * q]; let b = EFL[2u + 2u * q];
    if (W[i] > 0.0) { atomicOr(&efWet[b], 1u); }
    efLocalCandidate(i, b, W[i]);
  }
  efPublish(li, 0u);
  if (li < atomicLoad(&EFB[0]) && atomicLoad(&efWet[li]) != 0u) { atomicOr(&EFB[efBox(li)], 1u); }
}
@compute @workgroup_size(256)
fn ef_round_prep(@builtin(local_invocation_index) li: u32) {
  if (li == 0u) { atomicStore(&efAny, 0u); }
  workgroupBarrier();
  if (li < atomicLoad(&EFB[0])) {
    let rem = efRemaining(li, ROUND);
    let go = !efHalted() && atomicLoad(&EFB[efBox(li)]) != 0u && rem > 1e-12;
    var sub = 0.0;
    if (go) {
      sub = efSub(li, ROUND);
      atomicOr(&efAny, 1u);
      atomicMax(&EFB[3], ROUND + 1u);
      if (ROUND + 1u == atomicLoad(&EFB[1]) && bitcast<f32>(atomicLoad(&EFB[efBox(li) + 1u + ROUND])) < rem) { atomicAdd(&EFB[2], 1u); }
    }
    EF_META[li] = vec4<f32>(rem, sub, select(0.0, 1.0, go), 0.0);
  }
  workgroupBarrier();
  if (li == 0u) {
    EF_ARGS[0] = select(0u, (EFL[0] + 255u) / 256u, atomicLoad(&efAny) != 0u);
    EF_ARGS[1] = 1u; EF_ARGS[2] = 1u;
  }
}
// Cache the immutable start-of-round box state in each workgroup. Preparing
// these few boxes alongside the cells removes a separate dispatch per round;
// no workgroup depends on another one's metadata writes.
var<workgroup> efRoundMeta: array<vec4<f32>, ${EF_BMAX}>;
fn efLoadRound(li: u32) -> bool {
  if (li == 0u) { efMore = select(0u, 1u, !efLate(ROUND) && !efHalted()); }
  if (workgroupUniformLoad(&efMore) == 0u) { return false; }
  if (li < atomicLoad(&EFB[0])) {
    let rem = efRemaining(li, ROUND);
    let go = atomicLoad(&EFB[efBox(li)]) != 0u && rem > 1e-12;
    var sub = 0.0;
    if (go) { sub = efSub(li, ROUND); }
    efRoundMeta[li] = vec4<f32>(rem, sub, select(0.0, 1.0, go), 0.0);
  }
  workgroupBarrier();
  return true;
}
@compute @workgroup_size(256)
fn ef_prep_parallel(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (!efLoadRound(li)) { return; }
  if (gid.x < atomicLoad(&EFB[0]) && efRoundMeta[li].z != 0.0) {
    atomicMax(&EFB[3], ROUND + 1u);
    if (ROUND + 1u == atomicLoad(&EFB[1]) && bitcast<f32>(atomicLoad(&EFB[efBox(li) + 1u + ROUND])) < efRoundMeta[li].x) { atomicAdd(&EFB[2], 1u); }
  }
  let q = gid.x; if (q >= EFL[0]) { return; }
  let i = EFL[1u + 2u * q]; let m = efRoundMeta[EFL[2u + 2u * q]];
  if (m.z != 0.0) { efPrep(i, m.y); }
}
@compute @workgroup_size(256)
fn ef_apply_parallel(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (!efLoadRound(li)) { return; }
  efLocalReset(li);
  let q = gid.x;
  if (q < EFL[0]) {
    let i = EFL[1u + 2u * q]; let b = EFL[2u + 2u * q]; let m = efRoundMeta[b];
    if (m.z != 0.0) {
      let wn = efApply(i, m.y);
      if (ROUND + 1u < atomicLoad(&EFB[1]) && m.x - m.y > 1e-12) { efLocalCandidate(i, b, wn); }
    }
  }
  efPublish(li, ROUND + 1u);
}
`;
