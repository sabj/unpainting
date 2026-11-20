// Measurements of single brush strokes on a sheet (BRUSH-PHYSICS.md S1, S2), for tools/lab/brush-sheet.mjs and the
// section brush's tests. Lengths are in millimetres; `mm` is the sheet's millimetres a cell.
import { thickness } from '../../src/media/sheet.mjs';

/** Pigment along x, per mm of x: each column's total pigment (all pigments, all layers) times the cell's area, over its width. */
export function pigmentPerMm(sheet, mm, rows = null) {
  const t = thickness(sheet), { w, h } = sheet, out = new Float64Array(w);
  const [y0, y1] = rows ?? [0, h];
  for (const tk of t) for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) out[x] += tk[y * w + x];
  for (let x = 0; x < w; x++) out[x] *= mm; // (mass a cell x mm^2) / mm of x
  return out;
}
/** A profile smoothed by a box `win` samples wide. */
export function smoothProfile(a, win) {
  const r = Math.max(0, Math.floor(win / 2)), out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) { let s = 0, n = 0; for (let k = i - r; k <= i + r; k++) if (k >= 0 && k < a.length) { s += a[k]; n++; } out[i] = s / n; }
  return out;
}
/** Run-out of a stroke from x0 (mm), along x: the first distance past the stroke's start plateau (its mean from 5 to 15
 *  mm) where the pigment per mm, smoothed over 2 mm, falls below half of it. Infinity when it never does. */
export function runOut(perMm, mm, x0) {
  const s = smoothProfile(perMm, Math.round(2 / mm)), at = d => Math.min(s.length - 1, Math.max(0, Math.round((x0 + d) / mm)));
  let plateau = 0, n = 0; for (let k = at(5); k <= at(15); k++) { plateau += s[k]; n++; } plateau /= n;
  for (let k = at(15); k < s.length; k++) if (s[k] < 0.5 * plateau) return k * mm - x0;
  return Infinity;
}
/** Mean of a profile between two distances (mm) from x0. */
export function meanBetween(a, mm, x0, d0, d1) {
  let s = 0, n = 0;
  for (let k = Math.round((x0 + d0) / mm); k <= Math.round((x0 + d1) / mm); k++) if (k >= 0 && k < a.length) { s += a[k]; n++; }
  return n ? s / n : 0;
}

const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (rgb, i) => 0.2126 * lin(rgb[3 * i]) + 0.7152 * lin(rgb[3 * i + 1]) + 0.0722 * lin(rgb[3 * i + 2]);
/** Optical density of each cell of a render against the bare paper's own render: -log10(Y / Y paper). */
export function opticalDensity(rgb, paperRGB, n) {
  const od = new Float64Array(n);
  for (let i = 0; i < n; i++) od[i] = -Math.log10(Math.max(1e-4, lum(rgb, i)) / Math.max(1e-4, lum(paperRGB, i)));
  return od;
}
/** Mean of a field along x over columns [x0, x1), per row: a profile across a horizontal stroke. */
export function rowProfile(f, w, h, x0, x1) {
  const out = new Float64Array(h);
  for (let y = 0; y < h; y++) { let s = 0; for (let x = x0; x < x1; x++) s += f[y * w + x]; out[y] = s / (x1 - x0); }
  return out;
}
/** The density step across a seam at row `seam` of a profile: how far the profile within `half` rows of the seam strays
 *  from the line joining the two bands' means (taken from `half` to 3 `half` rows either side). */
export function seamStep(prof, seam, half) {
  const mean = (a, b) => { let s = 0, n = 0; for (let y = Math.max(0, a); y < Math.min(prof.length, b); y++) { s += prof[y]; n++; } return s / n; };
  const above = mean(seam - 3 * half, seam - half), below = mean(seam + half, seam + 3 * half);
  let worst = 0;
  for (let y = seam - half; y <= seam + half; y++) { const t = (y - (seam - 2 * half)) / (4 * half), line = above + (below - above) * t; worst = Math.max(worst, Math.abs(prof[y] - line)); }
  return { step: worst, above, below };
}

/** Width of a mark across x at each column: the cells in that column above `level` (a fraction of the mark's peak). */
export function widthAlongX(f, w, h, level) {
  let peak = 0; for (const v of f) peak = Math.max(peak, v);
  const out = new Float64Array(w);
  for (let x = 0; x < w; x++) { let n = 0; for (let y = 0; y < h; y++) if (f[y * w + x] > level * peak) n++; out[x] = n; }
  return out;
}

/** Edge roughness of a mark laid along the 45 degree diagonal y = x + c (cells): the distance of its upper edge
 *  (threshold `level` of the peak, read bilinearly) from the line at stations a quarter cell apart in x from `from` to
 *  `to`, detrended. Returns { offsets, spectrum }, the spectrum's frequencies in cycles a station. The cell pitch along
 *  the diagonal is one cycle each 4 stations (f = 0.25). */
export function diagonalEdge(f, w, h, c, level, from, to) {
  let peak = 0; for (const v of f) peak = Math.max(peak, v);
  const thr = level * peak, offs = [];
  const at = (x, y) => {
    const x0 = Math.floor(x - 0.5), y0 = Math.floor(y - 0.5), fx = x - 0.5 - x0, fy = y - 0.5 - y0;
    const g = (xx, yy) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : f[yy * w + xx]);
    return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
  };
  for (let s = from; s < to; s += 0.25) {
    let edge = null, prev = 0;
    for (let u = 0; u < 80; u += 0.05) {
      const v = at(s + 0.5 + u / Math.SQRT2, s + c + 0.5 - u / Math.SQRT2);
      if (v < thr) { edge = u - 0.05 * (thr - v) / Math.max(1e-9, prev - v); break; }
      prev = v;
    }
    if (edge !== null) offs.push(edge);
  }
  const n = offs.length, m = offs.reduce((a, b) => a + b, 0) / n;
  let sx = 0, sxy = 0; for (let i = 0; i < n; i++) { sx += (i - (n - 1) / 2) ** 2; sxy += (i - (n - 1) / 2) * (offs[i] - m); }
  const slope = sx ? sxy / sx : 0, d = offs.map((v, i) => v - m - slope * (i - (n - 1) / 2));
  const spectrum = [];
  for (let k = 1; k < n / 2; k++) { let re = 0, im = 0; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * k * i / n; re += d[i] * Math.cos(a); im += d[i] * Math.sin(a); } spectrum.push({ f: k / n, p: (re * re + im * im) / n }); }
  return { offsets: d, spectrum };
}
/** How far the power at a frequency band stands above the median power of the bands around it. */
export function spectralPeak(spectrum, f0, rel = 0.15) {
  const at = spectrum.filter(s => Math.abs(s.f - f0) <= rel * f0), around = spectrum.filter(s => Math.abs(s.f - f0) > rel * f0 && Math.abs(s.f - f0) <= 0.5 * f0).map(s => s.p).sort((a, b) => a - b);
  if (!at.length || !around.length) return 0;
  return Math.max(...at.map(s => s.p)) / Math.max(1e-12, around[Math.floor(around.length / 2)]);
}
