// The scrap a painter makes before trusting a wash of many lanes: one passage of N lanes of one dip, laid one into the
// next on dry paper with no drying between them, left to dry, and read across the lanes. A flat wash should dry with
// no lane line; a graded wash (each lane dipped at an even step weaker) should change one way with no step at a seam.
// The brush, the dip, the stroke and the drying are the caller's own (as in scrap-join.mjs), so the wash is laid with
// exactly the instruments a sheet is painted with. Nothing here reads a sheet being painted, or a target.
//
// The pass marks, fixed before any run (teacher-wet-edges.md, checks 1 and 3):
//   flat:   every seam row lies inside the range the lane bodies span (no seam lighter or darker than a lane's body);
//   graded: the lane bodies change one way, and every seam row lies inside the range of the two lanes beside it;
//   both:   the pigment that left the brushes is the pigment on the paper.
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness, totals } from '../../media/sheet.mjs';

/** Rows of an N-lane wash: lane centres at `pitch`, each lane's body (the middle half of what lies between its seams)
 *  and each seam (every row a ragged inner edge of either lane beside it reaches). */
export function washRows({ lanes, half, edge, pitch, margin }) {
  if (!(lanes >= 2) || !(half > 0) || !(edge >= 0) || !(pitch > 0 && pitch <= 2 * half + edge) || !(margin >= 0)) throw new RangeError('scrap wash: lanes, half, edge, pitch and margin must make touching lanes');
  const ys = Array.from({ length: lanes }, (_, k) => margin + half + k * pitch);
  const seams = ys.slice(1).map((y, k) => [Math.floor(y - half - edge), Math.ceil(ys[k] + half + edge)]);
  const bodies = ys.map((y, k) => {
    const lo = k ? seams[k - 1][1] + 1 : y - half + edge, hi = k < lanes - 1 ? seams[k][0] - 1 : y + half - edge;
    return [Math.ceil(lo + (hi - lo) / 4), Math.floor(hi - (hi - lo) / 4)];
  });
  if (bodies.some(([a, b]) => b < a)) throw new RangeError('scrap wash: the lanes overlap too far to have a body between their seams');
  return { ys, seams, bodies, height: Math.ceil(ys.at(-1) + half + margin) };
}

/**
 * Lay the wash and read it.
 * @param {object} env lanes, half, edge, pitch (cells); length (cells); grade: concentration steps down by this share of
 *   the first dip per lane (0: flat). pigment, physics, paperOptions: the scrap. brush(seed), loaded(brush),
 *   dipBrush(brush, factor), path(x0, x1, y), stroke, step, dry, flowEvery, settle, dryOptions: the caller's instruments.
 * @returns {{ profile, rows, bodies: {min, max, mean}[], seams: {min, max}[], given, onSheet, even, graded, conserved }}
 */
export function scrapWash({ lanes, half, edge, pitch, length, grade = 0, pigment, physics, paperOptions, brush, loaded, dipBrush, path, stroke, step, dry, flowEvery = 24, settle = 60, dryOptions = { levelMax: 140, dt: 2 } }) {
  const margin = Math.ceil(half + edge + 8), rows = washRows({ lanes, half, edge, pitch, margin });
  const w = Math.ceil(length + 2 * margin), h = rows.height, x0 = margin, x1 = margin + length;
  const sheet = createSheet(makePaper(w, h, paperOptions), [pigment]);
  let given = 0;
  rows.ys.forEach((y, k) => {
    const b = brush(k + 1); dipBrush(b, 1 - grade * k);
    const before = loaded(b);
    // lanes alternate direction, as a painter carries the bead
    stroke(b, sheet, k % 2 ? path(x1, x0, y) : path(x0, x1, y), { between: st => { if (flowEvery > 0 && st % flowEvery === 0) step(sheet, physics); } });
    given += before - loaded(b);
  });
  for (let q = 0; q < settle; q++) step(sheet, physics);
  dry(sheet, 20000, physics, dryOptions);
  const th = thickness(sheet)[0], c0 = Math.ceil(x0 + length / 4), c1 = Math.floor(x1 - length / 4), profile = new Float64Array(h);
  for (let y = 0; y < h; y++) { let s = 0; for (let x = c0; x <= c1; x++) s += th[y * w + x]; profile[y] = s / (c1 - c0 + 1); }
  const span = ([lo, hi]) => { let min = Infinity, max = -Infinity, sum = 0, n = 0; for (let y = lo; y <= hi; y++) { min = Math.min(min, profile[y]); max = Math.max(max, profile[y]); sum += profile[y]; n++; } return { min, max, mean: sum / n }; };
  const bodies = rows.bodies.map(span), seams = rows.seams.map(span);
  const lo = Math.min(...bodies.map(b => b.min)), hi = Math.max(...bodies.map(b => b.max));
  const even = seams.every(s => s.min >= lo && s.max <= hi);
  const step1 = bodies.slice(1).map((b, k) => Math.sign(b.mean - bodies[k].mean));
  const graded = step1.every(d => d === step1[0] && d !== 0) && seams.every((s, k) => s.min >= Math.min(bodies[k].min, bodies[k + 1].min) && s.max <= Math.max(bodies[k].max, bodies[k + 1].max));
  const onSheet = totals(sheet).pig[0];
  return { profile, rows, bodies, seams, given, onSheet, even, graded, conserved: Math.abs(onSheet - given) <= 1e-4 * Math.max(1e-9, given) };
}
