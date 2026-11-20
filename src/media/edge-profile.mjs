// the mean of the edge flux profile over [a, b] mm from the line, for a band `E` mm deep: 1/sqrt(x/E + c) less its
// value at E, scaled so its mean over the band is 1 (so edgeEvap is the band's mean extra rate whatever the cell size)
const C = 0.02, TAIL = 1 / Math.sqrt(1 + C), NORM = 2 * (Math.sqrt(1 + C) - Math.sqrt(C)) - TAIL;
export function edgeProfile(a, b, E) {
  if (a >= E) return 0;
  // a cell that reaches past the band is averaged over its whole width: the profile is zero beyond E
  const c = Math.min(b, E), u = 2 * (Math.sqrt(c / E + C) - Math.sqrt(a / E + C)) * E - TAIL * (c - a);
  return Math.max(0, u / NORM / (b - a));
}

