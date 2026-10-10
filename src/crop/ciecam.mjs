// CIECAM02 both ways, for turning published paint measurements into colours.
// Viewing conditions are the CIE defaults for a lit print: D65, LA 64 cd/m2, Yb 20, average surround. DOM free.

const mul = (M, v) => M.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const inverse3 = m => {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + c * C;
  return [[A, c * h - b * i, b * f - c * e], [B, a * i - c * g, c * d - a * f], [C, b * g - a * h, a * e - b * d]].map(r => r.map(v => v / det));
};

/** The chromatic adaptation space CIECAM02 adapts in. Its channels are sharper than cones and stay positive for
 *  surface colours that sRGB's primaries put below zero, which is why dilution is modelled in it (see box.mjs). */
const CAT02 = [[0.7328, 0.4296, -0.1624], [-0.7036, 1.6975, 0.0061], [0.0030, 0.0136, 0.9834]];
const CAT02_INV = inverse3(CAT02);
const HPE = [[0.38971, 0.68898, -0.07868], [-0.22981, 1.18340, 0.04641], [0, 0, 1]], HPE_INV = inverse3(HPE);
const SRGB = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]];
const SRGB_INV = inverse3(SRGB);

const WHITE = [95.047, 100, 108.883], LA = 64, YB = 20, F = 1, SURROUND_C = 0.69, NC = 1;
const k = 1 / (5 * LA + 1), FL = 0.2 * k ** 4 * 5 * LA + 0.1 * (1 - k ** 4) ** 2 * Math.cbrt(5 * LA);
const N = YB / WHITE[1], Z = 1.48 + Math.sqrt(N), NBB = 0.725 * N ** -0.2, NCB = NBB;
const D = F * (1 - (1 / 3.6) * Math.exp((-LA - 42) / 92));
const RGB_W = mul(CAT02, WHITE), ADAPT = RGB_W.map(v => (WHITE[1] * D) / v + 1 - D);
const compress = x => { const t = (FL * Math.abs(x) / 100) ** 0.42; return Math.sign(x) * (400 * t) / (27.13 + t) + 0.1; };
const AW = (() => { const p = mul(HPE, mul(CAT02_INV, RGB_W.map((v, i) => v * ADAPT[i]))).map(compress); return (2 * p[0] + p[1] + p[2] / 20 - 0.305) * NBB; })();

/** XYZ (white at Y 100) to CIECAM02 [J, C, h]. */
export function toJCh(XYZ) {
  const Ra = mul(HPE, mul(CAT02_INV, mul(CAT02, XYZ).map((v, i) => v * ADAPT[i]))).map(compress);
  const a = Ra[0] - (12 * Ra[1]) / 11 + Ra[2] / 11, b = (Ra[0] + Ra[1] - 2 * Ra[2]) / 9;
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360, et = 0.25 * (Math.cos((h * Math.PI) / 180 + 2) + 3.8);
  const J = 100 * (((2 * Ra[0] + Ra[1] + Ra[2] / 20 - 0.305) * NBB) / AW) ** (SURROUND_C * Z);
  const t = ((50000 / 13) * NC * NCB * et * Math.hypot(a, b)) / (Ra[0] + Ra[1] + (21 / 20) * Ra[2]);
  return [J, t ** 0.9 * Math.sqrt(J / 100) * (1.64 - 0.29 ** N) ** 0.73, h];
}

/** CIECAM02 [J, C, h] back to XYZ (white at Y 100): the model's published inversion (CIE 159:2004). */
export function fromJCh(J, C, hDeg) {
  const h = (hDeg * Math.PI) / 180, t = (Math.max(1e-9, C) / (Math.sqrt(J / 100) * (1.64 - 0.29 ** N) ** 0.73)) ** (1 / 0.9);
  const et = 0.25 * (Math.cos(h + 2) + 3.8), A = AW * (J / 100) ** (1 / (SURROUND_C * Z));
  const p1 = ((50000 / 13) * NC * NCB * et) / t, p2 = A / NBB + 0.305, p3 = 21 / 20, sin = Math.sin(h), cos = Math.cos(h);
  let a, b;
  if (Math.abs(sin) >= Math.abs(cos)) {
    b = (p2 * (2 + p3) * (460 / 1403)) / (p1 / sin + (2 + p3) * (220 / 1403) * (cos / sin) - 27 / 1403 + (p3 * 6300) / 1403);
    a = (b * cos) / sin;
  } else {
    a = (p2 * (2 + p3) * (460 / 1403)) / (p1 / cos + (2 + p3) * (220 / 1403) - (27 / 1403 - (p3 * 6300) / 1403) * (sin / cos));
    b = (a * sin) / cos;
  }
  const Ra = [(460 * p2 + 451 * a + 288 * b) / 1403, (460 * p2 - 891 * a - 261 * b) / 1403, (460 * p2 - 220 * a - 6300 * b) / 1403];
  const Rp = Ra.map(v => Math.sign(v - 0.1) * (100 / FL) * ((27.13 * Math.abs(v - 0.1)) / (400 - Math.abs(v - 0.1))) ** (1 / 0.42));
  return mul(CAT02_INV, mul(CAT02, mul(HPE_INV, Rp)).map((v, i) => v / ADAPT[i]));
}

/** XYZ (white at Y 100) to linear sRGB, and back. */
export const linearOfXYZ = XYZ => mul(SRGB_INV, XYZ.map(v => v / 100));
export const xyzOfLinear = lin => mul(SRGB, lin).map(v => v * 100);
/** Linear light to an 8-bit sRGB value, clamped. */
export const encode = v => { const c = Math.max(0, Math.min(1, v)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055); };
export const cat02 = XYZ => mul(CAT02, XYZ);
export const xyzOfCat02 = rgb => mul(CAT02_INV, rgb);
