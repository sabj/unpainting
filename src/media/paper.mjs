// Paper: a surface height made of fibres and tooth, and the capacity of its pores. Rough watercolour paper is a
// felt of cotton fibres pressed together, lightly sized (Computer-Generated Watercolor, section 2.1); the height steers water
// and granulating pigment, the capacity (c = h (cmax - cmin) + cmin) sets how much water it can absorb.
// DOM free.

// `scale` is cells per pixel of the picture. Every length below is a paper length, multiplied by it, so the grid
// does not decide how coarse the paper is.
export function makePaper(w, h, { seed = 1, fibres = 0.5, tooth = 0.5, fibreLength = 14, cmin = 0.2, cmax = 0.55, scale = 1, toothScale = 1, patternScale = 1, proudBlur = 1, coldPress = null, mmPerCell = 0 } = {}) {
  // Opt-in physical fibres: fibre size and count follow physical area.
  const fs = mmPerCell > 0 ? (280 / 1086) / mmPerCell : scale;
  const n = w * h, fib = new Float32Array(n), c2 = new Float32Array(n), s2 = new Float32Array(n); // fibre amount, and orientation as doubled angles (a fibre has no head or tail)
  // tooth coarseness in pixels of the picture. coldPress { mmPerCell }: a physical cold-press sheet instead of value
  // noise, with hollows and tooth in millimetres (0.4 mm a unit), so the sheet reads the same at any resolution.
  const ts = coldPress ? 0.4 / coldPress.mmPerCell : (mmPerCell > 0 ? fs : scale) * toothScale, ps = (mmPerCell > 0 ? fs : scale) * patternScale;
  const CP = coldPress ? coldPressField(w, h, coldPress.mmPerCell, seed, coldPress) : null;
  const blur = r => Math.max(1, Math.round(r * ts));
  let s = seed * 9301 + 49297; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // fibres: many short, slightly curved strands laid at random, a little thicker in the middle
  const count = Math.round(n / (9 * fs * fs));   // the same fibres per pixel of the picture, not per cell
  for (let f = 0; f < count; f++) {
    let x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI, bend = (rnd() - 0.5) * 0.12; const L = fibreLength * fs * (0.4 + rnd());
    const stepL = 0.7 * fs;
    for (let t = 0; t < L; t += stepL) { a += bend * (mmPerCell > 0 ? 1 : scale); x += Math.cos(a) * stepL; y += Math.sin(a) * stepL; const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= w || yi >= h) break; const wt = (0.6 + 0.4 * Math.sin(Math.PI * t / L)) * fs; fib[yi * w + xi] += wt; c2[yi * w + xi] += wt * Math.cos(2 * a); s2[yi * w + xi] += wt * Math.sin(2 * a); }
  }
  const hash = (x, y) => { const q = Math.sin(x * 127.1 + y * 311.7 + seed * 17.3) * 43758.5453; return q - Math.floor(q); };
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  const blurred = box(box(fib, w, h, blur(1)), w, h, blur(1));
  let fm = 0; for (const v of blurred) fm = Math.max(fm, v);
  const fscale = fm > 0 ? 1 / (fm * 0.5) : 0; // a sheet too small to hold a fibre is all tooth, not 0/0
  const height = new Float32Array(n), capacity = new Float32Array(n);
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Two roughnesses: the tooth, a pixel or two across, leaves specks of paper in a wash; the pattern, several
    // pixels across, makes a wash pool in patches. One noise field cannot be both.
    const i = y * w + x, t = CP ? CP[i] : 0.6 * vn(x / (2.5 * ts), y / (2.5 * ts)) + 0.4 * vn(x / (7 * ps) + 11, y / (7 * ps) + 3);
    height[i] = fibres * Math.min(1, blurred[i] * fscale) + tooth * t; lo = Math.min(lo, height[i]); hi = Math.max(hi, height[i]);
  }
  for (let i = 0; i < n; i++) height[i] = (height[i] - lo) / (hi - lo || 1);
  // pigment settles and water pools at the scale of the paper's hollows, a few fibres across, not per fibre
  const valley = box(height, w, h, blur(1)); let vl = Infinity, vh = -Infinity; for (const v of valley) { vl = Math.min(vl, v); vh = Math.max(vh, v); }
  for (let i = 0; i < n; i++) { valley[i] = (valley[i] - vl) / (vh - vl || 1); capacity[i] = valley[i] * (cmax - cmin) + cmin; }
  // the tooth a dragged brush feels: hills and hollows about a millimetre across, over which a clump rides
  const toothH = box(box(box(height, w, h, blur(2)), w, h, blur(2)), w, h, blur(2)); let tl = Infinity, th = -Infinity; for (const v of toothH) { tl = Math.min(tl, v); th = Math.max(th, v); }
  for (let i = 0; i < n; i++) toothH[i] = (toothH[i] - tl) / (th - tl || 1);
  // the direction water wicks along: the local fibre orientation, and how strongly the fibres there agree (0..1)
  const bc = box(c2, w, h, blur(1)), bs = box(s2, w, h, blur(1)), bf = box(fib, w, h, blur(1)), fdx = new Float32Array(n), fdy = new Float32Array(n), grain = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.atan2(bs[i], bc[i]) / 2, m = Math.hypot(bc[i], bs[i]); fdx[i] = Math.cos(a); fdy[i] = Math.sin(a); grain[i] = bf[i] > 1e-6 ? Math.min(1, (m / bf[i]) * Math.min(1, bf[i] / (fm * 0.3))) : 0; }
  // relief: the 10th to 90th percentile spread of height about the tooth's hills; a brush's bridge is a share of it.
  // proud: how far a fibre stands above its surroundings, blurred at proudBlur cells at height's own scale.
  const proudLow = box(height, w, h, Math.max(1, Math.round(proudBlur * (mmPerCell > 0 ? fs : 1))));
  const proud = new Float32Array(n); for (let i = 0; i < n; i++) proud[i] = height[i] - proudLow[i];
  const rel = new Float32Array(n); for (let i = 0; i < n; i++) rel[i] = height[i] - toothH[i];
  const sorted = Float32Array.from(rel).sort();
  const relief = Math.max(1e-4, sorted[Math.floor(n * 0.9)] - sorted[Math.floor(n * 0.1)]);
  return { w, h, n, height, capacity, valley, proud, tooth: toothH, fdx, fdy, grain, relief, mmPerCell: coldPress ? coldPress.mmPerCell : mmPerCell };
}

/**
 * A cold-press sheet's surface, 0..1: rounded domes (1 - r^2)^2 at uniformly random places, sized in millimetres,
 * over sparser broad swells. `bumpMm` [min, max] diameters, `cover` mean overlap, `swell` the swells' share.
 */
// pits p: this share of the bumps are pressed in instead of raised, so settling paint collects in pits as dark
// grains on a lighter ground. 0: domes only.
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

function box(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += src[y * w + xx]; c++; } } tmp[y * w + x] = s / c; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; c++; } } out[y * w + x] = s / c; }
  return out;
}
