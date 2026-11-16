// Pipeline: planning, stage 5 (brush and stroke application). Where a passage's planned sweeps reach.
// A wash reaches all of its shape. A passage brush laid along a shape's main axis (passage-brush.mjs) covers a convex
// plane, but a shape that wraps round a figure (a sky round a head) has pockets off every lane, and those pockets stay
// paper. A painter sees the pocket and lays it as its own sweep. This finds the parts of a mask that no planned path's
// footprint touches, so the planner can lay each as its own passage. Planning only: it reads the mask and the paths.
import { components } from '../../raster.js';

/**
 * @param mask   the passage's cells (Uint8Array, w x h)
 * @param paths  planned brush paths in the same cells: arrays of { x, y, r }
 * @param minCells a part smaller than this is left to the wash's own spread (the planner's minimum shape)
 * @returns {number[][]} the unreached parts of the mask, each a list of cell indices, largest first
 */
export function unreachedParts(mask, w, h, paths, minCells) {
  const n = w * h, reach = new Uint8Array(n);
  const stamp = (x, y, r) => {
    const R = Math.max(0.5, r), x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(w - 1, Math.ceil(x + R)), y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(h - 1, Math.ceil(y + R));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= R * R) reach[yy * w + xx] = 1;
  };
  for (const ps of paths) for (let q = 0; q < ps.length; q++) {
    const a = ps[q], b = ps[q + 1] ?? a, d = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(d / Math.max(0.5, Math.min(a.r, b.r) / 2)));
    for (let s = 0; s <= steps; s++) { const t = s / steps; stamp(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y), a.r + t * (b.r - a.r)); }
  }
  const left = Uint8Array.from(mask, (v, i) => (v && !reach[i] ? 1 : 0)), c = components(left, w, h);
  const parts = Array.from({ length: c.count + 1 }, () => []);
  for (let i = 0; i < n; i++) if (c.labels[i]) parts[c.labels[i]].push(i);
  return parts.filter(p => p.length >= minCells).sort((p, q) => q.length - p.length);
}
