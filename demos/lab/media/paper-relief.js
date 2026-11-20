// Generated from src/media/paper-relief.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// The paper's relief in physical units: one seeded height field in micrometres, with real structure from about 0.1 mm
// to a few millimetres, a little longer along the fibres (the machine direction, x) than across them. It is a fixed
// continuous field on the sheet, so a grid only samples it: each cell takes the mean of the field over its own area and
// nothing is rescaled to the grid's range. The same seed at 0.25, 0.1 and 0.05 mm cells is the same paper, only sharper.
//
// How it is made. Two periodic tiles of Gaussian noise with a chosen spectrum (25.6 mm and 20.48 mm on a side, so the
// pattern repeats only every 128 mm) are summed. Each tile is skewed a little towards pits (narrow hollows in broad
// crests: the felt's imprint on a cold-press sheet, where settling pigment collects as dark specks on a lighter
// ground), then scaled to the preset's RMS height. The spectrum is flat per octave (power ~ f^-2) between `lambdaMin`
// and `lambdaMax`, rolled off outside, and `aniso` stretches it along x.
//
// Fit (refs/crops-index.tsv, measured with tools/lab/wash-measure.mjs): inside granulating washes by Homer, Turner and
// Sargent the density's band RMS is about the same in every octave from 0.2 to 2 mm (granul-moran at 0.094 mm a pixel:
// 0.036 / 0.043 / 0.037 / 0.046 of mean density at 0.2 / 0.5 / 1 / 2 mm); the specks' autocorrelation falls to half at
// 0.11 to 0.19 mm (a speck 0.2 to 0.4 mm across) and is lowest at 0.4 to 0.56 mm (speck-to-gap pitch about 1 mm), with
// gradients 1.0 to 1.5 times stronger across x than along it on some sheets, and the density skewed towards dark specks
// (+0.3 to +0.7). The RMS heights are estimates for artists' papers (hot press a few micrometres, cold press about
// fifteen, rough about twice that); no profilometer data was at hand, and the cold-press RMS was set so a granulating
// wash comes out with the grain the crops have (src/media/paper-relief.test.mjs, src/media/settling.test.mjs).
// DOM free.

export const RELIEF_PRESETS = Object.freeze({
  // lambdaMin, lambdaMax mm: the octaves that carry the relief; rmsUm the RMS height; aniso the stretch along x; pits the
  // skew towards pits; swell: an extra share of broad relief at swellMm (rough paper's hills)
  cold: Object.freeze({ rmsUm: 15, lambdaMin: 0.12, lambdaMax: 2.5, aniso: 1.15, pits: 0.1, swell: 0.15, swellMm: 5 }),
  rough: Object.freeze({ rmsUm: 22, lambdaMin: 0.15, lambdaMax: 4, aniso: 1.1, pits: 0.12, swell: 0.35, swellMm: 6 }),
  hot: Object.freeze({ rmsUm: 4, lambdaMin: 0.08, lambdaMax: 1, aniso: 1.3, pits: 0.05, swell: 0, swellMm: 3 }),
});
// The height a sheet reads (paper.height) is this relief in units of HEIGHT_SPAN_UM about 0.5: 100 um a unit, the same
// for every grid, so the flow's hydraulic head (sheet.mjs `slope`, 0.1 mm of water a unit of height) is the paper's
// own relief in millimetres.
export const HEIGHT_SPAN_UM = 100;
// The neighbourhood a hollow is measured against: the mean height over about a millimetre.
const HOLLOW_MM = 1;

const TILES = [{ n: 1024, dx: 0.025 }, { n: 1024, dx: 0.02 }];

function fft1(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = ((inv ? 2 : -2) * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const p = i + k, q = p + half, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
function fft2(re, im, n, inv) {
  const r = new Float64Array(n), c = new Float64Array(n);
  for (let y = 0; y < n; y++) { for (let x = 0; x < n; x++) { r[x] = re[y * n + x]; c[x] = im[y * n + x]; } fft1(r, c, inv); for (let x = 0; x < n; x++) { re[y * n + x] = r[x]; im[y * n + x] = c[x]; } }
  for (let x = 0; x < n; x++) { for (let y = 0; y < n; y++) { r[y] = re[y * n + x]; c[y] = im[y * n + x]; } fft1(r, c, inv); for (let y = 0; y < n; y++) { re[y * n + x] = r[y]; im[y * n + x] = c[y]; } }
}
function rng(seed) {
  let s = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  const u = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
  // nearly Gaussian, unit variance: the sum of four uniforms (Irwin-Hall), fast enough for a million coefficients
  return () => (u() + u() + u() + u() - 2) * 1.7320508075688772;
}
/** Power of the relief at spatial frequency (fx, fy) cycles a millimetre. */
export function reliefPower(fx, fy, p) {
  const f = Math.hypot(fx * p.aniso, fy / p.aniso);
  if (f === 0) return 0;
  const band = (lo, hi) => f ** -2 * Math.exp(-((f * lo) ** 2)) * (1 - Math.exp(-((f * hi) ** 2)));
  return band(p.lambdaMin, p.lambdaMax) + (p.swell > 0 ? p.swell * band(p.lambdaMax, p.swellMm) : 0);
}
// one periodic tile, zero mean, its RMS 1/sqrt(2) (the two tiles sum to RMS 1)
function makeTile({ n, dx }, p, seed) {
  const g = rng(seed), re = new Float64Array(n * n), im = new Float64Array(n * n), L = n * dx;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = (x <= n / 2 ? x : x - n) / L, fy = (y <= n / 2 ? y : y - n) / L, a = Math.sqrt(reliefPower(fx, fy, p));
    re[y * n + x] = a * g(); im[y * n + x] = a * g();
  }
  fft2(re, im, n, true);
  const t = new Float64Array(n * n);
  let m = 0, v = 0; for (let i = 0; i < n * n; i++) { t[i] = re[i]; m += t[i]; } m /= n * n;
  for (let i = 0; i < n * n; i++) { t[i] -= m; v += t[i] * t[i]; } const sd = Math.sqrt(v / (n * n)) || 1;
  // skew towards pits: z = g - s (g^2 - 1), then back to zero mean and the tile's share of the variance
  m = 0; v = 0; for (let i = 0; i < n * n; i++) { const q = t[i] / sd; t[i] = q - p.pits * (q * q - 1); m += t[i]; } m /= n * n;
  for (let i = 0; i < n * n; i++) { t[i] -= m; v += t[i] * t[i]; }
  const k = Math.SQRT1_2 / (Math.sqrt(v / (n * n)) || 1), out = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = t[i] * k;
  return out;
}

const CACHE = new Map();
function presetOf(relief) {
  const p = typeof relief === 'string' ? RELIEF_PRESETS[relief] : relief;
  if (!p) throw new Error(`paper-relief: no relief preset ${relief} (cold, rough or hot)`);
  return p;
}
/** The relief's tiles and constants for one preset and seed, made once. */
function fieldOf(relief, seed) {
  const p = presetOf(relief), key = JSON.stringify(p);
  if (!CACHE.has(key)) CACHE.set(key, preset(p));
  const F = CACHE.get(key), g = rng(seed * 31 + 7);
  // the seed places the two tiles on the sheet: a different piece of the same paper
  return { ...F, off: F.tiles.map(t => [Math.abs(g()) * t.n * t.dx, Math.abs(g()) * t.n * t.dx]) };
}
// the tiles of one preset (the same for every seed) and the RMS of height about its millimetre mean
function preset(p) {
  const tiles = TILES.map((t, j) => ({ ...t, z: makeTile(t, p, 101 * j + 1) }));
  const F = { p, tiles, off: tiles.map(() => [0, 0]), hollowRms: 0 };
  // the RMS of height about its millimetre mean, at the tiles' own resolution (what a hollow is measured in)
  const A = tiles[0], n = A.n, r = Math.round(HOLLOW_MM / 2 / A.dx), z = new Float64Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) z[y * n + x] = sampleAt(F, x * A.dx, y * A.dx);
  const mean = boxPeriodic(z, n, r); let v = 0; for (let i = 0; i < n * n; i++) v += (z[i] - mean[i]) ** 2;
  F.hollowRms = Math.sqrt(v / (n * n));
  return F;
}
function bilinear(t, xMm, yMm) {
  const { n, dx, z } = t, u = xMm / dx, v = yMm / dx, x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
  const m = n - 1, xa = x0 & m, ya = y0 & m, xb = (xa + 1) & m, yb = (ya + 1) & m;   // n is a power of two
  return (z[ya * n + xa] * (1 - fx) + z[ya * n + xb] * fx) * (1 - fy) + (z[yb * n + xa] * (1 - fx) + z[yb * n + xb] * fx) * fy;
}
// the relief at a point (mm), in units of the preset's RMS
function sampleAt(F, xMm, yMm) { let s = 0; for (let j = 0; j < F.tiles.length; j++) s += bilinear(F.tiles[j], xMm + F.off[j][0], yMm + F.off[j][1]); return s; }
function boxPeriodic(f, n, r) {
  const tmp = new Float64Array(n * n), out = new Float64Array(n * n), k = 2 * r + 1;
  for (let y = 0; y < n; y++) { let s = 0; for (let d = -r; d <= r; d++) s += f[y * n + ((d % n) + n) % n]; for (let x = 0; x < n; x++) { tmp[y * n + x] = s / k; s += f[y * n + (x + r + 1) % n] - f[y * n + ((x - r) % n + n) % n]; } }
  for (let x = 0; x < n; x++) { let s = 0; for (let d = -r; d <= r; d++) s += tmp[(((d % n) + n) % n) * n + x]; for (let y = 0; y < n; y++) { out[y * n + x] = s / k; s += tmp[((y + r + 1) % n) * n + x] - tmp[(((y - r) % n + n) % n) * n + x]; } }
  return out;
}

/**
 * The relief on a grid of w x h cells of `mmPerCell`: each cell's mean height in micrometres (zUm), the height a sheet
 * reads (0.5 + z / HEIGHT_SPAN_UM, clamped to 0..1), and hollowRmsUm, the RMS of the relief about its millimetre mean
 * at full resolution (the unit makePaper measures a hollow in). `relief` a preset name or object.
 */
export function paperRelief(w, h, mmPerCell, { seed = 1, relief = 'cold' } = {}) {
  if (!(mmPerCell > 0)) throw new Error('paper-relief: mmPerCell must be positive');
  const F = fieldOf(relief, seed), rms = F.p.rmsUm, n = w * h;
  // samples a cell: sub-cells no wider than 0.04 mm, a third of the finest wavelength the relief carries (up to 8 a side)
  const k = Math.max(1, Math.min(8, Math.ceil(mmPerCell / 0.04))), zUm = new Float32Array(n), height = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) s += sampleAt(F, (x + (b + 0.5) / k) * mmPerCell, (y + (a + 0.5) / k) * mmPerCell);
    const i = y * w + x; zUm[i] = (rms * s) / (k * k);
    height[i] = Math.min(1, Math.max(0, 0.5 + zUm[i] / HEIGHT_SPAN_UM));
  }
  return { zUm, height, rmsUm: rms, hollowRmsUm: F.hollowRms * rms, preset: F.p };
}

