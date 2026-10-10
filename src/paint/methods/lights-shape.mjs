// --lightsbreak <cells>: local lights (local-lights.mjs) larger than this are broken into flecks, so a lit plane reads
// as a pale tint flecked with paper, not a cut-out hole. A large light keeps the cells where the sheet's own paper
// relief, blurred over --lightsgrain cells, is in its top --lightskeep share inside that light.
import { components } from '../../raster.js';

export function breakLights(mask, { w, h, paper, SC = 1, gaussian, num, log }) {
  const big = Math.round(num('lightsbreak', 0));
  if (!(big > 0) || !mask) return mask;
  const keep = num('lightskeep', 0.35), grain = num('lightsgrain', 1.2);
  const n = w * h, W2 = w * SC, ht = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i % w, y = (i / w) | 0; ht[i] = paper.height[(y * SC) * W2 + x * SC]; }
  const field = gaussian(ht, w, h, grain);
  const { labels, areas, count } = components(mask, w, h);
  const cells = Array.from({ length: count + 1 }, () => []);
  for (let i = 0; i < n; i++) if (labels[i]) cells[labels[i]].push(i);
  const out = Uint8Array.from(mask);
  let broken = 0, before = 0, after = 0;
  for (let id = 1; id <= count; id++) {
    if (areas[id] <= big) continue;
    broken++; before += areas[id];
    const v = cells[id].map(i => field[i]).sort((a, b) => b - a), cut = v[Math.min(v.length - 1, Math.floor(keep * v.length))];
    for (const i of cells[id]) if (field[i] < cut) out[i] = 0; else after++;
  }
  log(`lights broken: ${broken} lights over ${big} cells, ${before} cells to ${after}`);
  return out;
}
