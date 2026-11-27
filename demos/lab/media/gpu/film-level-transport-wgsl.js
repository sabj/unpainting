// Generated from src/media/gpu/film-level-transport-wgsl.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Physical donor transport shared by the parallel rounds and their same-step continuation.
export const filmLevelTransportWgsl = ({ channel = 'klAt', count = 'u.nAct' } = {}) => `
fn lvScale(t: u32, lid: vec3<u32>, round: u32) {
    let c = lvCellOf(t, lid); if (c.z == 0u) { return; }
    let i = c.y * u.w + c.x; if (!lvRound(i)) { return; }
    let B = lvBX(lvBoxOf(i)); let subs = LVX[B + 15u];
    if (LVX[B + 14u] == 0u || round >= subs) { return; }
    let wk = W[i]; let out = lvPos(lvOut(i, c.x, c.y)) / f32(subs);
    let budget = 0.95 * max(0.0, wk - u.lvFloor);
    var scale = 1.0;
    if (out > budget && out > 0.0) { scale = budget / out; }
    LVF[i].z = scale;
    for (var ka = 0u; ka < ${count}; ka++) {
      let q = ${channel}(ka) * u.n + i; let g = G[q];
      var conc = 0.0;
      if (wk > 1e-12) { conc = g / wk; }
      let pout = out * scale * conc;
      var pscale = 1.0;
      if (pout > 0.95 * g && pout > 0.0) { pscale = (0.95 * g) / pout; }
      o4set(q, vec4<f32>(conc, pscale, 0.0, 0.0));
    }
}
@compute @workgroup_size(16, 16)
fn lv_s1(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  if (LVROUND >= atomicLoad(&LVS[13])) { return; }
  let count = LVX[1];
  for (var j = wid.x; j < count; j += nw.x) { lvScale(LVX[lvLT() + j], lid, LVROUND); }
}
fn lvApply(t: u32, lid: vec3<u32>, round: u32) {
    let c = lvCellOf(t, lid); if (c.z == 0u) { return; }
    let i = c.y * u.w + c.x; if (!lvRound(i)) { return; }
    let B = lvBX(lvBoxOf(i)); let subs = LVX[B + 15u];
    if (LVX[B + 14u] == 0u || round >= subs) { return; }
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
@compute @workgroup_size(16, 16)
fn lv_s2(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  if (LVROUND >= atomicLoad(&LVS[13])) { return; }
  let count = LVX[1];
  for (var j = wid.x; j < count; j += nw.x) { lvApply(LVX[lvLT() + j], lid, LVROUND); }
}
// Finish rounds beyond the host's parallel budget in this same step. One group owns each box, so the storage
// barriers publish every tile's donor scales before any tile applies a round, and every new water/pigment value
// before the next round. The two paths call the same cell helpers; their rounding and donor budgets are identical.
var<workgroup> lvTransportRounds: u32;
@compute @workgroup_size(16, 16)
fn lv_transport_continue(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  let nb = lvBoxCount(li);
  for (var b = wid.x; b < nb; b += nw.x) {
    let B = lvBX(b);
    if (li == 0u) {
      lvTransportRounds = select(0u, LVX[B + 15u], LVX[B + 14u] == 3u);
      lvOffset = LVX[B + 7u]; lvCount = LVX[B + 8u];
    }
    let rounds = workgroupUniformLoad(&lvTransportRounds);
    let off = workgroupUniformLoad(&lvOffset); let count = workgroupUniformLoad(&lvCount);
    for (var r = LVROUND; r < rounds; r++) {
      for (var j = off; j < off + count; j++) { lvScale(LVX[lvLT() + j], lid, r); }
      storageBarrier();
      for (var j = off; j < off + count; j++) { lvApply(LVX[lvLT() + j], lid, r); }
      storageBarrier();
    }
    workgroupBarrier();
  }
}
`;
