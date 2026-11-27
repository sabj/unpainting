// One coarse block per workgroup. RT0 boundary flux plus its Neumann DCT
// correction; only interior faces change, so coarse face integrals stay fixed.
struct Params { dims: vec4u, dispatch: vec4u, flags: vec4u }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read_write> geom: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> volume: array<f32>;
@group(0) @binding(3) var<storage, read_write> enabled: array<u32>;
@group(0) @binding(4) var<storage, read> coarse: array<vec2f>;
@group(0) @binding(5) var<storage, read> dct: array<f32>;
struct Schedule { worst: atomic<u32>, count: u32, padding: vec2u, dispatches: array<u32> }
@group(0) @binding(6) var<storage, read_write> scheduleData: Schedule;
@group(0) @binding(7) var<storage, read> water: array<f32>;
@group(0) @binding(8) var<storage, read> cells: array<u32>;
@group(0) @binding(9) var<storage, read> fineMask: array<u32>;
@group(0) @binding(10) var<storage, read> blockCounts: array<u32>;
var<workgroup> before: array<f32, 64>;
var<workgroup> after: array<f32, 64>;
var<workgroup> phi: array<f32, 64>;
var<workgroup> temp: array<f32, 64>;
var<workgroup> wetMask: array<u32, 64>;
var<workgroup> totals: vec4f;
var<workgroup> needsSolve: u32;
var<workgroup> blockEnabled: u32;
var<workgroup> wetCount: u32;
var<workgroup> uniformBdry: u32;

fn cellIn(c: u32, f: u32, nn: u32) -> bool {
  let mode = p.flags.x;
  if (mode == 1u) { return true; }
  let cOff = select(0u, p.dispatch.z, mode == 2u);
  let cnt = blockCounts[cOff + c];
  if (cnt == 0u || cnt == nn) { return true; }
  let mOff = select(0u, p.flags.y, mode == 2u);
  return ((fineMask[mOff + (f >> 2u)] >> ((f & 3u) * 8u)) & 0xffu) != 0u;
}

// Packing is a copy, with no water arithmetic or changes to the RT0 solve.
// Separate dispatches clear the mask before the active index list fills it.
@compute @workgroup_size(128)
fn inputs(@builtin(global_invocation_id) g: vec3u) {
  let f = g.x + g.y * p.dispatch.y;
  if (f >= p.dims.y) { return; }
  enabled[f] = 0u; geom[f] = vec4f(0.);
}
@compute @workgroup_size(128)
fn activate(@builtin(global_invocation_id) g: vec3u) {
  let at = g.x + g.y * p.dispatch.y;
  if (at >= p.dispatch.w) { return; }
  let f = cells[at]; enabled[f] = 1u;
  geom[f] = vec4f(water[f], water[p.dims.y + f], 0., 0.);
}

@compute @workgroup_size(64)
fn prolong(@builtin(workgroup_id) group: vec3u, @builtin(local_invocation_index) at: u32) {
  let c = group.x + group.y * p.dispatch.x;
  let nn = p.dims.z * p.dims.z;
  let N = p.dims.z; let FW = p.dims.x; let cw = p.dims.w; let ch = p.dispatch.z / cw;
  if (c >= p.dispatch.z) { return; }
  let cx = c % cw; let cy = c / cw; let base = cy * N * FW + cx * N;
  if (at == 0u) { blockEnabled = enabled[base]; }
  if (workgroupUniformLoad(&blockEnabled) == 0u) { return; }
  var fl = 0.; var ft = 0.;
  if (cx > 0u) { fl = coarse[c - 1u].x; }
  if (cy > 0u) { ft = coarse[c - cw].y; }
  let fr = coarse[c].x; let fb = coarse[c].y;
  let x = at % N; let y = at / N; let f = base + y * FW + x;
  var bL = 0.; var bR = 0.; var bT = 0.; var bB = 0.;
  if (at < nn) {
    let g = geom[f]; before[at] = g.x; after[at] = g.y;
    let wHere = cellIn(c, f, nn);
    wetMask[at] = select(0u, 1u, wHere);
    var blocked = 0.;
    if (x == 0u) {
      let ok = wHere && cx > 0u && cellIn(c - 1u, f - 1u, nn);
      bL = select(0., f32(N) * fl, ok);
      if (fl != 0. && !ok) { blocked = 1.; }
    }
    if (x + 1u == N) {
      let ok = wHere && cx + 1u < cw && cellIn(c + 1u, f + 1u, nn);
      bR = select(0., f32(N) * fr, ok);
      if (fr != 0. && !ok) { blocked = 1.; }
    }
    if (y == 0u) {
      let ok = wHere && cy > 0u && cellIn(c - cw, f - FW, nn);
      bT = select(0., f32(N) * ft, ok);
      if (ft != 0. && !ok) { blocked = 1.; }
    }
    if (y + 1u == N) {
      let ok = wHere && cy + 1u < ch && cellIn(c + cw, f + FW, nn);
      bB = select(0., f32(N) * fb, ok);
      if (fb != 0. && !ok) { blocked = 1.; }
    }
    temp[at] = blocked;
  }
  workgroupBarrier();
  if (at == 0u) {
    var cnt = 0u; var uni = 1u;
    for (var i = 0u; i < nn; i++) { cnt += wetMask[i]; if (temp[i] != 0.) { uni = 0u; } }
    wetCount = cnt; uniformBdry = select(0u, uni, cnt == nn);
  }
  workgroupBarrier();
  let wc = workgroupUniformLoad(&wetCount);
  if (wc == 0u) {
    if (at < nn) { geom[f].z = 0.; geom[f].w = 0.; }
    return;
  }
  let isUniform = workgroupUniformLoad(&uniformBdry) != 0u;
  var raw = vec2f(0.); var inn = 0.;
  if (at < nn) {
    if (isUniform) {
      raw = f32(N) * vec2f(fl + (fr - fl) * f32(x + 1u) / f32(N), ft + (fb - ft) * f32(y + 1u) / f32(N));
      let left = f32(N) * (fl + (fr - fl) * f32(x) / f32(N));
      let top = f32(N) * (ft + (fb - ft) * f32(y) / f32(N));
      inn = left - raw.x + top - raw.y;
    } else {
      raw = vec2f(select(0., bR, x + 1u == N), select(0., bB, y + 1u == N));
      inn = bL - bR + bT - bB;
    }
    phi[at] = inn;
  }
  workgroupBarrier();
  if (at == 0u) {
    var sum = vec4f(0.);
    // Match the oracle's serial sum order within this small block.
    for (var i = 0u; i < nn; i++) {
      if (wetMask[i] != 0u) { sum += vec4f(phi[i], after[i] - before[i], before[i], after[i]); }
    }
    totals = sum;
  }
  workgroupBarrier();
  if (at < nn) {
    if (wetMask[at] != 0u) {
      let sink = totals.x - totals.y;
      var share = sink / f32(wc);
      if (totals.z > 0.) { share = sink * before[at] / totals.z; }
      else if (totals.w > 0.) { share = sink * after[at] / totals.w; }
      phi[at] = -((after[at] - before[at]) - inn + share);
    } else {
      phi[at] = 0.;
    }
  }
  workgroupBarrier();
  if (at == 0u) {
    needsSolve = 0u;
    for (var i = 0u; i < nn; i++) { if (abs(phi[i]) > 1e-12) { needsSolve = 1u; } }
  }
  workgroupBarrier();
  if (workgroupUniformLoad(&needsSolve) != 0u) {
    if (wc == nn) {
      if (at < nn) {
        var v = 0.; for (var k = 0u; k < N; k++) { v += dct[y * N + k] * phi[k * N + x]; }
        temp[at] = v;
      }
      workgroupBarrier();
      if (at < nn) {
        var v = 0.; for (var k = 0u; k < N; k++) { v += temp[y * N + k] * dct[x * N + k]; }
        let lambda = dct[nn + y] + dct[nn + x];
        phi[at] = select(0., v / max(lambda, 1e-30), lambda > 0.);
      }
      workgroupBarrier();
      if (at < nn) {
        var v = 0.; for (var k = 0u; k < N; k++) { v += dct[k * N + y] * phi[k * N + x]; }
        temp[at] = v;
      }
      workgroupBarrier();
      if (at < nn) {
        var v = 0.; for (var k = 0u; k < N; k++) { v += temp[y * N + k] * dct[k * N + x]; }
        phi[at] = v;
      }
      workgroupBarrier();
      if (at < nn) {
        if (x + 1u < N) { raw.x += phi[at] - phi[at + 1u]; }
        if (y + 1u < N) { raw.y += phi[at] - phi[at + N]; }
      }
    } else {
      // Masked Neumann graph Laplacian via CG on the wet subset (zero flux across dry faces).
      // Only boundary blocks (<5% of blocks) take this branch; running CG in lane 0 avoids
      // barriers inside loops and matches the CPU serial reduction order exactly.
      if (at == 0u) {
        var mean = 0.;
        for (var i = 0u; i < nn; i++) { if (wetMask[i] != 0u) { mean += phi[i]; } }
        mean /= f32(wc);
        var rr = 0.;
        for (var i = 0u; i < nn; i++) {
          let rv = select(0., phi[i] - mean, wetMask[i] != 0u);
          before[i] = rv; after[i] = rv; phi[i] = 0.; rr += rv * rv;
        }
        let tol = max(1e-20, rr * 1e-11);
        for (var it = 0u; it < nn && rr > tol; it++) {
          var pap = 0.; var pp = 0.;
          for (var i = 0u; i < nn; i++) {
            if (wetMask[i] == 0u) { temp[i] = 0.; continue; }
            let ix = i % N; let iy = i / N; let pi = after[i];
            var ap = 0.;
            if (ix > 0u && wetMask[i - 1u] != 0u) { ap += pi - after[i - 1u]; }
            if (ix + 1u < N && wetMask[i + 1u] != 0u) { ap += pi - after[i + 1u]; }
            if (iy > 0u && wetMask[i - N] != 0u) { ap += pi - after[i - N]; }
            if (iy + 1u < N && wetMask[i + N] != 0u) { ap += pi - after[i + N]; }
            temp[i] = ap; pap += pi * ap; pp += pi * pi;
          }
          if (!(pap > 1e-6 * pp) || !(pap > 1e-24)) { break; }
          let alpha = rr / pap;
          var rrn = 0.;
          for (var i = 0u; i < nn; i++) {
            if (wetMask[i] != 0u) {
              phi[i] += alpha * after[i];
              before[i] -= alpha * temp[i];
              rrn += before[i] * before[i];
            }
          }
          if (rrn <= tol) { break; }
          let beta = rrn / rr; rr = rrn;
          for (var i = 0u; i < nn; i++) {
            if (wetMask[i] != 0u) { after[i] = before[i] + beta * after[i]; }
          }
        }
      }
      workgroupBarrier();
      if (at < nn && wetMask[at] != 0u) {
        if (x + 1u < N && wetMask[at + 1u] != 0u) { raw.x += phi[at] - phi[at + 1u]; }
        if (y + 1u < N && wetMask[at + N] != 0u) { raw.y += phi[at] - phi[at + N]; }
      }
    }
  }
  if (at < nn) { geom[f].z = raw.x; geom[f].w = raw.y; }
}

@compute @workgroup_size(128)
fn budget(@builtin(global_invocation_id) g: vec3u) {
  let f = g.x + g.y * p.dispatch.y;
  if (f >= p.dims.y) { return; }
  var v = 0.;
  if (enabled[f] != 0u) {
    let q = geom[f].zw; v = max(0., q.x) + max(0., q.y);
    if (f % p.dims.x > 0u) { v += max(0., -geom[f - 1u].z); }
    if (f >= p.dims.x) { v += max(0., -geom[f - p.dims.x].w); }
    let depth = max(geom[f].x, geom[f].y);
    var ratio = 1.; if (depth > 1e-9) { ratio = v / (.5 * depth); }
    if (v > 0.) { atomicMax(&scheduleData.worst, bitcast<u32>(ratio)); }
  }
  volume[f] = v;
}

// Same ceil/clamp donor budget as the CPU oracle. Inactive substeps dispatch
// zero workgroups, rather than scanning the sheet through a fixed 64-step loop.
@compute @workgroup_size(64)
fn schedule(@builtin(local_invocation_index) sub: u32) {
  let ratio = bitcast<f32>(atomicLoad(&scheduleData.worst));
  let count = u32(clamp(ceil(ratio), 1., 64.));
  if (sub == 0u) { scheduleData.count = count; }
  let at = sub * 3u;
  scheduleData.dispatches[at] = select(0u, p.flags.z, sub < count);
  scheduleData.dispatches[at + 1u] = p.flags.w;
  scheduleData.dispatches[at + 2u] = 1u;
}
