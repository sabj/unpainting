// Pipeline: inking, stage 2 (hold and measure the lines): importance.
// A draughtsman states the structure first and stops when the drawing says enough. The lines are ranked by importance
// and drawn in that order until their length reaches the subject's own line length: a long line outranks a short one, a
// line the line model is sure of outranks a doubtful one, and a line of a long or closed set (a silhouette, a plane edge,
// an opening: salience's tier 1) outranks loose detail. There is no cap on the count, and nothing is dropped when the
// lines are already within the budget.
// Pure: arrays in, arrays out. Coordinates are the line file's image pixels.

const lengthOf = pts => { let s = 0; for (let k = 1; k < pts.length; k++) s += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return s; };

/** A line's importance: its length in mm, times the model's confidence (0.5 to 1.5), times 1.5 for a line of a form. */
export function lineImportance(g, pxMm) {
  return lengthOf(g.points) * pxMm * (0.5 + Math.max(0, Math.min(1, g.weight ?? 0.5))) * ((g.tier ?? 2) === 1 ? 1.5 : 1);
}

/**
 * The most important lines whose length adds up to `budgetMm`, in their given order.
 * @returns { lines, stats: { budgetMm, beforeMm, keptMm, dropped, shortestKeptMm } }
 */
export function byImportance(lines, { pxMm, budgetMm }) {
  const mm = lines.map(g => lengthOf(g.points) * pxMm), beforeMm = mm.reduce((a, b) => a + b, 0);
  const stats = { budgetMm, beforeMm, keptMm: beforeMm, dropped: 0, shortestKeptMm: mm.length ? Math.min(...mm) : 0 };
  if (!(budgetMm > 0) || beforeMm <= budgetMm) return { lines, stats };
  const order = lines.map((g, i) => i).sort((a, b) => lineImportance(lines[b], pxMm) - lineImportance(lines[a], pxMm) || a - b);
  const keep = new Uint8Array(lines.length); let sum = 0;
  for (const i of order) { if (sum >= budgetMm) break; keep[i] = 1; sum += mm[i]; }
  const kept = lines.filter((_, i) => keep[i]);
  return { lines: kept, stats: { budgetMm, beforeMm, keptMm: sum, dropped: lines.length - kept.length, shortestKeptMm: Math.min(...mm.filter((_, i) => keep[i])) } };
}
