// The touch-ups in default mode (--touchpoints > 0): one step-back after the planned layers dry (src/paint/step-backs.mjs).
// Each broad planning family (at least 0.08% of the sheet) is compared with the subject once, as one mean; a family that
// reads at least one value step lighter than the subject gets one glaze of the mixed lack. No second round: a second
// look at what the first corrected is look, correct, look again.
//
// Darken only. Lifting was considered (art-teacher review, section 2) and left out: the simulator has no physical lift
// of dried pigment (a damp brush or tissue taking a share of the non-staining paint back off the sheet), so a lifting
// touch-up would need a new removal law and its own strength, which is not one physical rule. A family that reads
// darker than the subject is left alone.

/** Optical density the family still lacks per channel: the subject's minus the sheet's, never below zero. */
export function touchLack(subjectDensity, sheetDensity) {
  return subjectDensity.map((v, q) => Math.max(0, v - sheetDensity[q]));
}

/** A family is corrected only when the sheet reads at least one value step (of the subject's own nine-step scale) lighter
 *  than the subject: a smaller difference is inside the value the plan gave it. Luminances 0..1. */
export function touchDue(sheetLum, subjectLum, valueStep) {
  if (!(valueStep > 0)) throw new Error('touch-up: the subject\'s value step is needed');
  return sheetLum - subjectLum >= valueStep;
}
