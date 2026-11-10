// Final darks (--finaldarks 1) as brush marks, not a stencil of the subject's darks (art-teacher review, section 2).
// The accent families are still planned from the reference and still get one shape-level look each at the end. What
// changes is what gets painted:
//   - an accent piece is at least one touch of the detail brush's tip (brushes.json roles.detail): a piece a brush
//     cannot make is not an accent;
//   - every dark mark is exactly one tip wide, never narrower, so a mark is a touch or a stroke of the point;
//   - the marks are not clipped to the accent cells. They are kept off the plan's reserved lights only, as a painter
//     paints a pupil round its catchlight.
import { footprintMm2 } from './brush-footprint.mjs';

/** The smallest accent piece in mm2: one touch of a tip tipMm wide. */
export const tipTouchMm2 = tipMm => footprintMm2(tipMm);

/** The final-dark paths with every mark one tip (tipR sheet cells) wide. */
export function tipMarks(paths, tipR) {
  if (!(tipR > 0)) throw new Error(`final darks: tip radius must be positive, got ${tipR}`);
  return paths.map(pts => pts.map(p => ({ ...p, r: tipR })));
}

/** Where the dark marks may land: everywhere but the plan's reserved lights (0/1 per plan cell), or null for anywhere. */
export function darkClip(protectedCells) {
  return protectedCells ? Uint8Array.from(protectedCells, v => (v ? 0 : 1)) : null;
}
