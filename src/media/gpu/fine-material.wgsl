struct Params {
  dims: vec4u, // width, cells, pigments, pigment index
  flags: vec4u, // dispatch row width, has top, finite hold, fixedBed
  time: vec4f, // dt, granFill, coSettle, liftDepth
  bed: vec4f, // hold, holdDepth, rewetLift, film
  slide: vec4f, // slide rate, repose step, slide cap, fill
  extra: vec4f, // fillRef, f32(groups), 0, 0
}
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read_write> G: array<f32>;
@group(0) @binding(2) var<storage, read_write> D: array<f32>;
@group(0) @binding(3) var<storage, read_write> top: array<f32>;
@group(0) @binding(4) var<storage, read> paper: array<vec4f>; // hollow, surface, grainH, tooth
@group(0) @binding(5) var<storage, read_write> water: array<vec4f>; // film, turnover
@group(0) @binding(6) var<storage, read> enabled: array<u32>;
@group(0) @binding(7) var<storage, read> material: array<vec4f>; // two vectors per pigment
@group(0) @binding(8) var<storage, read_write> field: array<vec2f>; // unscaled bed, pigment's surface
@group(0) @binding(9) var<storage, read_write> moves: array<vec4f>;
@group(0) @binding(10) var<storage, read_write> partial: array<vec2f>;
var<workgroup> bedSum: array<vec2f, 128>;
fn index(g: vec3u) -> u32 { return g.x + g.y * p.flags.x; }
fn mobility(w: f32) -> f32 { let h = max(0., w - .03); let h3 = h*h*h; return h3 / (h3 + .000216); }
fn exposureShare(x: f32) -> f32 {
  // Stable 1-exp(-x) near zero, retaining the same residence-time equation.
  if (abs(x) < .001) { return x * (1. - x * (.5 - x * (1./6. - x / 24.))); }
  return 1. - exp(-x);
}
@compute @workgroup_size(128)
fn settle(@builtin(global_invocation_id) g: vec3u) {
  let f = index(g); if (f >= p.dims.y || enabled[f] == 0u) { return; }
  let wi = water[f].x; let relief = paper[f]; let wetting = min(1., wi * wi / (p.time.w * p.time.w));
  var hol = relief.x; var totalD = 0.; var mixture = 0.; var gm = 0.;
  for (var k = 0u; k < p.dims.z; k++) {
    let at = k * p.dims.y + f; totalD += D[at]; mixture += G[at] * material[k * 2u].x; gm += G[at];
  }
  if (p.time.y > 0.) { hol *= max(0., 1. - totalD * p.time.y); }
  if (gm > 0.) { mixture /= gm; } else { mixture = 0.; }
  for (var k = 0u; k < p.dims.z; k++) {
    let at = k * p.dims.y + f; let a = material[k*2u]; let b = material[k*2u + 1u];
    let v = (1. - p.time.z) * a.x + p.time.z * mixture;
    let h = max(.001, wi); let l = min(h, .02);
    let rate = v / h + v * a.z * hol * mobility(wi) / .06 + a.y / (l*l);
    let down = min(G[at], max(0., G[at] * exposureShare(rate * p.time.x)));
    let shape = max(0., 1. + (relief.y - 1.) * a.z);
    let up = min(D[at], max(0., D[at] * shape * (a.w * wetting * p.time.x + b.x * water[f].y * mobility(wi))));
    D[at] += down - up; G[at] += up - down;
    let topK = i32(material[p.dims.z * 2u + k / 4u][k % 4u]);
    if (p.flags.y != 0u && topK >= 0 && wi > p.bed.w) {
      let bound = u32(topK) * p.dims.y + f;
      let r = min(top[bound], top[bound] * p.bed.z * p.time.x / b.y); top[bound] -= r; G[at] += r;
    }
  }
  if (p.flags.z != 0u && wi < p.bed.y) {
    var gs = 0.; for (var k = 0u; k < p.dims.z; k++) { gs += G[k*p.dims.y + f]; }
    let hold = p.bed.x * wi;
    if (gs > hold) {
      let fraction = 1. - hold / gs;
      for (var k = 0u; k < p.dims.z; k++) { let at = k*p.dims.y + f; let q = G[at] * fraction; G[at] -= q; D[at] += q; }
    }
  }
}
@compute @workgroup_size(128)
fn bedField(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_index) lane: u32, @builtin(workgroup_id) group: vec3u) {
  let f = index(g); var value = vec2f(0.);
  if (f < p.dims.y && enabled[f] != 0u) {
    var d = water[f].z;
    for (var k = 0u; k < p.dims.z; k++) {
      d += D[k * p.dims.y + f];
      if (p.flags.w != 0u && p.flags.y != 0u) {
        let topK = i32(material[p.dims.z * 2u + k / 4u][k % 4u]);
        if (topK >= 0) { d += top[u32(topK) * p.dims.y + f]; }
      }
    }
    field[f].x = d; value = vec2f(d, 1.);
  }
  bedSum[lane] = value; workgroupBarrier();
  if (lane == 0u) {
    var total = vec2f(0.); for (var i = 0u; i < 128u; i++) { total += bedSum[i]; }
    partial[group.x + group.y * (p.flags.x / 128u)] = total;
  }
}
@compute @workgroup_size(128)
fn bedMean(@builtin(local_invocation_index) lane: u32) {
  let groups = u32(p.extra.y);
  var acc = vec2f(0.);
  var i = lane;
  while (i < groups) { acc += partial[i]; i += 128u; }
  bedSum[lane] = acc; workgroupBarrier();
  if (lane == 0u) {
    var total = vec2f(0.); for (var j = 0u; j < 128u; j++) { total += bedSum[j]; }
    var eff = p.slide.w;
    let refVal = p.extra.x;
    if (refVal > 0. && total.y > 0.) {
      let mean = total.x / total.y;
      if (mean > refVal) { let ratio = refVal / mean; eff = p.slide.w * ratio * ratio; }
    }
    partial[0] = vec2f(eff, total.y);
  }
}
@compute @workgroup_size(128)
fn surface(@builtin(global_invocation_id) g: vec3u) {
  let f = index(g); if (f >= p.dims.y || enabled[f] == 0u) { return; }
  let floc = material[p.dims.w*2u + 1u].z;
  let fill = partial[0].x;
  field[f].y = (1. - floc) * paper[f].z + floc * paper[f].w + fill * field[f].x;
}
@compute @workgroup_size(128)
fn slideFaces(@builtin(global_invocation_id) g: vec3u) {
  let f = index(g); if (f >= p.dims.y) { return; }
  let wi = water[f].x; let dk = D[p.dims.w * p.dims.y + f];
  moves[f] = vec4f(0.);
  if (enabled[f] == 0u || wi <= 0. || dk <= 0.) { return; }
  let mat = material[p.dims.w * 2u]; let other = material[p.dims.w * 2u + 1u];
  let rep = p.slide.y / mat.z; let x = f % p.dims.x;
  var ex = vec4f(0.); let nb = vec4i(1, -1, i32(p.dims.x), -i32(p.dims.x));
  for (var e = 0u; e < 4u; e++) {
    let j = i32(f) + nb[e];
    if ((e == 0u && x + 1u == p.dims.x) || (e == 1u && x == 0u) || j < 0 || j >= i32(p.dims.y)) { continue; }
    if (enabled[u32(j)] != 0u) { ex[e] = max(0., field[f].y - field[u32(j)].y - rep); }
  }
  let sum = ex.x + ex.y + ex.z + ex.w; if (sum <= 0.) { return; }
  let h = max(0., wi - .03); let slideMobility = .12 * h*h / (h*h*h + .000216);
  var moved = dk * min(.2, p.slide.x * other.w * mat.z * slideMobility * sum * p.time.x);
  let fill = partial[0].x;
  if (p.slide.z > 0. && fill > 0.) {
    var limit = 3.402823e38;
    for (var e = 0u; e < 4u; e++) { if (ex[e] > 0.) { limit = min(limit, p.slide.z * ex[e] / (fill * (1. + ex[e] / sum))); } }
    moved = min(moved, limit);
  }
  moves[f] = moved * ex / sum;
}
@compute @workgroup_size(128)
fn slideGather(@builtin(global_invocation_id) g: vec3u) {
  let f = index(g); if (f >= p.dims.y || enabled[f] == 0u) { return; }
  let own = moves[f]; var d = -(own.x + own.y + own.z + own.w);
  let x = f % p.dims.x;
  if (x > 0u) { d += moves[f - 1u].x; }
  if (x + 1u < p.dims.x) { d += moves[f + 1u].y; }
  if (f >= p.dims.x) { d += moves[f - p.dims.x].z; }
  if (f + p.dims.x < p.dims.y) { d += moves[f + p.dims.x].w; }
  let at = p.dims.w * p.dims.y + f; D[at] = max(0., D[at] + d);
}
