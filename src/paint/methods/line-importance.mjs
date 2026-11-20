// Pipeline: inking, stage 2 (hold and measure the lines): importance.
// A draughtsman states the structure first and stops when the drawing says enough. The measured lines are ranked by
// importance and kept in that order until their length reaches the subject's own line length. A firm line (dark in the
// subject and sure in the line model: the stroke's median weight, squared) outranks a faint one, so a silhouette, a plane
// edge or an opening comes before a stone joint. A longer line outranks a shorter one up to 12 mm; beyond that length adds
// nothing, so a short window arch is not crowded out by long faint texture. A line of a long or closed set (salience's
// tier 1) outranks loose detail. There is no cap on the count, and nothing is dropped when the lines are within the budget.
// Pure: arrays in, arrays out. Coordinates are the line file's image pixels; points are [x, y] or { x, y }.

const FULL_LENGTH_MM = 12;
const X = p => (Array.isArray(p) ? p[0] : p.x), Y = p => (Array.isArray(p) ? p[1] : p.y);
const lengthOf = pts => { let s = 0; for (let k = 1; k < pts.length; k++) s += Math.hypot(X(pts[k]) - X(pts[k - 1]), Y(pts[k]) - Y(pts[k - 1])); return s; };
const median = v => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
/** The stroke's one weight, 0..1: the median of its per-point readings, else its own `weight`, else 0.5. */
const weightOf = g => Math.max(0, Math.min(1, Array.isArray(g.weights) && g.weights.length ? median(g.weights) : g.weight ?? 0.5));

/** A line's importance: its length in mm up to 12, times its weight squared, times 1.5 for a line of a form. */
export function lineImportance(g, pxMm) {
  return Math.min(FULL_LENGTH_MM, lengthOf(g.points) * pxMm) * weightOf(g) ** 2 * ((g.tier ?? 2) === 1 ? 1.5 : 1);
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
