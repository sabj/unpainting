// A drawn line restates an edge of the planned painting. The plan's edges are the boundary cells of its passages (each
// planned shape's hard and soft boundary, as the planner wrote them). A traced line from the plan's drawing file that
// lies inside one planned mass, with no passage edge under it, is a line in a mass: on the plate it would cross a flat
// fill. Such a line is left off whole; a line that mostly follows planned edges is drawn whole, never cut into dashes.
// The test reads the plan only (passage boundaries), never the target. Gestures and edges are in plan cells.

const px = q => (Array.isArray(q) ? q[0] : q.x);
const py = q => (Array.isArray(q) ? q[1] : q.y);

/** The boundary cells of every planned passage (instruction.edges.hardCells and softCells), as a mask over n cells. */
export function plannedEdges(instructions, n) {
  const edges = new Uint8Array(n);
  for (const q of instructions ?? []) for (const list of [q?.edges?.hardCells, q?.edges?.softCells]) for (const i of list ?? []) if (i >= 0 && i < n) edges[i] = 1;
  return edges;
}

/**
 * Splits the gestures into the lines drawn and the lines left off. A line is drawn when at least half of its path, sampled
 * about once a cell, lies within tol cells of a planned edge. tol is the registration slack between the drawing file and
 * the plan: one source pixel, since both were made from the same picture.
 * @param {{points: ({x:number,y:number}|number[])[]}[]} gestures in plan cells
 * @param {{edges: Uint8Array, w: number, h: number, tol: number}} o
 */
export function supportedLines(gestures, { edges, w, h, tol }) {
  const r = Math.max(0, Math.round(tol)), disk = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) disk.push([dx, dy]);
  const near = (x, y) => {
    const X = Math.round(x), Y = Math.round(y);
    for (const [dx, dy] of disk) { const xx = X + dx, yy = Y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && edges[yy * w + xx]) return true; }
    return false;
  };
  const kept = [], dropped = [];
  for (const g of gestures) {
    const pts = g.points ?? [];
    let samples = 0, on = 0;
    for (let k = 1; k < pts.length; k++) {
      const x0 = px(pts[k - 1]), y0 = py(pts[k - 1]), x1 = px(pts[k]), y1 = py(pts[k]);
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let s = k === 1 ? 0 : 1; s <= steps; s++) { samples++; if (near(x0 + (x1 - x0) * s / steps, y0 + (y1 - y0) * s / steps)) on++; }
    }
    (samples && 2 * on >= samples ? kept : dropped).push(g);
  }
  return { kept, dropped };
}
