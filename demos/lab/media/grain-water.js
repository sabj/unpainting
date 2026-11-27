// Generated from src/media/grain-water.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Grain sorting needs a connected film above the surface fibres. Its hydraulic
// conductance falls as depth cubed; in a deep pool the exposed bed limits it.
// The first 0.03 mm is held among fibres (the sheet's default residual film).
// 0.06 mm is three 20 um fibre spacings (the sheet's flowDepth scale): a
// coarse-grained collection length, not a measured pigment-specific constant.
// This is a mobility, integrated over wet time by settling/slide, not a multiplier
// on the final dry colour. Keep gpu/stepfull.wgsl's grainMobilityG in sync.
export const GRAIN_PATH_MM = 0.06;
const HELD_FILM_MM = 0.03;
export function grainMobility(filmMm) {
  const h = Math.max(0, filmMm - HELD_FILM_MM), h3 = h * h * h;
  return h3 / (h3 + GRAIN_PATH_MM ** 3);
}

// Meniscus forcing increases as a pool recedes (1/h), but lateral motion stops
// when the film disconnects (h^3). Together they peak at a receding glossy film,
// and vanish as h^2 in damp paint. 0.12 mm retains the slide's rate scale.
export function grainSlide(filmMm) {
  const h = Math.max(0, filmMm - HELD_FILM_MM);
  return 0.12 * h * h / (h * h * h + GRAIN_PATH_MM ** 3);
}

// Convert the legacy slide control to Stokes-limited motion down a physical
// slope: v * (0.1 mm relief unit) / dx^2, relative to slideRate's default
// 0.4 * (0.26 mm / dx)^2. Pigment retains its own particle drag.
export const grainDrag = vMmS => vMmS * 0.1 / (0.4 * 0.26 ** 2);
