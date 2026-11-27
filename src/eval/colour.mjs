// Colour difference (Delta E 2000) in CIELAB, catching hue errors that density misses.
// Linear RGB is divided by each image's paper colour first, so both papers land on L* 100, a* 0, b* 0.
// Delta E 1 is a just-noticeable difference, over 5 reads as a different colour.

const toLinear = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const TO_LINEAR_U8 = Float64Array.from({ length: 256 }, (_, v) => toLinear(v));
// sRGB primaries under D65. A reflectance of (1,1,1) maps to the D65 white point, which is what puts paper at L* 100.
const M = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]];
const WHITE = M.map(r => r[0] + r[1] + r[2]);
const M00 = M[0][0], M01 = M[0][1], M02 = M[0][2], W0 = WHITE[0];
const M10 = M[1][0], M11 = M[1][1], M12 = M[1][2], W1 = WHITE[1];
const M20 = M[2][0], M21 = M[2][1], M22 = M[2][2], W2 = WHITE[2];
const LAB_EPS = 216 / 24389, LAB_K = 24389 / 27;
const f = t => (t > LAB_EPS ? Math.cbrt(t) : (LAB_K * t + 16) / 116);
let lastP0 = NaN, lastP1 = NaN, lastP2 = NaN, pLin0 = 1, pLin1 = 1, pLin2 = 1;

/** One pixel's L*a*b*, with the image's own paper colour as the white point. Reflectance above paper is clamped to 1. */
export function labOf(rgb, i, paperRGB) {
  const pr0 = paperRGB[0], pr1 = paperRGB[1], pr2 = paperRGB[2];
  if (pr0 !== lastP0 || pr1 !== lastP1 || pr2 !== lastP2) {
    lastP0 = pr0; lastP1 = pr1; lastP2 = pr2;
    pLin0 = Math.max(1e-6, (pr0 | 0) === pr0 && pr0 >= 0 && pr0 <= 255 ? TO_LINEAR_U8[pr0] : toLinear(pr0));
    pLin1 = Math.max(1e-6, (pr1 | 0) === pr1 && pr1 >= 0 && pr1 <= 255 ? TO_LINEAR_U8[pr1] : toLinear(pr1));
    pLin2 = Math.max(1e-6, (pr2 | 0) === pr2 && pr2 >= 0 && pr2 <= 255 ? TO_LINEAR_U8[pr2] : toLinear(pr2));
  }
  const idx = i * 3, c0 = rgb[idx], c1 = rgb[idx + 1], c2 = rgb[idx + 2];
  const l0 = (c0 | 0) === c0 && c0 >= 0 && c0 <= 255 ? TO_LINEAR_U8[c0] : toLinear(c0);
  const l1 = (c1 | 0) === c1 && c1 >= 0 && c1 <= 255 ? TO_LINEAR_U8[c1] : toLinear(c1);
  const l2 = (c2 | 0) === c2 && c2 >= 0 && c2 <= 255 ? TO_LINEAR_U8[c2] : toLinear(c2);
  const r0 = l0 >= pLin0 ? 1 : l0 / pLin0;
  const r1 = l1 >= pLin1 ? 1 : l1 / pLin1;
  const r2 = l2 >= pLin2 ? 1 : l2 / pLin2;
  const fx = f((M00 * r0 + M01 * r1 + M02 * r2) / W0);
  const fy = f((M10 * r0 + M11 * r1 + M12 * r2) / W1);
  const fz = f((M20 * r0 + M21 * r1 + M22 * r2) / W2);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Whole-image L*a*b* planes, one image, one paper. */
export function labPlanes(rgb, n, paperRGB) {
  const L = new Float32Array(n), a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = labOf(rgb, i, paperRGB); L[i] = p[0]; a[i] = p[1]; b[i] = p[2]; }
  return { L, a, b };
}

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
/** CIEDE2000, Sharma, Wu and Dalal's formulation. */
export function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const Lm = (L1 + L2) / 2, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2), Cpm = (Cp1 + Cp2) / 2;
  const hp = (ap, bp) => { if (ap === 0 && bp === 0) return 0; const d = Math.atan2(bp, ap) * DEG; return d < 0 ? d + 360 : d; };
  const hp1 = hp(ap1, b1), hp2 = hp(ap2, b2), prod = Cp1 * Cp2;
  let dhp = 0; if (prod !== 0) { dhp = hp2 - hp1; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dLp = L2 - L1, dCp = Cp2 - Cp1, dHp = 2 * Math.sqrt(prod) * Math.sin(dhp / 2 * RAD);
  let Hpm = hp1 + hp2;
  if (prod !== 0) { if (Math.abs(hp1 - hp2) <= 180) Hpm = (hp1 + hp2) / 2; else Hpm = (hp1 + hp2 + (hp1 + hp2 < 360 ? 360 : -360)) / 2; }
  const T = 1 - 0.17 * Math.cos((Hpm - 30) * RAD) + 0.24 * Math.cos(2 * Hpm * RAD) + 0.32 * Math.cos((3 * Hpm + 6) * RAD) - 0.20 * Math.cos((4 * Hpm - 63) * RAD);
  const SL = 1 + 0.015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cpm, SH = 1 + 0.015 * Cpm * T;
  const dTheta = 30 * Math.exp(-(((Hpm - 275) / 25) ** 2)), RC = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const RT = -RC * Math.sin(2 * dTheta * RAD);
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

/**
 * Mean and 90th percentile Delta E 2000 between two images, each against its own paper.
 * "painted" is the mean over pixels either image has painted, since blank paper flatters the whole-crop mean.
 */
export function colourError(paintRGB, keyRGB, n, paintPaper, keyPaper, paintD, keyD, inkThreshold = 0.03) {
  const all = new Float64Array(n); let painted = 0, paintedSum = 0;
  for (let i = 0; i < n; i++) {
    const d = deltaE2000(labOf(paintRGB, i, paintPaper), labOf(keyRGB, i, keyPaper));
    all[i] = d;
    if (paintD[i] > inkThreshold || keyD[i] > inkThreshold) { painted++; paintedSum += d; }
  }
  const sorted = Float64Array.from(all).sort();
  let sum = 0; for (let i = 0; i < n; i++) sum += all[i];
  return { mean: sum / n, p90: sorted[Math.floor(n * 0.9)], painted: painted ? paintedSum / painted : 0 };
}
