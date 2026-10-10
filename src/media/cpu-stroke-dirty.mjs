// Bounds of instrument writes since the last GPU flow. This tracks writes only;
// it never changes the contact model or restricts the existing full-path reads.
export function markCpuStrokeCell(sheet, i) {
  const dirty = sheet._cpuStrokeDirty;
  if (!dirty) return;
  const x = i % sheet.w, y = Math.floor(i / sheet.w);
  dirty.x0 = Math.min(dirty.x0, x); dirty.y0 = Math.min(dirty.y0, y);
  dirty.x1 = Math.max(dirty.x1, x); dirty.y1 = Math.max(dirty.y1, y);
}
export function resetCpuStrokeDirty(sheet) {
  sheet._cpuStrokeDirty = { x0: sheet.w, y0: sheet.h, x1: -1, y1: -1 };
}
export function cpuStrokeDirtyRect(sheet) {
  const d = sheet._cpuStrokeDirty;
  return d && d.x1 >= d.x0 ? [d.x0, d.y0, d.x1 - d.x0 + 1, d.y1 - d.y0 + 1] : null;
}
