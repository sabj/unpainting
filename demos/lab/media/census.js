// Generated from src/media/census.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Observation only; enabled explicitly by the census runner, never a physics input.
export const census = typeof process !== 'undefined' && process.env?.PAINTER_CENSUS === '1' ? {
  measurePaper: { calls: 0, cells: 0, ms: 0 }, pen: { touches: 0, dijkstraPops: 0 },
  inkres: { carryCalls: 0, carryMs: 0, composeCalls: 0, composeMs: 0 },
  dry: {}, firstMarkSeconds: null,
} : null;
export function censusMark() {
  if (census && census.firstMarkSeconds === null) census.firstMarkSeconds = process.uptime();
}
export function censusDry(sheet) {
  if (!census) return;
  const caller = new Error().stack.split('\n').slice(3, 6).map(s => s.trim().replaceAll(process.cwd() + '/', '')).join(' <- ');
  const row = census.dry[caller] ??= { calls: 0, maxLayers: 0, maxLogicalPlaneBytes: 0, maxAllocatedPlaneBytes: 0 };
  row.calls++;
  row.maxLayers = Math.max(row.maxLayers, sheet.layers.length);
  row.maxLogicalPlaneBytes = Math.max(row.maxLogicalPlaneBytes, sheet.layers.reduce((n, l) => n + l.reduce((s, a) => s + a.byteLength, 0), 0));
  row.maxAllocatedPlaneBytes = Math.max(row.maxAllocatedPlaneBytes, [...new Set(sheet.layers.flat().map(p => p.buffer))].reduce((n,b) => n+b.byteLength,0));
}
