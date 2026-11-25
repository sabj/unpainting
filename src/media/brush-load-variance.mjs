// Uneven pigment in the brush: a smooth, seeded concentration factor across the bristles (faint streaks along a
// stroke) and one factor per load (each dip carries a little more or less pigment). Both are pure functions of the
// brush seed and the load index, so CPU, GPU upload and replays agree. Lane factors are normalised to a weighted
// mean of 1 so the total pigment in a load is unchanged.

export const LANE_SPREAD = 0.25, LOAD_SPREAD = 0.15;

function unit(seed, a, b) { // deterministic hash to [0, 1)
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(a | 0, 0x85ebca6b) ^ Math.imul(b | 0, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Per-lane factors in about 1 +/- LANE_SPREAD, smooth over a few lanes, weighted mean exactly 1. */
export function laneFactors(seed, loadIndex, weights) {
  const n = weights.length, knots = 4, step = Math.max(1, (n - 1) / knots);
  const raw = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const t = j / step, i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f);
    const a = unit(seed, loadIndex, i) * 2 - 1, b = unit(seed, loadIndex, i + 1) * 2 - 1;
    raw[j] = 1 + LANE_SPREAD * (a + (b - a) * s);
  }
  let sw = 0, sm = 0;
  for (let j = 0; j < n; j++) { sw += weights[j]; sm += weights[j] * raw[j]; }
  const norm = sm > 0 ? sw / sm : 1;
  return raw.map(v => v * norm);
}

/** One factor in 1 +/- LOAD_SPREAD for the whole load. */
export function loadFactor(seed, loadIndex) { return 1 + LOAD_SPREAD * (unit(seed, loadIndex, 9973) * 2 - 1); }
