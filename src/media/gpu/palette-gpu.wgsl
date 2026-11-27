// Metal/WebGPU batched palette scoring: unmix (projected gradient) + 1-layer Kubelka-Munk
// + sRGB->CIELAB + CIEDE2000 + local-colour hue-chroma error + dark-tenth warmth.
// Matches src/crop/boxpick.mjs, src/crop/palettewide.mjs, src/crop/pigments.mjs, src/eval/colour.mjs.

const LAB_EPS: f32 = 216.0 / 24389.0;
const LAB_K: f32 = 24389.0 / 27.0;
const PI: f32 = 3.14159265358979323846;
const RAD: f32 = PI / 180.0;
const DEG: f32 = 180.0 / PI;
const POW25_7: f32 = 6103515625.0; // 25^7

// sRGB primaries under D65 (src/eval/colour.mjs)
const M00: f32 = 0.4124564; const M01: f32 = 0.3575761; const M02: f32 = 0.1804375;
const M10: f32 = 0.2126729; const M11: f32 = 0.7151522; const M12: f32 = 0.0721750;
const M20: f32 = 0.0193339; const M21: f32 = 0.1191920; const M22: f32 = 0.9503041;
const W0: f32 = M00 + M01 + M02;
const W1: f32 = M10 + M11 + M12;
const W2: f32 = M20 + M21 + M22;

struct PaletteUniforms {
  uCount: u32,
  numTrials: u32,
  numClusters: u32,
  numWgU: u32,
  outStride: u32,
  trialStride: u32,
  unmixIters: u32,
  pad0: u32,
  paperR: f32,
  paperG: f32,
  paperB: f32,
  pLin0: f32,
  pLin1: f32,
  pLin2: f32,
  padF0: f32,
  padF1: f32,
}

// Binding layout:
// 0: uniform pu
// 1: uniqueD (read) - vec4<f32>(d0, d1, d2, count) per unique colour
// 2: uniqueLab (read) - vec4<f32>(L, a, b, darkCount) per unique colour
// 3: uniqueCluster (read) - u32 cluster index (or 0xFFFFFFFFu)
// 4: trialData (read) - per trial: trialStride floats (max k=16 pigments)
//    [0]=k (as f32), [1]=invL, [2..257]=Gf (16x16), [258..305]=P0,P1,P2 (16 each),
//    [306..353]=K0,K1,K2 (16 each), [354..401]=S0,S1,S2 (16 each)
// 5: outBuf (read_write) - per (trial, wg): outStride f32s; or packed u32 RGB for render_unique

@group(0) @binding(0) var<uniform> pu: PaletteUniforms;
@group(0) @binding(1) var<storage, read> uniqueD: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> uniqueLab: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> uniqueCluster: array<u32>;
@group(0) @binding(4) var<storage, read> trialData: array<f32>;
@group(0) @binding(5) var<storage, read_write> outBuf: array<f32>;

fn toLinear(v: f32) -> f32 {
  let c = v / 255.0;
  if (c <= 0.04045) { return c / 12.92; }
  return pow((c + 0.055) / 1.055, 2.4);
}

fn labF(t: f32) -> f32 {
  if (t > LAB_EPS) { return pow(t, 1.0 / 3.0); }
  return (LAB_K * t + 16.0) / 116.0;
}

fn rgbToLab(r: f32, g: f32, b: f32) -> vec3<f32> {
  let l0 = toLinear(r);
  let l1 = toLinear(g);
  let l2 = toLinear(b);
  let r0 = select(l0 / pu.pLin0, 1.0, l0 >= pu.pLin0);
  let r1 = select(l1 / pu.pLin1, 1.0, l1 >= pu.pLin1);
  let r2 = select(l2 / pu.pLin2, 1.0, l2 >= pu.pLin2);
  let fx = labF((M00 * r0 + M01 * r1 + M02 * r2) / W0);
  let fy = labF((M10 * r0 + M11 * r1 + M12 * r2) / W1);
  let fz = labF((M20 * r0 + M21 * r1 + M22 * r2) / W2);
  return vec3<f32>(116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz));
}

fn kmChannel(Kc: f32, Sc: f32, x: f32, paperR01: f32) -> f32 {
  if (x <= 1e-9) { return paperR01; }
  var R = 0.0;
  var T = 1.0;
  if (Sc < 1e-7) {
    R = 0.0;
    T = exp(-Kc * x);
  } else if (Kc < 1e-7) {
    let t = Sc * x;
    R = t / (1.0 + t);
    T = 1.0 / (1.0 + t);
  } else {
    let a = 1.0 + Kc / Sc;
    let b = sqrt(max(0.0, a * a - 1.0));
    let bSx = b * Sc * x;
    if (bSx > 20.0) {
      R = a - b;
      T = 0.0;
    } else {
      let ep = exp(bSx);
      let em = 1.0 / ep;
      let sh = 0.5 * (ep - em);
      let ch = 0.5 * (ep + em);
      let den = a * sh + b * ch;
      R = sh / den;
      T = b / den;
    }
  }
  return R + (T * T * paperR01) / (1.0 - R * paperR01);
}

fn hpDeg(ap: f32, bp: f32) -> f32 {
  if (ap == 0.0 && bp == 0.0) { return 0.0; }
  let d = atan2(bp, ap) * DEG;
  return select(d, d + 360.0, d < 0.0);
}

fn pow7(x: f32) -> f32 {
  let x2 = x * x;
  let x4 = x2 * x2;
  return x4 * x2 * x;
}

fn deltaE2000(L1: f32, a1: f32, b1: f32, L2: f32, a2: f32, b2: f32) -> f32 {
  let Lm = 0.5 * (L1 + L2);
  let C1 = length(vec2<f32>(a1, b1));
  let C2 = length(vec2<f32>(a2, b2));
  let Cm = 0.5 * (C1 + C2);
  let Cm7 = pow7(Cm);
  let G = 0.5 * (1.0 - sqrt(Cm7 / (Cm7 + POW25_7)));
  let ap1 = (1.0 + G) * a1;
  let ap2 = (1.0 + G) * a2;
  let Cp1 = length(vec2<f32>(ap1, b1));
  let Cp2 = length(vec2<f32>(ap2, b2));
  let Cpm = 0.5 * (Cp1 + Cp2);
  let hp1 = hpDeg(ap1, b1);
  let hp2 = hpDeg(ap2, b2);
  let prod = Cp1 * Cp2;
  var dhp = 0.0;
  if (prod != 0.0) {
    dhp = hp2 - hp1;
    if (dhp > 180.0) { dhp -= 360.0; }
    else if (dhp < -180.0) { dhp += 360.0; }
  }
  let dLp = L2 - L1;
  let dCp = Cp2 - Cp1;
  let dHp = 2.0 * sqrt(prod) * sin(0.5 * dhp * RAD);
  var Hpm = hp1 + hp2;
  if (prod != 0.0) {
    if (abs(hp1 - hp2) <= 180.0) {
      Hpm = 0.5 * (hp1 + hp2);
    } else {
      Hpm = 0.5 * (hp1 + hp2 + select(-360.0, 360.0, hp1 + hp2 < 360.0));
    }
  }
  let T = 1.0
    - 0.17 * cos((Hpm - 30.0) * RAD)
    + 0.24 * cos(2.0 * Hpm * RAD)
    + 0.32 * cos((3.0 * Hpm + 6.0) * RAD)
    - 0.20 * cos((4.0 * Hpm - 63.0) * RAD);
  let dL50 = Lm - 50.0;
  let SL = 1.0 + (0.015 * dL50 * dL50) / sqrt(20.0 + dL50 * dL50);
  let SC = 1.0 + 0.045 * Cpm;
  let SH = 1.0 + 0.015 * Cpm * T;
  let dT = (Hpm - 275.0) / 25.0;
  let dTheta = 30.0 * exp(-(dT * dT));
  let Cpm7 = pow7(Cpm);
  let RC = 2.0 * sqrt(Cpm7 / (Cpm7 + POW25_7));
  let RT = -RC * sin(2.0 * dTheta * RAD);
  let tL = dLp / SL;
  let tC = dCp / SC;
  let tH = dHp / SH;
  return sqrt(max(0.0, tL * tL + tC * tC + tH * tH + RT * tC * tH));
}

fn unmixAndRenderRGB(d: vec3<f32>, tBase: u32) -> vec3<f32> {
  let k = u32(trialData[tBase]);
  let invL = trialData[tBase + 1u];
  var x: array<f32, 16>;
  var bvec: array<f32, 16>;
  for (var j = 0u; j < k; j++) {
    x[j] = 0.0;
    let p0 = trialData[tBase + 258u + j];
    let p1 = trialData[tBase + 274u + j];
    let p2 = trialData[tBase + 290u + j];
    bvec[j] = p0 * d.x + p1 * d.y + p2 * d.z;
  }
  for (var it = 0u; it < pu.unmixIters; it++) {
    for (var j = 0u; j < k; j++) {
      var g = -bvec[j];
      let r = tBase + 2u + j * k;
      for (var q = 0u; q < k; q++) {
        g += trialData[r + q] * x[q];
      }
      x[j] = max(0.0, x[j] - g * invL);
    }
  }
  var x0 = 0.0;
  for (var j = 0u; j < k; j++) { x0 += x[j]; }
  if (x0 <= 1e-7) {
    return vec3<f32>(pu.paperR, pu.paperG, pu.paperB);
  }
  var K0 = 0.0; var K1 = 0.0; var K2 = 0.0;
  var S0 = 0.0; var S1 = 0.0; var S2 = 0.0;
  let invX0 = 1.0 / x0;
  for (var j = 0u; j < k; j++) {
    let f = x[j] * invX0;
    K0 += f * trialData[tBase + 306u + j];
    K1 += f * trialData[tBase + 322u + j];
    K2 += f * trialData[tBase + 338u + j];
    S0 += f * trialData[tBase + 354u + j];
    S1 += f * trialData[tBase + 370u + j];
    S2 += f * trialData[tBase + 386u + j];
  }
  let r0 = kmChannel(K0, S0, x0, pu.paperR / 255.0);
  let r1 = kmChannel(K1, S1, x0, pu.paperG / 255.0);
  let r2 = kmChannel(K2, S2, x0, pu.paperB / 255.0);
  // Match JS Math.round(v * 255) clamped to 0..255
  return vec3<f32>(
    clamp(floor(r0 * 255.0 + 0.5), 0.0, 255.0),
    clamp(floor(r1 * 255.0 + 0.5), 0.0, 255.0),
    clamp(floor(r2 * 255.0 + 0.5), 0.0, 255.0)
  );
}

var<workgroup> sh0: array<f32, 128>;
var<workgroup> sh1: array<f32, 128>;
var<workgroup> sh2: array<f32, 128>;

@compute @workgroup_size(128)
fn score_trials(
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>
) {
  let wgU = wid.x;
  let tIdx = wid.y;
  if (tIdx >= pu.numTrials) { return; }
  let j = wgU * 128u + lid.x;
  let tBase = tIdx * pu.trialStride;

  var sampE = 0.0;
  var darkB = 0.0;
  var cid = 0xFFFFFFFFu;
  var clusE = 0.0;
  var clusA = 0.0;
  var clusB = 0.0;

  if (j < pu.uCount) {
    let ud = uniqueD[j];
    let cnt = ud.w;
    let ul = uniqueLab[j];
    let rgb = unmixAndRenderRGB(ud.xyz, tBase);
    let lab2 = rgbToLab(rgb.x, rgb.y, rgb.z);
    sampE = deltaE2000(ul.x, ul.y, ul.z, lab2.x, lab2.y, lab2.z) * cnt;
    if (ul.w > 0.0) {
      darkB = lab2.z * ul.w;
    }
    cid = uniqueCluster[j];
    if (cid < pu.numClusters) {
      clusE = deltaE2000(ul.x, ul.y, ul.z, ul.x, lab2.y, lab2.z) * cnt;
      clusA = lab2.y * cnt;
      clusB = lab2.z * cnt;
    }
  }

  let outBase = (tIdx * pu.numWgU + wgU) * pu.outStride;

  // Reduce sampE and darkB
  sh0[lid.x] = sampE;
  sh1[lid.x] = darkB;
  workgroupBarrier();
  for (var stride = 64u; stride > 0u; stride >>= 1u) {
    if (lid.x < stride) {
      sh0[lid.x] += sh0[lid.x + stride];
      sh1[lid.x] += sh1[lid.x + stride];
    }
    workgroupBarrier();
  }
  if (lid.x == 0u) {
    outBuf[outBase] = sh0[0];
    outBuf[outBase + 1u] = sh1[0];
  }

  // Reduce each local-colour cluster reusing the same 1.5 KB shared memory
  for (var c = 0u; c < pu.numClusters; c++) {
    let matchC = (cid == c);
    sh0[lid.x] = select(0.0, clusE, matchC);
    sh1[lid.x] = select(0.0, clusA, matchC);
    sh2[lid.x] = select(0.0, clusB, matchC);
    workgroupBarrier();
    for (var stride = 64u; stride > 0u; stride >>= 1u) {
      if (lid.x < stride) {
        sh0[lid.x] += sh0[lid.x + stride];
        sh1[lid.x] += sh1[lid.x + stride];
        sh2[lid.x] += sh2[lid.x + stride];
      }
      workgroupBarrier();
    }
    if (lid.x == 0u) {
      outBuf[outBase + 2u + c * 3u] = sh0[0];
      outBuf[outBase + 2u + c * 3u + 1u] = sh1[0];
      outBuf[outBase + 2u + c * 3u + 2u] = sh2[0];
    }
  }
}

// Render u unique colours for trial 0 into outBuf as RGB floats (3*j + 0/1/2) — used by paletteJudge.
@compute @workgroup_size(128)
fn render_unique(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  let j = gid.x + gid.y * ng.x * 128u;
  if (j >= pu.uCount) { return; }
  let rgb = unmixAndRenderRGB(uniqueD[j].xyz, 0u);
  outBuf[j * 3u] = rgb.x;
  outBuf[j * 3u + 1u] = rgb.y;
  outBuf[j * 3u + 2u] = rgb.z;
}
