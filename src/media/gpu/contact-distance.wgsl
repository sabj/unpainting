// Exact squared distances on the half-cell lattice used by contact-distance.mjs.
// Only the band that can contribute to the cell's quadrature is needed.
struct Grid {
  sheetWidth: u32, sheetHeight: u32, left: u32, top: u32,
  cols: u32, rows: u32, radius: u32, holeSpan: u32,
}
@group(0) @binding(0) var<uniform> grid: Grid;
@group(0) @binding(1) var<storage, read> packed: array<u32>;
@group(0) @binding(2) var<storage, read_write> sides: array<u32>;
@group(0) @binding(3) var<storage, read_write> field: array<u32>;
@group(0) @binding(4) var<storage, read_write> vertical: array<u32>;

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
