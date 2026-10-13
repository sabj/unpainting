// Late detail lines: a selective closing-pen set chosen from a dense traced line file.
// A traced source drawing mixes structure with short crack fragments. When a separate,
// cleaner opening drawing carries the structure, the closing pen should add only the
// longer, straight detail it lacks (stone coursing, paving joints, mullions), not the
// fragments. Pure: points in one shared sheet coordinate frame, no file or pixel access.

const pathLength = pts => { let d = 0; for (let k = 1; k < pts.length; k++) d += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return d; };

/** Chord over path length, 1 for a straight segment. */
export function straightness(pts) {
  const L = pathLength(pts);
  if (L <= 0) return 0;
  const a = pts[0], b = pts[pts.length - 1];
  return Math.hypot(b[0] - a[0], b[1] - a[1]) / L;
}

/** Degrees between a line's chord and the nearer of horizontal and vertical (0..45). */
export function tilt(pts) {
  const a = pts[0], b = pts[pts.length - 1];
  const deg = Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI) % 90;
  return Math.min(deg, 90 - deg);
}

/** A cell grid marking every cell within `radius` of an opening line. */
function clearanceGrid(opening, w, h, radius) {
  const grid = new Uint8Array(w * h), r = Math.max(0, Math.ceil(radius));
  const mark = (x, y) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const X = Math.round(x) + dx, Y = Math.round(y) + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h) grid[Y * w + X] = 1;
    }
  };
  for (const pts of opening) for (let k = 0; k < pts.length; k++) {
    const p = pts[k], q = pts[Math.min(k + 1, pts.length - 1)], steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1])));
    for (let s = 0; s < steps; s++) mark(p[0] + (q[0] - p[0]) * s / steps, p[1] + (q[1] - p[1]) * s / steps);
  }
  return grid;
}

/**
 * Indices of candidate lines kept for the late pen, longest first.
 * candidates/opening: arrays of point arrays [[x,y],...] in sheet cells.
 * minLength (cells), minStraight (0..1), clearance (cells from any opening line), maxCovered
 * (largest share of a line's points inside that clearance), maxTilt (degrees off horizontal or vertical: coursing,
 * joints and mullions are square to the wall; diagonal traces are usually cast-shadow edges, which paint states),
 * maxLines (cap).
 */
export function selectLateLines(candidates, opening, { w, h, minLength = 10, minStraight = 0.85, clearance = 2, maxCovered = 0.5, maxTilt = 45, maxLines = Infinity } = {}) {
  if (!(w > 0 && h > 0)) throw new Error('selectLateLines: sheet w and h are required');
  const grid = clearanceGrid(opening, w, h, clearance);
  const covered = pts => pts.filter(([x, y]) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < w && Y < h && grid[Y * w + X]; }).length / pts.length;
  const kept = [];
  candidates.forEach((pts, i) => {
    if (pts.length < 2) return;
    const L = pathLength(pts);
    if (L < minLength || straightness(pts) < minStraight || tilt(pts) > maxTilt || covered(pts) > maxCovered) return;
    kept.push({ i, L });
  });
  kept.sort((a, b) => b.L - a.L || a.i - b.i);
  return kept.slice(0, maxLines).map(k => k.i);
}
