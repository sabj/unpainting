// Keep physical brush bristle count, contact lengths and carried paint volume (mm3)
// consistent when rendering above the 540-cell calibration width.
const CALIBRATED_WIDTH_CELLS = 540;

export function scaleBrushForDensity(opts = {}, { renderWidth = CALIBRATED_WIDTH_CELLS, baseWidth = CALIBRATED_WIDTH_CELLS } = {}) {
  const sc = renderWidth > baseWidth ? renderWidth / baseWidth : 1;
  if (!(sc > 1) || opts?._densitySized || Array.isArray(opts?.hairs)) return opts;
  const radius = Math.max(1, opts.radius ?? 6);
  const bristles = opts.bristles > 12 && opts.bristles / radius >= 1.5
    ? Math.max(12, Math.round(opts.bristles / sc))
    : opts.bristles;
  return {
    ...opts,
    _densitySized: true,
    bristles,
    capacity: opts.loadWater > 0 ? opts.capacity : (opts.capacity ?? 20) * sc * sc,
    stiffness: opts.stiffness == null ? undefined : opts.stiffness * sc,
    streakLength: (opts.streakLength ?? 14) * sc,
    grainShift: (opts.grainShift ?? 0) * sc,
  };
}

export function brushWaterVolumeMm3(brush, mmPerCell) {
  if (!(mmPerCell > 0)) throw new RangeError("mmPerCell must be positive");
  const hairWater = (brush.hairs ?? []).reduce((s, hr) => s + hr.water, 0);
  return ((brush.resW ?? 0) + hairWater) * mmPerCell * mmPerCell;
}
