// Browser- and Node-loadable WGSL source for WebGPU sub-cell grain spreading + KM finish compositor.
export const FINISH_GPU_WGSL = `
// Metal/WebGPU sub-cell grain spreading + Kubelka-Munk layered finish compositor.
// Matches src/media/subcell-grain.mjs, src/media/subcell-edge.mjs, and src/media/km.mjs
// using compensated double-single arithmetic for byte-stable optical compositing.

// Double-single helpers (same compensated arithmetic as optical-gpu.wgsl).
// The uniform xor pad is 0 at runtime, preventing relaxed algebraic elimination of error terms.
fn rounded(x: f32) -> f32 { return bitcast<f32>(bitcast<u32>(x) ^ u.zeroPad); }
fn plus(a: f32, b: f32) -> f32 { return rounded(a + b); }
fn minus(a: f32, b: f32) -> f32 { return rounded(a - b); }
fn times(a: f32, b: f32) -> f32 { return rounded(a * b); }
fn ds(x: f32) -> vec2<f32> { return vec2<f32>(x, 0.0); }
fn dsAdd(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  let s = plus(a.x, b.x);
  let v = minus(s, a.x);
  let e = plus(plus(plus(minus(a.x, minus(s, v)), minus(b.x, v)), a.y), b.y);
  let h = plus(s, e);
  return vec2<f32>(h, minus(e, minus(h, s)));
}
fn dsSub(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> { return dsAdd(a, -b); }
fn dsMul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  let p = times(a.x, b.x);
  let e = plus(plus(plus(rounded(fma(a.x, b.x, -p)), times(a.x, b.y)), times(a.y, b.x)), times(a.y, b.y));
  let h = plus(p, e);
  return vec2<f32>(h, minus(e, minus(h, p)));
}
fn dsDiv(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  let q = rounded(a.x / b.x);
  let r = dsSub(a, dsMul(b, ds(q)));
  return dsAdd(ds(q), ds(rounded(plus(r.x, r.y) / b.x)));
}
fn dsSqrt(a: vec2<f32>) -> vec2<f32> {
  let q = sqrt(max(0.0, a.x));
  if (q == 0.0) { return ds(0.0); }
  return dsAdd(ds(q), dsDiv(dsSub(a, dsMul(ds(q), ds(q))), ds(2.0 * q)));
}
fn dsExp(a: vec2<f32>) -> vec2<f32> {
  let ln2 = vec2<f32>(0.6931471824645996, -1.904654323148236e-9);
  let k = round(a.x / ln2.x);
  let x = dsSub(a, dsMul(ds(k), ln2));
  // Precomputed double-single reciprocals 1/1 .. 1/11 (|x| <= 0.347 => |x|^11/11! < 2e-13).
  let inv = array<vec2<f32>, 11>(
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.5, 0.0),
    vec2<f32>(0.3333333432674408, -9.934107481679265e-9),
    vec2<f32>(0.25, 0.0),
    vec2<f32>(0.20000000298023224, -2.9802322387695312e-9),
    vec2<f32>(0.1666666716337204, -4.967053740839633e-9),
    vec2<f32>(0.1428571492433548, -6.386211925614661e-9),
    vec2<f32>(0.125, 0.0),
    vec2<f32>(0.1111111119389534, -8.278422731968572e-10),
    vec2<f32>(0.10000000149011612, -1.4901161193847656e-9),
    vec2<f32>(0.09090909361839294, -2.7093019801417615e-9)
  );
  var term = ds(1.0);
  var total = term;
  for (var j = 0u; j < 11u; j++) {
    term = dsMul(dsMul(term, x), inv[j]);
    total = dsAdd(total, term);
  }
  return dsMul(total, ds(exp2(k)));
}
fn kmRT(k: vec2<f32>, s: vec2<f32>, x: vec2<f32>) -> vec4<f32> {
  if (x.x <= 1e-9) { return vec4<f32>(0.0, 0.0, 1.0, 0.0); }
  if (s.x < 1e-7) { return vec4<f32>(ds(0.0), dsExp(-dsMul(k, x))); }
  if (k.x < 1e-7) {
    let t = dsMul(s, x);
    let den = dsAdd(ds(1.0), t);
    return vec4<f32>(dsDiv(t, den), dsDiv(ds(1.0), den));
  }
  let a = dsAdd(ds(1.0), dsDiv(k, s));
  let b = dsSqrt(dsSub(dsMul(a, a), ds(1.0)));
  let bx = dsMul(dsMul(b, s), x);
  if (bx.x > 20.0) { return vec4<f32>(dsSub(a, b), ds(0.0)); }
  let ep = dsExp(bx);
  let em = dsDiv(ds(1.0), ep);
  let sh = dsMul(dsSub(ep, em), ds(0.5));
  let ch = dsMul(dsAdd(ep, em), ds(0.5));
  let den = dsAdd(dsMul(a, sh), dsMul(b, ch));
  return vec4<f32>(dsDiv(sh, den), dsDiv(b, den));
}

struct Uniforms {
  w: u32,
  h: u32,
  n: u32,
  N: u32,
  fw: u32,
  fh: u32,
  fnPix: u32,
  edges: u32,
  lx0: u32,
  lx1: u32,
  ly0: u32,
  ly1: u32,
  rx0: u32,
  rx1: u32,
  ry0: u32,
  ry1: u32,
  px0: u32,
  px1: u32,
  py0: u32,
  py1: u32,
  prx0: u32,
  prx1: u32,
  pry0: u32,
  pry1: u32,
  activeCount: u32,
  pigSlot: u32,
  pigIdx: u32,
  numWg: u32,
  zeroPad: u32,
  useInkRatio: u32,
  pad0: u32,
  pad1: u32,
  gg: f32,
  paperR: f32,
  paperG: f32,
  paperB: f32,
  shade: f32,
  padF0: f32,
  padF1: f32,
  padF2: f32,
}

// Binding layout (shared across entry points, 9 storage buffers <= 10):
// 0: uniform u
// 1: pigmentTable (read) - per pigment: 6 vec2<f32> (K0,K1,K2,S0,S1,S2)
// 2: deltaZ (read) - fine grid (zref - z) / unit
// 3: coarseLayers (read) - active coarse pigment planes [slot * n + c]
// 4: coarseAux (read_write) - packed coarse working planes:
//      0: T, 1: ind, 2: pres, 3: tmp, 4: phi, 5: edgeFlag (as f32), 6: cellSum, 7: want, 8: fBuf, 9: fBuf2
// 5: fineWork (read_write) - fine grid vec4<f32>(mask, denom, baseFine, 0)
// 6: accum (read_write) - fine grid 2 * vec4<f32>: [2*q]=(x0,sumK0,sumK1,sumK2), [2*q+1]=(sumS0,sumS1,sumS2,0)
// 7: under (read_write) - fine grid 3 * vec2<f32> double-single reflectance
// 8: reduceOut (read_write) - workgroup partial sums / packed u32 RGB output
// 9: extraRead (read) - fbase packed u32 bytes or invInkL f32 or heightFine f32

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> pigTable: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> deltaZ: array<f32>;
@group(0) @binding(3) var<storage, read> coarseLayers: array<f32>;
@group(0) @binding(4) var<storage, read_write> coarseAux: array<f32>;
@group(0) @binding(5) var<storage, read_write> fineWork: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> accum: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read_write> under: array<vec2<f32>>;
@group(0) @binding(8) var<storage, read_write> reduceOut: array<u32>;
@group(0) @binding(9) var<storage, read> extraRead: array<u32>;

const EDGE_KAPPA: f32 = 0.25;
const AA: f32 = 0.25;
const CORE: f32 = 0.8;

fn auxOff(plane: u32, c: u32) -> u32 { return plane * u.n + c; }

// ---- 1. Initialize under from packed RGB bytes in extraRead ----
@compute @workgroup_size(256)
fn init_under_bytes(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let idx = gid.x + gid.y * ng.x * 256u;
  let total = u.fnPix * 3u;
  if (idx >= total) { return; }
  let word = extraRead[idx >> 2u];
  let byteVal = (word >> ((idx & 3u) * 8u)) & 255u;
  under[idx] = dsDiv(ds(f32(byteVal)), ds(255.0));
}

// ---- 1b. Initialize under directly from paperRGB, shade, and fine height (bitcast f32 in extraRead) ----
@compute @workgroup_size(256)
fn init_under_height(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= u.fnPix) { return; }
  let hVal = bitcast<f32>(extraRead[i]);
  let sh = (1.0 - u.shade) + u.shade * hVal;
  let r = round(min(255.0, u.paperR * sh));
  let g = round(min(255.0, u.paperG * sh));
  let b = round(min(255.0, u.paperB * sh));
  under[i * 3u] = dsDiv(ds(r), ds(255.0));
  under[i * 3u + 1u] = dsDiv(ds(g), ds(255.0));
  under[i * 3u + 2u] = dsDiv(ds(b), ds(255.0));
}

// ---- 2. Layer total T and indicator ind over [rx0..rx1, ry0..ry1] ----
@compute @workgroup_size(256)
fn layer_total(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let bw = u.rx1 - u.rx0 + 1u;
  let bh = u.ry1 - u.ry0 + 1u;
  let tid = gid.x + gid.y * ng.x * 256u;
  if (tid >= bw * bh) { return; }
  let cx = u.rx0 + (tid % bw);
  let cy = u.ry0 + (tid / bw);
  let c = cy * u.w + cx;
  var t = 0.0;
  for (var s = 0u; s < u.activeCount; s++) {
    t += coarseLayers[s * u.n + c];
  }
  coarseAux[auxOff(0u, c)] = t;
  coarseAux[auxOff(1u, c)] = select(0.0, 1.0, t > 0.0);
}

// ---- 3. Edge presence pres over [rx0..rx1, ry0..ry1] ----
@compute @workgroup_size(256)
fn layer_pres(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let bw = u.rx1 - u.rx0 + 1u;
  let bh = u.ry1 - u.ry0 + 1u;
  let tid = gid.x + gid.y * ng.x * 256u;
  if (tid >= bw * bh) { return; }
  let cx = u.rx0 + (tid % bw);
  let cy = u.ry0 + (tid / bw);
  let c = cy * u.w + cx;
  let tc = coarseAux[auxOff(0u, c)];
  if (!(tc > 0.0)) {
    coarseAux[auxOff(2u, c)] = 0.0;
    return;
  }
  var m = 0.0;
  let y0 = select(cy - 1u, 0u, cy == 0u);
  let y1 = min(u.h - 1u, cy + 1u);
  let x0 = select(cx - 1u, 0u, cx == 0u);
  let x1 = min(u.w - 1u, cx + 1u);
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      if (x >= u.rx0 && x <= u.rx1 && y >= u.ry0 && y <= u.ry1) {
        let v = coarseAux[auxOff(0u, y * u.w + x)];
        if (v > m) { m = v; }
      }
    }
  }
  coarseAux[auxOff(2u, c)] = min(1.0, tc / (EDGE_KAPPA * m));
}

// ---- 4. Edge 1-2-1 blur X: pres -> tmp ----
@compute @workgroup_size(256)
fn layer_blur_x(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let bw = u.rx1 - u.rx0 + 1u;
  let bh = u.ry1 - u.ry0 + 1u;
  let tid = gid.x + gid.y * ng.x * 256u;
  if (tid >= bw * bh) { return; }
  let cx = u.rx0 + (tid % bw);
  let cy = u.ry0 + (tid / bw);
  let c = cy * u.w + cx;
  let p = coarseAux[auxOff(2u, c)];
  let left = select(select(0.0, coarseAux[auxOff(2u, c - 1u)], cx > u.rx0), p, cx == 0u);
  let right = select(select(0.0, coarseAux[auxOff(2u, c + 1u)], cx < u.rx1), p, cx == u.w - 1u);
  coarseAux[auxOff(3u, c)] = 0.25 * left + 0.5 * p + 0.25 * right;
}

// ---- 5. Edge 1-2-1 blur Y: tmp -> phi ----
@compute @workgroup_size(256)
fn layer_blur_y(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let bw = u.rx1 - u.rx0 + 1u;
  let bh = u.ry1 - u.ry0 + 1u;
  let tid = gid.x + gid.y * ng.x * 256u;
  if (tid >= bw * bh) { return; }
  let cx = u.rx0 + (tid % bw);
  let cy = u.ry0 + (tid / bw);
  let c = cy * u.w + cx;
  let t = coarseAux[auxOff(3u, c)];
  let above = select(select(0.0, coarseAux[auxOff(3u, c - u.w)], cy > u.ry0), t, cy == 0u);
  let below = select(select(0.0, coarseAux[auxOff(3u, c + u.w)], cy < u.ry1), t, cy == u.h - 1u);
  coarseAux[auxOff(4u, c)] = 0.25 * above + 0.5 * t + 0.25 * below;
}

fn bilAux(plane: u32, fx: u32, fy: u32) -> f32 {
  let ux = clamp((f32(fx) + 0.5) / f32(u.N) - 0.5, 0.0, f32(u.w - 1u));
  let uy = clamp((f32(fy) + 0.5) / f32(u.N) - 0.5, 0.0, f32(u.h - 1u));
  let x0 = u32(floor(ux));
  let y0 = u32(floor(uy));
  let x1 = min(u.w - 1u, x0 + 1u);
  let y1 = min(u.h - 1u, y0 + 1u);
  let tx = ux - f32(x0);
  let ty = uy - f32(y0);
  let r0 = y0 * u.w;
  let r1 = y1 * u.w;
  let v00 = coarseAux[auxOff(plane, r0 + x0)];
  let v10 = coarseAux[auxOff(plane, r0 + x1)];
  let v01 = coarseAux[auxOff(plane, r1 + x0)];
  let v11 = coarseAux[auxOff(plane, r1 + x1)];
  return (v00 * (1.0 - tx) + v10 * tx) * (1.0 - ty) + (v01 * (1.0 - tx) + v11 * tx) * ty;
}

fn atAux(plane: u32, x: f32, y: f32) -> f32 {
  let ux = clamp(x, 0.0, f32(u.w - 1u));
  let uy = clamp(y, 0.0, f32(u.h - 1u));
  let x0 = u32(floor(ux));
  let y0 = u32(floor(uy));
  let x1 = min(u.w - 1u, x0 + 1u);
  let y1 = min(u.h - 1u, y0 + 1u);
  let tx = ux - f32(x0);
  let ty = uy - f32(y0);
  let r0 = y0 * u.w;
  let r1 = y1 * u.w;
  let v00 = coarseAux[auxOff(plane, r0 + x0)];
  let v10 = coarseAux[auxOff(plane, r0 + x1)];
  let v01 = coarseAux[auxOff(plane, r1 + x0)];
  let v11 = coarseAux[auxOff(plane, r1 + x1)];
  return (v00 * (1.0 - tx) + v10 * tx) * (1.0 - ty) + (v01 * (1.0 - tx) + v11 * tx) * ty;
}

// High-accuracy 8x8 midpoint integration for the rare tiny-core fallback (edgeRaster lines 86-93).
fn tinyCoreCoverage(fx: u32, fy: u32) -> f32 {
  let invN = 1.0 / f32(u.N);
  let x0 = f32(fx) * invN - 0.5;
  let y0 = f32(fy) * invN - 0.5;
  var acc = 0.0;
  for (var sy = 0u; sy < 8u; sy++) {
    let py = y0 + (f32(sy) + 0.5) * (invN / 8.0);
    for (var sx = 0u; sx < 8u; sx++) {
      let px = x0 + (f32(sx) + 0.5) * (invN / 8.0);
      let a = (atAux(4u, px, py) - 0.5) / AA + 0.5;
      let b = (atAux(2u, px, py) - CORE) / AA + 0.5;
      acc += clamp(max(a, b), 0.0, 1.0);
    }
  }
  return acc / 64.0;
}

// ---- 6. Edge rasterizer over coarse cells [lx0..lx1, ly0..ly1] ----
@compute @workgroup_size(256)
fn layer_edge_raster(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let bw = u.lx1 - u.lx0 + 1u;
  let bh = u.ly1 - u.ly0 + 1u;
  let tid = gid.x + gid.y * ng.x * 256u;
  if (tid >= bw * bh) { return; }
  let cx = u.lx0 + (tid % bw);
  let cy = u.ly0 + (tid / bw);
  let c = cy * u.w + cx;

  var loPhi = 1.0;
  var hiPhi = 0.0;
  var loPres = 1.0;
  var hiPres = 0.0;
  var fullDensity = true;

  let y0 = select(cy - 1u, 0u, cy == 0u);
  let y1 = min(u.h - 1u, cy + 1u);
  let x0 = select(cx - 1u, 0u, cx == 0u);
  let x1 = min(u.w - 1u, cx + 1u);
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      let i = y * u.w + x;
      if (u.edges != 0u) {
        let ph = coarseAux[auxOff(4u, i)];
        let pr = coarseAux[auxOff(2u, i)];
        loPhi = min(loPhi, ph);
        hiPhi = max(hiPhi, ph);
        loPres = min(loPres, pr);
        hiPres = max(hiPres, pr);
      }
      if (coarseAux[auxOff(1u, i)] != 1.0) { fullDensity = false; }
    }
  }

  let indC = coarseAux[auxOff(1u, c)];
  let full = select(indC == 1.0, loPhi >= 0.5 + AA * 0.5 || loPres >= CORE + AA * 0.5, u.edges != 0u);
  let empty = select(indC == 0.0, hiPhi <= 0.5 - AA * 0.5 && hiPres <= CORE - AA * 0.5, u.edges != 0u);

  var minM = 1.0;
  var maxM = 0.0;
  if (empty) {
    minM = 0.0; maxM = 0.0;
    for (var dy = 0u; dy < u.N; dy++) {
      let fy = cy * u.N + dy;
      for (var dx = 0u; dx < u.N; dx++) {
        fineWork[fy * u.fw + cx * u.N + dx] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
      }
    }
  } else if (full && fullDensity) {
    minM = 1.0; maxM = 1.0;
    for (var dy = 0u; dy < u.N; dy++) {
      let fy = cy * u.N + dy;
      for (var dx = 0u; dx < u.N; dx++) {
        fineWork[fy * u.fw + cx * u.N + dx] = vec4<f32>(1.0, 1.0, 0.0, 0.0);
      }
    }
  } else {
    for (var dy = 0u; dy < u.N; dy++) {
      let fy = cy * u.N + dy;
      for (var dx = 0u; dx < u.N; dx++) {
        let fx = cx * u.N + dx;
        var m = 1.0;
        if (!full) {
          let a = (bilAux(4u, fx, fy) - 0.5) / AA + 0.5;
          let b = (bilAux(2u, fx, fy) - CORE) / AA + 0.5;
          m = clamp(max(a, b), 0.0, 1.0);
        }
        let d = select(0.0, select(bilAux(1u, fx, fy), 1.0, fullDensity), m > 0.0);
        fineWork[fy * u.fw + fx] = vec4<f32>(m, d, 0.0, 0.0);
        minM = min(minM, m);
        maxM = max(maxM, m);
      }
    }
    let tc = coarseAux[auxOff(0u, c)];
    if (maxM == 0.0 && tc > 0.0 && (coarseAux[auxOff(4u, c)] > 0.5 - AA * 0.5 || coarseAux[auxOff(2u, c)] > CORE - AA * 0.5)) {
      minM = 1.0;
      for (var dy = 0u; dy < u.N; dy++) {
        let fy = cy * u.N + dy;
        for (var dx = 0u; dx < u.N; dx++) {
          let fx = cx * u.N + dx;
          let m = tinyCoreCoverage(fx, fy);
          let d = select(0.0, bilAux(1u, fx, fy), m > 0.0);
          fineWork[fy * u.fw + fx] = vec4<f32>(m, d, 0.0, 0.0);
          minM = min(minM, m);
          maxM = max(maxM, m);
        }
      }
    }
  }
  let tc = coarseAux[auxOff(0u, c)];
  let isEdge = select((maxM > 0.0), (minM < 1.0), (tc > 0.0));
  coarseAux[auxOff(5u, c)] = select(0.0, 1.0, isEdge);
}

fn bilCoarseLayer(slot: u32, fx: u32, fy: u32) -> f32 {
  let ux = clamp((f32(fx) + 0.5) / f32(u.N) - 0.5, 0.0, f32(u.w - 1u));
  let uy = clamp((f32(fy) + 0.5) / f32(u.N) - 0.5, 0.0, f32(u.h - 1u));
  let x0 = u32(floor(ux));
  let y0 = u32(floor(uy));
  let x1 = min(u.w - 1u, x0 + 1u);
  let y1 = min(u.h - 1u, y0 + 1u);
  let tx = ux - f32(x0);
  let ty = uy - f32(y0);
  let off = slot * u.n;
  let r0 = off + y0 * u.w;
  let r1 = off + y1 * u.w;
  let v00 = coarseLayers[r0 + x0];
  let v10 = coarseLayers[r0 + x1];
  let v01 = coarseLayers[r1 + x0];
  let v11 = coarseLayers[r1 + x1];
  return (v00 * (1.0 - tx) + v10 * tx) * (1.0 - ty) + (v01 * (1.0 - tx) + v11 * tx) * ty;
}

// ---- 7. Per-pigment spread Pass 1: baseFine and cellSum over [px0..px1, py0..py1] ----
@compute @workgroup_size(256)
fn spread_base_sum(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let bw = u.px1 - u.px0 + 1u;
  let bh = u.py1 - u.py0 + 1u;
  let tid = gid.x + gid.y * ng.x * 256u;
  if (tid >= bw * bh) { return; }
  let cx = u.px0 + (tid % bw);
  let cy = u.py0 + (tid / bw);
  let c = cy * u.w + cx;

  var s = 0.0;
  for (var dy = 0u; dy < u.N; dy++) {
    let fy = cy * u.N + dy;
    for (var dx = 0u; dx < u.N; dx++) {
      let fx = cx * u.N + dx;
      let q = fy * u.fw + fx;
      let fwVal = fineWork[q];
      var v = 0.0;
      if (fwVal.x > 0.0) {
        let al = bilCoarseLayer(u.pigSlot, fx, fy);
        if (fwVal.x == 1.0 && fwVal.y == 1.0) {
          v = al;
        } else if (fwVal.y > 1e-9) {
          v = (al / fwVal.y) * fwVal.x;
        }
        if (u.gg > 0.0) {
          v *= exp(u.gg * deltaZ[q]);
        }
      }
      fineWork[q].z = v;
      s += v;
    }
  }
  coarseAux[auxOff(6u, c)] = s;
}

var<workgroup> wgWant: array<f32, 256>;
var<workgroup> wgGot: array<f32, 256>;

// ---- 8. Per-pigment spread Pass 2: want[c] + workgroup reduction of (edgeWant, edgeGot) ----
@compute @workgroup_size(256)
fn spread_edge_want(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(num_workgroups) ng: vec3<u32>
) {
  let bw = u.px1 - u.px0 + 1u;
  let bh = u.py1 - u.py0 + 1u;
  let wgIndex = wid.x + wid.y * ng.x;
  let tid = wgIndex * 256u + lid.x;
  var ew = 0.0;
  var eg = 0.0;

  if (tid < bw * bh) {
    let cx = u.px0 + (tid % bw);
    let cy = u.py0 + (tid / bw);
    let c = cy * u.w + cx;
    let n2 = f32(u.N * u.N);
    let cellVal = coarseLayers[u.pigSlot * u.n + c];
    let isEdge = coarseAux[auxOff(5u, c)] > 0.5;
    if (!isEdge) {
      coarseAux[auxOff(7u, c)] = cellVal * n2;
    } else {
      let sc = coarseAux[auxOff(6u, c)];
      if (sc == 0.0) {
        coarseAux[auxOff(7u, c)] = 0.0;
        ew = cellVal * n2;
      } else {
        var a = 0.0;
        var b = 0.0;
        let x0 = select(cx - 2u, u.px0, cx < u.px0 + 2u);
        let x1 = min(u.px1, cx + 2u);
        let y0 = select(cy - 2u, u.py0, cy < u.py0 + 2u);
        let y1 = min(u.py1, cy + 2u);
        for (var Y = y0; Y <= y1; Y++) {
          for (var X = x0; X <= x1; X++) {
            let e = Y * u.w + X;
            if (coarseAux[auxOff(5u, e)] > 0.5) {
              a += coarseLayers[u.pigSlot * u.n + e];
              b += coarseAux[auxOff(6u, e)];
            }
          }
        }
        let wVal = select(0.0, sc * a * n2 / b, b > 0.0);
        coarseAux[auxOff(7u, c)] = wVal;
        ew = cellVal * n2;
        eg = wVal;
      }
    }
  }

  wgWant[lid.x] = ew;
  wgGot[lid.x] = eg;
  workgroupBarrier();
  for (var stride = 128u; stride > 0u; stride >>= 1u) {
    if (lid.x < stride) {
      wgWant[lid.x] += wgWant[lid.x + stride];
      wgGot[lid.x] += wgGot[lid.x + stride];
    }
    workgroupBarrier();
  }
  if (lid.x == 0u) {
    reduceOut[wgIndex * 2u] = bitcast<u32>(wgWant[0]);
    reduceOut[wgIndex * 2u + 1u] = bitcast<u32>(wgGot[0]);
  }
}

// ---- 9. Single-workgroup finalize of edgeScale ----
@compute @workgroup_size(256)
fn spread_edge_reduce(@builtin(local_invocation_id) lid: vec3<u32>) {
  var ew = 0.0;
  var eg = 0.0;
  var i = lid.x;
  while (i < u.numWg) {
    ew += bitcast<f32>(reduceOut[i * 2u]);
    eg += bitcast<f32>(reduceOut[i * 2u + 1u]);
    i += 256u;
  }
  wgWant[lid.x] = ew;
  wgGot[lid.x] = eg;
  workgroupBarrier();
  for (var stride = 128u; stride > 0u; stride >>= 1u) {
    if (lid.x < stride) {
      wgWant[lid.x] += wgWant[lid.x + stride];
      wgGot[lid.x] += wgGot[lid.x + stride];
    }
    workgroupBarrier();
  }
  if (lid.x == 0u) {
    let scale = select(1.0, wgWant[0] / wgGot[0], wgGot[0] > 0.0);
    reduceOut[0] = bitcast<u32>(scale);
  }
}

// ---- 10. Apply edgeScale to want and compute fBuf over [prx0..prx1, pry0..pry1] ----
@compute @workgroup_size(256)
fn spread_factor(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let bw = u.prx1 - u.prx0 + 1u;
  let bh = u.pry1 - u.pry0 + 1u;
  let tid = gid.x + gid.y * ng.x * 256u;
  if (tid >= bw * bh) { return; }
  let cx = u.prx0 + (tid % bw);
  let cy = u.pry0 + (tid / bw);
  let c = cy * u.w + cx;

  if (cx < u.px0 || cx > u.px1 || cy < u.py0 || cy > u.py1) {
    coarseAux[auxOff(8u, c)] = 0.0;
    coarseAux[auxOff(9u, c)] = 0.0;
    return;
  }
  var wVal = coarseAux[auxOff(7u, c)];
  if (coarseAux[auxOff(5u, c)] > 0.5) {
    wVal *= bitcast<f32>(reduceOut[0]);
    coarseAux[auxOff(7u, c)] = wVal;
  }
  let sc = coarseAux[auxOff(6u, c)];
  coarseAux[auxOff(8u, c)] = select(-1.0, wVal / sc, sc > 0.0);
}

// ---- 11. Fill negative fBuf from 3x3 positive neighbors into fBuf2 ----
@compute @workgroup_size(256)
fn spread_factor_fill(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let bw = u.px1 - u.px0 + 1u;
  let bh = u.py1 - u.py0 + 1u;
  let tid = gid.x + gid.y * ng.x * 256u;
  if (tid >= bw * bh) { return; }
  let cx = u.px0 + (tid % bw);
  let cy = u.py0 + (tid / bw);
  let c = cy * u.w + cx;
  let fv = coarseAux[auxOff(8u, c)];
  if (fv >= 0.0) {
    coarseAux[auxOff(9u, c)] = fv;
    return;
  }
  var a = 0.0;
  var cnt = 0.0;
  let x0 = select(cx - 1u, u.px0, cx == u.px0);
  let x1 = min(u.px1, cx + 1u);
  let y0 = select(cy - 1u, u.py0, cy == u.py0);
  let y1 = min(u.py1, cy + 1u);
  for (var Y = y0; Y <= y1; Y++) {
    for (var X = x0; X <= x1; X++) {
      let v = coarseAux[auxOff(8u, Y * u.w + X)];
      if (v > 0.0) { a += v; cnt += 1.0; }
    }
  }
  coarseAux[auxOff(9u, c)] = select(0.0, a / cnt, cnt > 0.0);
}

// ---- 12. Finalize fine pigment mass and accumulate (x0, sumK, sumS) ----
@compute @workgroup_size(256)
fn spread_finalize(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let bw = u.px1 - u.px0 + 1u;
  let bh = u.py1 - u.py0 + 1u;
  let tid = gid.x + gid.y * ng.x * 256u;
  if (tid >= bw * bh) { return; }
  let cx = u.px0 + (tid % bw);
  let cy = u.py0 + (tid / bw);
  let c = cy * u.w + cx;
  let wVal = coarseAux[auxOff(7u, c)];

  var s2 = 0.0;
  for (var dy = 0u; dy < u.N; dy++) {
    let fy = cy * u.N + dy;
    for (var dx = 0u; dx < u.N; dx++) {
      let fx = cx * u.N + dx;
      let q = fy * u.fw + fx;
      let v = fineWork[q].z * bilAux(9u, fx, fy);
      fineWork[q].z = v;
      s2 += v;
    }
  }
  if (!(s2 > 0.0) || !(wVal > 0.0)) { return; }
  let scale = wVal / s2;
  let pOff = u.pigIdx * 6u;
  let K0 = pigTable[pOff].x;
  let K1 = pigTable[pOff + 1u].x;
  let K2 = pigTable[pOff + 2u].x;
  let S0 = pigTable[pOff + 3u].x;
  let S1 = pigTable[pOff + 4u].x;
  let S2 = pigTable[pOff + 5u].x;

  for (var dy = 0u; dy < u.N; dy++) {
    let fy = cy * u.N + dy;
    for (var dx = 0u; dx < u.N; dx++) {
      let fx = cx * u.N + dx;
      let q = fy * u.fw + fx;
      let m = fineWork[q].z * scale;
      if (m > 0.0) {
        accum[q * 2u] += vec4<f32>(m, m * K0, m * K1, m * K2);
        accum[q * 2u + 1u] += vec4<f32>(m * S0, m * S1, m * S2, 0.0);
      }
    }
  }
}

// ---- 13. Kubelka-Munk composite of accumulated layer over fine box + clear accum ----
@compute @workgroup_size(256)
fn km_compose_layer(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let fx0 = u.lx0 * u.N;
  let fy0 = u.ly0 * u.N;
  let bfw = (u.lx1 - u.lx0 + 1u) * u.N;
  let bfh = (u.ly1 - u.ly0 + 1u) * u.N;
  let tid = gid.x + gid.y * ng.x * 256u;
  if (tid >= bfw * bfh) { return; }
  let fx = fx0 + (tid % bfw);
  let fy = fy0 + (tid / bfw);
  let q = fy * u.fw + fx;

  let a0 = accum[q * 2u];
  let x0 = a0.x;
  if (x0 <= 1e-7) {
    if (x0 != 0.0) {
      accum[q * 2u] = vec4<f32>(0.0);
      accum[q * 2u + 1u] = vec4<f32>(0.0);
    }
    return;
  }
  let a1 = accum[q * 2u + 1u];
  accum[q * 2u] = vec4<f32>(0.0);
  accum[q * 2u + 1u] = vec4<f32>(0.0);

  let x = ds(x0);
  let invX = dsDiv(ds(1.0), x);
  let ks = array<vec2<f32>, 3>(dsMul(ds(a0.y), invX), dsMul(ds(a0.z), invX), dsMul(ds(a0.w), invX));
  let ss = array<vec2<f32>, 3>(dsMul(ds(a1.x), invX), dsMul(ds(a1.y), invX), dsMul(ds(a1.z), invX));

  for (var c = 0u; c < 3u; c++) {
    let opt = kmRT(ks[c], ss[c], x);
    let r = opt.xy;
    let t = opt.zw;
    let u0 = under[q * 3u + c];
    let num = dsMul(dsMul(t, t), u0);
    let den = dsSub(ds(1.0), dsMul(r, u0));
    under[q * 3u + c] = dsAdd(r, dsDiv(num, den));
  }
}

// ---- 14. Pack final double-single reflectance to u8 RGB (optionally applying invInkL) ----
@compute @workgroup_size(256)
fn pack_fine(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let wIdx = gid.x + gid.y * ng.x * 256u;
  let total = u.fnPix * 3u;
  if (wIdx * 4u >= total) { return; }
  var packed = 0u;
  for (var j = 0u; j < 4u; j++) {
    let i = wIdx * 4u + j;
    if (i >= total) { break; }
    let byteDs = dsMul(under[i], ds(255.0));
    let whole = floor(byteDs.x);
    let delta = dsSub(byteDs, ds(whole + 0.5));
    let up = delta.x > 0.0 || (delta.x == 0.0 && delta.y >= 0.0);
    var v = clamp(whole + select(0.0, 1.0, up), 0.0, 255.0);
    if (u.useInkRatio != 0u) {
      let ratio = bitcast<f32>(extraRead[i]);
      v = clamp(floor(v * ratio + 0.5), 0.0, 255.0);
    }
    packed |= (u32(v) << (8u * j));
  }
  reduceOut[wIdx] = packed;
}

// ---- 15. Downsample packed fine RGB (in extraRead) to coarse RGB (in reduceOut) ----
@compute @workgroup_size(256)
fn downsample_coarse(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let wIdx = gid.x + gid.y * ng.x * 256u;
  let total = u.n * 3u;
  if (wIdx * 4u >= total) { return; }
  let n2 = f32(u.N * u.N);
  var packed = 0u;
  for (var j = 0u; j < 4u; j++) {
    let idx = wIdx * 4u + j;
    if (idx >= total) { break; }
    let cell = idx / 3u;
    let ch = idx - cell * 3u;
    let cx = cell % u.w;
    let cy = cell / u.w;
    var sum = 0.0;
    for (var dy = 0u; dy < u.N; dy++) {
      let fy = cy * u.N + dy;
      for (var dx = 0u; dx < u.N; dx++) {
        let fx = cx * u.N + dx;
        let bIdx = (fy * u.fw + fx) * 3u + ch;
        let word = extraRead[bIdx >> 2u];
        sum += f32((word >> ((bIdx & 3u) * 8u)) & 255u);
      }
    }
    let val = u32(clamp(floor(sum / n2 + 0.5), 0.0, 255.0));
    packed |= (val << (8u * j));
  }
  reduceOut[wIdx] = packed;
}
`;
