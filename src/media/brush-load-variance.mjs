// A stirred load has a small concentration gradient across the tuft, not independent stripes in its lanes. The
// gradient is seeded per dip; its weighted mean is 1, so dipping takes exactly the requested concentration. Changes
// along a stroke come from water and pigment leaving the finite tips and belly (brush.mjs), never a painted pattern.
// CPU, GPU upload and replays all start with these same masses.

export const LANE_SPREAD = 0.03;

function unit(seed, a, b) { // deterministic hash to [0, 1)
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(a | 0, 0x85ebca6b) ^ Math.imul(b | 0, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** One smooth gradient across the whole tuft, weighted mean exactly 1. */
export function laneFactors(seed, loadIndex, weights) {
  const n = weights.length, a = unit(seed, loadIndex, 0) * 2 - 1, b = unit(seed, loadIndex, 1) * 2 - 1;
  const raw = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const f = j / Math.max(1, n - 1), s = f * f * (3 - 2 * f);
    raw[j] = 1 + LANE_SPREAD * (a + (b - a) * s);
  }
  let sw = 0, sm = 0;
  for (let j = 0; j < n; j++) { sw += weights[j]; sm += weights[j] * raw[j]; }
  const norm = sm > 0 ? sw / sm : 1;
  return raw.map(v => v * norm);
}
