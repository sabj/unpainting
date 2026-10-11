// Hand painting on the sheet and scratch paper uses the same finite brush load.
// Above saturation, grow the belly linearly: wetter washes carry more water without
// the old quadratic growth at the top of the Water slider. Dry loads stay small.
export function handBrushOptions(t, { dpi = 60, res = dpi / 60, seed = 3 } = {}) {
  const radius = t.sizeMm / 2 / 25.4 * dpi, flat = t.tool === 'flat';
  const water = Math.max(0, t.water);
  return { flat, radius, bristles: Math.max(12, Math.round(radius * (flat ? 2.3 : 2))),
    capacity: 32 * res, belly: 1 + 4 * water * Math.min(water, 1),
    // Wet hairs wick quickly from the finite belly; blotted loads retain slow dry-brush feed.
    feed: water >= 0.4 ? 0.6 : 0.06, give: 0.8, free: 0.4, film: 0.25, seed, model: t.model ?? 'row' };
}

export const brushWater = b => b.resW + b.hairs.reduce((sum, h) => sum + h.water, 0);

// Called only between visitor strokes; recorded tapes retain their explicit dips.
// A wet wash starts with a palette load, even if the previous stroke left 25–40%.
// Blotted/dry brushes keep their finite load until the visitor explicitly re-dips.
export function needsRedip(b, enabled = true) {
  return enabled && b.load >= b.free;
}
