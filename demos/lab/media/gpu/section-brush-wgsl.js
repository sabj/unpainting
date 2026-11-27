// Generated from src/media/gpu/section-brush-wgsl.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Browser-safe section shader. The fused specialization shares the exact contact and exchange
// arithmetic with the parallel shader; only scratch address space and reductions change.
// Contact records scale in invocation-private memory; shared scratch remains
// 14,964 bytes at this limit, including the 128-lane state and reductions.
export const SMALL_CELLS = 2048;
export const SMALL_LANES = 128;
const PARALLEL = String.raw`// Multi-workgroup parallel Metal/WebGPU section brush (tuft-section.mjs + brush.mjs sectionStroke).
// Parallelizes every step's bbox across ALL GPU cores (up to MAX_WG = 128 workgroups of 256 threads):
//   1. section_init        (1 wg):   Load stroke header, prep step 0 (capillary feed, geom, hashC1/C2).
//   2. section_eval        (nWG):    All cells in bbox evaluated in parallel (exact SDF, edge breathing,
//                                    edgeTooth, end-line cuts, clip, toothReach + filmReach), compacting
//                                    active cells into SW.data and reducing per-lane demands (mix/give/take/pore).
//   3. section_scale       (1 wg):   Reduce per-WG demands -> exact conservation scale factors per lane
//                                    (guarantees 100% mass conservation & non-negative water/pigments).
//   4. section_apply       (nWG):    All active cells execute simultaneous film exchange in parallel
//                                    across all cores, reducing per-lane water & trade pigment deltas.
//   5. section_commit_prep (1 wg):   Apply lane deltas to BSTR hair state, advance cur, prep next step.
// Prepended with struct U + @binding(0) uniform u by section-brush-gpu.mjs.

const SB = 4194304u;
const MAX_WG = 128u;
const MASK_LANES = 128u;
const NONE = 0xFFFFFFFFu;

const SOAK_SIZING: f32 = 0.9;
const TUFT_SUCK: f32 = 0.6;
const TUFT_PORE: f32 = 0.15;
const TUFT_PORE_FILM: f32 = 0.03;
const TUFT_MIX: f32 = 0.25;
const SURFACE_MM: f32 = 0.1;

// Header layout in BSTR[0..63]
const SH_LANES = 0u;
const SH_K = 1u;
const SH_WETTING = 3u;
const SH_CAPA = 4u;
const SH_CAPB = 5u;
const SH_KEEP = 6u;
const SH_HB = 7u;
const SH_G = 8u;
const SH_KF = 9u;
const SH_KA = 10u;
const SH_BRIDGE = 11u;
const SH_RELIEF = 12u;
const SH_SOFT = 13u;
const SH_TLO = 14u;
const SH_TSPAN = 15u;
const SH_ET = 16u;
const SH_VR = 17u;
const SH_NENDS = 18u;
const SH_OFFCLIP = 19u;
const SH_CLIP_X0 = 20u;
const SH_CLIP_Y0 = 21u;
const SH_NSTEPS = 24u;
const SH_CUR = 25u;
const SH_SP = 26u;
const SH_OFFH = 27u;
const SH_OFFS = 28u;
const SH_HS = 29u;
const SH_CLIP_RW = 30u;
const SH_CLIP_RH = 31u;
const SH_ENDS0 = 36u;
const SH_ENDS1 = 41u;
const SH_ENDS_RANGE = 46u;

struct SWork {
  cur: u32,
  nst: u32,
  lanes: u32,
  flag: u32,       // bit 0: active; bit 2: anyFeed; bit 3: onSheet; bit 4: recalc hc1; bit 5: recalc hc2
  nsub: u32,
  nCells: u32,
  nWG: u32,
  nActive: atomic<u32>,
  X0: u32,
  Y0: u32,
  X1: u32,
  Y1: u32,
  bw: u32,
  sp: u32,
  offs: u32,
  offH: u32,
  hs: u32,
  pK: u32,
  partWords: u32,
  hasTrade: atomic<u32>,
  // 20 u32s = 80 bytes
  p: f32,
  dt: f32,
  half: f32,
  band: f32,
  edgeLim: f32,
  invL1: f32,
  invL2: f32,
  bx: f32,
  by: f32,
  thick: f32,
  capa: f32,
  capB: f32,
  keep: f32,
  hb: f32,
  g: f32,
  kF: f32,
  kA: f32,
  bridge: f32,
  relief: f32,
  soft: f32,
  tLo: f32,
  tSpan: f32,
  eT: f32,
  vR: f32,
  // 24 f32s = 96 bytes (total 176 bytes)
  wetting: u32,
  nEnds: u32,
  offClip: u32,
  clipX0: u32,
  clipY0: u32,
  clipRW: u32,
  clipRH: u32,
  curStep: u32,
  // 8 u32s = 32 bytes (total 208 bytes, 16-byte aligned)
  end0A: vec4<f32>,
  end0B: vec4<f32>,
  end1A: vec4<f32>,
  end1B: vec4<f32>,
  hc1Info: vec4<u32>,
  hc2Info: vec4<u32>,
  prevHc1: vec4<u32>,
  prevHc2: vec4<u32>,
  geomPts: array<vec4<f32>, 64>,
  hashC1: array<f32, 256>,
  hashC2: array<f32, 64>,
  reach: array<f32, 576>,
  fFeed: array<f32, 576>,
  laneScale: array<vec4<f32>, 576>,
  laneHbMid: array<f32, 576>,
  wgHasTrade: array<u32, 128>,
  // Trailing runtime-sized array: [0..partWords) = per-WG partial reductions, [partWords..) = compacted active cells
  data: array<f32>,
}

// Each entry point uses <= 10 storage buffers:
//   eval-group (init/eval/scale/commit): bindings 0, 1, 3, 4, 5, 9, 10, 11 (7 storage buffers)
//   apply-group (apply):                 bindings 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11 (10 storage buffers)
@group(0) @binding(1) var<storage, read_write> M: array<u32>;
@group(0) @binding(2) var<storage, read_write> EVER: array<u32>;
@group(0) @binding(3) var<storage, read> RESIST: array<u32>;
@group(0) @binding(4) var<storage, read_write> W: array<f32>;
@group(0) @binding(5) var<storage, read_write> S: array<f32>;
@group(0) @binding(6) var<storage, read_write> G: array<f32>;
@group(0) @binding(7) var<storage, read_write> D: array<f32>;
@group(0) @binding(8) var<storage, read_write> FLAGS2: array<atomic<u32>>;
@group(0) @binding(9) var<storage, read_write> BSTR: array<f32>;
@group(0) @binding(10) var<storage, read> BPAP: array<vec4<f32>>;
@group(0) @binding(11) var<storage, read_write> SW: SWork;

override FULL_BRUSH_PIGMENTS: bool = false;
override IS_FLAT: bool = false;
override LAB_FLAGS: bool = false;

fn klAt(a: u32) -> u32 { return u.kl[a >> 2u][a & 3u]; }
fn brushPigmentCount() -> u32 { return select(u.nAct, SW.pK, FULL_BRUSH_PIGMENTS); }
fn brushPigmentAt(a: u32) -> u32 { if (FULL_BRUSH_PIGMENTS) { return a; } return klAt(a); }
fn bu(i: u32) -> u32 { return bitcast<u32>(BSTR[i]); }
fn hb(j: u32) -> u32 { return SW.offH + j * SW.hs; }

fn smooth01(x: f32) -> f32 {
  if (x <= 0.0) { return 0.0; }
  if (x >= 1.0) { return 1.0; }
  return x * x * (3.0 - 2.0 * x);
}
fn jround(x: f32) -> f32 { return floor(x + 0.5); }

fn markDirty(t: u32) {
  if (LAB_FLAGS) { return; }
  if (u.p3 != 0u && atomicLoad(&FLAGS2[2u * u.ntiles + 1u + t]) == 0u) {
    if (atomicExchange(&FLAGS2[2u * u.ntiles + 1u + t], 1u) == 0u) {
      let q = atomicAdd(&FLAGS2[5u * u.ntiles + 1u], 1u);
      atomicStore(&FLAGS2[3u * u.ntiles + 1u + q], t);
    }
  }
}
fn markWet(t: u32) {
  if (LAB_FLAGS) { atomicOr(&FLAGS2[t], 1u); return; }
  if (atomicLoad(&FLAGS2[5u * u.ntiles + 3u + t]) != 511u) {
    atomicStore(&FLAGS2[5u * u.ntiles + 3u + t], 511u);
  }
  markDirty(t);
  if (u.p3 != 0u && atomicLoad(&FLAGS2[t]) == 0u) {
    if (atomicExchange(&FLAGS2[t], 1u) == 0u) {
      let q = atomicAdd(&FLAGS2[2u * u.ntiles], 1u);
      atomicStore(&FLAGS2[u.ntiles + q], t);
    }
  }
}

// Exact 64-bit unsigned fixed-point hash2 matching JS f64 Math.sin(c*91.7 + i*12.9898 + j*78.233) * 43758.5453
fn u64_add(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
  let lo = a.y + b.y;
  return vec2<u32>(a.x + b.x + select(0u, 1u, lo < a.y), lo);
}
fn u64_sub(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
  let lo = a.y - b.y;
  return vec2<u32>(a.x - b.x - select(0u, 1u, a.y < b.y), lo);
}
fn mul32_64(a: u32, b: u32) -> vec2<u32> {
  let a0 = a & 0xFFFFu; let a1 = a >> 16u;
  let b0 = b & 0xFFFFu; let b1 = b >> 16u;
  let p00 = a0 * b0; let p01 = a0 * b1; let p10 = a1 * b0; let p11 = a1 * b1;
  let mid = (p00 >> 16u) + (p01 & 0xFFFFu) + (p10 & 0xFFFFu);
  let lo = (p00 & 0xFFFFu) | (mid << 16u);
  let hi = p11 + (p01 >> 16u) + (p10 >> 16u) + (mid >> 16u);
  return vec2<u32>(hi, lo);
}
fn u64_mul_u32_lo(a: vec2<u32>, b: u32) -> vec2<u32> {
  let p = mul32_64(a.y, b);
  return vec2<u32>(a.x * b + p.x, p.y);
}
fn u64_mul_hi(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
  let ll = mul32_64(a.y, b.y);
  let lh = mul32_64(a.y, b.x);
  let hl = mul32_64(a.x, b.y);
  let hh = mul32_64(a.x, b.x);
  let m1 = u64_add(vec2<u32>(0u, ll.x), lh);
  let m2 = u64_add(m1, hl);
  let carry_hi = select(0u, 1u, m2.x < m1.x || (m2.x == m1.x && m2.y < m1.y));
  return u64_add(hh, vec2<u32>(carry_hi, m2.x));
}
fn hash2_exact(c_idx: u32, ii: u32, jj: u32) -> f32 {
  let c0 = select(vec2<u32>(0xfd61086fu, 0x98000000u), vec2<u32>(0xdb0cb233u, 0x48000000u), c_idx == 0u);
  let kA = vec2<u32>(0x11408758u, 0xaec78000u);
  let kB = vec2<u32>(0x737fca1cu, 0x2bc50000u);
  let ph = u64_add(u64_add(c0, u64_mul_u32_lo(kA, ii)), u64_mul_u32_lo(kB, jj));
  let quad = ph.x >> 30u;
  let neg = quad >= 2u;
  var q = vec2<u32>(ph.x & 0x3FFFFFFFu, ph.y);
  if ((quad & 1u) != 0u) {
    q = u64_sub(vec2<u32>(0x40000000u, 0u), q);
  }
  var uu = vec2<u32>((q.x << 2u) | (q.y >> 30u), q.y << 2u);
  if (q.x == 0x40000000u) { uu = vec2<u32>(0xFFFFFFFFu, 0xFFFFFFFFu); }
  let u2 = u64_mul_hi(uu, uu);
  var p = vec2<u32>(0x0u, 0xb7d6dcf9u);
  p = u64_sub(vec2<u32>(0x3du, 0x1e869a03u), u64_mul_hi(p, u2));
  p = u64_sub(vec2<u32>(0xf18u, 0x3a7ef444u), u64_mul_hi(p, u2));
  p = u64_sub(vec2<u32>(0x2a0f0u, 0x690fdcf0u), u64_mul_hi(p, u2));
  p = u64_sub(vec2<u32>(0x4cb4b3u, 0x398af610u), u64_mul_hi(p, u2));
  p = u64_sub(vec2<u32>(0x519af19u, 0xdd6ab840u), u64_mul_hi(p, u2));
  p = u64_sub(vec2<u32>(0x295779ccu, 0x4b7ca400u), u64_mul_hi(p, u2));
  p = u64_sub(vec2<u32>(0x6487ed51u, 0x10b46000u), u64_mul_hi(p, u2));
  let s62 = u64_mul_hi(uu, p);
  let s64 = vec2<u32>((s62.x << 2u) | (s62.y >> 30u), s62.y << 2u);
  let frac1 = u64_mul_u32_lo(s64, 43758u);
  let frac2 = u64_mul_hi(s64, vec2<u32>(0x8b98c7e2u, 0x8240b800u));
  var frac = u64_add(frac1, frac2);
  if (neg) { frac = u64_sub(vec2<u32>(0u, 0u), frac); }
  return f32(frac.x) * 2.3283064365386963e-10;
}

fn field2_cached1(x: f32, y: f32) -> f32 {
  let i = floor(x);
  let j = floor(y);
  let iu = u32(i);
  let ju = u32(j);
  let fx = x - i;
  let fy = y - j;
  let ux = fx * fx * (3.0 - 2.0 * fx);
  let wy = fy * fy * (3.0 - 2.0 * fy);
  let info = SW.hc1Info;
  let nx = info.z;
  let lx = min(iu - info.x, nx - 2u);
  let ly = min(ju - info.y, info.w - 2u);
  let idx = ly * nx + lx;
  let a = SW.hashC1[idx];
  let b = SW.hashC1[idx + 1u];
  let d = SW.hashC1[idx + nx];
  let e = SW.hashC1[idx + nx + 1u];
  return a + (b - a) * ux + (d - a) * wy + (a - b - d + e) * ux * wy;
}

fn field2_cached2(x: f32, y: f32) -> f32 {
  let i = floor(x);
  let j = floor(y);
  let iu = u32(i);
  let ju = u32(j);
  let fx = x - i;
  let fy = y - j;
  let ux = fx * fx * (3.0 - 2.0 * fx);
  let wy = fy * fy * (3.0 - 2.0 * fy);
  let info = SW.hc2Info;
  let nx = info.z;
  let lx = min(iu - info.x, nx - 2u);
  let ly = min(ju - info.y, info.w - 2u);
  let idx = ly * nx + lx;
  let a = SW.hashC2[idx];
  let b = SW.hashC2[idx + 1u];
  let d = SW.hashC2[idx + nx];
  let e = SW.hashC2[idx + nx + 1u];
  return a + (b - a) * ux + (d - a) * wy + (a - b - d + e) * ux * wy;
}

fn head_of(sat: f32, free: f32, Hb: f32) -> f32 {
  if (sat >= free) {
    let x = min(1.0, (sat - free) / max(1e-6, 1.0 - free));
    let m = 1.0 - x;
    return Hb * (1.0 - m * m * m);
  }
  return TUFT_SUCK * (sat - free) / max(1e-6, free);
}

fn tooth_reach(sat: f32, p: f32, bridge: f32, wander: f32) -> f32 {
  let pressure = clamp(p, 0.0, 1.0);
  let contact = -0.7 + 0.5 * pressure;
  let full = select(3.0, bridge, bridge > 0.0) * (0.55 + 0.45 * pressure) * wander;
  let s = clamp(sat, 0.0, 1.0);
  return contact + (full - contact) * (s * s * s);
}

fn section_feed_water(dt: f32) -> u32 {
  let lanes = SW.lanes;
  let bel = hb(lanes);
  let capB = SW.capB;
  let capa = SW.capa;
  let ef = 1.0 - exp(-SW.kF * dt);
  var bw = BSTR[bel];
  var anyFeed = 0u;
  for (var j = 0u; j < lanes; j++) {
    let h = hb(j);
    var hw = BSTR[h];
    let cL = capa * BSTR[h + 1u];
    let cLnz = select(1.0, cL, cL != 0.0);
    let sB = select(0.0, bw / capB, capB > 0.0);
    let sL = hw / cLnz;
    let denom = cL + capB;
    let q = ef * (sB - sL) * cL * capB / select(1.0, denom, denom != 0.0);
    var ff = 0.0;
    if (q > 0.0 && bw > 0.0) {
      let wat = min(q, bw);
      let f = min(1.0, wat / bw);
      let wq = bw * f;
      bw -= wq;
      hw += wq;
      ff = f;
      anyFeed = 4u;
    } else if (q < 0.0 && hw > 0.0) {
      let f = min(1.0, -q / hw);
      let wq = hw * f;
      bw += wq;
      hw -= wq;
      ff = -f;
      anyFeed = 4u;
    }
    BSTR[h] = hw;
    SW.fFeed[j] = ff;
  }
  BSTR[bel] = bw;
  return anyFeed;
}

fn section_feed_pigments(li: u32, lanesU: u32) {
  let nP = brushPigmentCount();
  if (li < nP) {
    let k = brushPigmentAt(li);
    let bel = hb(lanesU) + 4u + k;
    var bp = BSTR[bel];
    for (var j = 0u; j < lanesU; j++) {
      let ff = SW.fFeed[j];
      if (ff > 0.0) {
        let m = bp * ff;
        bp -= m;
        BSTR[hb(j) + 4u + k] += m;
      } else if (ff < 0.0) {
        let h = hb(j) + 4u + k;
        let m = BSTR[h] * (-ff);
        BSTR[h] -= m;
        bp += m;
      }
    }
    BSTR[bel] = bp;
  }
}

// Workgroup uniform scalars (so all barriers live in strictly uniform control flow)
var<workgroup> w_flag: u32;
var<workgroup> w_step: u32;
var<workgroup> w_lanes: u32;
var<workgroup> w_nCells: u32;
var<workgroup> w_nWG: u32;
var<workgroup> w_nP: u32;
var<workgroup> w_sb: u32;

fn prep_step(li: u32, stepIdx: u32) {
  if (li == 0u) {
    SW.curStep = stepIdx;
    let lanesU = SW.lanes;
    w_lanes = lanesU;
    if (stepIdx >= SW.nst) {
      SW.flag = 0u;
      w_flag = 0u;
      w_sb = 0u;
    } else {
      let sb = SW.offs + stepIdx * SW.sp;
      w_sb = sb;
      let X0 = bu(sb + 28u);
      let isAct = select(0u, 1u, X0 != NONE);
      var moved = 0u;
      var onSheetBit = 0u;
      var hashBits = 0u;
      atomicStore(&SW.nActive, 0u);
      atomicStore(&SW.hasTrade, 0u);
      if (isAct != 0u) {
        let p = BSTR[sb + 18u];
        let dt = BSTR[sb + 19u];
        SW.p = p;
        SW.dt = dt;
        if (X0 != (NONE - 1u)) {
          onSheetBit = 8u;
          let Y0s = bu(sb + 29u);
          let X1s = bu(sb + 30u);
          let Y1s = bu(sb + 31u);
          let bw = X1s - X0 + 1u;
          let bh = Y1s - Y0s + 1u;
          let nCells = bw * bh;
          SW.X0 = X0; SW.Y0 = Y0s; SW.X1 = X1s; SW.Y1 = Y1s;
          SW.bw = bw;
          SW.nCells = nCells;
          SW.nWG = min(MAX_WG, (nCells + 255u) >> 8u);
          let half = BSTR[sb + 20u];
          let band = BSTR[sb + 21u];
          let l1s = BSTR[sb + 22u];
          let l2s = BSTR[sb + 23u];
          let bx = BSTR[sb + 24u];
          let by = BSTR[sb + 25u];
          let thick = BSTR[sb + 26u];
          SW.half = half;
          SW.band = band;
          SW.edgeLim = 0.5 + 0.1 * half * SW.vR + 2.0 * SW.eT + 1e-4;
          SW.invL1 = 1.0 / l1s;
          SW.invL2 = 1.0 / l2s;
          SW.bx = bx; SW.by = by; SW.thick = thick;
          if (SW.vR != 0.0) {
            let i10 = u32(floor(f32(X0) / l1s));
            let i11 = u32(floor(f32(X1s) / l1s)) + 1u;
            let j10 = u32(floor(f32(Y0s) / l1s));
            let j11 = u32(floor(f32(Y1s) / l1s)) + 1u;
            let nx1 = max(2u, min(16u, i11 - i10 + 1u));
            let ny1 = max(2u, min(16u, j11 - j10 + 1u));
            let next1 = vec4<u32>(i10, j10, nx1, ny1);
            if (any(next1 != SW.prevHc1)) {
              SW.hc1Info = next1;
              SW.prevHc1 = next1;
              hashBits |= 16u;
            }
            let i20 = u32(floor(f32(X0) / l2s));
            let i21 = u32(floor(f32(X1s) / l2s)) + 1u;
            let j20 = u32(floor(f32(Y0s) / l2s));
            let j21 = u32(floor(f32(Y1s) / l2s)) + 1u;
            let nx2 = max(2u, min(8u, i21 - i20 + 1u));
            let ny2 = max(2u, min(8u, j21 - j20 + 1u));
            let next2 = vec4<u32>(i20, j20, nx2, ny2);
            if (any(next2 != SW.prevHc2)) {
              SW.hc2Info = next2;
              SW.prevHc2 = next2;
              hashBits |= 32u;
            }
          }
        }
        moved = section_feed_water(dt);
      }
      let fl = isAct | moved | onSheetBit | hashBits;
      SW.flag = fl;
      w_flag = fl;
    }
  }
  let flag = workgroupUniformLoad(&w_flag);
  let lanesU = workgroupUniformLoad(&w_lanes);
  let sb = workgroupUniformLoad(&w_sb);
  // Publish lane-zero storage headers, hair water and feed fractions.
  storageBarrier(); workgroupBarrier();
  if ((flag & 4u) != 0u) {
    section_feed_pigments(li, lanesU);
    storageBarrier(); workgroupBarrier();
  }
  if ((flag & 8u) != 0u) {
    // Geometry writes have independent owners; only scalar header/feed work stays on lane zero.
    let bx = SW.bx; let by = SW.by; let thick = SW.thick;
    if (IS_FLAT) {
      if (li < 64u) {
        let nx = -by; let ny = bx;
        let stepDiv = max(0.35, 0.7 * thick);
        var nsub = 0u;
        for (var s = 0u; s < 5u; s++) {
          let ax = BSTR[sb + 2u * s]; let ay = BSTR[sb + 2u * s + 1u];
          let ex = BSTR[sb + 2u * s + 2u] - ax; let ey = BSTR[sb + 2u * s + 3u] - ay;
          let m = max(1u, u32(ceil(sqrt(ex * ex + ey * ey) / stepDiv)));
          let count = min(m, 63u - nsub);
          if (li >= nsub && li < nsub + count) {
            let tf = f32(li - nsub) / f32(m);
            let sx = ax + ex * tf; let sy = ay + ey * tf;
            let r0 = BSTR[sb + 12u + s]; let r1 = BSTR[sb + 13u + s];
            let a = r0 + (r1 - r0) * tf;
            SW.geomPts[li] = vec4<f32>(sx * bx + sy * by, sx * nx + sy * ny, a, min(thick, a));
          }
          nsub += count;
        }
        if (li == nsub) {
          let lx = BSTR[sb + 10u]; let ly = BSTR[sb + 11u]; let alast = BSTR[sb + 17u];
          SW.geomPts[li] = vec4<f32>(lx * bx + ly * by, lx * nx + ly * ny, alast, min(thick, alast));
          SW.nsub = nsub + 1u;
        }
      }
    } else {
      if (li < 5u) {
        let s = li;
        let ax = BSTR[sb + 2u * s];
        let ay = BSTR[sb + 2u * s + 1u];
        let bpx = BSTR[sb + 2u * s + 2u];
        let bpy = BSTR[sb + 2u * s + 3u];
        let ex = bpx - ax;
        let ey = bpy - ay;
        let L = sqrt(ex * ex + ey * ey);
        let ux = select(1.0, ex / L, L > 1e-9);
        let uy = select(0.0, ey / L, L > 1e-9);
        let r1 = BSTR[sb + 12u + s];
        let r2 = BSTR[sb + 13u + s];
        let degen = (L <= 1e-6) || (abs(r1 - r2) >= L);
        var a = 0.0;
        var b = 0.0;
        var ah = 0.0;
        if (!degen) {
          b = (r1 - r2) / L;
          a = sqrt(max(0.0, 1.0 - b * b));
          ah = a * L;
        }
        SW.geomPts[4u * s] = vec4<f32>(ax, ay, ux, uy);
        SW.geomPts[4u * s + 1u] = vec4<f32>(L, r1, r2, max(r1, r2));
        SW.geomPts[4u * s + 2u] = vec4<f32>(a, b, ah, select(0.0, 1.0, degen));
        SW.geomPts[4u * s + 3u] = vec4<f32>(bpx, bpy, 0.0, 0.0);
      }
      if (li == 0u) { SW.nsub = 5u; }
    }
    let p = SW.p;
    let capa = SW.capa;
    let keep = SW.keep;
    let hbMax = SW.hb;
    let bridge = SW.bridge;
    let relief = SW.relief;
    for (var j = li; j < lanesU; j += 256u) {
      let h = hb(j);
      let cL = capa * BSTR[h + 1u];
      let cLnz = select(1.0, cL, cL != 0.0);
      let sat = BSTR[h] / cLnz;
      BSTR[h + 3u] = head_of(sat, keep, hbMax);
      let cidx = bitcast<u32>(BSTR[h + 2u]);
      let wander = BSTR[sb + 32u + cidx];
      SW.reach[j] = tooth_reach(sat, p, bridge, wander) * relief;
    }
    if ((flag & 16u) != 0u) {
      let info = SW.hc1Info;
      let cnt1 = info.z * info.w;
      for (var hi = li; hi < cnt1; hi += 256u) {
        SW.hashC1[hi] = hash2_exact(0u, info.x + (hi % info.z), info.y + (hi / info.z));
      }
    }
    if ((flag & 32u) != 0u) {
      let info = SW.hc2Info;
      let cnt2 = info.z * info.w;
      for (var hi = li; hi < cnt2; hi += 256u) {
        SW.hashC2[hi] = hash2_exact(1u, info.x + (hi % info.z), info.y + (hi / info.z));
      }
    }
  }
}

@compute @workgroup_size(256)
fn section_init(@builtin(local_invocation_index) li: u32) {
  if (li == 0u) {
    let lanes = bu(SH_LANES);
    let pK = bu(SH_K);
    let cur0 = bu(SH_CUR);
    SW.cur = cur0;
    w_step = cur0;
    SW.nst = bu(SH_NSTEPS);
    SW.lanes = lanes;
    SW.pK = pK;
    SW.sp = bu(SH_SP);
    SW.offs = bu(SH_OFFS);
    SW.offH = bu(SH_OFFH);
    SW.hs = bu(SH_HS);
    SW.partWords = MAX_WG * lanes * max(4u, 2u + pK);
    SW.wetting = bu(SH_WETTING);
    SW.capa = BSTR[SH_CAPA];
    SW.capB = BSTR[SH_CAPB];
    SW.keep = BSTR[SH_KEEP];
    SW.hb = BSTR[SH_HB];
    SW.g = BSTR[SH_G];
    SW.kF = BSTR[SH_KF];
    SW.kA = BSTR[SH_KA];
    SW.bridge = BSTR[SH_BRIDGE];
    SW.relief = BSTR[SH_RELIEF];
    SW.soft = BSTR[SH_SOFT];
    SW.tLo = BSTR[SH_TLO];
    SW.tSpan = BSTR[SH_TSPAN];
    SW.eT = BSTR[SH_ET];
    SW.vR = BSTR[SH_VR];
    let nEnds = bu(SH_NENDS);
    SW.nEnds = nEnds;
    SW.offClip = bu(SH_OFFCLIP);
    SW.clipX0 = bu(SH_CLIP_X0);
    SW.clipY0 = bu(SH_CLIP_Y0);
    SW.clipRW = bu(SH_CLIP_RW);
    SW.clipRH = bu(SH_CLIP_RH);
    if (nEnds > 0u) {
      SW.end0A = vec4<f32>(BSTR[SH_ENDS0], BSTR[SH_ENDS0 + 1u], BSTR[SH_ENDS0 + 2u], BSTR[SH_ENDS0 + 3u]);
      SW.end0B = vec4<f32>(BSTR[SH_ENDS0 + 4u], BSTR[SH_ENDS_RANGE], BSTR[SH_ENDS_RANGE + 1u], 0.0);
    }
    if (nEnds > 1u) {
      SW.end1A = vec4<f32>(BSTR[SH_ENDS1], BSTR[SH_ENDS1 + 1u], BSTR[SH_ENDS1 + 2u], BSTR[SH_ENDS1 + 3u]);
      SW.end1B = vec4<f32>(BSTR[SH_ENDS1 + 4u], BSTR[SH_ENDS_RANGE + 2u], BSTR[SH_ENDS_RANGE + 3u], 0.0);
    }
    SW.prevHc1 = vec4<u32>(NONE, NONE, 0u, 0u);
    SW.prevHc2 = vec4<u32>(NONE, NONE, 0u, 0u);
  }
  storageBarrier(); workgroupBarrier();
  let cur0 = workgroupUniformLoad(&w_step);
  prep_step(li, cur0);
}

// Shared memory for eval & apply workgroup-level reductions (~13 KB <= 16 KB for high GPU occupancy)
var<workgroup> wgActCount: atomic<u32>;
var<workgroup> wgBaseOut: u32;
var<workgroup> wgTradeFlag: atomic<u32>;
var<workgroup> wgHasTradeU: u32;
var<workgroup> sLane: array<u32, 256>;
var<workgroup> sV0: array<f32, 256>;
var<workgroup> sV1: array<f32, 256>;
var<workgroup> sV2: array<f32, 256>;
var<workgroup> sV3: array<f32, 256>;
var<workgroup> laneMask: array<atomic<u32>, 1024>;
var<workgroup> cSum0: array<f32, 256>;
var<workgroup> cSum1: array<f32, 256>;
var<workgroup> cSum2: array<f32, 256>;
var<workgroup> cSum3: array<f32, 256>;

@compute @workgroup_size(256)
fn section_eval(
  @builtin(local_invocation_index) li: u32,
  @builtin(workgroup_id) wgid: vec3<u32>
) {
  let wg = wgid.x;
  if (li == 0u) {
    w_nCells = SW.nCells;
    w_nWG = SW.nWG;
    w_lanes = SW.lanes;
  }
  let nCells = workgroupUniformLoad(&w_nCells);
  let nWG = workgroupUniformLoad(&w_nWG);
  let lanesU = workgroupUniformLoad(&w_lanes);
  if (wg >= nWG) { return; }

  let fastMask = lanesU <= MASK_LANES;
  let maskWords = min(lanesU, MASK_LANES) * 8u;
  for (var q = li; q < maskWords; q += 256u) {
    atomicStore(&laneMask[q], 0u);
  }
  let partBase = wg * lanesU * 4u;
  for (var j = li; j < lanesU; j += 256u) {
    let pb = partBase + j * 4u;
    SW.data[pb] = 0.0; SW.data[pb + 1u] = 0.0; SW.data[pb + 2u] = 0.0; SW.data[pb + 3u] = 0.0;
  }
  storageBarrier();
  workgroupBarrier();

  let X0 = SW.X0; let Y0 = SW.Y0; let bw = SW.bw;
  let half = SW.half; let band = SW.band;
  let start = band + 0.5 + 1e-6;
  let edgeLim = SW.edgeLim;
  let invL1 = SW.invL1; let invL2 = SW.invL2;
  let bx = SW.bx; let by = SW.by; let nx = -by; let ny = bx;
  let thick = SW.thick; let nsub = SW.nsub;
  let p = SW.p; let dt = SW.dt;
  let pKA = SW.kA; let pVR = SW.vR; let pET = SW.eT;
  let pTLo = SW.tLo; let pTSpan = SW.tSpan; let pSoft = SW.soft;
  let pNEnds = SW.nEnds;
  let pOffClip = SW.offClip; let pClipX0 = SW.clipX0; let pClipY0 = SW.clipY0;
  let pClipRW = SW.clipRW; let pClipRH = SW.clipRH;
  let curStepF = f32(SW.curStep);
  let end0A = SW.end0A; let end0R2 = SW.end0B.x; let end0On = pNEnds > 0u && curStepF >= SW.end0B.y && curStepF <= SW.end0B.z;
  let end1A = SW.end1A; let end1R2 = SW.end1B.x; let end1On = pNEnds > 1u && curStepF >= SW.end1B.y && curStepF <= SW.end1B.z;
  let lanesM1 = f32(lanesU - 1u);
  let g = SW.g; let capa = SW.capa; let keep = SW.keep;
  let cellsOff = SW.partWords;
  let stride = nWG * 256u;

  for (var base = 0u; base < nCells; base += stride) {
    let idx = base + wg * 256u + li;
    if (li == 0u) { atomicStore(&wgActCount, 0u); }
    workgroupBarrier();

    var isActive = false;
    var cellI = 0u;
    var cellLane = NONE;
    var cellCon = 0.0;
    var cellAa = 0.0;
    var wantMix = 0.0;
    var wantGive = 0.0;
    var wantTake = 0.0;
    var wantPore = 0.0;
    var slot = 0u;

    if (idx < nCells) {
      let ly = idx / bw;
      let lx = idx - ly * bw;
      let x = X0 + lx;
      let y = Y0 + ly;
      var clipped = false;
      if (pOffClip != 0u) {
        if (x < pClipX0 || y < pClipY0 || x >= pClipX0 + pClipRW || y >= pClipY0 + pClipRH) {
          clipped = true;
        } else {
          let ci = (y - pClipY0) * pClipRW + (x - pClipX0);
          if (((bu(pOffClip + (ci >> 5u)) >> (ci & 31u)) & 1u) == 0u) { clipped = true; }
        }
      }
      if (!clipped) {
        let px = f32(x) + 0.5;
        let py = f32(y) + 0.5;
        var best = start;
        var across = 0.0;
        if (IS_FLAT) {
          let U = px * bx + py * by;
          let V = px * nx + py * ny;
          for (var s = 0u; s < nsub; s++) {
            let spv = SW.geomPts[s];
            let uu = U - spv.x;
            let vv = V - spv.y;
            let du = abs(uu) - spv.z;
            let dv = abs(vv) - thick;
            if (du >= best || dv >= best) { continue; }
            let rc = spv.w;
            let qx = du + rc;
            let qy = dv + rc;
            let mx = max(qx, 0.0);
            let my = max(qy, 0.0);
            let corner = select(select(sqrt(mx * mx + my * my), my, mx == 0.0), mx, my == 0.0);
            let d = corner + min(max(qx, qy), 0.0) - rc;
            if (d < best) {
              best = d;
              across = select(0.0, clamp(uu / spv.z, -1.0, 1.0), spv.z > 1e-6);
            }
          }
        } else {
          for (var s = 0u; s < 5u; s++) {
            let g0 = SW.geomPts[4u * s];
            let g1 = SW.geomPts[4u * s + 1u];
            let dx = px - g0.x;
            let dy = py - g0.y;
            let Y = dx * g0.z + dy * g0.w;
            let Xs = -dx * g0.w + dy * g0.z;
            let Yc = select(select(0.0, Y - g1.x, Y > g1.x), Y, Y < 0.0);
            let lim = best + g1.w;
            if (lim <= 0.0 || Xs * Xs + Yc * Yc >= lim * lim) { continue; }
            let g2 = SW.geomPts[4u * s + 2u];
            let g3 = SW.geomPts[4u * s + 3u];
            let d1sq = dx * dx + dy * dy;
            let dx2 = px - g3.x;
            let dy2 = py - g3.y;
            let d2sq = dx2 * dx2 + dy2 * dy2;
            var d: f32;
            if (g2.w > 0.5) {
              if (g1.x <= 1e-6) {
                d = sqrt(d1sq) - g1.w;
              } else {
                d = min(sqrt(d1sq) - g1.y, sqrt(d2sq) - g1.z);
              }
            } else {
              let ax = abs(Xs);
              let k = -g2.y * ax + g2.x * Y;
              if (k < 0.0) {
                d = sqrt(d1sq) - g1.y;
              } else if (k > g2.z) {
                d = sqrt(d2sq) - g1.z;
              } else {
                d = ax * g2.x + Y * g2.y - g1.y;
              }
            }
            if (d < best) {
              best = d;
              let tt = select(0.0, clamp(Y / g1.x, 0.0, 1.0), g1.x > 1e-6);
              let r = g1.y + (g1.z - g1.y) * tt;
              across = select(0.0, clamp(Xs / r, -1.0, 1.0), r > 1e-6);
            }
          }
        }
        if (best < edgeLim) {
          let i = y * u.w + x;
          var d = best;
          let pp = BPAP[i];
          if (d > -edgeLim) {
            if (pVR != 0.0) {
              let xf = f32(x);
              let yf = f32(y);
              d -= half * pVR * (0.05 * (2.0 * field2_cached1(xf * invL1, yf * invL1) - 1.0) + 0.05 * (2.0 * field2_cached2(xf * invL2, yf * invL2) - 1.0));
            }
            if (pET != 0.0) {
              d -= pET * clamp((pp.x - 0.54) / 0.16, -2.0, 2.0);
            }
          }
          var cov = min(1.0, 0.5 - d);
          if (end0On) {
            let ex = px - end0A.x; let ey = py - end0A.y;
            if (ex * ex + ey * ey <= end0R2) { cov = min(cov, 0.5 + ex * end0A.z + ey * end0A.w); }
          }
          if (end1On) {
            let ex = px - end1A.x; let ey = py - end1A.y;
            if (ex * ex + ey * ey <= end1R2) { cov = min(cov, 0.5 + ex * end1A.z + ey * end1A.w); }
          }
          if (cov > 0.0) {
            let lane = u32(clamp(jround((across + 1.0) * 0.5 * lanesM1), 0.0, lanesM1));
            let Wi = W[i];
            let filmReach = max(0.0, Wi - TUFT_PORE_FILM) / SURFACE_MM;
            let rel = select(0.0, pp.x - (pTLo + pTSpan * pp.y), pTSpan != 0.0);
            let tooth = smooth01((rel + SW.reach[lane] + filmReach) / pSoft + 0.5);
            let contact = cov * tooth;
            if (contact > 0.0) {
              isActive = true;
              cellI = i;
              cellLane = lane;
              cellCon = contact;
              let pl = select(p * (0.6 + 0.4 * (1.0 - across * across)), p, IS_FLAT);
              cellAa = 1.0 - exp(-pKA * (0.35 + 0.65 * min(1.0, pl)) * dt);
              slot = atomicAdd(&wgActCount, 1u);

              let h = hb(lane);
              let lw = BSTR[h];
              let cL = capa * BSTR[h + 1u];
              let freeAt = keep * cL;
              let hbVal = BSTR[h + 3u];
              if (Wi > 1e-9 && lw > 1e-12 && hbVal > 0.0) {
                wantMix = TUFT_MIX * cellAa * contact * min(Wi, min(hbVal, lw / g));
              }
              var J = 0.0;
              if (hbVal * contact > Wi) {
                J = cellAa * (hbVal * contact - Wi);
              } else if (hbVal < Wi) {
                J = cellAa * contact * (hbVal - Wi);
              }
              let pcap = BSTR[SB + i];
              let Si = S[i];
              let masked = (RESIST[i] & 1u) == 1u;
              var wAfter = Wi;
              var sAfter = Si;
              if (J > 0.0) {
                wantGive = min(J, max(0.0, lw - freeAt) / g);
                if (wantGive > 0.0) {
                  if (M[i] == 1u || masked) {
                    wAfter = Wi + wantGive;
                  } else {
                    let room = max(0.0, pcap - Si);
                    let into = min(room, wantGive - SOAK_SIZING * wantGive);
                    sAfter = Si + into;
                    wAfter = Wi + (wantGive - into);
                  }
                }
              } else if (J < 0.0 && Wi > 1e-9) {
                wantTake = min(-J, min(Wi, max(0.0, cL - lw) / g));
                wAfter = Wi - wantTake;
              }
              let dryness = select(0.0, max(0.0, 1.0 - sAfter / pcap), pcap > 0.0);
              if (dryness > 0.0 && lw > 1e-12 && contact * pcap > sAfter) {
                let freeH = max(0.0, hbVal);
                let push = freeH * (1.0 - SOAK_SIZING * freeH / (freeH + TUFT_PORE_FILM));
                let pull = TUFT_PORE * dryness * select(1.0, max(0.0, 1.0 + hbVal / TUFT_SUCK), hbVal < 0.0);
                let expW = select(1.0, exp(-wAfter / TUFT_PORE_FILM), wAfter > 0.0);
                let jp = min(cellAa * contact * (push + pull) * expW, min(lw / g, contact * pcap - sAfter));
                if (jp > 1e-12) { wantPore = jp; }
              }
              if (fastMask) {
                atomicOr(&laneMask[lane * 8u + (li >> 5u)], 1u << (li & 31u));
              }
            }
          }
        }
      }
    }

    sLane[li] = cellLane;
    sV0[li] = wantMix;
    sV1[li] = wantGive;
    sV2[li] = wantTake;
    sV3[li] = wantPore;
    workgroupBarrier();

    if (li == 0u) {
      let cnt = atomicLoad(&wgActCount);
      if (cnt > 0u) { wgBaseOut = atomicAdd(&SW.nActive, cnt); }
    }
    workgroupBarrier();

    if (isActive) {
      let outAt = cellsOff + (wgBaseOut + slot) * 4u;
      SW.data[outAt] = bitcast<f32>(cellI);
      SW.data[outAt + 1u] = bitcast<f32>(cellLane);
      SW.data[outAt + 2u] = cellCon;
      SW.data[outAt + 3u] = cellAa;
    }

    if (lanesU <= 64u) {
      let chunk = li >> 6u;
      let lane = li & 63u;
      var a0 = 0.0; var a1 = 0.0; var a2 = 0.0; var a3 = 0.0;
      if (lane < lanesU) {
        let mbase = lane * 8u + chunk * 2u;
        for (var w = 0u; w < 2u; w++) {
          var bits = atomicLoad(&laneMask[mbase + w]);
          if (bits != 0u) {
            atomicStore(&laneMask[mbase + w], 0u);
            let b0 = (chunk * 2u + w) << 5u;
            while (bits != 0u) {
              let bit = countTrailingZeros(bits);
              bits &= bits - 1u;
              let t = b0 + bit;
              a0 += sV0[t]; a1 += sV1[t]; a2 += sV2[t]; a3 += sV3[t];
            }
          }
        }
      }
      cSum0[li] = a0; cSum1[li] = a1; cSum2[li] = a2; cSum3[li] = a3;
      workgroupBarrier();
      if (li < lanesU) {
        let pb = partBase + li * 4u;
        SW.data[pb] += cSum0[li] + cSum0[li + 64u] + cSum0[li + 128u] + cSum0[li + 192u];
        SW.data[pb + 1u] += cSum1[li] + cSum1[li + 64u] + cSum1[li + 128u] + cSum1[li + 192u];
        SW.data[pb + 2u] += cSum2[li] + cSum2[li + 64u] + cSum2[li + 128u] + cSum2[li + 192u];
        SW.data[pb + 3u] += cSum3[li] + cSum3[li + 64u] + cSum3[li + 128u] + cSum3[li + 192u];
      }
    } else if (fastMask) {
      let chunk = li >> 7u;
      let lane = li & 127u;
      var a0 = 0.0; var a1 = 0.0; var a2 = 0.0; var a3 = 0.0;
      if (lane < lanesU) {
        let mbase = lane * 8u + chunk * 4u;
        for (var w = 0u; w < 4u; w++) {
          var bits = atomicLoad(&laneMask[mbase + w]);
          if (bits != 0u) {
            atomicStore(&laneMask[mbase + w], 0u);
            let b0 = (chunk * 4u + w) << 5u;
            while (bits != 0u) {
              let bit = countTrailingZeros(bits);
              bits &= bits - 1u;
              let t = b0 + bit;
              a0 += sV0[t]; a1 += sV1[t]; a2 += sV2[t]; a3 += sV3[t];
            }
          }
        }
      }
      cSum0[li] = a0; cSum1[li] = a1; cSum2[li] = a2; cSum3[li] = a3;
      workgroupBarrier();
      if (li < lanesU) {
        let pb = partBase + li * 4u;
        SW.data[pb] += cSum0[li] + cSum0[li + 128u];
        SW.data[pb + 1u] += cSum1[li] + cSum1[li + 128u];
        SW.data[pb + 2u] += cSum2[li] + cSum2[li + 128u];
        SW.data[pb + 3u] += cSum3[li] + cSum3[li + 128u];
      }
    } else {
      for (var j = li; j < lanesU; j += 256u) {
        var a0 = 0.0; var a1 = 0.0; var a2 = 0.0; var a3 = 0.0;
        for (var t = 0u; t < 256u; t++) {
          if (sLane[t] == j) {
            a0 += sV0[t]; a1 += sV1[t]; a2 += sV2[t]; a3 += sV3[t];
          }
        }
        let pb = partBase + j * 4u;
        SW.data[pb] += a0; SW.data[pb + 1u] += a1; SW.data[pb + 2u] += a2; SW.data[pb + 3u] += a3;
      }
    }
    storageBarrier();
    workgroupBarrier();
  }
}

@compute @workgroup_size(256)
fn section_scale(@builtin(local_invocation_index) li: u32) {
  let lanesU = SW.lanes;
  let nWG = SW.nWG;
  let g = SW.g;
  let capa = SW.capa;
  let keep = SW.keep;
  for (var j = li; j < lanesU; j += 256u) {
    var sumMix = 0.0;
    var sumGive = 0.0;
    var sumTake = 0.0;
    var sumPore = 0.0;
    for (var wg = 0u; wg < nWG; wg++) {
      let pb = (wg * lanesU + j) * 4u;
      sumMix += SW.data[pb];
      sumGive += SW.data[pb + 1u];
      sumTake += SW.data[pb + 2u];
      sumPore += SW.data[pb + 3u];
    }
    let h = hb(j);
    let lw = BSTR[h];
    let cL = capa * BSTR[h + 1u];
    let freeAt = keep * cL;
    let availFree = max(0.0, lw - freeAt) / g;
    let sGive = select(1.0, (availFree / sumGive) * 0.999999, sumGive > availFree && sumGive > 0.0);
    let availRoom = max(0.0, cL - lw) / g;
    let sTake = select(1.0, (availRoom / sumTake) * 0.999999, sumTake > availRoom && sumTake > 0.0);
    let giveOut = sumGive * sGive;
    let availPore = max(0.0, lw - giveOut * g) / g;
    let sPore = select(1.0, (availPore / sumPore) * 0.999999, sumPore > availPore && sumPore > 0.0);
    let poreOut = sumPore * sPore;
    let availMix = max(0.0, lw - (giveOut + poreOut) * g) / g;
    let sMix = select(1.0, (availMix / sumMix) * 0.999999, sumMix > availMix && sumMix > 0.0);
    SW.laneScale[j] = vec4<f32>(sMix, sGive, sTake, sPore);
    let takeIn = sumTake * sTake;
    let lwMid = clamp(lw + 0.5 * (takeIn - giveOut - poreOut) * g, 0.0, cL);
    let cLnz = select(1.0, cL, cL != 0.0);
    SW.laneHbMid[j] = head_of(lwMid / cLnz, keep, SW.hb);
  }
  for (var wg = li; wg < nWG; wg += 256u) {
    SW.wgHasTrade[wg] = 0u;
  }
}

@compute @workgroup_size(256)
fn section_apply(
  @builtin(local_invocation_index) li: u32,
  @builtin(workgroup_id) wgid: vec3<u32>
) {
  let wg = wgid.x;
  if (li == 0u) {
    let na = atomicLoad(&SW.nActive);
    w_nCells = na;
    w_nWG = min(SW.nWG, (na + 255u) >> 8u);
    w_lanes = SW.lanes;
    w_nP = brushPigmentCount();
  }
  let nActCells = workgroupUniformLoad(&w_nCells);
  let nWG_act = workgroupUniformLoad(&w_nWG);
  let lanesU = workgroupUniformLoad(&w_lanes);
  let nP = workgroupUniformLoad(&w_nP);
  if (wg >= nWG_act) { return; }

  let partPerLane = 2u + nP;
  let partBase = wg * lanesU * partPerLane;
  let fastMask = lanesU <= MASK_LANES;
  let maskWords = min(lanesU, MASK_LANES) * 8u;
  for (var q = li; q < maskWords; q += 256u) {
    atomicStore(&laneMask[q], 0u);
  }
  let totalPart = lanesU * partPerLane;
  for (var q = li; q < totalPart; q += 256u) {
    SW.data[partBase + q] = 0.0;
  }
  storageBarrier();
  workgroupBarrier();

  let g = SW.g;
  let capa = SW.capa;
  let keep = SW.keep;
  let pWetting = SW.wetting != 0u;
  let cellsOff = SW.partWords;
  let stride = nWG_act * 256u;
  var wgEverTrade = 0u;

  for (var base = 0u; base < nActCells; base += stride) {
    let cid = base + wg * 256u + li;
    if (li == 0u) { atomicStore(&wgTradeFlag, 0u); }
    workgroupBarrier();

    var cellI = 0u;
    var cellLane = NONE;
    var myX = 0.0;
    var myGive = 0.0;
    var myTake = 0.0;
    var myJp = 0.0;
    var myWiOrig = 0.0;
    var myLw = 0.0;
    var myH = 0u;
    var mySMix = 1.0;
    var myGiveInto = 0.0;
    var myGiveStand = 0.0;
    var myGiveFr = 0.0;
    var myGiveGs = 1.0;
    var myGiveWasWet = false;
    var myMasked = false;
    var myPcap = 0.0;

    if (cid < nActCells) {
      let at = cellsOff + cid * 4u;
      cellI = bitcast<u32>(SW.data[at]);
      cellLane = bitcast<u32>(SW.data[at + 1u]);
      let contact = SW.data[at + 2u];
      let aa = SW.data[at + 3u];
      myH = hb(cellLane);
      myLw = BSTR[myH];
      let cL = capa * BSTR[myH + 1u];
      let freeAt = keep * cL;
      let hbStart = BSTR[myH + 3u];
      let hbVal = SW.laneHbMid[cellLane];
      let sc = SW.laneScale[cellLane];
      mySMix = sc.x;
      let sGive = sc.y;
      let sTake = sc.z;
      let sPore = sc.w;

      let Wi = W[cellI];
      myWiOrig = Wi;
      let Si = S[cellI];
      myPcap = BSTR[SB + cellI];
      myMasked = (RESIST[cellI] & 1u) == 1u;

      if (Wi > 1e-9 && myLw > 1e-12 && hbVal > 0.0) {
        let xMid = TUFT_MIX * aa * contact * min(Wi, min(hbVal, myLw / g));
        let xStart = select(0.0, TUFT_MIX * aa * contact * min(Wi, min(hbStart, myLw / g)), hbStart > 0.0);
        myX = select(xMid, min(xMid, xStart) * mySMix, mySMix < 1.0);
      }
      var J = 0.0;
      if (hbVal * contact > Wi) {
        J = aa * (hbVal * contact - Wi);
      } else if (hbVal < Wi) {
        J = aa * contact * (hbVal - Wi);
      }
      var Jstart = 0.0;
      if (hbStart * contact > Wi) {
        Jstart = aa * (hbStart * contact - Wi);
      } else if (hbStart < Wi) {
        Jstart = aa * contact * (hbStart - Wi);
      }

      var wNow = Wi;
      var sNow = Si;
      var wEst = Wi;
      var sEst = Si;
      if (Jstart > 0.0) {
        let wantGiveStart = min(Jstart, max(0.0, myLw - freeAt) / g);
        if (M[cellI] == 1u || myMasked) {
          wEst = Wi + wantGiveStart;
        } else {
          let room = max(0.0, myPcap - Si);
          let intoEst = min(room, wantGiveStart - SOAK_SIZING * wantGiveStart);
          sEst = Si + intoEst;
          wEst = Wi + (wantGiveStart - intoEst);
        }
      } else if (Jstart < 0.0 && Wi > 1e-9) {
        wEst = Wi - min(-Jstart, min(Wi, max(0.0, cL - myLw) / g));
      }

      if (J > 0.0) {
        var wantGive = min(J, max(0.0, myLw - freeAt) / g);
        if (sGive < 1.0) {
          let capG = select(0.0, min(Jstart, max(0.0, myLw - freeAt) / g), Jstart > 0.0);
          wantGive = min(wantGive, capG);
        }
        myGive = wantGive * sGive;
        if (myGive > 0.0) {
          if (M[cellI] == 1u || myMasked) {
            myGiveWasWet = true;
            wNow = Wi + myGive;
            W[cellI] = wNow;
            M[cellI] = 1u;
            EVER[cellI] = 1u;
          } else {
            let room = max(0.0, myPcap - Si);
            myGiveWasWet = false;
            myGiveInto = min(room, myGive - SOAK_SIZING * myGive);
            myGiveFr = myGiveInto / myGive;
            sNow = Si + myGiveInto;
            S[cellI] = sNow;
            if (pWetting && myGiveInto > 0.0) { EVER[cellI] = 1u; }
            myGiveStand = myGive - myGiveInto;
            myGiveGs = 1.0 - myGiveFr;
            if (myGiveStand > 0.0) {
              wNow = Wi + myGiveStand;
              W[cellI] = wNow;
              M[cellI] = 1u;
              EVER[cellI] = 1u;
            }
          }
        }
      } else if (J < 0.0 && Wi > 1e-9) {
        var wantTake = min(-J, min(Wi, max(0.0, cL - myLw) / g));
        if (sTake < 1.0) {
          let capT = select(0.0, min(-Jstart, min(Wi, max(0.0, cL - myLw) / g)), Jstart < 0.0);
          wantTake = min(wantTake, capT);
        }
        myTake = wantTake * sTake;
        if (myTake > 0.0) {
          wNow = Wi - myTake;
          W[cellI] = wNow;
        }
      }

      let dryNow = select(0.0, max(0.0, 1.0 - sNow / myPcap), myPcap > 0.0);
      if (dryNow > 0.0 && myLw > 1e-12 && contact * myPcap > sNow) {
        let freeH = max(0.0, hbVal);
        let push = freeH * (1.0 - SOAK_SIZING * freeH / (freeH + TUFT_PORE_FILM));
        let pullNow = TUFT_PORE * dryNow * select(1.0, max(0.0, 1.0 + hbVal / TUFT_SUCK), hbVal < 0.0);
        let expNow = select(1.0, exp(-wNow / TUFT_PORE_FILM), wNow > 0.0);
        var jpRaw = min(aa * contact * (push + pullNow) * expNow, min(myLw / g, contact * myPcap - sNow));
        if (sPore < 1.0) {
          let freeS = max(0.0, hbStart);
          let pushS = freeS * (1.0 - SOAK_SIZING * freeS / (freeS + TUFT_PORE_FILM));
          let dryEst = select(0.0, max(0.0, 1.0 - sEst / myPcap), myPcap > 0.0);
          let pullEst = TUFT_PORE * dryEst * select(1.0, max(0.0, 1.0 + hbStart / TUFT_SUCK), hbStart < 0.0);
          let expEst = select(1.0, exp(-wEst / TUFT_PORE_FILM), wEst > 0.0);
          let jpEst = select(0.0, min(aa * contact * (pushS + pullEst) * expEst, min(myLw / g, contact * myPcap - sEst)), dryEst > 0.0 && contact * myPcap > sEst);
          jpRaw = min(jpRaw, jpEst);
        }
        let jp = jpRaw * sPore;
        if (jp > 1e-12) {
          myJp = jp;
          if (myMasked) {
            W[cellI] = wNow + jp;
            M[cellI] = 1u;
            EVER[cellI] = 1u;
          } else {
            let room = max(0.0, myPcap - sNow);
            let into = min(room, jp);
            S[cellI] = sNow + into;
            if (jp > into) {
              W[cellI] = wNow + (jp - into);
              M[cellI] = 1u;
              EVER[cellI] = 1u;
            }
          }
        }
      }

      if (myX > 0.0 || myTake > 0.0) {
        atomicStore(&wgTradeFlag, 1u);
      }

      let x = cellI % u.w;
      let y = cellI / u.w;
      let tile = (y >> 4u) * u.tw + (x >> 4u);
      markDirty(tile);
      if (M[cellI] == 1u || S[cellI] > 0.02 * myPcap) {
        markWet(tile);
      }

      if (fastMask) {
        atomicOr(&laneMask[cellLane * 8u + (li >> 5u)], 1u << (li & 31u));
      }
    }

    sLane[li] = cellLane;
    sV0[li] = myGive + myJp;
    sV1[li] = myTake;
    workgroupBarrier();

    if (li == 0u) {
      let tf = atomicLoad(&wgTradeFlag);
      wgHasTradeU = tf;
      if (tf != 0u) {
        wgEverTrade = 1u;
      }
    }
    let hasTrade = workgroupUniformLoad(&wgHasTradeU);

    if (hasTrade != 0u) {
      let invLw = select(0.0, 1.0 / max(myLw, 1e-12), myLw > 1e-12);
      let invWi = select(0.0, 1.0 / max(myWiOrig, 1e-9), myWiOrig > 1e-9);
      for (var ka = 0u; ka < nP; ka++) {
        let k = brushPigmentAt(ka);
        var dP = 0.0;
        if (myX > 0.0 || myTake > 0.0) {
          let lpk = BSTR[myH + 4u + k];
          var gpk = G[k * u.n + cellI];
          if (myX > 0.0 && (lpk != 0.0 || gpk != 0.0 || FULL_BRUSH_PIGMENTS)) {
            var d = myX * (lpk * invLw - gpk * invWi);
            if (d > 0.0) {
              let capG = (lpk / g) * mySMix;
              if (d > capG) { d = capG; }
            } else if (d < -gpk) {
              d = -gpk;
            }
            gpk += d;
            dP -= d * g;
          }
          if (myTake > 0.0 && (gpk != 0.0 || FULL_BRUSH_PIGMENTS)) {
            let q = gpk * (myTake * invWi);
            gpk -= q;
            dP += q * g;
          }
          G[k * u.n + cellI] = gpk;
        }
        sV2[li] = dP;
        workgroupBarrier();
        if (lanesU <= 64u) {
          let chunk = li >> 6u;
          let lane = li & 63u;
          var acc = 0.0;
          if (lane < lanesU) {
            let mbase = lane * 8u + chunk * 2u;
            for (var w = 0u; w < 2u; w++) {
              var bits = atomicLoad(&laneMask[mbase + w]);
              let b0 = (chunk * 2u + w) << 5u;
              while (bits != 0u) {
                let bit = countTrailingZeros(bits);
                bits &= bits - 1u;
                acc += sV2[b0 + bit];
              }
            }
          }
          cSum0[li] = acc;
          workgroupBarrier();
          if (li < lanesU) {
            SW.data[partBase + li * partPerLane + 2u + ka] += cSum0[li] + cSum0[li + 64u] + cSum0[li + 128u] + cSum0[li + 192u];
          }
        } else if (fastMask) {
          let chunk = li >> 7u;
          let lane = li & 127u;
          var acc = 0.0;
          if (lane < lanesU) {
            let mbase = lane * 8u + chunk * 4u;
            for (var w = 0u; w < 4u; w++) {
              var bits = atomicLoad(&laneMask[mbase + w]);
              let b0 = (chunk * 4u + w) << 5u;
              while (bits != 0u) {
                let bit = countTrailingZeros(bits);
                bits &= bits - 1u;
                acc += sV2[b0 + bit];
              }
            }
          }
          cSum0[li] = acc;
          workgroupBarrier();
          if (li < lanesU) {
            SW.data[partBase + li * partPerLane + 2u + ka] += cSum0[li] + cSum0[li + 128u];
          }
        } else {
          for (var j = li; j < lanesU; j += 256u) {
            var acc = 0.0;
            for (var t = 0u; t < 256u; t++) {
              if (sLane[t] == j) { acc += sV2[t]; }
            }
            SW.data[partBase + j * partPerLane + 2u + ka] += acc;
          }
        }
        storageBarrier();
        workgroupBarrier();
      }
    }

    if ((myGive > 0.0 || myJp > 0.0) && myLw > 1e-12) {
      let invLw = 1.0 / myLw;
      let fGive = myGive * invLw;
      let fJp = myJp * invLw;
      for (var ka = 0u; ka < nP; ka++) {
        let k = brushPigmentAt(ka);
        let lpk = BSTR[myH + 4u + k];
        if (lpk != 0.0 || FULL_BRUSH_PIGMENTS) {
          var addG = 0.0;
          var addD = 0.0;
          if (myGive > 0.0) {
            let bk = lpk * fGive;
            if (bk != 0.0) {
              if (myGiveWasWet) {
                addG += bk;
              } else {
                addD += bk * myGiveFr;
                if (myGiveStand > 0.0) { addG += bk * myGiveGs; }
              }
            }
          }
          if (myJp > 0.0) {
            let bp = lpk * fJp;
            if (bp != 0.0) {
              if (myMasked) { addG += bp; }
              else { addD += bp; }
            }
          }
          if (addG != 0.0) { G[k * u.n + cellI] += addG; }
          if (addD != 0.0) { D[k * u.n + cellI] += addD; }
        }
      }
    }

    if (lanesU <= 64u) {
      let chunk = li >> 6u;
      let lane = li & 63u;
      var a0 = 0.0; var a1 = 0.0;
      if (lane < lanesU) {
        let mbase = lane * 8u + chunk * 2u;
        for (var w = 0u; w < 2u; w++) {
          var bits = atomicLoad(&laneMask[mbase + w]);
          if (bits != 0u) {
            atomicStore(&laneMask[mbase + w], 0u);
            let b0 = (chunk * 2u + w) << 5u;
            while (bits != 0u) {
              let bit = countTrailingZeros(bits);
              bits &= bits - 1u;
              let t = b0 + bit;
              a0 += sV0[t]; a1 += sV1[t];
            }
          }
        }
      }
      cSum0[li] = a0; cSum1[li] = a1;
      workgroupBarrier();
      if (li < lanesU) {
        let pb = partBase + li * partPerLane;
        SW.data[pb] += cSum0[li] + cSum0[li + 64u] + cSum0[li + 128u] + cSum0[li + 192u];
        SW.data[pb + 1u] += cSum1[li] + cSum1[li + 64u] + cSum1[li + 128u] + cSum1[li + 192u];
      }
    } else if (fastMask) {
      let chunk = li >> 7u;
      let lane = li & 127u;
      var a0 = 0.0; var a1 = 0.0;
      if (lane < lanesU) {
        let mbase = lane * 8u + chunk * 4u;
        for (var w = 0u; w < 4u; w++) {
          var bits = atomicLoad(&laneMask[mbase + w]);
          if (bits != 0u) {
            atomicStore(&laneMask[mbase + w], 0u);
            let b0 = (chunk * 4u + w) << 5u;
            while (bits != 0u) {
              let bit = countTrailingZeros(bits);
              bits &= bits - 1u;
              let t = b0 + bit;
              a0 += sV0[t]; a1 += sV1[t];
            }
          }
        }
      }
      cSum0[li] = a0; cSum1[li] = a1;
      workgroupBarrier();
      if (li < lanesU) {
        let pb = partBase + li * partPerLane;
        SW.data[pb] += cSum0[li] + cSum0[li + 128u];
        SW.data[pb + 1u] += cSum1[li] + cSum1[li + 128u];
      }
    } else {
      for (var j = li; j < lanesU; j += 256u) {
        var a0 = 0.0; var a1 = 0.0;
        for (var t = 0u; t < 256u; t++) {
          if (sLane[t] == j) { a0 += sV0[t]; a1 += sV1[t]; }
        }
        let pb = partBase + j * partPerLane;
        SW.data[pb] += a0; SW.data[pb + 1u] += a1;
      }
    }
    storageBarrier();
    workgroupBarrier();
  }

  if (li == 0u && wgEverTrade != 0u) {
    SW.wgHasTrade[wg] = 1u;
    atomicStore(&SW.hasTrade, 1u);
  }
}

@compute @workgroup_size(256)
fn section_commit_prep(@builtin(local_invocation_index) li: u32) {
  let flag = SW.flag;
  if ((flag & 8u) != 0u) {
    let nActCells = atomicLoad(&SW.nActive);
    let nWG_act = min(SW.nWG, (nActCells + 255u) >> 8u);
    if (nWG_act > 0u) {
      let lanesU = SW.lanes;
      let nP = brushPigmentCount();
      let partPerLane = 2u + nP;
      let g = SW.g;
      let anyTrade = atomicLoad(&SW.hasTrade);
      for (var j = li; j < lanesU; j += 256u) {
        var sumOut = 0.0;
        var sumTake = 0.0;
        for (var wg = 0u; wg < nWG_act; wg++) {
          let pb = (wg * lanesU + j) * partPerLane;
          sumOut += SW.data[pb];
          sumTake += SW.data[pb + 1u];
        }
        let h = hb(j);
        let lwOld = BSTR[h];
        let lwNew = max(0.0, lwOld - sumOut * g + sumTake * g);
        BSTR[h] = lwNew;
        let outFrac = select(0.0, min(1.0, (sumOut * g) / lwOld), lwOld > 1e-12 && sumOut > 0.0);
        for (var ka = 0u; ka < nP; ka++) {
          let k = brushPigmentAt(ka);
          let lpkOld = BSTR[h + 4u + k];
          var dP = 0.0;
          if (anyTrade != 0u) {
            for (var wg = 0u; wg < nWG_act; wg++) {
              if (SW.wgHasTrade[wg] != 0u) {
                dP += SW.data[(wg * lanesU + j) * partPerLane + 2u + ka];
              }
            }
          }
          if (outFrac != 0.0 || dP != 0.0) {
            let lpkNew = lpkOld - lpkOld * outFrac + dP;
            BSTR[h + 4u + k] = select(lpkNew, max(0.0, lpkNew), lpkOld > 0.0 || dP > 0.0);
          }
        }
      }
    }
  }
  // Publish every hair commit before lane zero feeds the next large step.
  storageBarrier(); workgroupBarrier();

  if (li == 0u) {
    let nextCur = SW.cur + 1u;
    SW.cur = nextCur;
    BSTR[SH_CUR] = bitcast<f32>(nextCur);
    w_step = nextCur;
  }
  let nextCur = workgroupUniformLoad(&w_step);
  if (li == 0u) {
    var nextSmall = 0u;
    if (nextCur < SW.nst && SW.lanes <= 128u) {
      let sb = SW.offs + nextCur * SW.sp;
      let x0 = bu(sb + 28u);
      if (x0 >= NONE - 1u) { nextSmall = 1u; }
      else {
        let count = (bu(sb + 30u) - x0 + 1u) * (bu(sb + 31u) - bu(sb + 29u) + 1u);
        nextSmall = select(0u, 1u, count <= ${SMALL_CELLS}u);
      }
    }
    w_flag = nextSmall;
  }
  let nextSmall = workgroupUniformLoad(&w_flag);
  if (nextSmall == 0u) { prep_step(li, nextCur); }
}
`;

// Fail loudly if edits to the parallel shader invalidate a shared arithmetic fragment.
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`section shader fragment missing: ${start}`);
  return source.slice(a, b);
}
function fn(name) {
  const start = PARALLEL.indexOf(`fn ${name}(`);
  if (start < 0) throw new Error(`section shader function missing: ${name}`);
  const brace = PARALLEL.indexOf('{', start);
  let depth = 1, end = brace + 1;
  while (depth && end < PARALLEL.length) {
    if (PARALLEL[end] === '{') depth++;
    if (PARALLEL[end] === '}') depth--;
    end++;
  }
  return PARALLEL.slice(start, end);
}
const helpers = ['brushPigmentCount', 'hb', 'field2_cached1', 'field2_cached2',
  'section_feed_water', 'section_feed_pigments', 'prep_step', 'section_init'];
const fusedNames = code => {
  code = code.replace(/\bSW\b/g, 'FW');
  for (const name of helpers) code = code.replace(new RegExp(`\\b${name}\\b`, 'g'), `f_${name}`);
  return code;
};
const state = between(PARALLEL, 'struct SWork {', '// Each entry point')
  .replace('struct SWork', 'struct FWork')
  .replaceAll('576>', '128>')
  .replace(/  data: array<f32>,/, '');
const evalSource = fn('section_eval');
const evalConstants = between(evalSource, '  let X0 =', '  let cellsOff =');
const evalCell = between(evalSource, '    var isActive =', '\n    sLane[li] =')
  .replace('    var slot = 0u;', '')
  .replace('              slot = atomicAdd(&wgActCount, 1u);', '')
  .replace(/              if \(fastMask\) \{[\s\S]*?\n              \}/, '');
const scaleLane = between(fn('section_scale'), '    let h = hb(j);', '\n  }\n  for (var wg');
const applySource = fn('section_apply');
const applyCell = between(applySource, '    var cellI =', '\n    sLane[li] =')
  .replace('    if (cid < nActCells) {\n      let at = cellsOff + cid * 4u;\n      cellI = bitcast<u32>(SW.data[at]);\n      cellLane = bitcast<u32>(SW.data[at + 1u]);\n      let contact = SW.data[at + 2u];\n      let aa = SW.data[at + 3u];',
    '    if (saved.y != NONE) {\n      cellI = saved.x;\n      cellLane = saved.y;\n      let contact = bitcast<f32>(saved.z);\n      let aa = bitcast<f32>(saved.w);')
  .replace(/\bwgTradeFlag\b/g, 'fTrade')
  .replace(/      if \(fastMask\) \{[\s\S]*?\n      \}/, '');
const trade = between(applySource, '      let invLw = select', '        sV2[li] = dP;');
const give = between(applySource, '    if ((myGive >', '\n    if (lanesU <= 64u)');
const commit = between(fn('section_commit_prep'), '        let h = hb(j);', '\n      }\n    }\n  }')
  .replace(/          var dP = 0.0;[\s\S]*?\n          if \(outFrac/, '          let dP = deltaP[ka];\n          if (outFrac');

// FWork: 6,736 bytes; lane masks: 4,096; vec4 reduction scratch: 4,096.
// All per-cell contact records and per-lane pigment deltas stay invocation-private.
// Total including uniform-control scalars: 14,964 bytes, below WebGPU's 16 KiB floor.
const FUSED = fusedNames(`
${state}
var<workgroup> FW: FWork;
var<workgroup> fMask: array<atomic<u32>, 1024>;
var<workgroup> fValue: array<vec4<f32>, 256>;
var<workgroup> fTrade: atomic<u32>;
var<workgroup> fTradeU: u32;
${helpers.map(fn).join('\n').replaceAll('@builtin(local_invocation_index) ', '')}

// Cache lane membership once per cell batch, then stream demand and pigment reductions.
fn f_mask(li: u32, lane: u32, lanes: u32) {
  for (var q = li; q < lanes * 8u; q += 256u) { atomicStore(&fMask[q], 0u); }
  workgroupBarrier();
  if (lane != NONE) { atomicOr(&fMask[lane * 8u + (li >> 5u)], 1u << (li & 31u)); }
  workgroupBarrier();
}

// Keep the parallel path's 64/128-cell chunk summation order, with one owner per lane.
fn f_reduce(li: u32, value: vec4<f32>, lanes: u32) -> vec4<f32> {
  fValue[li] = value;
  workgroupBarrier();
  var sum = vec4<f32>(0.0);
  if (li < lanes) {
    let words = select(4u, 2u, lanes <= 64u);
    for (var c = 0u; c < 8u; c += words) {
      var part = vec4<f32>(0.0);
      for (var w = c; w < c + words; w++) {
        var bits = atomicLoad(&fMask[li * 8u + w]);
        while (bits != 0u) {
          let bit = countTrailingZeros(bits);
          bits &= bits - 1u;
          part += fValue[(w << 5u) + bit];
        }
      }
      sum += part;
    }
  }
  workgroupBarrier();
  return sum;
}

@compute @workgroup_size(256)
fn section_run_small(@builtin(local_invocation_index) li: u32) {
  section_init(li);
  storageBarrier(); workgroupBarrier();
  let lanesU = workgroupUniformLoad(&w_lanes);
  if (li == 0u) { w_nP = brushPigmentCount(); w_nWG = SW.nst; }
  let nst = workgroupUniformLoad(&w_nWG);
  let nP = workgroupUniformLoad(&w_nP);
  loop {
    let flag = workgroupUniformLoad(&w_flag);
    let cur = workgroupUniformLoad(&w_step);
    if (cur >= nst) { break; }
    if (li == 0u) { w_nCells = select(0u, SW.nCells, (flag & 8u) != 0u); }
    let nCells = workgroupUniformLoad(&w_nCells);
    var cells: array<vec4<u32>, ${Math.ceil(SMALL_CELLS / 256)}>;
    var demand = vec4<f32>(0.0);
    ${evalConstants}
    for (var base = 0u; base < nCells; base += 256u) {
      let idx = base + li;
      ${evalCell}
      cells[base / 256u] = vec4<u32>(cellI, cellLane, bitcast<u32>(cellCon), bitcast<u32>(cellAa));
      f_mask(li, cellLane, lanesU);
      demand += f_reduce(li, vec4<f32>(wantMix, wantGive, wantTake, wantPore), lanesU);
    }
    if (li < lanesU && nCells > 0u) {
      let j = li;
      let sumMix = demand.x; let sumGive = demand.y; let sumTake = demand.z; let sumPore = demand.w;
      ${scaleLane}
    }
    workgroupBarrier();
    var sumOut = 0.0;
    var sumTake = 0.0;
    var deltaP: array<f32, 16>;
    let pWetting = SW.wetting != 0u;
    for (var base = 0u; base < nCells; base += 256u) {
      if (li == 0u) { atomicStore(&fTrade, 0u); }
      workgroupBarrier();
      let saved = cells[base / 256u];
      ${applyCell}
      f_mask(li, cellLane, lanesU);
      // Match the parallel shader's trade gate. Dry contacts still give paint,
      // but cannot pick up or mix pigment, so all their trade deltas are zero.
      if (li == 0u) { fTradeU = atomicLoad(&fTrade); }
      let hasTrade = workgroupUniformLoad(&fTradeU);
      if (hasTrade != 0u) {
        ${trade}
          let reduced = f_reduce(li, vec4<f32>(0.0, 0.0, dP, 0.0), lanesU);
          deltaP[ka] += reduced.z;
        }
      }
      ${give}
      let water = f_reduce(li, vec4<f32>(myGive + myJp, myTake, 0.0, 0.0), lanesU);
      sumOut += water.x; sumTake += water.y;
    }
    if (li < lanesU && nCells > 0u) {
      let j = li;
      ${commit}
    }
    storageBarrier(); workgroupBarrier();
    if (li == 0u) {
      let next = cur + 1u;
      BSTR[SH_CUR] = bitcast<f32>(next);
      w_step = next;
      let sb = SW.offs + cur * SW.sp;
      // Stop before flows and large steps; the host emits the identical run partition.
      var stop = next >= SW.nst || bu(sb + 27u) != 0u;
      if (!stop) {
        let nsb = SW.offs + next * SW.sp;
        let x0 = bu(nsb + 28u);
        if (x0 < NONE - 1u) {
          let count = (bu(nsb + 30u) - x0 + 1u) * (bu(nsb + 31u) - bu(nsb + 29u) + 1u);
          stop = count > ${SMALL_CELLS}u;
        }
      }
      w_flag = select(0u, 1u, stop);
    }
    let stop = workgroupUniformLoad(&w_flag);
    if (stop != 0u) { break; }
    prep_step(li, cur + 1u);
    storageBarrier(); workgroupBarrier();
  }
}
`);

export const WGSL = PARALLEL + FUSED;
