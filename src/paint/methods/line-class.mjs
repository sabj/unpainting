// Pipeline: inking, stage 2 (hold and measure the lines): line or mass.
// A pen line is a thin dark stroke with lighter tone on both sides at its own width. A shadow or wash edge is a one-sided
// step between two tone masses. Each point of a candidate line is read across the source at several widths and is a pen
// line, a mass edge, or faint (no contrast of its own and no step beside it). Mass edges are cut out of the drawing in
// pen and wash, except a long, smooth contour, which is structure (a pillar's edge, an arch). Pure: arrays in, arrays out.
// Coordinates are the line file's image pixels; L is CIE L* (0..100) on that grid.
import { resample, turning } from './ink-lines.mjs';

export const CLASS = Object.freeze({ faint: 0, pen: 1, mass: 2 });
export const MASS_DEFAULTS = Object.freeze({
  scalesMm: [0.15, 0.3, 0.6], // the widths a pen line is read at
  penContrast: 5,             // L*: the lighter side of the line over the line itself, at one of those widths
  broadMm: 1.2,               // the scale the two tone masses are read at
  stepContrast: 6,            // L*: the step between the masses beside a line that has no contrast of its own
  smoothMm: 0.6,              // a class is the majority within this much of path either way
  minRunMm: 1,                // a run of mass edge shorter than this stays (the majority has already spoken)
  structureMm: 12,            // a mass edge this long and smooth is a structural contour
  structureDegPerMm: 8,
});

function sample(P, w, h, x, y) {
  const fx = Math.max(0, Math.min(w - 1, x - 0.5)), fy = Math.max(0, Math.min(h - 1, y - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), u = fx - x0, v = fy - y0;
  return (P[y0 * w + x0] * (1 - u) + P[y0 * w + x1] * u) * (1 - v) + (P[y1 * w + x0] * (1 - u) + P[y1 * w + x1] * u) * v;
}

/** The cross profile at one point: { contrast, step } in L*, from the unit normal (nx, ny). */
export function crossProfile(L, w, h, p, nx, ny, pxMm, o = MASS_DEFAULTS) {
  const at = (d) => sample(L, w, h, p.x + d * nx, p.y + d * ny);
  let contrast = -Infinity;
  for (const s of o.scalesMm) {
    const r = Math.max(1, s / pxMm), on = (at(0) + at(0.4 * r) + at(-0.4 * r)) / 3;
    const left = (at(1.2 * r) + at(1.8 * r)) / 2, right = (at(-1.2 * r) + at(-1.8 * r)) / 2;
    contrast = Math.max(contrast, Math.min(left, right) - on);
  }
  const R = Math.max(2, o.broadMm / pxMm);
  const bl = (at(R) + at(1.6 * R) + at(2.2 * R)) / 3, br = (at(-R) + at(-1.6 * R) + at(-2.2 * R)) / 3;
  return { contrast, step: Math.abs(bl - br), dark: Math.min(bl, br) };
}

const arc = pts => { const d = [0]; for (let k = 1; k < pts.length; k++) d.push(d[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y)); return d; };

/** Per point class (CLASS) of a path resampled every pixel, smoothed by majority within `smoothMm`. */
export function classifyPath(R, L, w, h, pxMm, o = MASS_DEFAULTS) { return classifyPathDetail(R, L, w, h, pxMm, o).cls; }

/** classifyPath with each point's own contrast (L*) too: { cls, contrast }. */
export function classifyPathDetail(R, L, w, h, pxMm, o = MASS_DEFAULTS) {
  const n = R.length, raw = new Uint8Array(n), contrast = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = R[Math.max(0, k - 2)], b = R[Math.min(n - 1, k + 2)], tl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const c = crossProfile(L, w, h, R[k], -(b.y - a.y) / tl, (b.x - a.x) / tl, pxMm, o);
    contrast[k] = c.contrast;
    raw[k] = c.contrast >= o.penContrast ? CLASS.pen : c.step >= o.stepContrast ? CLASS.mass : CLASS.faint;
  }
  const half = Math.max(1, Math.round(o.smoothMm / pxMm)), out = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const c = [0, 0, 0]; for (let j = Math.max(0, k - half); j <= Math.min(n - 1, k + half); j++) c[raw[j]]++;
    out[k] = c[CLASS.mass] > c[CLASS.pen] && c[CLASS.mass] >= c[CLASS.faint] ? CLASS.mass : c[CLASS.pen] >= c[CLASS.faint] ? CLASS.pen : CLASS.faint;
  }
  return { cls: out, contrast };
}

const runsOf = (cls, value) => { const runs = []; for (let i = 0; i < cls.length;) { if (cls[i] !== value) { i++; continue; } let j = i; while (j + 1 < cls.length && cls[j + 1] === value) j++; runs.push([i, j]); i = j + 1; } return runs; };

/**
 * Cut the mass edges out of `lines` ({ points: [{x, y, ...}] }, any extra fields kept per point).
 * A mass-edge run of a line that is long and smooth as a whole is kept: structure.
 * @returns { lines, stats } stats { lengthPx, massBefore, massAfter } the share (0..1) of length on a mass edge
 */
export function cutMassEdges(lines, L, w, h, pxMm, o = MASS_DEFAULTS) {
  const out = []; let len = 0, massLen = 0, keptLen = 0, keptMass = 0, cut = 0, kept = 0;
  for (const g of lines) {
    const R = resample(g.points, 1); if (R.length < 2) continue;
    const cls = classifyPath(R, L, w, h, pxMm, o), d = arc(R), total = d.at(-1);
    const mass = runsOf(cls, CLASS.mass), massPx = mass.reduce((s, [a, b]) => s + d[b] - d[a], 0);
    len += total; massLen += massPx;
    const structural = total * pxMm >= o.structureMm && turning(R) / pxMm <= o.structureDegPerMm;
    const drop = new Uint8Array(R.length);
    if (!structural) for (const [a, b] of mass) for (let k = a; k <= b; k++) drop[k] = 1;
    else kept++;
    // the pieces between the dropped runs
    let start = -1;
    for (let k = 0; k <= R.length; k++) {
      const live = k < R.length && !drop[k];
      if (live && start < 0) start = k;
      if (!live && start >= 0) {
        const piece = R.slice(start, k), pl = arc(piece).at(-1);
        if (piece.length >= 2 && pl * pxMm >= 0.3) {
          out.push({ ...g, points: piece, cls: cls.slice(start, k) });
          keptLen += pl; for (let j = start; j < k; j++) if (cls[j] === CLASS.mass && j > start) keptMass += d[j] - d[j - 1];
        }
        start = -1;
      }
    }
    if (mass.length && !structural) cut++;
  }
  return { lines: out, stats: { lines: lines.length, pieces: out.length, cut, structural: kept, lengthPx: len, massBefore: len ? massLen / len : 0, massAfter: keptLen ? keptMass / keptLen : 0 } };
}
