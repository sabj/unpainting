// The fungi plate's cold-press appearance field: elliptical bumps (and pits) of the given sizes in mm, and a slower swell,
// normalised to 0..1. It was src/media/paper.mjs coldPressField until the painter's paper took its relief in micrometres
// (paper-relief.mjs); the plate keeps it for the look of its sheet.
export function coldPressField(w, h, mmPerCell, seed = 1, { bumpMm = [0.5, 2], cover = 2.2, swell = 0.3, swellMm = [3, 6], pits = 0 } = {}) {
  const n = w * h, f = new Float32Array(n);
  let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const drop = (dMin, dMax, cov, amp, pitShare = 0) => {
    const rMean = (dMin + dMax) / 4 / mmPerCell, count = Math.max(1, Math.round((cov * n) / (Math.PI * rMean * rMean)));
    for (let c = 0; c < count; c++) {
      const cx = rnd() * w, cy = rnd() * h, R = Math.max(0.6, ((dMin + (dMax - dMin) * rnd()) / 2) / mmPerCell), a = amp * (0.55 + 0.45 * rnd()) * (pitShare > 0 && rnd() < pitShare ? -1 : 1);
      const e = 0.75 + 0.5 * rnd(), th = rnd() * Math.PI, ct = Math.cos(th), st = Math.sin(th), Ru = R * e, Rv = R / e, reach = Math.ceil(Math.max(Ru, Rv)) + 1;
      const x0 = Math.max(0, Math.floor(cx - reach)), x1 = Math.min(w - 1, Math.ceil(cx + reach)), y0 = Math.max(0, Math.floor(cy - reach)), y1 = Math.min(h - 1, Math.ceil(cy + reach));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, u = (dx * ct + dy * st) / Ru, v = (-dx * st + dy * ct) / Rv, r2 = u * u + v * v;
        if (r2 < 1) { const q = 1 - r2; f[y * w + x] += a * q * q; }
      }
    }
  };
  drop(bumpMm[0], bumpMm[1], cover, 1, pits);
  if (swell > 0) drop(swellMm[0], swellMm[1], 1.2, swell * 2.5);
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { lo = Math.min(lo, f[i]); hi = Math.max(hi, f[i]); }
  for (let i = 0; i < n; i++) f[i] = (f[i] - lo) / (hi - lo || 1);
  return f;
}

