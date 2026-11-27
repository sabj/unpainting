// Fine-grid donor transport and diffusion. Each face reads the old suspension;
// a separate gather applies its two equal-and-opposite transfers without atomics.
struct Params {
  dims: vec4u, // fine width, cells, ratio, coarse width
  step: vec4u, // substeps, substep, diffusion, pore capture
  run: vec4u,  // dispatch row width
  physics: vec4f, // carryDepth, diffusion coefficient, film diffusion, filmDepth
}
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read_write> geometry: array<vec4f>; // wb, wa, FX, FY (or conductance)
@group(0) @binding(2) var<storage, read> volume: array<f32>;
@group(0) @binding(3) var<storage, read> enabled: array<u32>;
@group(0) @binding(4) var<storage, read_write> mass: array<f32>;
@group(0) @binding(5) var<storage, read_write> faces: array<vec2f>;
@group(0) @binding(6) var<storage, read> capture: array<vec2f>;
@group(0) @binding(7) var<storage, read_write> deposit: array<f32>;
@group(0) @binding(8) var<storage, read> dispatches: array<u32>;

fn index(g: vec3u) -> u32 { return g.x + g.y * p.run.x; }
fn wet(f: u32) -> bool { return enabled[f] != 0u && geometry[f].y > 1e-6; }
fn coefficient(f: u32, j: u32) -> f32 {
  if (!wet(j)) { return 0.; }
  let wi = geometry[f].y; let wj = geometry[j].y; let mw = min(wi, wj);
  let mi = wi / p.physics.x; let mj = wj / p.physics.x;
  let cm = min(min(1., mi * mi), min(1., mj * mj));
  let film = min(.2, p.physics.z * min(1., mw / p.physics.w));
  return min(.2, bitcast<f32>(p.run.y) * (p.physics.y * cm + film)) * mw;
}
@compute @workgroup_size(128)
fn conductance(@builtin(global_invocation_id) g: vec3u) {
  let f = index(g); if (f >= p.dims.y) { return; }
  var k = vec2f(0.);
  if (wet(f)) {
    if ((f + 1u) % p.dims.x != 0u) { k.x = coefficient(f, f + 1u); }
    if (f + p.dims.x < p.dims.y) { k.y = coefficient(f, f + p.dims.x); }
  }
  geometry[f].z = k.x; geometry[f].w = k.y;
}
fn gain(f: u32) -> f32 {
  let v = geometry[f];
  let count = select(p.step.x, dispatches[1], p.step.x == 0u);
  let depth = v.x + (v.y - v.x) * (f32(p.step.y) / f32(count));
  if (depth <= 1e-9 || volume[f] <= 0.) { return 0.; }
  return min(1. / (f32(count) * depth), .95 / volume[f]);
}
fn transfer(f: u32, j: u32, q: f32) -> f32 {
  if (q == 0.) { return 0.; }
  if (p.step.z != 0u) { return q * (mass[f] / geometry[f].y - mass[j] / geometry[j].y); }
  let donor = select(j, f, q > 0.);
  return q * mass[donor] * gain(donor);
}
@compute @workgroup_size(128)
fn flux(@builtin(global_invocation_id) g: vec3u) {
  let f = index(g); if (f >= p.dims.y) { return; }
  var v = vec2f(0.);
  if (enabled[f] != 0u) {
    if ((f + 1u) % p.dims.x != 0u) { v.x = transfer(f, f + 1u, geometry[f].z); }
    if (f + p.dims.x < p.dims.y) { v.y = transfer(f, f + p.dims.x, geometry[f].w); }
  }
  faces[f] = v;
}
fn caught(f: u32, vertical: bool) -> f32 {
  if (p.step.w == 0u) { return 0.; }
  let x = f % p.dims.x; let y = f / p.dims.x;
  let c = (y / p.dims.z) * p.dims.w + x / p.dims.z;
  if (vertical) { return select(0., capture[c].y, (y + 1u) % p.dims.z == 0u); }
  return select(0., capture[c].x, (x + 1u) % p.dims.z == 0u);
}
// Face signed mass, the fraction retained by its donor, and whether this cell owns the face.
fn delta(v: f32, c: f32, owner: bool) -> vec2f {
  if (owner) {
    if (v > 0.) { return vec2f(-v, v * c); }
    return vec2f(-v * (1. - c), 0.);
  }
  if (v < 0.) { return vec2f(v, -v * c); }
  return vec2f(v * (1. - c), 0.);
}
@compute @workgroup_size(128)
fn gather(@builtin(global_invocation_id) g: vec3u) {
  let f = index(g); if (f >= p.dims.y || enabled[f] == 0u) { return; }
  let x = f % p.dims.x; let y = f / p.dims.x;
  var left = vec2f(0.); var top = vec2f(0.);
  if (x > 0u) { left = delta(faces[f - 1u].x, caught(f - 1u, false), false); }
  if (y > 0u) { top = delta(faces[f - p.dims.x].y, caught(f - p.dims.x, true), false); }
  var d = top + left;
  // Follow the CPU's block-raster face order, then its right and bottom faces.
  if (x % p.dims.z == 0u && y % p.dims.z != 0u) { d = left + top; }
  d += delta(faces[f].x, caught(f, false), true);
  d += delta(faces[f].y, caught(f, true), true);
  mass[f] = max(0., mass[f] + d.x);
  if (p.step.w != 0u) { deposit[f] += d.y; }
}
