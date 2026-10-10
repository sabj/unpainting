/** Same explicit glaze pass count in reference calibration and actual numerical execution. */
export function numericalGlazePasses(technique, requested = 2) {
  if (!Number.isFinite(requested) || requested < 1 || !Number.isInteger(requested)) throw new RangeError('glazepasses must be a positive integer');
  return technique.name === 'glazed' ? { ...technique, passes: requested } : technique;
}
