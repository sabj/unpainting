// A wash plan lays the lanes of a part back and forth as one stroke (sweep-fill.mjs laneFill): the brush turns at the
// outline instead of lifting. What a passage is charged for counts how many sweeps lie over each cell (wash.mjs
// sweepCover), and one path over a cell counts once, so a zigzag's overlapping lanes would read as one sweep and the
// passage would be charged for half the overlap it has. Here a path is cut where it turns back on itself, so each lane
// counts as the pass it is.

/**
 * The lanes of a path: a new lane starts where a segment runs back against the way the lane has gone so far (its net
 * displacement, once that is longer than twice the brush's radius). A path that does not turn back is returned whole.
 * @param {Array<{x:number,y:number,r?:number}>} pts
 * @returns {Array<Array<{x:number,y:number,r?:number}>>}
 */
export function lanesOfPath(pts) {
  const out = []; let start = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[start], b = pts[k - 1], c = pts[k], dx = b.x - a.x, dy = b.y - a.y, net = Math.hypot(dx, dy);
    const sx = c.x - b.x, sy = c.y - b.y, seg = Math.hypot(sx, sy);
    if (k - 1 > start && seg > 1e-9 && net > 2 * (b.r ?? 1) && (dx * sx + dy * sy) / (net * seg) < -0.5) { out.push(pts.slice(start, k)); start = k - 1; }
  }
  out.push(pts.slice(start));
  return out;
}
