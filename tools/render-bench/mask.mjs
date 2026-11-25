// Wash clips for a mushroom plate in Node: the same masks the browser's nativeMaskRasterizer (demos/fungi/mushrooms.mjs)
// draws on a canvas, filled here by scanline at cell centres. A cell is in when its centre lies in the mark's shape
// (nonzero winding), in one of its islands when it has any, outside every reserve, and, for a gill passage, where
// the lamellae's coverage is at least half. Plate units are 1200 across; `scale` turns them into sheet cells.

/** Fill polygons (each [[x, y], ...] in plate units) into `out` (w x h bytes) with `value`, nonzero winding, centres. */
export function fillPolygons(out, w, h, polys, scale, value = 1) {
  const edges = [];
  for (const poly of polys) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x0, y0] = poly[j], [x1, y1] = poly[i];
    if (y0 !== y1) edges.push({ x0: x0 * scale, y0: y0 * scale, x1: x1 * scale, y1: y1 * scale, dir: y1 > y0 ? 1 : -1 });
  }
  if (!edges.length) return out;
  const xs = [];
  for (let y = 0; y < h; y++) {
    const cy = y + 0.5; xs.length = 0;
    for (const e of edges) {
      const lo = Math.min(e.y0, e.y1), hi = Math.max(e.y0, e.y1);
      if (cy < lo || cy >= hi) continue;
      xs.push({ x: e.x0 + (cy - e.y0) * (e.x1 - e.x0) / (e.y1 - e.y0), dir: e.dir });
    }
    if (!xs.length) continue;
    xs.sort((a, b) => a.x - b.x);
    let wind = 0;
    for (let k = 0; k < xs.length - 1; k++) {
      wind += xs[k].dir; if (!wind) continue;
      const a = Math.max(0, Math.ceil(xs[k].x - 0.5)), b = Math.min(w - 1, Math.ceil(xs[k + 1].x - 0.5) - 1);
      for (let x = a; x <= b; x++) out[y * w + x] = value;
    }
  }
  return out;
}

const boxOf = pts => { let x = Infinity, y = Infinity, r = -Infinity, b = -Infinity; for (const [px, py] of pts) { x = Math.min(x, px); y = Math.min(y, py); r = Math.max(r, px); b = Math.max(b, py); } return { x, y, w: r - x, h: b - y }; };

/** maskFor for simulateNativePassages: (mark, { width, height, scale }) => Uint8Array of 0/1. `coverage` is
 *  mushrooms.mjs's lamellarCoverage, passed in so this module stays independent of the plate code. */
export function nodeMaskRasterizer({ coverage = null } = {}) {
  return (mark, { width: w, height: h, scale }) => {
    const out = fillPolygons(new Uint8Array(w * h), w, h, [mark.shape], scale, 1);
    if (Array.isArray(mark.islands)) {
      const isl = fillPolygons(new Uint8Array(w * h), w, h, mark.islands, scale, 1);
      for (let i = 0; i < out.length; i++) out[i] &= isl[i];
    }
    for (const reserve of mark.reserves ?? []) fillPolygons(out, w, h, [reserve], scale, 0);
    if (mark.depthFaces) {
      if (!coverage) throw new Error('a gill passage needs lamellarCoverage to clip it');
      const c = coverage(mark.depthFaces, boxOf(mark.shape));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; if (!out[i]) continue;
        const u = Math.floor((x + 0.5) / scale - c.x), v = Math.floor((y + 0.5) / scale - c.y);
        out[i] = u >= 0 && v >= 0 && u < c.width && v < c.height && c.alpha[v * c.width + u] >= 128 ? 1 : 0;
      }
    }
    return out;
  };
}
