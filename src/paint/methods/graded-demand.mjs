// Graded demand for a value-plan passage: one low-order plane per passage, fitted to the plan's own demand before any
// paint, in place of one flat amount. A big wash varies along its sweep (sky darker at the top, a wall lit from one
// side) the way a painter grades it: the brush is loaded a little stronger or weaker for each load, and pressed a
// little heavier or lighter along one load. The plane is three numbers (a centre, two slopes) plus a shift that keeps
// its mean over the passage at exactly 1, so the passage's booking is unchanged; it is clamped to GRADED_RANGE, the
// strongest grade one wash carries. It can hold no structure finer than the passage itself: no per-cell field reaches
// the painter (sh.graded stays null), and nothing is read from the target while painting.
import { softRing } from './soft-edges.mjs';

export const GRADED_RANGE = Object.freeze({ lo: 0.5, hi: 1.5 });
// The sweep's own pressure bounds (paint-plate's land/body/lift profile keeps the same ones).
const PRESSURE = Object.freeze({ min: 0.18, max: 1.2 });
const MEAN_ROUNDS = 8, MEAN_TOL = 1e-4;

/** The factor at a continuous sheet point (cell centres sit at x + .5, y + .5). */
export function planeAt(plane, x, y) {
  const f = 1 + plane.shift + plane.gx * (x - plane.cx) + plane.gy * (y - plane.cy);
  return f < plane.lo ? plane.lo : f > plane.hi ? plane.hi : f;
}
export const planeAtCell = (plane, i, w) => planeAt(plane, i % w + .5, Math.floor(i / w) + .5);

/**
 * Least-squares plane of G over the passage's cells, as a factor of the passage mean: null for under 4 cells or no
 * demand. The clamp and the mean-1 shift are solved together (the clamped mean is monotone in the shift).
 */
export function fitGradedPlane(list, G, w, { lo = GRADED_RANGE.lo, hi = GRADED_RANGE.hi } = {}) {
  const c = list.length;
  if (c < 4) return null;
  let sx = 0, sy = 0, sg = 0;
  for (const i of list) { sx += i % w + .5; sy += Math.floor(i / w) + .5; sg += G[i]; }
  const cx = sx / c, cy = sy / c, m = sg / c;
  if (!(m > 1e-9)) return null;
  let sxx = 0, syy = 0, sxy = 0, sxg = 0, syg = 0;
  for (const i of list) {
    const x = i % w + .5 - cx, y = Math.floor(i / w) + .5 - cy, g = G[i] - m;
    sxx += x * x; syy += y * y; sxy += x * y; sxg += x * g; syg += y * g;
  }
  const det = sxx * syy - sxy * sxy;
  let gx = 0, gy = 0;
  if (det > 1e-6 * Math.max(1, sxx * syy)) { gx = (syy * sxg - sxy * syg) / det; gy = (sxx * syg - sxy * sxg) / det; }
  else if (sxx > 1e-9) gx = sxg / sxx;
  else if (syy > 1e-9) gy = syg / syy;
  const plane = { cx, cy, gx: gx / m, gy: gy / m, shift: 0, lo, hi, range: [1, 1] };
  if (gx === 0 && gy === 0) return plane;
  for (let round = 0; round < MEAN_ROUNDS; round++) {
    let s = 0;
    for (const i of list) s += planeAtCell(plane, i, w);
    const mean = s / c;
    if (Math.abs(mean - 1) < MEAN_TOL) break;
    plane.shift -= mean - 1;
  }
  let fmin = Infinity, fmax = -Infinity;
  for (const i of list) { const f = planeAtCell(plane, i, w); if (f < fmin) fmin = f; if (f > fmax) fmax = f; }
  plane.range = [fmin, fmax];
  return plane;
}

/**
 * One load of a sweep, its pressure shaped so that the load's charge factor times the pressure follows the plane at
 * every point: the load is dipped at the plane's mean under it (factor), and the hand presses heavier toward the
 * darker end. Points are at the painting scale (sheet cells times scale).
 */
export function gradeLoadPressure(points, plane, factor, scale = 1) {
  if (!plane || !(factor > 1e-6)) return points;
  return points.map(q => {
    const p = (q.p ?? 1) * planeAt(plane, q.x / scale, q.y / scale) / factor;
    return { ...q, p: p < PRESSURE.min ? PRESSURE.min : p > PRESSURE.max ? PRESSURE.max : p };
  });
}

/**
 * The clip for a crisp passage with soft boundary cells: its mask plus a ring of `radius` cells past the soft cells
 * (never past a hard cell, never into a reserved light), so the bead runs out there and the edge takes the brush's own
 * fall-off instead of a cut. Returns the mask itself when there is no soft cell.
 */
export function softClipMask(mask, edges, w, h, radius, protect = null) {
  const soft = edges?.softCells;
  if (!soft?.length || !(radius > 0)) return { clip: mask, ring: 0 };
  const ring = softRing(mask, soft, edges.hardCells ?? [], w, h, radius, protect);
  let count = 0;
  const clip = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) { if (mask[i]) clip[i] = 1; else if (ring[i]) { clip[i] = 1; count++; } }
  return count ? { clip, ring: count } : { clip: mask, ring: 0 };
}
