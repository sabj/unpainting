// efRefresh reads these settings to build its work boxes and pressure geometry.
// Solver budgets, pigment lists and optical settings do not change that problem.
export function edgeRefreshKey(sheet, o, pores) {
  const mm = o.mmPerCell > 0 ? o.mmPerCell : sheet.mmPerCell > 0 ? sheet.mmPerCell : sheet.paper?.mmPerCell || 0.3;
  return [mm, o.edgeMm ?? 1, o.edgeEvap, o.reachMm ?? 1.5, o.holeSpan ?? 0, Math.max(2, pores?.iters ?? 1)].join(':');
}
