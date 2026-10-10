// Hand painting on the sheet and scratch paper uses the same finite brush load.
// Above saturation, grow the belly linearly: wetter washes carry more water without
// the old quadratic growth at the top of the Water slider. Dry loads stay small.
export function handBrushOptions(t, { dpi = 60, res = dpi / 60, seed = 3 } = {}) {
  const radius = t.sizeMm / 2 / 25.4 * dpi, flat = t.tool === 'flat';
  const water = Math.max(0, t.water);
  return { flat, radius, bristles: Math.max(12, Math.round(radius * (flat ? 2.3 : 2))),
    capacity: 32 * res, belly: 1 + 4 * water * Math.min(water, 1),
    feed: 0.06, give: 0.8, free: 0.4, film: 0.25, seed, model: t.model ?? 'row' };
}

export const brushWater = b => b.resW + b.hairs.reduce((sum, h) => sum + h.water, 0);

// Called only between visitor strokes; recorded tapes retain their explicit dips.
export function needsRedip(b, enabled = true) {
  const full = b.load * b.capacity * (b.hairs.length * b.belly + b.hairs.reduce((sum, h) => sum + h.len, 0));
  return enabled && full > 0 && brushWater(b) < full * 0.2;
}
