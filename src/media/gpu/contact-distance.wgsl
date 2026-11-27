// Exact squared distances on the half-cell lattice used by contact-distance.mjs.
// Only the band that can contribute to the cell's quadrature is needed.
struct Grid {
  sheetWidth: u32, sheetHeight: u32, left: u32, top: u32,
  cols: u32, rows: u32, radius: u32, holeSpan: u32,
  mm: f32, edgeMm: f32, samplesPerSide: u32, padding: u32,
}
@group(0) @binding(0) var<uniform> grid: Grid;
@group(0) @binding(1) var<storage, read> packed: array<u32>;
@group(0) @binding(2) var<storage, read_write> sides: array<u32>;
@group(0) @binding(3) var<storage, read_write> field: array<u32>;
@group(0) @binding(4) var<storage, read_write> vertical: array<u32>;
@group(0) @binding(5) var<storage, read_write> fluxOut: array<f32>;

fn onSheet(p: vec2<i32>) -> bool {
  return all(p >= vec2<i32>(0)) && all(p < vec2<i32>(i32(grid.sheetWidth), i32(grid.sheetHeight)));
}
fn wet(p: vec2<i32>) -> bool {
  if (!onSheet(p)) { return false; }
  let i = u32(p.y) * grid.sheetWidth + u32(p.x);
  return ((packed[i / 8u] >> (4u * (i % 8u))) & 3u) != 0u;
}
fn inBox(p: vec2<i32>) -> bool {
  let rel = p - vec2<i32>(i32(grid.left), i32(grid.top));
  return all(rel >= vec2<i32>(0)) && all(rel < vec2<i32>(i32(grid.cols), i32(grid.rows)));
}
const directions = array<vec2<i32>, 4>(vec2<i32>(-1,0), vec2<i32>(1,0), vec2<i32>(0,-1), vec2<i32>(0,1));
fn pinned(p: vec2<i32>) -> bool {
  if (!onSheet(p) || (inBox(p) && wet(p))) { return false; }
  if (grid.holeSpan == 0u) { return true; }
  for (var d = 0u; d < 4u; d++) {
    var held = false;
    for (var k = 1u; k <= grid.holeSpan; k++) {
      let q = p + directions[d] * i32(k);
      if (!onSheet(q)) { break; }
      if (wet(q)) { held = true; break; }
    }
    if (!held) { return true; }
  }
  return false;
}
@compute @workgroup_size(128)
fn faces(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= grid.cols * grid.rows) { return; }
  let p = vec2<i32>(i32(i % grid.cols + grid.left), i32(i / grid.cols + grid.top));
  var mask = 0u;
  if (wet(p)) {
    for (var d = 0u; d < 4u; d++) {
      if (pinned(p + directions[d])) { mask |= 1u << d; }
    }
  }
  sides[i] = mask;
}
fn side(x: i32, y: i32) -> u32 {
  if (x < 0 || y < 0 || x >= i32(grid.cols) || y >= i32(grid.rows)) { return 0u; }
  return sides[u32(y) * grid.cols + u32(x)];
}
@compute @workgroup_size(128)
fn seeds(@builtin(global_invocation_id) id: vec3<u32>) {
  let width = 2u * grid.cols + 1u;
  let i = id.x;
  if (i >= width * (2u * grid.rows + 1u)) { return; }
  let x = i % width; let y = i / width;
  let a = i32(x / 2u); let b = i32(y / 2u);
  let evenX = x % 2u == 0u; let evenY = y % 2u == 0u;
  let here = side(a, b);
  var f = 0u;
  if (evenX) { f |= (here & 1u) | (side(a-1, b) & 2u); }
  if (evenY) { f |= (here & 4u) | (side(a, b-1) & 8u); }
  if (evenX && evenY) {
    f |= (side(a-1, b-1) & 10u) | (side(a, b-1) & 1u) | (side(a-1, b) & 4u);
  }
  field[i] = f;
}
@compute @workgroup_size(128)
fn nearestVertical(@builtin(global_invocation_id) id: vec3<u32>) {
  let width = 2u * grid.cols + 1u; let height = 2u * grid.rows + 1u;
  let i = id.x;
  if (i >= width * height) { return; }
  let y = i / width;
  var nearest = grid.radius;
  for (var d = 0u; d < grid.radius; d++) {
    if ((d <= y && field[i - d * width] != 0u) ||
        (y + d < height && field[i + d * width] != 0u)) { nearest = d; break; }
  }
  vertical[i] = nearest * nearest;
}
@compute @workgroup_size(128)
fn nearestHorizontal(@builtin(global_invocation_id) id: vec3<u32>) {
  let width = 2u * grid.cols + 1u; let height = 2u * grid.rows + 1u;
  let i = id.x;
  if (i >= width * height) { return; }
  let x = i % width;
  var best = vertical[i];
  for (var d = 1u; d * d < best; d++) {
    if (x >= d) { best = min(best, vertical[i - d] + d * d); }
    if (x + d < width) { best = min(best, vertical[i + d] + d * d); }
  }
  field[i] = best;
}

// The same analytic straight-line integral and half-cell bilinear quadrature as cellEdgeFlux.
@compute @workgroup_size(128)
fn edge_flux(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= grid.cols * grid.rows) { return; }
  fluxOut[i] = 0.0;
  let x = i % grid.cols; let y = i / grid.cols;
  if (!wet(vec2<i32>(i32(x + grid.left), i32(y + grid.top)))) { return; }
  let width = 2u * grid.cols + 1u;
  let base = 2u * y * width + 2u * x;
  let mm = grid.mm; let E = grid.edgeMm;
  if (0.5 * sqrt(f32(field[base + width + 1u])) * mm > E + sqrt(2.0) * mm) { return; }
  var d: array<f32, 9>;
  for (var yy = 0u; yy < 3u; yy++) {
    for (var xx = 0u; xx < 3u; xx++) { d[3u * yy + xx] = 0.5 * sqrt(f32(field[base + yy * width + xx])); }
  }
  let gx = 0.5 * (d[2] - d[0]); let gy = 0.5 * (d[6] - d[0]);
  // Squared distances are integers: straight half-cell ramps are exactly representable in f32.
  var straight = (abs(abs(2.0 * gx) - 1.0) < 1e-12 && abs(gy) < 1e-12) ||
                 (abs(abs(2.0 * gy) - 1.0) < 1e-12 && abs(gx) < 1e-12);
  for (var yy = 0u; yy < 3u; yy++) {
    for (var xx = 0u; xx < 3u; xx++) {
      if (abs(d[3u * yy + xx] - d[0] - f32(xx) * gx - f32(yy) * gy) > 1e-12) { straight = false; }
    }
  }
  let tail = inverseSqrt(1.02);
  let norm = 2.0 * (sqrt(1.02) - sqrt(0.02)) - tail;
  if (straight) {
    let a = min(min(d[0], d[2]), min(d[6], d[8])) * mm;
    let b = max(max(d[0], d[2]), max(d[6], d[8])) * mm;
    if (a < E) {
      let c = min(b, E);
      fluxOut[i] = max(0.0, (2.0 * (sqrt(c / E + 0.02) - sqrt(a / E + 0.02)) * E - tail * (c - a)) / norm / (b - a));
    }
    return;
  }
  let count = grid.samplesPerSide;
  var sum = 0.0;
  for (var yy = 0u; yy < count; yy++) {
    let yq = 2.0 * (f32(yy) + 0.5) / f32(count); let ay = u32(yq); let fy = yq - f32(ay);
    for (var xx = 0u; xx < count; xx++) {
      let xq = 2.0 * (f32(xx) + 0.5) / f32(count); let ax = u32(xq); let fx = xq - f32(ax);
      let k = 3u * ay + ax;
      let dist = ((1.0 - fy) * ((1.0 - fx) * d[k] + fx * d[k + 1u]) + fy * ((1.0 - fx) * d[k + 3u] + fx * d[k + 4u])) * mm;
      if (dist < E) { sum += (inverseSqrt(dist / E + 0.02) - tail) / norm; }
    }
  }
  fluxOut[i] = sum / f32(count * count);
}
