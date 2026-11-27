struct Params { dims: vec4u, run: vec4u }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> source: array<u32>;
@group(0) @binding(2) var<storage, read_write> water: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> enabled: array<u32>;
@compute @workgroup_size(128)
fn reset(@builtin(global_invocation_id) g: vec3u) {
  let f = g.x + g.y * p.run.x;
  if (f >= p.dims.y) { return; }
  water[f] = vec4f(0.); enabled[f] = 0u;
}
@compute @workgroup_size(128)
fn activate(@builtin(global_invocation_id) g: vec3u) {
  let at = g.x + g.y * p.run.x;
  if (at >= p.run.y) { return; }
  let n = p.dims.y; let f = source[n + at];
  let c = (f / p.dims.x / p.dims.z) * p.dims.w + (f % p.dims.x) / p.dims.z;
  var bed = 0.; if (p.run.z != 0u) { bed = bitcast<f32>(source[2u * n + f]); }
  water[f] = vec4f(bitcast<f32>(source[f]), bitcast<f32>(source[3u * n + c]), bed, 0.);
  enabled[f] = 1u;
}
