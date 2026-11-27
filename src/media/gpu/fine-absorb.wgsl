struct Params { dims: vec4u, grid: vec4u }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read_write> film: array<f32>;
@group(0) @binding(2) var<storage, read_write> pores: array<f32>;
@group(0) @binding(3) var<storage, read> shares: array<vec2f>;
@group(0) @binding(4) var<storage, read> mobility: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> deposit: array<f32>;
// Preserve the CPU exchange's unrounded intermediate amount until each f32
// compartment is stored. Rounding the amount itself would lose small uptake.
fn add(a: vec2f, b: vec2f) -> vec2f {
  let s = a.x + b.x; let v = s - a.x;
  let e = (a.x - (s - v)) + (b.x - v) + a.y + b.y;
  let h = s + e; return vec2f(h, e - (h - s));
}
fn mul(a: vec2f, b: vec2f) -> vec2f {
  let h = a.x * b.x; let e = fma(a.x, b.x, -h) + a.x * b.y + a.y * b.x;
  let s = h + e; return vec2f(s, e - (s - h));
}
@compute @workgroup_size(128)
fn absorb(@builtin(global_invocation_id) g: vec3u) {
  let f = g.x + g.y * p.grid.x;
  if (f >= p.dims.y) { return; }
  let c = (f / p.dims.x / p.dims.z) * p.dims.w + (f % p.dims.x) / p.dims.z;
  let share = shares[c].x;
  if (share == 0.) { return; }
  for (var k = 0u; k < p.grid.y; k++) {
    let at = k * p.dims.y + f;
    let amount = mul(mul(vec2f(film[at], 0.), vec2f(share, 0.)), mobility[k]);
    film[at] = add(vec2f(film[at], 0.), -amount).x;
    pores[at] = add(vec2f(pores[at], 0.), amount).x;
  }
}
@compute @workgroup_size(128)
fn dryPhase(@builtin(global_invocation_id) g: vec3u) {
  let f = g.x + g.y * p.grid.x;
  if (f >= p.dims.y) { return; }
  let c = (f / p.dims.x / p.dims.z) * p.dims.w + (f % p.dims.x) / p.dims.z;
  let info = shares[c];
  if (info.x == 0. && info.y == 0.) { return; }
  for (var k = 0u; k < p.grid.y; k++) {
    let at = k * p.dims.y + f;
    if (info.x > 0.) {
      let q = mul(vec2f(pores[at], 0.), vec2f(info.x, 0.));
      pores[at] = add(vec2f(pores[at], 0.), -q).x;
      deposit[at] = add(vec2f(deposit[at], 0.), q).x;
    }
    if (info.y > 0.) {
      deposit[at] = deposit[at] + film[at];
      film[at] = 0.;
    }
  }
}
