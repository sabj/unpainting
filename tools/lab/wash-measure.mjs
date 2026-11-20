// Measures of a dried wash, in millimetres (tools/lab/wash-sheet.mjs): how much darker its rim dries than its middle,
// how much fine grain it has, and how much relief there is at each scale. `mm` is millimetres a cell (or a pixel).

const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** Luminance (linear Y) of each pixel of packed RGB. */
export function luminance(rgb, n) { const y = new Float64Array(n); for (let i = 0; i < n; i++) y[i] = 0.2126 * lin(rgb[3 * i]) + 0.7152 * lin(rgb[3 * i + 1]) + 0.0722 * lin(rgb[3 * i + 2]); return y; }
/** Optical density -log10(Y / Ypaper) of each pixel against one paper luminance. */
export function densityOf(Y, paperY) { return Float64Array.from(Y, v => -Math.log10(Math.max(1e-4, v) / paperY)); }

/** Distance of every cell inside `mask` to the nearest cell outside it (or the sheet's edge), in cells (chamfer 3-4). */
export function insideDistance(mask, w, h) {
  const d = new Float64Array(w * h), BIG = 1e9;
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? BIG : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!d[i]) continue; d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!d[i]) continue; d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4); }
  for (let i = 0; i < w * h; i++) d[i] /= 3;
  return d;
}

/** The painted area: cells denser than `share` of the 90th percentile density. */
export function washMask(od, share = 0.3) {
  const s = Float64Array.from(od).sort(), p90 = s[Math.floor(0.9 * (s.length - 1))], t = share * p90;
  return Uint8Array.from(od, v => (v > t ? 1 : 0));
}

/** Rim contrast: mean density of the outer `bandMm` of the wash over the mean of its interior (more than `innerMm` in).
 *  Above 1 the edge dried darker. */
export function rimContrast(od, w, h, mm, { bandMm = 1, innerMm = 3, mask = washMask(od) } = {}) {
  const d = insideDistance(mask, w, h); let r = 0, rn = 0, c = 0, cn = 0;
  for (let i = 0; i < w * h; i++) { if (!mask[i]) continue; const dm = d[i] * mm; if (dm <= bandMm) { r += od[i]; rn++; } else if (dm > innerMm) { c += od[i]; cn++; } }
  return { rim: rn ? r / rn : 0, interior: cn ? c / cn : 0, contrast: rn && cn && c > 0 ? (r / rn) / (c / cn) : 0, interiorMask: Uint8Array.from(d, v => (v * mm > innerMm ? 1 : 0)) };
}

/** Separable Gaussian blur, sigma in cells (none below 0.3). */
export function gaussian(f, w, h, sigma) {
  if (!(sigma >= 0.3)) return Float64Array.from(f);
  const r = Math.ceil(3 * sigma), k = []; let ks = 0; for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); ks += v; }
  for (let i = 0; i < k.length; i++) k[i] /= ks;
  const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * f[y * w + Math.min(w - 1, Math.max(0, x + i))]; tmp[y * w + x] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]; out[y * w + x] = s; }
  return out;
}
// a Gaussian of sigma 0.19 wavelength passes that wavelength at half amplitude
const SIG = 0.19;
/** Grain: the standard deviation of density in the band of wavelengths `loMm` to `hiMm`, inside `mask`, over the mean
 *  density there (relative), and absolute. Returns null when the band's short end is finer than the grid resolves. */
export function grainContrast(od, w, h, mm, mask, loMm = 0.2, hiMm = 1) {
  if (loMm < 2 * mm) return null;
  const a = gaussian(od, w, h, (SIG * loMm) / mm), b = gaussian(od, w, h, (SIG * hiMm) / mm);
  let s = 0, s2 = 0, m = 0, n = 0;
  for (let i = 0; i < w * h; i++) { if (!mask[i]) continue; const v = a[i] - b[i]; s += v; s2 += v * v; m += od[i]; n++; }
  if (n < 16) return null;
  const sd = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
  return { sd, mean: m / n, relative: m > 0 ? sd / (m / n) : 0 };
}

function fft1(re, im, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = ((inv ? 2 : -2) * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
/** RMS amplitude of a field in octave bands around each wavelength (mm), from a square power-of-two window of side `n`
 *  cells at (x0, y0), mean removed and Hann-windowed. A band finer than the grid resolves is null. */
export function bandSpectrum(f, w, mm, x0, y0, n, wavelengths = [0.1, 0.2, 0.5, 1, 2]) {
  const re = [], im = [];
  let mean = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) mean += f[(y0 + y) * w + x0 + x]; mean /= n * n;
  for (let y = 0; y < n; y++) { const r = new Float64Array(n), i = new Float64Array(n), hy = 0.5 - 0.5 * Math.cos((2 * Math.PI * (y + 0.5)) / n); for (let x = 0; x < n; x++) r[x] = (f[(y0 + y) * w + x0 + x] - mean) * hy * (0.5 - 0.5 * Math.cos((2 * Math.PI * (x + 0.5)) / n)); fft1(r, i); re.push(r); im.push(i); }
  for (let x = 0; x < n; x++) { const r = Float64Array.from(re, row => row[x]), i = Float64Array.from(im, row => row[x]); fft1(r, i); for (let y = 0; y < n; y++) { re[y][x] = r[y]; im[y][x] = i[y]; } }
  const hann = 0.375 ** 2, out = {};   // the window's mean square, so the band powers sum to the field's variance
  for (const lam of wavelengths) {
    const lo = 1 / (lam * Math.SQRT2), hi = Math.SQRT2 / lam;
    if (1 / lam > 1 / (2 * mm)) { out[lam] = null; continue; }   // a band whose centre is past the grid's Nyquist
    let p = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const fy = (y <= n / 2 ? y : y - n) / (n * mm), fx = (x <= n / 2 ? x : x - n) / (n * mm), fr = Math.hypot(fx, fy); if (fr >= lo && fr < hi) p += re[y][x] ** 2 + im[y][x] ** 2; }
    out[lam] = Math.sqrt(p / (n * n) / (n * n) / hann);
  }
  return out;
}
