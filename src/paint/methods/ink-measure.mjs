// Pipeline: inking, stage 2 (hold and measure the lines).
// The target's own line, read point by point along a pen path (--linemeasure): how wide it is and how dark it is
// against what is beside it. The pen then follows both along the stroke, so a line swells and fades where the
// source's does, instead of one even hairline.
//
// Width: across the path, the distance on each side at which L* climbs back halfway from the on-path value to the
// side value; the sum of both sides. Darkness: absorbance, -ln(Y on the path / Y beside it). Both are smoothed along
// the path over about two pixels, since one pixel of a traced line is mostly noise.
//
// Pure: arrays in, arrays out. Coordinates are the line file's pixels; L is CIE L* (0..100) on that grid.

const STEP = 0.25, REACH = 4;

function sample(P, w, h, x, y) {
  const fx = Math.max(0, Math.min(w - 1, x - 0.5)), fy = Math.max(0, Math.min(h - 1, y - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), u = fx - x0, v = fy - y0;
  return (P[y0 * w + x0] * (1 - u) + P[y0 * w + x1] * u) * (1 - v) + (P[y1 * w + x0] * (1 - u) + P[y1 * w + x1] * u) * v;
}

const Y = Lstar => (Lstar > 8 ? ((Lstar + 16) / 116) ** 3 : Lstar / 903.3);

function smoothAlong(v, radius) {
  const n = v.length, out = new Float32Array(n), r = Math.max(1, Math.round(radius));
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = -2 * r; k <= 2 * r; k++) { const j = i + k; if (j < 0 || j >= n || !Number.isFinite(v[j])) continue; const g = Math.exp(-k * k / (2 * r * r)); s += g * v[j]; c += g; }
    out[i] = c > 0 ? s / c : NaN;
  }
  return out;
}

/**
 * Width (pixels) and absorbance of the target's line under each point of `pts` ({x, y}, evenly spaced `spacing`
 * pixels apart). `on` and `side` are the on-path and beside-path L* per point (ink-lines.mjs pathSupport). Where the
 * target shows no darker line (side - on under `minSupport` L*) width is NaN and absorbance 0. The probe walks at most
 * `reach` pixels each way, so a width is at most 2 x reach + the step.
 */
export function measureAlong(pts, L, w, h, on, side, { spacing = 0.5, minSupport = 1, reach = REACH } = {}) {
  const n = pts.length, width = new Float32Array(n), absorb = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], tl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / tl, ny = (b.x - a.x) / tl, p = pts[k];
    if (side[k] - on[k] < minSupport) { width[k] = NaN; absorb[k] = 0; continue; }
    const half = (on[k] + side[k]) / 2;
    let sum = 0;
    for (const sg of [1, -1]) {
      let d = 0;
      while (d < reach && sample(L, w, h, p.x + sg * (d + STEP) * nx, p.y + sg * (d + STEP) * ny) < half) d += STEP;
      sum += d + STEP / 2;
    }
    width[k] = sum;
    absorb[k] = Math.max(0, -Math.log(Math.max(1e-4, Y(on[k])) / Math.max(1e-4, Y(side[k]))));
  }
  const r = 1 / spacing;
  return { width: smoothAlong(width, r), absorbance: smoothAlong(absorb, r) };
}

/** Pressure weights (floor..1) from absorbances: floor plus the rest in proportion to each point's absorbance over
 *  `ref`, the file's strong line. The floor keeps a pale stretch a line, not a gap. */
export function weightsFrom(absorbance, ref, { floor = 0.45 } = {}) {
  return Array.from(absorbance, a => (ref > 0 ? floor + (1 - floor) * Math.max(0, Math.min(1, a / ref)) : 1));
}
