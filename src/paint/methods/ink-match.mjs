// Pipeline: inking, stage 5 (ink load).
// --inkdarkmatch c: the ink load set so the pen's own strokes come out c times as dark as the target's lines, raising
// the load as well as lowering it. --inkdarkcap tests one straight line of fixed width on a scrap; this tests a sample
// of the stage's real strokes, with their widths, pressures and speeds, on a blank sheet of the painting's size, and
// reads their line cores as the target's lines were read (strokesPeakAbsorbance, on both).
//
// Pure apart from the drawing it is handed: no files, no target pixels.
import { resample } from './ink-lines.mjs';

const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const Lstar = Y => (Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y);
const Yof = L => (L > 8 ? ((L + 16) / 116) ** 3 : L / 903.3);

/** L* plane of an RGB render. */
export function lPlane(rgb, n) {
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = Lstar(0.2126 * lin(rgb[3 * i]) + 0.7152 * lin(rgb[3 * i + 1]) + 0.0722 * lin(rgb[3 * i + 2]));
  return L;
}

function sampleAt(P, w, h, x, y) {
  const fx = Math.max(0, Math.min(w - 1, x - 0.5)), fy = Math.max(0, Math.min(h - 1, y - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), u = fx - x0, v = fy - y0;
  return (P[y0 * w + x0] * (1 - u) + P[y0 * w + x1] * u) * (1 - v) + (P[y1 * w + x0] * (1 - u) + P[y1 * w + x1] * u) * v;
}

/**
 * Median peak absorbance along the gestures: at each point, the darkest L* within half a pixel across the path
 * against the lighter side's lightest L* 1.5 to 3 pixels out. This is how dark a line looks at its core, which a
 * mean across a blurred profile understates for a line a pixel or two wide. Points under `minSupport` L* are skipped.
 */
export function strokesPeakAbsorbance(L, w, h, gestures, { minSupport = 2 } = {}) {
  const v = [];
  for (const g of gestures) {
    if (!(g.points?.length >= 2)) continue;
    const R = resample(g.points.map(p => ({ x: p.x + 0.5, y: p.y + 0.5 })), 0.5), n = R.length;
    for (let k = 0; k < n; k++) {
      const a = R[Math.max(0, k - 1)], b = R[Math.min(n - 1, k + 1)], tl = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / tl, ny = (b.x - a.x) / tl, p = R[k];
      let on = Infinity; for (const d of [-0.5, -0.25, 0, 0.25, 0.5]) on = Math.min(on, sampleAt(L, w, h, p.x + d * nx, p.y + d * ny));
      const side = sg => { let m = -Infinity; for (const d of [1.5, 2, 2.5, 3]) m = Math.max(m, sampleAt(L, w, h, p.x + sg * d * nx, p.y + sg * d * ny)); return m; };
      const lit = Math.max(side(1), side(-1));
      if (lit - on >= minSupport) v.push(-Math.log(Math.max(1e-4, Yof(on)) / Math.max(1e-4, Yof(lit))));
    }
  }
  if (!v.length) return 0;
  v.sort((a, b) => a - b);
  return v[v.length >> 1];
}

/** The longest `count` gestures, in their drawing order: the sample the match is made on. */
export function sampleGestures(gestures, count = 60) {
  const len = g => g.points.reduce((a, q, k) => (k ? a + Math.hypot(q.x - g.points[k - 1].x, q.y - g.points[k - 1].y) : 0), 0);
  const ranked = gestures.map((g, i) => ({ i, L: g.points?.length >= 2 ? len(g) : 0 })).filter(r => r.L > 0).sort((a, b) => b.L - a.L).slice(0, count);
  return ranked.sort((a, b) => a.i - b.i).map(r => gestures[r.i]);
}

/**
 * The factor on the ink load that brings the strokes' absorbance to `cap` x `targetAbsorbance`.
 * `measure(f)` draws the sample at load factor f on a fresh blank sheet and returns its absorbance.
 * Two secant steps from f = 1, kept within [lo, hi].
 * @returns { factor, before, after, want }
 */
export function matchInkLoad({ targetAbsorbance, cap = 1, measure, lo = 0.125, hi = 4 }) {
  const want = cap * targetAbsorbance, clamp = f => Math.max(lo, Math.min(hi, f));
  const before = measure(1);
  if (!(want > 0) || !(before > 0)) return { factor: 1, before, after: before, want };
  let f = clamp(want / before), after = measure(f);
  for (let i = 0; i < 2; i++) {
    if (!(after > 0) || Math.abs(after - want) < 0.03 * want || f === lo || f === hi) break;
    f = clamp(f * want / after);
    after = measure(f);
  }
  return { factor: f, before, after, want };
}
