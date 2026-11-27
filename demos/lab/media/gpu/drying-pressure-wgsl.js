// Generated from src/media/gpu/drying-pressure-wgsl.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Browser-safe source: compact Galerkin multigrid and GPU-resident PCG scalars.
export const dryingPressureWgsl = `
struct Node {
  nb: array<vec4<i32>, 1>, weight: array<vec4<f32>, 1>, children: vec4<i32>,
  diag: f32, parent: i32, inverse: u32, terms: u32,
}
struct Term { node: u32, weight: f32 }
struct Level { offset: u32, count: u32, fine: u32, groups: u32, levels: array<vec4<u32>, 16> }
@group(0) @binding(0) var<storage, read> graph: array<Node>;
@group(0) @binding(1) var<storage, read_write> x: array<f32>;
@group(0) @binding(2) var<storage, read_write> b: array<f32>;
@group(0) @binding(3) var<storage, read_write> tmp: array<f32>;
@group(0) @binding(4) var<storage, read_write> p: array<f32>;
@group(0) @binding(5) var<storage, read_write> ap: array<f32>;
@group(0) @binding(6) var<storage, read_write> out: array<f32>;
@group(0) @binding(7) var<storage, read_write> scalar: array<f32>;
@group(0) @binding(8) var<storage, read> inverse: array<Term>;
@group(0) @binding(9) var<uniform> level: Level;

@compute @workgroup_size(256)
fn clear(@builtin(global_invocation_id) id: vec3<u32>) {
  if (scalar[4] == 0.0) { return; }
  if (id.x < arrayLength(&x)) { x[id.x] = 0.0; }
}
fn smoothAt(i: u32, alternate: bool) -> f32 {
  let node = graph[i];
  var sum = b[i];
  for (var a = 0u; a < 4u; a++) {
    let j = node.nb[a / 4u][a % 4u];
    if (j >= 0) {
      var v = x[u32(j)];
      if (alternate) { v = tmp[u32(j)]; }
      sum += node.weight[a / 4u][a % 4u] * v;
    }
  }
  var old = x[i];
  if (alternate) { old = tmp[i]; }
  return old + 0.7 * (sum / node.diag - old);
}
@compute @workgroup_size(256)
fn smooth0(@builtin(global_invocation_id) id: vec3<u32>) {
  if (scalar[4] == 0.0) { return; }
  if (id.x < level.count) { let i = level.offset + id.x; tmp[i] = smoothAt(i, false); }
}
@compute @workgroup_size(256)
fn smooth1(@builtin(global_invocation_id) id: vec3<u32>) {
  if (scalar[4] == 0.0) { return; }
  if (id.x < level.count) { let i = level.offset + id.x; x[i] = smoothAt(i, true); }
}
@compute @workgroup_size(256)
fn restrictResidual(@builtin(global_invocation_id) id: vec3<u32>) {
  if (scalar[4] == 0.0) { return; }
  if (id.x >= level.count) { return; }
  let i = level.offset + id.x;
  var sum = 0.0;
  for (var a = 0u; a < 4u; a++) {
    let c = graph[i].children[a];
    if (c < 0) { continue; }
    let k = u32(c); let node = graph[k];
    var r = b[k] - node.diag * x[k];
    for (var e = 0u; e < 4u; e++) {
      let j = node.nb[e / 4u][e % 4u]; if (j >= 0) { r += node.weight[e / 4u][e % 4u] * x[u32(j)]; }
    }
    sum += r;
  }
  b[i] = sum;
}
@compute @workgroup_size(256)
fn prolong(@builtin(global_invocation_id) id: vec3<u32>) {
  if (scalar[4] == 0.0) { return; }
  if (id.x >= level.count) { return; }
  let i = level.offset + id.x; let parent = graph[i].parent;
  if (parent >= 0) { x[i] += 1.4 * x[u32(parent)]; }
}
@compute @workgroup_size(256)
fn coarse(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= level.count) { return; }
  let i = level.offset + id.x; let node = graph[i];
  var sum = 0.0;
  for (var a = node.inverse; a < node.inverse + node.terms; a++) { sum += inverse[a].weight * b[inverse[a].node]; }
  x[i] = sum;
}

// A W-cycle on the small levels. One workgroup visits the tree twice per level;
// storage barriers replace dispatch boundaries, and each correction uses a new residual.
var<workgroup> pcgRunning: u32;
fn running(li: u32) -> bool {
  if (li == 0u) { pcgRunning = select(0u, 1u, scalar[4] != 0.0); }
  return workgroupUniformLoad(&pcgRunning) != 0u;
}
@compute @workgroup_size(256)
fn coarseCycle(@builtin(local_invocation_index) li: u32) {
  if (!running(li)) { return; }
  let start = level.levels[0].w; let last = level.levels[0].z - 1u;
  var phase: array<u32, 16>;
  var l = start;
  loop {
    let L = level.levels[l];
    if (l == last) {
      for (var q = li; q < L.y; q += 256u) {
        let i = L.x + q; let node = graph[i]; var sum = 0.0;
        for (var a = node.inverse; a < node.inverse + node.terms; a++) { sum += inverse[a].weight * b[inverse[a].node]; }
        x[i] = sum;
      }
      storageBarrier();
      if (l == start) { break; }
      l--; continue;
    }
    if (phase[l] == 0u) {
      for (var q = li; q < L.y; q += 256u) { let i = L.x + q; tmp[i] = smoothAt(i, false); }
      storageBarrier();
      for (var q = li; q < L.y; q += 256u) { let i = L.x + q; x[i] = smoothAt(i, true); }
      storageBarrier();
      phase[l] = 1u;
    } else {
      for (var q = li; q < L.y; q += 256u) {
        let i = L.x + q; let parent = graph[i].parent;
        if (parent >= 0) { x[i] += 1.4 * x[u32(parent)]; }
      }
      storageBarrier();
      if (phase[l] == 2u) {
        for (var q = li; q < L.y; q += 256u) { let i = L.x + q; tmp[i] = smoothAt(i, false); }
        storageBarrier();
        for (var q = li; q < L.y; q += 256u) { let i = L.x + q; x[i] = smoothAt(i, true); }
        storageBarrier();
        phase[l] = 0u;
        if (l == start) { break; }
        l--; continue;
      }
      phase[l] = 2u;
    }
    let C = level.levels[l + 1u];
    for (var q = li; q < C.y; q += 256u) {
      let i = C.x + q; var sum = 0.0;
      for (var a = 0u; a < 4u; a++) {
        let c = graph[i].children[a]; if (c < 0) { continue; }
        let k = u32(c); let node = graph[k]; var r = b[k] - node.diag * x[k];
        for (var e = 0u; e < 4u; e++) { let j = node.nb[e / 4u][e % 4u]; if (j >= 0) { r += node.weight[e / 4u][e % 4u] * x[u32(j)]; } }
        sum += r;
      }
      b[i] = sum; x[i] = 0.0;
    }
    storageBarrier();
    l++; phase[l] = 0u;
  }
}

var<workgroup> sums: array<vec2<f32>, 256>;
fn reduce(li: u32, value: vec2<f32>) -> vec2<f32> {
  sums[li] = value; workgroupBarrier();
  for (var stride = 128u; stride > 0u; stride /= 2u) {
    if (li < stride) { sums[li] += sums[li + stride]; }
    workgroupBarrier();
  }
  return sums[0];
}
@compute @workgroup_size(256)
fn dot(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(workgroup_id) group: vec3<u32>) {
  if (!running(li)) { return; }
  var v = vec2<f32>(0.0);
  if (id.x < level.fine) { v = vec2<f32>(b[id.x] * x[id.x], b[id.x] * b[id.x]); }
  let sum = reduce(li, v);
  if (li == 0u) { tmp[group.x] = sum.x; tmp[level.groups + group.x] = sum.y; }
}
fn total(li: u32) -> vec2<f32> {
  var v = vec2<f32>(0.0);
  for (var i = li; i < level.groups; i += 256u) { v += vec2<f32>(tmp[i], tmp[level.groups + i]); }
  return reduce(li, v);
}
@compute @workgroup_size(256)
fn initial(@builtin(local_invocation_index) li: u32) {
  if (!running(li)) { return; }
  let v = total(li);
  if (li == 0u) { scalar[0] = v.x; scalar[3] = v.y; scalar[4] = select(0.0, 1.0, v.x > 0.0 && v.y > 0.0); }
}
@compute @workgroup_size(256)
fn direction0(@builtin(global_invocation_id) id: vec3<u32>) {
  if (scalar[4] == 0.0) { return; }
  if (id.x < level.fine) { p[id.x] = x[id.x]; }
}
@compute @workgroup_size(256)
fn multiply(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(workgroup_id) group: vec3<u32>) {
  if (!running(li)) { return; }
  let i = id.x; var v = 0.0;
  if (i < level.fine && scalar[4] != 0.0) {
    let node = graph[i]; var value = node.diag * p[i];
    for (var a = 0u; a < 4u; a++) { let j = node.nb[a / 4u][a % 4u]; if (j >= 0) { value -= node.weight[a / 4u][a % 4u] * p[u32(j)]; } }
    ap[i] = value; v = p[i] * value;
  }
  let sum = reduce(li, vec2<f32>(v, 0.0));
  if (li == 0u) { tmp[group.x] = sum.x; }
}
@compute @workgroup_size(256)
fn alpha(@builtin(local_invocation_index) li: u32) {
  if (!running(li)) { return; }
  let v = total(li);
  if (li == 0u) {
    scalar[1] = 0.0;
    if (v.x > 0.0 && scalar[4] != 0.0) { scalar[1] = scalar[0] / v.x; }
    else { scalar[4] = 0.0; }
  }
}
@compute @workgroup_size(256)
fn update(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i < level.fine && scalar[4] != 0.0) { out[i] += scalar[1] * p[i]; b[i] -= scalar[1] * ap[i]; }
}
@compute @workgroup_size(256)
fn beta(@builtin(local_invocation_index) li: u32) {
  if (!running(li)) { return; }
  let v = total(li);
  if (li == 0u) {
    // Count completed PCG updates; convergence can stop the remaining dispatches.
    scalar[5] += 1.0; scalar[2] = 0.0;
    if (scalar[4] != 0.0 && v.y > scalar[3] * 1e-14 && v.x > 0.0) { scalar[2] = v.x / scalar[0]; scalar[0] = v.x; }
    else { scalar[4] = 0.0; }
  }
}
@compute @workgroup_size(256)
fn direction(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i < level.fine && scalar[4] != 0.0) { p[i] = x[i] + scalar[2] * p[i]; }
}
`;

// Structured geometric multigrid: only E/S face weights, diagonal and activity.
// The scalar PCG/reduction kernels are shared with the general graph solver.
export const structuredPressureWgsl = `
struct Term { node: u32, weight: f32 }
struct Level { offset: u32, count: u32, fine: u32, groups: u32, levels: array<vec4<u32>, 16>, dims: array<vec4<u32>, 16> }
@group(0) @binding(0) var<storage, read_write> faces: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> x: array<f32>;
@group(0) @binding(2) var<storage, read_write> b: array<f32>;
@group(0) @binding(3) var<storage, read_write> tmp: array<f32>;
@group(0) @binding(4) var<storage, read_write> p: array<f32>;
@group(0) @binding(5) var<storage, read_write> ap: array<f32>;
@group(0) @binding(6) var<storage, read_write> out: array<f32>;
@group(0) @binding(7) var<storage, read_write> scalar: array<f32>;
@group(0) @binding(8) var<storage, read_write> inverse: array<Term>;
@group(0) @binding(9) var<uniform> level: Level;
fn neighbor(i: u32, l: u32, e: u32) -> u32 {
  let w = level.dims[l].x;
  switch e { case 0u: { return i - 1u; } case 1u: { return i + 1u; } case 2u: { return i - w; } default: { return i + w; } }
}
fn weight(i: u32, l: u32, e: u32) -> f32 {
  let w = level.dims[l].x; let q = i - level.levels[l].x;
  switch e {
    case 0u: { if (q % w == 0u) { return 0.0; } return faces[i - 1u].x; }
    case 1u: { return faces[i].x; }
    case 2u: { if (q < w) { return 0.0; } return faces[i - w].y; }
    default: { return faces[i].y; }
  }
}
fn parent(i: u32, l: u32) -> u32 {
  let q = i - level.levels[l].x; let w = level.dims[l].x;
  return level.levels[l + 1u].x + (q / w / 2u) * level.dims[l + 1u].x + q % w / 2u;
}
fn child(i: u32, l: u32, a: u32) -> u32 {
  let q = i - level.levels[l].x; let w = level.dims[l].x; let W = level.dims[l - 1u];
  let xx = 2u * (q % w) + a % 2u; let yy = 2u * (q / w) + a / 2u;
  if (xx >= W.x || yy >= W.y) { return 0xffffffffu; }
  return level.levels[l - 1u].x + yy * W.x + xx;
}
fn offX(i: u32, l: u32, alternate: bool) -> f32 {
  let w = level.dims[l].x; let q = i - level.levels[l].x; let f = faces[i];
  var sum = 0.0;
  if (q % w > 0u) { let v = faces[i - 1u].x; if (v > 0.0) { if (alternate) { sum += v * tmp[i - 1u]; } else { sum += v * x[i - 1u]; } } }
  if (f.x > 0.0) { if (alternate) { sum += f.x * tmp[i + 1u]; } else { sum += f.x * x[i + 1u]; } }
  if (q >= w) { let v = faces[i - w].y; if (v > 0.0) { if (alternate) { sum += v * tmp[i - w]; } else { sum += v * x[i - w]; } } }
  if (f.y > 0.0) { if (alternate) { sum += f.y * tmp[i + w]; } else { sum += f.y * x[i + w]; } }
  return sum;
}
fn smoothAt(i: u32, alternate: bool, l: u32) -> f32 {
  var old = x[i]; if (alternate) { old = tmp[i]; }
  return old + 0.7 * ((b[i] + offX(i, l, alternate)) / max(faces[i].z, 1.0) - old);
}
fn restricted(i: u32, l: u32) -> f32 {
  var sum = 0.0;
  for (var a = 0u; a < 4u; a++) {
    let k = child(i, l, a); if (k == 0xffffffffu) { continue; }
    var r = b[k] - max(faces[k].z, 1.0) * x[k];
    r += offX(k, l - 1u, false); sum += r;
  }
  return sum;
}
@compute @workgroup_size(256)
fn clear(@builtin(global_invocation_id) id: vec3<u32>) {
  if (scalar[4] != 0.0 && id.x < arrayLength(&x)) { x[id.x] = 0.0; }
}
@compute @workgroup_size(256)
fn smooth0(@builtin(global_invocation_id) id: vec3<u32>) {
  if (scalar[4] != 0.0 && id.x < level.count) { let i = level.offset + id.x; tmp[i] = smoothAt(i, false, level.dims[15].x); }
}
@compute @workgroup_size(256)
fn smooth1(@builtin(global_invocation_id) id: vec3<u32>) {
  if (scalar[4] != 0.0 && id.x < level.count) { let i = level.offset + id.x; x[i] = smoothAt(i, true, level.dims[15].x); }
}
@compute @workgroup_size(256)
fn restrictResidual(@builtin(global_invocation_id) id: vec3<u32>) {
  if (scalar[4] != 0.0 && id.x < level.count) { let i = level.offset + id.x; b[i] = restricted(i, level.dims[15].x); }
}
@compute @workgroup_size(256)
fn prolong(@builtin(global_invocation_id) id: vec3<u32>) {
  if (scalar[4] != 0.0 && id.x < level.count) { let i = level.offset + id.x; if (faces[i].w > 0.0) { x[i] += 1.4 * x[parent(i, level.dims[15].x)]; } }
}
var<workgroup> pcgRunning: u32;
fn running(li: u32) -> bool {
  if (li == 0u) { pcgRunning = select(0u, 1u, scalar[4] != 0.0); }
  return workgroupUniformLoad(&pcgRunning) != 0u;
}
@compute @workgroup_size(256)
fn coarseCycle(@builtin(local_invocation_index) li: u32) {
  if (!running(li)) { return; }
  let start = level.levels[0].w; let last = level.levels[0].z - 1u;
  var phase: array<u32, 16>; var l = start;
  loop {
    let L = level.levels[l];
    if (l == last) {
      for (var q = li; q < L.y; q += 256u) {
        var sum = 0.0; for (var a = 0u; a < L.y; a++) { let t = inverse[q * L.y + a]; sum += t.weight * b[t.node]; } x[L.x + q] = sum;
      }
      storageBarrier(); if (l == start) { break; } l--; continue;
    }
    if (phase[l] == 0u) {
      for (var q = li; q < L.y; q += 256u) { let i = L.x + q; tmp[i] = smoothAt(i, false, l); }
      storageBarrier();
      for (var q = li; q < L.y; q += 256u) { let i = L.x + q; x[i] = smoothAt(i, true, l); }
      storageBarrier(); phase[l] = 1u;
    } else {
      for (var q = li; q < L.y; q += 256u) { let i = L.x + q; if (faces[i].w > 0.0) { x[i] += 1.4 * x[parent(i, l)]; } }
      storageBarrier();
      if (phase[l] == 2u) {
        for (var q = li; q < L.y; q += 256u) { let i = L.x + q; tmp[i] = smoothAt(i, false, l); }
        storageBarrier();
        for (var q = li; q < L.y; q += 256u) { let i = L.x + q; x[i] = smoothAt(i, true, l); }
        storageBarrier(); phase[l] = 0u; if (l == start) { break; } l--; continue;
      }
      phase[l] = 2u;
    }
    let C = level.levels[l + 1u];
    for (var q = li; q < C.y; q += 256u) { let i = C.x + q; b[i] = restricted(i, l + 1u); x[i] = 0.0; }
    storageBarrier(); l++; phase[l] = 0u;
  }
}
` + dryingPressureWgsl.slice(dryingPressureWgsl.indexOf('var<workgroup> sums:'))
  .replace(/let node = graph\[i\]; var value = node.diag \* p\[i\];[\s\S]*?(?=    ap\[i\])/, `var value = max(faces[i].z, 1.0) * p[i];
    let w = level.dims[0].x; let f = faces[i];
    if (i % w > 0u) { let v = faces[i - 1u].x; if (v > 0.0) { value -= v * p[i - 1u]; } }
    if (f.x > 0.0) { value -= f.x * p[i + 1u]; }
    if (i >= w) { let v = faces[i - w].y; if (v > 0.0) { value -= v * p[i - w]; } }
    if (f.y > 0.0) { value -= f.y * p[i + w]; }
`)
+ `
@compute @workgroup_size(1)
fn buildInverse() {
  let l = level.dims[15].x; let L = level.levels[l]; let m = L.y;
  var a: array<f32, 256>; var inv: array<f32, 256>;
  for (var q = 0u; q < m; q++) {
    let i = L.x + q; let f = faces[i]; a[q * m + q] = max(f.z, 1.0); inv[q * m + q] = 1.0;
    for (var e = 0u; e < 4u; e++) {
      let j = neighbor(i, l, e); let v = weight(i, l, e); if (v > 0.0) { a[q * m + j - L.x] = -v; }
    }
  }
  for (var k = 0u; k < m; k++) {
    let d = a[k * m + k];
    for (var j = 0u; j < m; j++) { a[k * m + j] /= d; inv[k * m + j] /= d; }
    for (var q = 0u; q < m; q++) {
      if (q == k) { continue; } let v = a[q * m + k];
      for (var j = 0u; j < m; j++) { a[q * m + j] -= v * a[k * m + j]; inv[q * m + j] -= v * inv[k * m + j]; }
    }
  }
  for (var q = 0u; q < m; q++) { for (var j = 0u; j < m; j++) { inverse[q * m + j] = Term(L.x + j, inv[q * m + j]); } }
}
@group(0) @binding(10) var<storage, read> mask: array<u32>;
@compute @workgroup_size(256)
fn buildFine(@builtin(global_invocation_id) id: vec3<u32>) {
  let q = id.x; if (q >= level.count) { return; }
  let W = level.dims[0].x; let xx = q % W; let yy = q / W;
// 0 = absent, 1 = unknown, 2 = gauge. Faces incident on the gauge
  // remain in the diagonal but are removed from both off-diagonal rows.
  let m = mask[q]; var f = vec4<f32>(0.0);
  if (m == 1u) {
    f.w = 1.0;
    if (xx > 0u && mask[q - 1u] != 0u) { f.z += 1.0; }
    if (xx + 1u < W && mask[q + 1u] != 0u) { f.z += 1.0; f.x = select(0.0, 1.0, mask[q + 1u] == 1u); }
    if (yy > 0u && mask[q - W] != 0u) { f.z += 1.0; }
    if (q + W < level.count && mask[q + W] != 0u) { f.z += 1.0; f.y = select(0.0, 1.0, mask[q + W] == 1u); }
  }
  faces[q] = f;
}
@compute @workgroup_size(256)
fn buildCoarse(@builtin(global_invocation_id) id: vec3<u32>) {
  let q = id.x; if (q >= level.count) { return; }
  // Each level uniform carries its own index in dims[15].x.
  let l = level.dims[15].x; let W = level.dims[l - 1u]; let C = level.dims[l];
  let P = level.levels[l - 1u].x; let xx = 2u * (q % C.x); let yy = 2u * (q / C.x);
  var f = vec4<f32>(0.0);
  for (var a = 0u; a < 4u; a++) {
    let x0 = xx + a % 2u; let y0 = yy + a / 2u;
    if (x0 >= W.x || y0 >= W.y) { continue; }
    let t = faces[P + y0 * W.x + x0]; f.z += t.z; f.w = max(f.w, t.w);
    // Internal faces cancel twice in P^T A P; only E/S boundary faces survive.
    if (a % 2u == 0u) { f.z -= 2.0 * t.x; } else { f.x += t.x; }
    if (a / 2u == 0u) { f.z -= 2.0 * t.y; } else { f.y += t.y; }
  }
  faces[level.offset + q] = f;
}
`;
