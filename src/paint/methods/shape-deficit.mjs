// A passage's load from a shape-level comparison: the difference between the shape's mean in the plan and on the
// sheet, never cell by cell, with even pressure along the stroke.
//
// planMean, onMean: mean amount of each pigment over the shape (from the guard's look), length K.
// mix: the passage's mix direction (pigment shares), or null for a single-pigment pass on `pigment`.

/** How much of the passage's colour the shape still lacks, as one number for the whole shape. */
export function shapeDeficit(planMean, onMean, { mix = null, pigment = 0 } = {}) {
  if (!mix) return Math.max(0, (planMean[pigment] ?? 0) - (onMean[pigment] ?? 0));
  let d = 0, nn = 0;
  for (let j = 0; j < mix.length; j++) {
    nn += mix[j] * mix[j];
    if (mix[j] > 0) d += Math.max(0, (planMean[j] ?? 0) - (onMean[j] ?? 0)) * mix[j];
  }
  return d / Math.max(1e-9, nn);
}

/** The passage's charge factor: what the shape lacks now over what the plan asked of this pass, 0 to 2, 1 if unknown. */
export function shapeCharge(lack, asked) {
  return asked > 1e-6 ? Math.max(0, Math.min(2, lack / asked)) : 1;
}

/** The mean still-owed colour of a shape, per pigment (for a glaze recharged after a keep-out cut). */
export function shapeOwedColour(planMean, onMean) {
  return planMean.map((v, j) => Math.max(0, v - (onMean[j] ?? 0)));
}
