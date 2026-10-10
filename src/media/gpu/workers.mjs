// Persistent worker groups: each group walks the active tile list with a stride of the group count.
// GPU_WORKERS: a group count, or auto to scale with tiles. A single sheet defaults to 128. A batch scales with its tile
// count (`scale`), since its list carries the tiles of every sheet.
export function workerCount(ntiles, scale = false) {
  const env = process.env.GPU_WORKERS;
  if (env && env !== 'auto') { const n = Math.floor(Number(env)); return Number.isFinite(n) ? Math.max(1, Math.min(4096, n)) : 32; }
  if (!scale && env !== 'auto') return 128;
  return Math.max(32, Math.min(2048, Math.ceil(ntiles / 48)));
}
