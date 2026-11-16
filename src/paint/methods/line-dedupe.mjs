// One line per edge. A drawing file can hold the same edge twice: a planner's own line and the tracer's line along it
// (dog-ink's fence), or two traces of one mark. Two lines are one edge when the shorter lies within `within` of the
// longer on at least half its length, running the same way (|cos| of the local directions at least `cos`, the
// hand's join gate). `within` is the tracer's own resolution on the sheet, its inner flank (pen-trace.mjs
// TRACE_MM.flank[0], 1.9 mm): two marks closer than that are one mark to it. The longer line is kept, whichever file
// or source it came from; the other is left out whole, never cut. Lines are { points: [{x, y}] } on one grid.

const segDist = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return { d: Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy), ux: dx / Math.sqrt(L), uy: dy / Math.sqrt(L) };
};
const lengthOf = g => { let s = 0; for (let k = 1; k < g.points.length; k++) s += Math.hypot(g.points[k].x - g.points[k - 1].x, g.points[k].y - g.points[k - 1].y); return s; };

/** Whether line `g` runs along `h` (within `within`, same way) on at least half its points. */
export function runsAlong(g, h, { within, cos = 0.8 }) {
  const P = g.points, Q = h.points;
  if (P.length < 2 || Q.length < 2) return false;
  let on = 0;
  for (let k = 0; k < P.length; k++) {
    const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], m = Math.hypot(b.x - a.x, b.y - a.y) || 1, tx = (b.x - a.x) / m, ty = (b.y - a.y) / m;
    let best = null;
    for (let j = 1; j < Q.length; j++) { const r = segDist(P[k], Q[j - 1], Q[j]); if (!best || r.d < best.d) best = r; }
    if (best.d <= within && Math.abs(tx * best.ux + ty * best.uy) >= cos) on++;
  }
  return on >= P.length / 2;
}

/** Keep one line per edge: longest first, a line running along a kept one is left out. @returns {{ lines, dropped }} */
export function onePerEdge(lines, { within, cos = 0.8 }) {
  if (!(within > 0)) throw new Error('one line per edge: a positive distance');
  const order = lines.map((g, i) => ({ g, i, L: lengthOf(g) })).sort((a, b) => b.L - a.L || a.i - b.i);
  const kept = [], keep = new Set();
  for (const o of order) {
    if (kept.some(k => runsAlong(o.g, k, { within, cos }))) continue;
    kept.push(o.g); keep.add(o.i);
  }
  return { lines: lines.filter((_, i) => keep.has(i)), dropped: lines.length - keep.size };
}
