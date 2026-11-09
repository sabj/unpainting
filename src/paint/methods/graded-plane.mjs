// The gradient of a wash (--gradedlanes). A painter grades a wash smoothly from one side to the other, dipping a little
// weaker or stronger for each lane, with the lanes lying across the gradient. So a passage takes one plane through its
// own demand: dips that followed the demand lane by lane and chunk by chunk printed the flat brush's rectangle wherever
// one chunk came out stronger than its neighbours. A passage the plane does not describe is not graded at all; what it
// holds beyond the plane is left to the smaller shapes laid over it. Planning only, from the plan's own demand.

/**
 * The least-squares plane through G over a passage's cells, or null when the passage has no gradient to follow: the plane
 * spans under `minSpan` of the mean across the passage, or explains under `minFit` of the demand's variance.
 * @returns {{angle: number, span: number, fit: number, at: (i: number) => number} | null} angle is the direction of the
 *   plane's level lines in radians, along which lanes run; at(i) is the plane's demand at cell i, never below 0.
 */
export function gradientPlane(list, G, w, { minSpan = 0.25, minFit = 0.25 } = {}) {
  const c = list.length;
  if (c < 3) return null;
  let sx = 0, sy = 0, sg = 0;
  for (const i of list) { sx += i % w; sy += Math.floor(i / w); sg += G[i]; }
  const mx = sx / c, my = sy / c, mg = sg / c;
  if (!(mg > 0)) return null;
  let xx = 0, yy = 0, xy = 0, xg = 0, yg = 0, gg = 0;
  for (const i of list) {
    const x = i % w - mx, y = Math.floor(i / w) - my, g = G[i] - mg;
    xx += x * x; yy += y * y; xy += x * y; xg += x * g; yg += y * g; gg += g * g;
  }
  const det = xx * yy - xy * xy;
  if (!(Math.abs(det) > 1e-9) || !(gg > 0)) return null;
  const a = (xg * yy - yg * xy) / det, b = (yg * xx - xg * xy) / det;
  if (!(Math.hypot(a, b) > 0)) return null;
  const fit = (a * xg + b * yg) / gg;
  let lo = Infinity, hi = -Infinity;
  for (const i of list) { const t = (i % w - mx) * a + (Math.floor(i / w) - my) * b; if (t < lo) lo = t; if (t > hi) hi = t; }
  const span = (hi - lo) / mg;
  if (span < minSpan || fit < minFit) return null;
  return { angle: Math.atan2(a, -b), span, fit, at: i => Math.max(0, mg + (i % w - mx) * a + (Math.floor(i / w) - my) * b) };
}
