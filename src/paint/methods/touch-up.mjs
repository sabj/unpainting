// The touch-ups in default mode (--touchpoints R): R rounds fixed before the first mark, each a step-back after the last
// layer dries (src/paint/step-backs.mjs). Each broad planning family (at least 0.08% of the sheet) is compared with the
// subject once a round, as one mean. A family the sheet still shows visibly lighter, or visibly less chromatic, than the
// subject gets one glaze of the mixed lack, sized from the measured gap through the sheet's own film optics. A round
// that corrected nothing leaves the sheet as it was, so the next round is not taken.
//
// Darken only. Lifting was considered (art-teacher review, section 2) and left out: the simulator has no physical lift
// of dried pigment (a damp brush or tissue taking a share of the non-staining paint back off the sheet), so a lifting
// touch-up would need a new removal law and its own strength, which is not one physical rule. A family that reads
// darker than the subject is left alone.
import { labOf } from '../../eval/colour.mjs';

/** A gap of this many L* or C* reads as a difference: about the smallest lightness step the eye sees. */
export const TOUCH_VISIBLE = 2;

/** Optical density the family still lacks per channel: the subject's minus the sheet's, never below zero. */
export function touchLack(subjectDensity, sheetDensity) {
  return subjectDensity.map((v, q) => Math.max(0, v - sheetDensity[q]));
}

/** How far the sheet's mean colour is from the subject's, in the perceptual terms a glaze can close: how much lighter it
 *  is (L*) and how much less chromatic (C*). Colours are 8-bit RGB means read against the paper. */
export function touchGap(sheetRGB, subjectRGB, paperRGB) {
  const [Ls, as, bs] = labOf(sheetRGB, 0, paperRGB), [Lt, at, bt] = labOf(subjectRGB, 0, paperRGB);
  return { lighter: Ls - Lt, lessChromatic: Math.hypot(at, bt) - Math.hypot(as, bs) };
}

/** A family is corrected only when the sheet reads lighter or less chromatic than the subject by a visible step. Darker
 *  or more chromatic than the subject is never corrected (no lifting). */
export function touchDue(gap) {
  return gap.lighter >= TOUCH_VISIBLE || gap.lessChromatic >= TOUCH_VISIBLE;
}

/** Each pigment's density per unit of paint for a glaze: light crosses a film twice, so a film of amount x has density
 *  2 K x (src/paint/methods/mass-tone.mjs). Unmixing a density lack on these directions gives the amounts that lay it. */
export function touchFilmUnits(pigments) {
  return pigments.map(p => Array.from(p.K, v => 2 * v));
}
