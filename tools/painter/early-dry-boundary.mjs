// Change timing only at an already-separated ordinary numeric dry boundary.
export function earlyDryBoundary({minValue = 0, value, fullBoundary, leaveWet = false}) {
  if (!Number.isInteger(minValue) || minValue < 0) throw Error('earlydryvalue must be a nonnegative integer');
  return minValue > 0 && value >= minValue && fullBoundary && !leaveWet;
}
