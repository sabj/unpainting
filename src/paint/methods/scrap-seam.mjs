// The scrap for two loads of one wash laid edge to edge (033 drying2): a painter who reloads in the middle of a wash
// lifts the brush, dips, and comes back into the wet edge of the last load, and the two loads melt. Laid as separate
// strokes (each lands and lifts), the second at once into the first while it is wet, left to dry, read across the seam.
// `along`: the second load continues the first's lane (a fresh load where a lane changes strength); `beside`: it is
// the next lane, at the caller's pitch. The brush, dip, stroke and drying are the caller's own (as in scrap-wash.mjs).
// Nothing here reads a sheet being painted, or a target.
//
// The pass mark, stated before any run (STATUS-033-drying2.md 16:55):
//   1. no line: every row of the seam zone (within one brush radius of the planned seam) lies inside the range the two
//      bodies span (the middle half of each load clear of the seam), to within one L* (restated 17:00: first stated
//      with no tolerance, it failed its own control laid with no land or lift taper at all, 3 of 3 by 1.0-2.4% of
//      thickness, the wash's own grain over a zone wider than the bodies);
//   2. no step sharper than the brush's own edge: the sharpest change over a quarter-brush window in the seam zone, as
//      a share of the change between the bodies, is no more than the sharpest such change at the second stroke's own
//      edge on dry paper (its lifted end along a lane, its outer side beside one) as a share of its body;
//   3. the pigment that left the brushes is on the paper.
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness, totals } from '../../media/sheet.mjs';
import { renderLayers } from '../../media/km.mjs';
import { lightness } from '../../eval/plan-values.mjs';

// a line a viewer can see: the seam lighter or darker than both bodies by more than this many L* (one just noticeable
// difference)
export const SEAM_MARK = Object.freeze({ lineL: 1 });

/**
 * Lay two loads and read the seam.
 * @param {object} env layout: 'along' | 'beside'; fA, fB: the two dips' strengths; r: brush radius (cells); half: the
 *   half-width it lays; pitch: lane pitch for 'beside'; length: one load's length (cells). pigment, physics,
 *   paperOptions, brush(seed), loaded(brush), dipBrush(brush, f), path(x0, x1, y), stroke, step, dry, flowEvery,
 *   settle, dryOptions: the caller's instruments.
 * @returns {{ profile, seam, bodyA, bodyB, zone, step, edge, grade, given, onSheet, line, sharp, conserved, pass }}
 */
export function scrapSeam({ paperRGB = [252, 251, 248], layout = 'along', fA, fB, r, half, pitch, length, pigment, physics, paperOptions, brush, loaded, dipBrush, path, stroke, step, dry, flowEvery = 12, settle = 60, dryOptions = { levelMax: 140, dt: 2 } }) {
  if (layout !== 'along' && layout !== 'beside') throw new RangeError(`scrap seam: unknown layout ${layout}`);
  if (!(fA > 0) || !(fB > 0) || !(r > 0) || !(half > 0) || !(length > 4 * r)) throw new RangeError('scrap seam: two positive dips, a brush and loads longer than two brush widths');
  if (layout === 'beside' && !(pitch > 0 && pitch < 2 * half)) throw new RangeError('scrap seam: beside needs lanes that touch');
  const margin = Math.ceil(2 * r), along = layout === 'along';
  const w = Math.ceil((along ? 2 : 1) * length + 2 * margin);
  const yA = margin + half, yB = along ? yA : yA + pitch, h = Math.ceil(yB + half + margin);
  const sheet = createSheet(makePaper(w, h, paperOptions), [pigment]);
  const x0 = margin, xm = margin + length, x1 = margin + (along ? 2 : 1) * length;
  let given = 0;
  const lay = (f, from, to, y, seed) => {
    const b = brush(seed); dipBrush(b, f); const before = loaded(b);
    stroke(b, sheet, path(from, to, y), { between: st => { if (flowEvery > 0 && st % flowEvery === 0) step(sheet, physics); } });
    given += before - loaded(b);
  };
  if (along) { lay(fA, x0, xm, yA, 1); lay(fB, xm, x1, yA, 2); }
  else { lay(fA, x0, xm, yA, 1); lay(fB, xm, x0, yB, 2); }   // the next lane comes back the other way
  for (let q = 0; q < settle; q++) step(sheet, physics);
  dry(sheet, 20000, physics, dryOptions);
  const layer = thickness(sheet), th = layer[0];
  const paperBuf = new Uint8ClampedArray(w * h * 3); for (let i = 0; i < w * h; i++) paperBuf.set(paperRGB, 3 * i);
  const rgb = renderLayers([layer], [pigment], paperBuf, w * h, 1), Lc = i => lightness(rgb[3 * i], rgb[3 * i + 1], rgb[3 * i + 2]);
  // the profile across the seam: along a lane, x over the lane's middle half; beside, y over the loads' middle half
  const read = fn => {
    if (along) { const a = Math.ceil(yA - half / 2), z = Math.floor(yA + half / 2), out = new Float64Array(w); for (let x = 0; x < w; x++) { let s = 0; for (let y = a; y <= z; y++) s += fn(y * w + x); out[x] = s / (z - a + 1); } return out; }
    const a = Math.ceil(x0 + length / 4), z = Math.floor(xm - length / 4), out = new Float64Array(h); for (let y = 0; y < h; y++) { let s = 0; for (let x = a; x <= z; x++) s += fn(y * w + x); out[y] = s / (z - a + 1); } return out;
  };
  const profile = read(i => th[i]), lProfile = read(Lc);
  const seam = along ? xm : (yA + yB) / 2, outer = along ? x1 : yB + half;   // the second stroke's own edge on dry paper
  const span = (lo, hi, p = profile) => { let min = Infinity, max = -Infinity, sum = 0, n = 0; for (let i = Math.ceil(lo); i <= hi; i++) { min = Math.min(min, p[i]); max = Math.max(max, p[i]); sum += p[i]; n++; } return { min, max, mean: sum / n }; };
  // bodies: the middle half of each load clear of the seam zone (and, beside, of each lane's outer side)
  const aSpan = along ? [x0 + r, seam - r] : [yA - half / 2, seam - r], bSpan = along ? [seam + r, x1 - 2 * r] : [seam + r, yB + half / 2];
  const bodyOf = ([lo, hi], p) => span(lo + (hi - lo) / 4, hi - (hi - lo) / 4, p);
  const bodyA = bodyOf(aSpan), bodyB = bodyOf(bSpan), zone = span(seam - r, seam + r);
  const lA = bodyOf(aSpan, lProfile), lB = bodyOf(bSpan, lProfile), lZone = span(seam - r, seam + r, lProfile);
  const q = Math.max(1, Math.round(r / 2));
  const sharpest = (lo, hi) => { let s = 0; for (let i = Math.round(lo); i + q <= hi; i++) s = Math.max(s, Math.abs(profile[i + q] - profile[i])); return s; };
  const change = Math.abs(bodyB.mean - bodyA.mean);
  // the line, in L*: how far the seam zone goes past the range both bodies span (lighter is higher L*)
  const lighter = lZone.max - Math.max(lA.max, lB.max), darker = Math.min(lA.min, lB.min) - lZone.min;
  const lineL = Math.max(0, lighter, darker), line = lineL > SEAM_MARK.lineL;
  // the step: a share of the change between the bodies (an all-equal pair has no change: its step is the grain against
  // the body, read the same way as the brush's edge)
  const stepAbs = sharpest(seam - r, seam + r), stepShare = stepAbs / Math.max(change, 1e-9);
  const edge = sharpest(outer - 2 * r, outer + r) / Math.max(1e-9, bodyB.mean);
  const sharp = change > 0.02 * Math.max(bodyA.mean, bodyB.mean) ? stepShare > edge : false;
  const onSheet = totals(sheet).pig[0], conserved = Math.abs(onSheet - given) <= 1e-4 * Math.max(1e-9, given);
  return { profile, lProfile, seam, bodyA, bodyB, zone, lineL, lighter, darker, step: stepShare, stepAbs, edge, grade: 0.25, change, given, onSheet, line, sharp, conserved, pass: !line && !sharp && conserved };
}
