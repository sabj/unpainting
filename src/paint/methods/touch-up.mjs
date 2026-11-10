// The touch-up rounds in default mode (--touchpoints, two fixed rounds, Sam's default): after the planned layers dry,
// each broad planning family (at least 0.08% of the sheet) is compared with the subject as one mean, and a family that
// reads lighter than the subject gets one glaze. Two rounds, never repeated until the sheet matches.
//
// Darken only. Lifting was considered (art-teacher review, section 2) and left out: the simulator has no physical lift
// of dried pigment (a damp brush or tissue taking a share of the non-staining paint back off the sheet), so a lifting
// touch-up would need a new removal law and its own strength, which is not one physical rule. A family that reads
// darker than the subject is left alone.

/** Optical density the family still lacks per channel: the subject's minus the sheet's, never below zero. */
export function touchLack(subjectDensity, sheetDensity) {
  return subjectDensity.map((v, q) => Math.max(0, v - sheetDensity[q]));
}
