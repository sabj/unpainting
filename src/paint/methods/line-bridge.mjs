// A line the decision cut can still be structure: a short one whose two ends both meet kept lines (a voussoir joint between two
// arch mouldings, a gate bar between two rails) joins what is drawn, and a local gap in the evidence (a mass edge, a faint stretch)
// should not leave the arch broken. Such a line is restored, unless it lay on a wash-only ground. Pure: arrays in, arrays out.
// Coordinates are the line file's image pixels.

const pathMm = (pts, pxMm) => { let s = 0; for (let k = 1; k < pts.length; k++) s += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return s * pxMm; };

/**
 * @param dropped lines the decision dropped, each with `dropWhy` (mass, faint, contrast, whole, short, turny, or label for a wash-only ground)
 * @param kept the lines drawn
 * @returns {{ lines, stats: { restored } }} the dropped lines to add back, each marked `restored`
 */
export function restoreBridges(dropped, kept, { pxMm, touchMm = 0.6, maxMm = 12 }) {
  const touch = touchMm / pxMm, cell = Math.max(1, touch), key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const bins = new Map();
  for (const g of kept) for (const p of g.points) { const k = key(p.x, p.y); (bins.get(k) ?? bins.set(k, []).get(k)).push(p); }
  const meets = p => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const q of bins.get(key(p.x + dx * cell, p.y + dy * cell)) ?? []) if (Math.hypot(q.x - p.x, q.y - p.y) <= touch) return true; return false; };
  const pool = dropped.filter(g => g.dropWhy !== 'label' && g.points.length >= 2);
  // dropped pieces that meet end to end are one candidate path
  const parent = pool.map((_, i) => i), find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const ends = pool.flatMap((g, i) => [{ i, p: g.points[0] }, { i, p: g.points.at(-1) }]), linked = new Set();
  for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) {
    if (ends[a].i === ends[b].i || Math.hypot(ends[a].p.x - ends[b].p.x, ends[a].p.y - ends[b].p.y) > touch) continue;
    parent[find(ends[a].i)] = find(ends[b].i); linked.add(a); linked.add(b);
  }
  const groups = new Map(); pool.forEach((g, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)).push(i); });
  const out = [];
  for (const ids of groups.values()) {
    if (ids.reduce((s, i) => s + pathMm(pool[i].points, pxMm), 0) > maxMm) continue;
    const free = ends.filter((e, k) => ids.includes(e.i) && !linked.has(k));
    if (free.length >= 2 && free.every(e => meets(e.p))) for (const i of ids) out.push({ ...pool[i], restored: true });
  }
  return { lines: out, stats: { restored: out.length } };
}
