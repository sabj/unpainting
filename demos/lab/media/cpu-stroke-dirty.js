// Generated from src/media/cpu-stroke-dirty.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Bounds of instrument writes since the last GPU flow. This tracks writes only;
// it never changes the contact model or restricts the existing full-path reads.
export function markCpuStrokeCell(sheet, i) {
  const dirty = sheet._cpuStrokeDirty;
  if (!dirty) return;
  const x = i % sheet.w, y = Math.floor(i / sheet.w);
  dirty.x0 = Math.min(dirty.x0, x); dirty.y0 = Math.min(dirty.y0, y);
  dirty.x1 = Math.max(dirty.x1, x); dirty.y1 = Math.max(dirty.y1, y);
  if (dirty.rowLo) { if (x < dirty.rowLo[y]) dirty.rowLo[y] = x; if (x > dirty.rowHi[y]) dirty.rowHi[y] = x; }
}
export function resetCpuStrokeDirty(sheet) {
  const prior = sheet._cpuStrokeDirty, h = sheet.h | 0, w = sheet.w | 0;
  const rowLo = prior?.rowLo && prior.rowLo.length === h ? prior.rowLo : new Int32Array(h);
  const rowHi = prior?.rowHi && prior.rowHi.length === h ? prior.rowHi : new Int32Array(h);
  rowLo.fill(w); rowHi.fill(-1);
  sheet._cpuStrokeDirty = { x0: w, y0: h, x1: -1, y1: -1, rowLo, rowHi };
}

/** Disjoint row spans of actual writes; no untouched rows or stale edge tiles. */
export function cpuStrokeDirtyRects(sheet) {
  const d = sheet._cpuStrokeDirty;
  if (!d?.rowLo) { const rect = cpuStrokeDirtyRect(sheet); return rect ? [rect] : []; }
  const rects = [];
  for (let y = d.y0; y <= d.y1; y++) {
    const x = d.rowLo[y], end = d.rowHi[y];
    if (end < x) continue;
    const previous = rects.at(-1), width = end - x + 1;
    if (previous && previous[0] === x && previous[2] === width && previous[1] + previous[3] === y) previous[3]++;
    else rects.push([x,y,width,1]);
  }
  return rects;
}
export function cpuStrokeDirtyRect(sheet) {
  const d = sheet._cpuStrokeDirty;
  return d && d.x1 >= d.x0 ? [d.x0, d.y0, d.x1 - d.x0 + 1, d.y1 - d.y0 + 1] : null;
}
