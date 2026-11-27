// Browser- and Node-loadable WGSL source for WebGPU procedural paper relief, blurs, cockle, grain, and tooth fields.
// Matches src/media/paper-relief.mjs, src/media/paper.mjs, src/media/grain-field.mjs, and src/media/cockle.mjs.
export const PAPER_GPU_WGSL = `
struct ReliefUniforms {
  w: u32,
  h: u32,
  k: u32,
  numTiles: u32,
  t0n: u32,
  t1n: u32,
  sn: u32,
  hasStrength: u32,
  rmsUm: f32,
  invHeightSpan: f32,
  step0Hi: f32,
  step0Lo: f32,
  step1Hi: f32,
  step1Lo: f32,
  stepSHi: f32,
  stepSLo: f32,
  off0u: f32,
  off0v: f32,
  off1u: f32,
  off1v: f32,
}

@group(0) @binding(0) var<uniform> ru: ReliefUniforms;
@group(0) @binding(1) var<storage, read> tile0: array<f32>;
@group(0) @binding(2) var<storage, read> tile1: array<f32>;
@group(0) @binding(3) var<storage, read> strengthTile: array<f32>;
@group(0) @binding(4) var<storage, read_write> outZUm: array<f32>;
@group(0) @binding(5) var<storage, read_write> outHeight: array<f32>;

fn tileCoord(idx: f32, sub: f32, stepHi: f32, stepLo: f32, offU: f32, n: u32) -> f32 {
  let nf = f32(n);
  let coarse = (idx * stepHi) % nf;
  let fine = idx * stepLo + sub * (stepHi + stepLo) + offU;
  return coarse + fine;
}

fn bilPeriodic0(u: f32, v: f32) -> f32 {
  let n = ru.t0n;
  let m = n - 1u;
  let x0 = i32(floor(u));
  let y0 = i32(floor(v));
  let fx = u - f32(x0);
  let fy = v - f32(y0);
  let xa = u32(x0) & m;
  let ya = u32(y0) & m;
  let xb = (xa + 1u) & m;
  let yb = (ya + 1u) & m;
  let a = tile0[ya * n + xa] * (1.0 - fx) + tile0[ya * n + xb] * fx;
  let b = tile0[yb * n + xa] * (1.0 - fx) + tile0[yb * n + xb] * fx;
  return a * (1.0 - fy) + b * fy;
}

fn bilPeriodic1(u: f32, v: f32) -> f32 {
  let n = ru.t1n;
  let m = n - 1u;
  let x0 = i32(floor(u));
  let y0 = i32(floor(v));
  let fx = u - f32(x0);
  let fy = v - f32(y0);
  let xa = u32(x0) & m;
  let ya = u32(y0) & m;
  let xb = (xa + 1u) & m;
  let yb = (ya + 1u) & m;
  let a = tile1[ya * n + xa] * (1.0 - fx) + tile1[ya * n + xb] * fx;
  let b = tile1[yb * n + xa] * (1.0 - fx) + tile1[yb * n + xb] * fx;
  return a * (1.0 - fy) + b * fy;
}

fn bilStrength(u: f32, v: f32) -> f32 {
  let n = ru.sn;
  let m = n - 1u;
  let x0 = i32(floor(u));
  let y0 = i32(floor(v));
  let fx = u - f32(x0);
  let fy = v - f32(y0);
  let xa = u32(x0) & m;
  let ya = u32(y0) & m;
  let xb = (xa + 1u) & m;
  let yb = (ya + 1u) & m;
  let a = strengthTile[ya * n + xa] * (1.0 - fx) + strengthTile[ya * n + xb] * fx;
  let b = strengthTile[yb * n + xa] * (1.0 - fx) + strengthTile[yb * n + xb] * fx;
  return a * (1.0 - fy) + b * fy;
}

@compute @workgroup_size(256)
fn eval_relief(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  let n = ru.w * ru.h;
  if (i >= n) { return; }
  let xf = f32(i % ru.w);
  let yf = f32(i / ru.w);
  let kf = f32(ru.k);
  var s = 0.0;
  for (var a = 0u; a < ru.k; a++) {
    let subY = (f32(a) + 0.5) / kf;
    let v0 = tileCoord(yf, subY, ru.step0Hi, ru.step0Lo, ru.off0v, ru.t0n);
    let v1 = tileCoord(yf, subY, ru.step1Hi, ru.step1Lo, ru.off1v, ru.t1n);
    let vS = tileCoord(yf, subY, ru.stepSHi, ru.stepSLo, 0.0, ru.sn);
    for (var b = 0u; b < ru.k; b++) {
      let subX = (f32(b) + 0.5) / kf;
      let u0 = tileCoord(xf, subX, ru.step0Hi, ru.step0Lo, ru.off0u, ru.t0n);
      var val = bilPeriodic0(u0, v0);
      if (ru.numTiles > 1u) {
        let u1 = tileCoord(xf, subX, ru.step1Hi, ru.step1Lo, ru.off1u, ru.t1n);
        val += bilPeriodic1(u1, v1);
      }
      if (ru.hasStrength != 0u) {
        let uS = tileCoord(xf, subX, ru.stepSHi, ru.stepSLo, 0.0, ru.sn);
        val *= bilStrength(uS, vS);
      }
      s += val;
    }
  }
  let z = (ru.rmsUm * s) / (kf * kf);
  outZUm[i] = z;
  outHeight[i] = clamp(0.5 + z * ru.invHeightSpan, 0.0, 1.0);
}

// ---- Field operations: separable box blur, separable Gaussian blur, reductions, elementwise ----
struct FieldUniforms {
  w: u32,
  h: u32,
  n: u32,
  radius: u32,
  gw0: u32,
  gh0: u32,
  gw1: u32,
  gh1: u32,
  p0: f32,
  p1: f32,
  p2: f32,
  p3: f32,
  p4: f32,
  p5: f32,
  p6: f32,
  p7: f32,
}

@group(0) @binding(0) var<uniform> fu: FieldUniforms;
@group(0) @binding(1) var<storage, read> srcA: array<f32>;
@group(0) @binding(2) var<storage, read> srcB: array<f32>;
@group(0) @binding(3) var<storage, read> srcC: array<f32>;
@group(0) @binding(4) var<storage, read_write> dstA: array<f32>;
@group(0) @binding(5) var<storage, read_write> dstB: array<f32>;
@group(0) @binding(6) var<storage, read_write> dstC: array<f32>;

@compute @workgroup_size(256)
fn box_x(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  let x = i32(i % fu.w);
  let y = i / fu.w;
  let r = i32(fu.radius);
  let x0 = max(0, x - r);
  let x1 = min(i32(fu.w) - 1, x + r);
  let row = y * fu.w;
  var s = 0.0;
  for (var xx = x0; xx <= x1; xx++) { s += srcA[row + u32(xx)]; }
  dstA[i] = s / f32(x1 - x0 + 1);
}

@compute @workgroup_size(256)
fn box_y(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  let x = i % fu.w;
  let y = i32(i / fu.w);
  let r = i32(fu.radius);
  let y0 = max(0, y - r);
  let y1 = min(i32(fu.h) - 1, y + r);
  var s = 0.0;
  for (var yy = y0; yy <= y1; yy++) { s += srcA[u32(yy) * fu.w + x]; }
  dstA[i] = s / f32(y1 - y0 + 1);
}

// Separable Gaussian blur: srcB holds kernel weights [0..2*r]
@compute @workgroup_size(256)
fn gauss_x(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  let x = i32(i % fu.w);
  let y = i / fu.w;
  let r = i32(fu.radius);
  let wMax = i32(fu.w) - 1;
  let row = y * fu.w;
  var v = 0.0;
  for (var k = -r; k <= r; k++) {
    let xx = u32(clamp(x + k, 0, wMax));
    v += srcB[u32(k + r)] * srcA[row + xx];
  }
  dstA[i] = v;
}

@compute @workgroup_size(256)
fn gauss_y(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  let x = i % fu.w;
  let y = i32(i / fu.w);
  let r = i32(fu.radius);
  let hMax = i32(fu.h) - 1;
  var v = 0.0;
  for (var k = -r; k <= r; k++) {
    let yy = u32(clamp(y + k, 0, hMax));
    v += srcB[u32(k + r)] * srcA[yy * fu.w + x];
  }
  dstA[i] = v;
}

// DeltaZ = (zref - z) * invUnit where srcA=zref, srcB=z, fu.p0=invUnit
@compute @workgroup_size(256)
fn sub_scale(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  dstA[i] = (srcA[i] - srcB[i]) * fu.p0;
}

// Affine normalization: dstA[i] = (srcA[i] - fu.p0) * fu.p1 + fu.p2
@compute @workgroup_size(256)
fn norm_scale(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  dstA[i] = (srcA[i] - fu.p0) * fu.p1 + fu.p2;
}

// Reduction: per-workgroup (min, max, sum) of srcA into dstA[wg*3 + 0/1/2]
var<workgroup> shMin: array<f32, 256>;
var<workgroup> shMax: array<f32, 256>;
var<workgroup> shSum: array<f32, 256>;

@compute @workgroup_size(256)
fn reduce_stats(
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(num_workgroups) ng: vec3<u32>
) {
  let wgIdx = wid.x + wid.y * ng.x;
  let i = wgIdx * 256u + lid.x;
  var lo = 3.4028234e38;
  var hi = -3.4028234e38;
  var sm = 0.0;
  if (i < fu.n) {
    let v = srcA[i];
    lo = v; hi = v; sm = v;
  }
  shMin[lid.x] = lo; shMax[lid.x] = hi; shSum[lid.x] = sm;
  workgroupBarrier();
  for (var stride = 128u; stride > 0u; stride >>= 1u) {
    if (lid.x < stride) {
      shMin[lid.x] = min(shMin[lid.x], shMin[lid.x + stride]);
      shMax[lid.x] = max(shMax[lid.x], shMax[lid.x + stride]);
      shSum[lid.x] += shSum[lid.x + stride];
    }
    workgroupBarrier();
  }
  if (lid.x == 0u) {
    dstA[wgIdx * 3u] = shMin[0];
    dstA[wgIdx * 3u + 1u] = shMax[0];
    dstA[wgIdx * 3u + 2u] = shSum[0];
  }
}

// Compute toothH normalized (dstA), capacity (dstB), proud (dstC)
// srcA=height, srcB=toothRaw, srcC=proudLow; fu.p0=toothLo, fu.p1=toothSpan, fu.p2=cmin, fu.p3=cmax
@compute @workgroup_size(256)
fn finalize_tooth_cap_proud(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  let hVal = srcA[i];
  let tRaw = srcB[i];
  let invSpan = 1.0 / fu.p1;
  dstA[i] = (tRaw - fu.p0) * invSpan;
  dstB[i] = hVal * (fu.p3 - fu.p2) + fu.p2;
  dstC[i] = hVal - srcC[i];
}

// Compute fdx (dstA), fdy (dstB), grain (dstC) from bc (srcA), bs (srcB), bf (srcC), fu.p0=fm*0.3
@compute @workgroup_size(256)
fn finalize_fibres(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  let bc = srcA[i];
  let bs = srcB[i];
  let bf = srcC[i];
  let a = select(atan2(bs, bc) * 0.5, 0.0, (bc == 0.0 && bs == 0.0));
  let m = length(vec2<f32>(bc, bs));
  dstA[i] = cos(a);
  dstB[i] = sin(a);
  if (bf > 1e-6) {
    let denom = fu.p0;
    let factor = select(1.0, min(1.0, bf / denom), denom > 0.0);
    dstC[i] = min(1.0, (m / bf) * factor);
  } else {
    dstC[i] = 0.0;
  }
}

// Compute hollow (dstA) and rel^2 (dstB) from height (srcA), toothH (srcB), grainH (srcC)
// fu.p0=toothLo, fu.p1=toothSpan, fu.p2=hollowUnit
@compute @workgroup_size(256)
fn finalize_hollow_rel2(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  let level = fu.p0 + fu.p1 * srcB[i];
  let rel = srcA[i] - level;
  dstB[i] = rel * rel;
  let d = level - srcC[i];
  dstA[i] = max(0.0, d / fu.p2);
}

// Non-physical paper raw height from precomputed value-noise knot grids (srcA=tooth knots, srcB=pattern knots, srcC=blurred fibres)
// fu.p0 = 2.5 * ts, fu.p1 = 7.0 * ps, fu.p2 = fibres, fu.p3 = fscale, fu.p4 = tooth
@compute @workgroup_size(256)
fn nonphys_height(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  let x = f32(i % fu.w);
  let y = f32(i / fu.w);

  let u0 = x / fu.p0;
  let v0 = y / fu.p0;
  let xi0 = min(u32(floor(u0)), fu.gw0 - 2u);
  let yi0 = min(u32(floor(v0)), fu.gh0 - 2u);
  let fx0 = u0 - f32(xi0);
  let fy0 = v0 - f32(yi0);
  let sx0 = fx0 * fx0 * (3.0 - 2.0 * fx0);
  let sy0 = fy0 * fy0 * (3.0 - 2.0 * fy0);
  let a0 = srcA[yi0 * fu.gw0 + xi0];
  let b0 = srcA[yi0 * fu.gw0 + xi0 + 1u];
  let c0 = srcA[(yi0 + 1u) * fu.gw0 + xi0];
  let d0 = srcA[(yi0 + 1u) * fu.gw0 + xi0 + 1u];
  let vn0 = a0 + (b0 - a0) * sx0 + (c0 - a0) * sy0 + (a0 - b0 - c0 + d0) * sx0 * sy0;

  let u1 = x / fu.p1;
  let v1 = y / fu.p1;
  let xi1 = min(u32(floor(u1)), fu.gw1 - 2u);
  let yi1 = min(u32(floor(v1)), fu.gh1 - 2u);
  let fx1 = u1 - f32(xi1);
  let fy1 = v1 - f32(yi1);
  let sx1 = fx1 * fx1 * (3.0 - 2.0 * fx1);
  let sy1 = fy1 * fy1 * (3.0 - 2.0 * fy1);
  let a1 = srcB[yi1 * fu.gw1 + xi1];
  let b1 = srcB[yi1 * fu.gw1 + xi1 + 1u];
  let c1 = srcB[(yi1 + 1u) * fu.gw1 + xi1];
  let d1 = srcB[(yi1 + 1u) * fu.gw1 + xi1 + 1u];
  let vn1 = a1 + (b1 - a1) * sx1 + (c1 - a1) * sy1 + (a1 - b1 - c1 + d1) * sx1 * sy1;

  let t = 0.6 * vn0 + 0.4 * vn1;
  dstA[i] = fu.p2 * min(1.0, srcC[i] * fu.p3) + fu.p4 * t;
}

// Bilinear upsample of coarse scalar field srcA (gw0 x gh0) to fine field dstA (w x h) at factor N=fu.radius
@compute @workgroup_size(256)
fn upsample_bil(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  let x = i % fu.w;
  let y = i / fu.w;
  let nf = f32(fu.radius);
  let u = clamp((f32(x) + 0.5) / nf - 0.5, 0.0, f32(fu.gw0 - 1u));
  let v = clamp((f32(y) + 0.5) / nf - 0.5, 0.0, f32(fu.gh0 - 1u));
  let x0 = u32(floor(u));
  let y0 = u32(floor(v));
  let x1 = min(fu.gw0 - 1u, x0 + 1u);
  let y1 = min(fu.gh0 - 1u, y0 + 1u);
  let fx = u - f32(x0);
  let fy = v - f32(y0);
  let a = srcA[y0 * fu.gw0 + x0] * (1.0 - fx) + srcA[y0 * fu.gw0 + x1] * fx;
  let b = srcA[y1 * fu.gw0 + x0] * (1.0 - fx) + srcA[y1 * fu.gw0 + x1] * fx;
  dstA[i] = a * (1.0 - fy) + b * fy;
}

// Cockle raw value noise from exact precomputed knot grids (srcA = broad knots, srcB = fine knots)
// fu.gw0/gh0 = broad knot grid dims, fu.gw1/gh1 = fine knot grid dims
// fu.p0=mmPerCell, fu.p1=broadMm, fu.p2=fineMm, fu.p3=fineShare, fu.p4=ox1 (7.3), fu.p5=oy1 (2.9)
@compute @workgroup_size(256)
fn cockle_raw(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  let x = i % fu.w;
  let y = i / fu.w;
  let X = (f32(x) + 0.5) * fu.p0;
  let Y = (f32(y) + 0.5) * fu.p0;

  let u0 = X / fu.p1;
  let v0 = Y / fu.p1;
  let xi0 = u32(floor(u0));
  let yi0 = u32(floor(v0));
  let fx0 = u0 - f32(xi0);
  let fy0 = v0 - f32(yi0);
  let sx0 = fx0 * fx0 * (3.0 - 2.0 * fx0);
  let sy0 = fy0 * fy0 * (3.0 - 2.0 * fy0);
  let a0 = srcA[yi0 * fu.gw0 + xi0];
  let b0 = srcA[yi0 * fu.gw0 + xi0 + 1u];
  let c0 = srcA[(yi0 + 1u) * fu.gw0 + xi0];
  let d0 = srcA[(yi0 + 1u) * fu.gw0 + xi0 + 1u];
  let vn0 = a0 + (b0 - a0) * sx0 + (c0 - a0) * sy0 + (a0 - b0 - c0 + d0) * sx0 * sy0;

  let u1 = X / fu.p2 + fu.p4;
  let v1 = Y / fu.p2 + fu.p5;
  let xi1 = u32(floor(u1));
  let yi1 = u32(floor(v1));
  let fx1 = u1 - f32(xi1);
  let fy1 = v1 - f32(yi1);
  let sx1 = fx1 * fx1 * (3.0 - 2.0 * fx1);
  let sy1 = fy1 * fy1 * (3.0 - 2.0 * fy1);
  let ox1 = xi1 - u32(floor(fu.p4));
  let oy1 = yi1 - u32(floor(fu.p5));
  let a1 = srcB[oy1 * fu.gw1 + ox1];
  let b1 = srcB[oy1 * fu.gw1 + ox1 + 1u];
  let c1 = srcB[(oy1 + 1u) * fu.gw1 + ox1];
  let d1 = srcB[(oy1 + 1u) * fu.gw1 + ox1 + 1u];
  let vn1 = a1 + (b1 - a1) * sx1 + (c1 - a1) * sy1 + (a1 - b1 - c1 + d1) * sx1 * sy1;

  dstA[i] = (1.0 - fu.p3) * vn0 + fu.p3 * vn1;
}

// Subtract mean and compute squared value for cockle RMS reduction: dstA = srcA - mean, dstB = (srcA - mean)^2
@compute @workgroup_size(256)
fn cockle_center_sq(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  let d = srcA[i] - fu.p0;
  dstA[i] = d;
  dstB[i] = d * d;
}

// surface = valley (srcA) + cockleCentered (srcB) * (k / SURFACE_MM)
@compute @workgroup_size(256)
fn cockle_surface(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let i = gid.x + gid.y * ng.x * 256u;
  if (i >= fu.n) { return; }
  dstA[i] = srcA[i] + srcB[i] * fu.p0;
}
`;
