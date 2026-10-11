// Final darks: the last few small, decisive darks a painter puts in once the washes are down (pupils, the gap under a
// door, the shadow side of a window bar, the deepest fold). The value ladder cannot carry them: its glazes are cut
// from broad value bands, small dark flecks are filtered out of the glaze list, and the touch-up rounds compare whole
// colour families, where a dark accent is averaged with the mid-values around it.
//
// Planned before painting, from the reference (the planning step may read it): the cells that are both among the
// picture's darkest and clearly darker than their surroundings, less the cells the pen will draw. They are grouped by
// tile into accent families, each large enough for one shape-level look (the guard's 64-cell floor), so at the end the
// painter compares one mean per family and never reads the reference cell by cell.

import { closeLocal, removeSmall } from '../../raster.js';

// Box mean of a field over (2r+1)^2 cells, clipped at the edges.
function boxMean(a, w, h, r) {
  const t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    const row = y * w;
    for (let x = -r; x < w; x++) {
      if (x + r < w) s += a[row + x + r];
      if (x - r - 1 >= 0) s -= a[row + x - r - 1];
      if (x >= 0) t[row + x] = s / (Math.min(w - 1, x + r) - Math.max(0, x - r) + 1);
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y < h; y++) {
      if (y + r < h) s += t[(y + r) * w + x];
      if (y - r - 1 >= 0) s -= t[(y - r - 1) * w + x];
      if (y >= 0) o[y * w + x] = s / (Math.min(h - 1, y + r) - Math.max(0, y - r) + 1);
    }
  }
  return o;
}

/**
 * The accent cells: dark (value at or above `darkQ` of the picture's own value range, and at least `minValue` of its
 * 97th-percentile density) and darker than their neighbourhood (`surroundMm` box) by at least `contrast`. With
 * minMm2 > 0, cells a cell apart are joined and pieces smaller than minMm2 square millimetres are dropped.
 * D: channel density, n x 3. pen: cells the planned drawing covers (0/1), left to the pen. Returns a 0/1 mask.
 */
export function accentCells(D, w, h, { mmPerCell, pen = null, darkQ = 0.9, minValue = 0.45, contrast = 0.08, surroundMm = 2.5, minMm2 = 0 } = {}) {
  const n = w * h;
  if (D.length !== 3 * n) throw new Error('accentCells: density must be n x 3');
  if (!(mmPerCell > 0)) throw new Error('accentCells: mmPerCell must be positive');
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = (D[3 * i] + D[3 * i + 1] + D[3 * i + 2]) / 3;
  const sorted = Float32Array.from(v).sort();
  const peak = sorted[Math.min(n - 1, Math.floor(n * 0.97))] || 1;
  for (let i = 0; i < n; i++) v[i] = Math.min(1, v[i] / peak);
  const q = Float32Array.from(v).sort()[Math.min(n - 1, Math.floor(n * darkQ))];
  const floor = Math.max(minValue, q);
  const around = boxMean(v, w, h, Math.max(1, Math.round(surroundMm / mmPerCell)));
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (v[i] >= floor && v[i] - around[i] >= contrast && !(pen && pen[i])) m[i] = 1;
  if (!(minMm2 > 0)) return m;
  // A decisive dark is a shape, not a speckle: join cells a cell apart, then keep pieces of at least minMm2.
  const joined = closeLocal(m, w, h, 1);
  const kept = removeSmall(joined, w, h, Math.max(2, Math.round(minMm2 / (mmPerCell * mmPerCell))));
  for (let i = 0; i < n; i++) kept[i] = kept[i] && !(pen && pen[i]) ? 1 : 0;
  return kept;
}

/**
 * Accent families: the accent cells grouped by square tiles `tileMm` wide. A tile's cells are one family when there
 * are at least `minCells` of them (one shape-level look); a smaller set joins the largest family among its 8
 * neighbouring tiles, or is dropped. Returns [{ cells: number[], tile: [tx, ty] }], largest first.
 */
export function accentFamilies(mask, w, h, { mmPerCell, tileMm = 10, minCells = 64 } = {}) {
  const T = Math.max(4, Math.round(tileMm / mmPerCell)), tw = Math.ceil(w / T), th = Math.ceil(h / T);
  const tiles = Array.from({ length: tw * th }, () => []);
  for (let i = 0; i < w * h; i++) if (mask[i]) tiles[((i / w | 0) / T | 0) * tw + ((i % w) / T | 0)].push(i);
  const big = new Set();
  tiles.forEach((c, k) => { if (c.length >= minCells) big.add(k); });
  for (let k = 0; k < tiles.length; k++) {
    if (big.has(k) || !tiles[k].length) continue;
    const tx = k % tw, ty = (k / tw) | 0;
    let best = -1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx, y = ty + dy, j = y * tw + x;
      if ((dx || dy) && x >= 0 && y >= 0 && x < tw && y < th && big.has(j) && (best < 0 || tiles[j].length > tiles[best].length)) best = j;
    }
    if (best >= 0) tiles[best].push(...tiles[k]);
  }
  return [...big].map(k => ({ cells: tiles[k], tile: [k % tw, (k / tw) | 0] })).sort((a, b) => b.cells.length - a.cells.length);
}
