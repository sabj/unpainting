// CG tile operations and the same-step continuation for a box that needs more than the host's parallel budget.
// One workgroup owns a continuing box, so storage barriers publish every tile before a neighbour reads it. This
// exceptional path keeps the same matrix, preconditioner, residual tolerance and tile-sum order as the parallel solve.
export const LV_ITMAX = 8192;
export const filmLevelCgWgsl = `
fn lvRunning(b: u32) -> bool { return lvState(b) == 1u; }
var<workgroup> lvGo: u32;
var<workgroup> lvCoef: f32;
var<workgroup> lvZc: array<f32, 5>;
fn lvCgA(t: u32, j: u32, lid: vec3<u32>, li: u32, par: u32, beta: f32) {
  let po = par * u.n; let pn = (1u - par) * u.n;
  if (li == 0u) {
    lvZc[0] = LVR[16u * j + 6u];
    let tx = t % u.tw; let ty = t / u.tw;
    var zW = 0.0; var zN = 0.0; var zE = 0.0; var zS = 0.0;
    if (tx > 0u) { let nj = LVX[lvTM() + t - 1u]; if (nj != LV_NONE) { zW = LVR[16u * nj + 6u]; } }
    if (ty > 0u) { let nj = LVX[lvTM() + t - u.tw]; if (nj != LV_NONE) { zN = LVR[16u * nj + 6u]; } }
    if (tx + 1u < u.tw) { let nj = LVX[lvTM() + t + 1u]; if (nj != LV_NONE) { zE = LVR[16u * nj + 6u]; } }
    if (ty + 1u < u.th) { let nj = LVX[lvTM() + t + u.tw]; if (nj != LV_NONE) { zS = LVR[16u * nj + 6u]; } }
    lvZc[1] = zW; lvZc[2] = zN; lvZc[3] = zE; lvZc[4] = zS;
  }
  workgroupBarrier();
  let zc = lvZc[0];
  var pq = 0.0;
  let c = lvCellOf(t, lid);
  if (c.z != 0u) {
    let i = c.y * u.w + c.x;
    if (lvLevel(i)) {
      let f = lvFaces(i, c.x, c.y);
      let p = (LVB[i].z + zc) + beta * LVP[po + i];
      var q = LVA[i].w * p;
      if (f[0].y != 0.0) { let k = i - 1u; let zk = select(zc, lvZc[1], lid.x == 0u); q -= f[0].y * ((LVB[k].z + zk) + beta * LVP[po + k]); }
      if (f[1].y != 0.0) { let k = i - u.w; let zk = select(zc, lvZc[2], lid.y == 0u); q -= f[1].y * ((LVB[k].z + zk) + beta * LVP[po + k]); }
      if (f[2].y != 0.0) { let k = i + 1u; let zk = select(zc, lvZc[3], lid.x == 15u); q -= f[2].y * ((LVB[k].z + zk) + beta * LVP[po + k]); }
      if (f[3].y != 0.0) { let k = i + u.w; let zk = select(zc, lvZc[4], lid.y == 15u); q -= f[3].y * ((LVB[k].z + zk) + beta * LVP[po + k]); }
      LVP[pn + i] = p; LVB[i].w = q; pq = p * q;
    }
  }
  lvSum[li] = pq; lvSum2[li] = 0.0;
  workgroupBarrier();
  lvReduce2(li);
  if (li == 0u) { LVR[16u * j] = lvSum[0]; }
  workgroupBarrier();
}
fn lvCgC(t: u32, j: u32, lid: vec3<u32>, li: u32, par: u32, alpha: f32) {
  let pn = (1u - par) * u.n;
  var rr = 0.0; var rz = 0.0; var rTile = 0.0; var has = false; var v = vec4<f32>(0.0); var diag = 1.0; var cw = 0.0; var cn = 0.0; var i = 0u;
  let c = lvCellOf(t, lid);
  if (c.z != 0u) {
    i = c.y * u.w + c.x;
    if (lvLevel(i)) {
      v = LVB[i]; let a = LVA[i]; diag = a.w; cw = a.y; cn = a.z; has = true;
      v.x = v.x + alpha * LVP[pn + i]; v.y = v.y - alpha * v.w;
    }
  }
  lvCw[li] = cw; lvCn[li] = cn;
  workgroupBarrier();
  let cp = vec4<f32>(
    select(0.0, cw, lid.x > 0u),
    select(0.0, cn, lid.y > 0u),
    select(0.0, lvCw[li + 1u], lid.x < 15u),
    select(0.0, lvCn[li + 16u], lid.y < 15u)
  );
  let z = lvPrecond(li, lid, v.y, diag, cp, has);
  if (has) { v.z = z; LVB[i] = v; rr = v.y * v.y; rz = v.y * z; rTile = v.y; }
  lvSum[li] = rr; lvSum2[li] = rz; lvSum3[li] = rTile;
  workgroupBarrier();
  lvReduce3(li);
  if (li == 0u) { let base = 16u * j; LVR[base + 1u + 2u * par] = lvSum[0]; LVR[base + 2u + 2u * par] = lvSum2[0]; LVR[base + 5u] = lvSum3[0]; }
  workgroupBarrier();
}
// Each CG iteration k is lv_cg_a (SpMV), lv_cg_c (update + tile RBGS with cached per-box alpha and shared-mem conductances)
// and lv_cg_d (box sums, convergence check, coarse-tile RBGS and beta). Converged steps exit immediately on LVS[12] == 0.
@compute @workgroup_size(16, 16)
fn lv_cg_a(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { lvRun = atomicLoad(&LVS[12]); lvCount = LVX[1]; }
  if (workgroupUniformLoad(&lvRun) == 0u) { return; }
  let count = workgroupUniformLoad(&lvCount);
  for (var j = wid.x; j < count; j += nw.x) {
    let t = LVX[lvLT() + j];
    if (li == 0u) { let bx = LVX[lvTR(((t / u.tw) / 2u) * lvTw32() + (t % u.tw) / 2u) + 7u]; lvBox = select(LV_NONE, bx, lvRunning(bx)); }
    let b = workgroupUniformLoad(&lvBox);
    if (b == LV_NONE) { continue; }
    let beta = select(bitcast<f32>(LVX[lvBX(b) + 10u]), 0.0, LVK0);
    lvCgA(t, j, lid, li, LVPAR, beta);
  }
}
@compute @workgroup_size(16, 16)
fn lv_cg_c(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { lvRun = atomicLoad(&LVS[12]); lvCount = LVX[1]; }
  if (workgroupUniformLoad(&lvRun) == 0u) { return; }
  let count = workgroupUniformLoad(&lvCount);
  var prevBox = LV_NONE;
  var boxGo = false;
  var boxAlpha = 0.0;
  var boxOff = 0u;
  for (var j = wid.x; j < count; j += nw.x) {
    let t = LVX[lvLT() + j];
    if (li == 0u) { let bx = LVX[lvTR(((t / u.tw) / 2u) * lvTw32() + (t % u.tw) / 2u) + 7u]; lvBox = select(LV_NONE, bx, lvRunning(bx)); }
    let b = workgroupUniformLoad(&lvBox);
    if (b == LV_NONE) { continue; }
    let B = lvBX(b);
    if (b != prevBox) {
      lvBoxSums(b, li, 0u, 0u);
      if (li == 0u) {
        let pq = lvSum[0];
        let rz = bitcast<f32>(LVX[B + 11u]);
        lvCoef = rz / pq; lvGo = select(0u, 1u, pq > 0.0);
        lvCOff = LVX[B + 7u];
      }
      boxGo = workgroupUniformLoad(&lvGo) != 0u;
      boxAlpha = workgroupUniformLoad(&lvCoef);
      boxOff = workgroupUniformLoad(&lvCOff);
      prevBox = b;
    }
    if (j == boxOff) {
      if (li == 0u) {
        if (!boxGo) { LVX[B + 14u] = 4u; atomicAdd(&LVS[4], 1u); atomicSub(&LVS[12], 1u); }
        else { LVX[B + 9u] = bitcast<u32>(boxAlpha); }
      }
      workgroupBarrier();
    }
    if (!boxGo) { continue; }
    lvCgC(t, j, lid, li, LVPAR, boxAlpha);
  }
}
// Close an iteration (LVPAR its parity): check convergence, solve the coarse-tile correction, and compute beta.
@compute @workgroup_size(256)
fn lv_cg_d(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { lvRun = atomicLoad(&LVS[12]); }
  if (workgroupUniformLoad(&lvRun) == 0u) { return; }
  let nb = lvBoxCount(li);
  for (var b = wid.x; b < nb; b += nw.x) {
    if (li == 0u) { lvBox = select(0u, 1u, lvRunning(b)); }
    if (workgroupUniformLoad(&lvBox) == 0u) { continue; }
    lvBoxSums(b, li, 1u + 2u * LVPAR, 2u + 2u * LVPAR);
    let B = lvBX(b);
    let rzLoc = lvSum2[0];
    if (li == 0u) { lvGo = select(1u, 0u, lvSum[0] <= bitcast<f32>(LVX[B + 12u])); }
    if (workgroupUniformLoad(&lvGo) == 0u) {
      if (li == 0u) {
        let it = LVX[B + 13u] + 1u; LVX[B + 13u] = it;
        atomicMax(&LVS[3], it);
        LVX[B + 14u] = 3u;
        atomicSub(&LVS[12], 1u);
      }
      workgroupBarrier();
      continue;
    }
    let rzCoarse = lvCoarseSolve(b, li);
    if (li == 0u) {
      let next = rzLoc + rzCoarse;
      LVX[B + 10u] = bitcast<u32>(next / bitcast<f32>(LVX[B + 11u])); LVX[B + 11u] = bitcast<u32>(next);
      let it = LVX[B + 13u] + 1u; LVX[B + 13u] = it;
      atomicMax(&LVS[3], it);
    }
    workgroupBarrier();
  }
}

// Close the parallel budget before entering here. Its latest p is in plane 1 - LVPAR; beta, rz and z_coarse are
// already closed by lv_cg_d. Converged boxes do no work. A numerical failure or the safety ceiling is an error, never
// a converged state: flux/transport exclude that box, and adaptLevel fails the run on its next status read.
var<workgroup> lvOffset: u32;
@compute @workgroup_size(16, 16)
fn lv_cg_continue(@builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  let nb = lvBoxCount(li);
  for (var b = wid.x; b < nb; b += nw.x) {
    let B = lvBX(b);
    if (li == 0u) { lvBox = select(0u, 1u, lvRunning(b)); lvCount = LVX[B + 8u]; lvOffset = LVX[B + 7u]; }
    if (workgroupUniformLoad(&lvBox) == 0u) { continue; }
    let count = workgroupUniformLoad(&lvCount); let off = workgroupUniformLoad(&lvOffset);
    if (li == 0u) { atomicAdd(&LVS[10], 1u); }
    var par = 1u - LVPAR;
    loop {
      if (li == 0u) {
        if (lvRunning(b) && LVX[B + 13u] >= ${LV_ITMAX}u) { LVX[B + 14u] = 4u; atomicAdd(&LVS[4], 1u); }
        lvGo = select(0u, 1u, lvRunning(b)); lvCoef = bitcast<f32>(LVX[B + 10u]);
      }
      if (workgroupUniformLoad(&lvGo) == 0u) { break; }
      let beta = workgroupUniformLoad(&lvCoef);
      for (var j = off; j < off + count; j++) { lvCgA(LVX[lvLT() + j], j, lid, li, par, beta); }
      storageBarrier();
      lvBoxSums(b, li, 0u, 0u);
      if (li == 0u) {
        let pq = lvSum[0]; lvGo = select(0u, 1u, pq > 0.0);
        lvCoef = bitcast<f32>(LVX[B + 11u]) / pq;
        if (!(pq > 0.0)) { LVX[B + 14u] = 4u; atomicAdd(&LVS[4], 1u); }
      }
      if (workgroupUniformLoad(&lvGo) == 0u) { break; }
      let alpha = workgroupUniformLoad(&lvCoef);
      for (var j = off; j < off + count; j++) { lvCgC(LVX[lvLT() + j], j, lid, li, par, alpha); }
      storageBarrier();
      lvBoxSums(b, li, 1u + 2u * par, 2u + 2u * par);
      let rzLoc = lvSum2[0];
      if (li == 0u) { lvGo = select(1u, 0u, lvSum[0] <= bitcast<f32>(LVX[B + 12u])); }
      if (workgroupUniformLoad(&lvGo) == 0u) {
        if (li == 0u) {
          let it = LVX[B + 13u] + 1u; LVX[B + 13u] = it;
          atomicMax(&LVS[3], it);
          LVX[B + 14u] = 3u;
        }
        storageBarrier(); workgroupBarrier();
        break;
      }
      let rzCoarse = lvCoarseSolve(b, li);
      if (li == 0u) {
        let next = rzLoc + rzCoarse; let it = LVX[B + 13u] + 1u;
        LVX[B + 10u] = bitcast<u32>(next / bitcast<f32>(LVX[B + 11u])); LVX[B + 11u] = bitcast<u32>(next); LVX[B + 13u] = it;
        atomicMax(&LVS[3], it);
      }
      storageBarrier(); workgroupBarrier();
      par = 1u - par;
    }
    storageBarrier(); workgroupBarrier();
  }
}
`;
