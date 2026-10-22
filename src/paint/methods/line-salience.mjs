// Pipeline: inking, stage 2 (hold and measure the lines): salience.
// What makes a subject read first is closed and connected geometry: a gate's frame, bars and arch, a figure's outline.
// Lines are grouped into connected sets (ends within a short gap). A set is kept when it is long enough to be a form, or
// closed, or a face or hand feature; an isolated short piece is texture that belongs to no form and is left to the wash.
// Each line is also held to the shortest piece its ground allows (ink-labels.mjs). Sets that are long or closed are drawn first.
// Pure: arrays in, arrays out. Coordinates are the line file's image pixels.

const SALIENCE_DEFAULTS = Object.freeze({ gapMm: 0.6, componentMm: 6, firstMm: 20 });

const pathMm = (pts, pxMm) => { let s = 0; for (let k = 1; k < pts.length; k++) s += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return s * pxMm; };

/**
 * @param lines [{ points: [{x, y, ...}], inkMinMm? }]; ctx { pxMm, isFeature(x, y) }
 * @returns { lines, stats } lines with `tier` 1 (long or closed sets) or 2, stats { sets, kept, droppedMm, closed }
 */
export function salience(lines, { pxMm, isFeature = () => false }, o = SALIENCE_DEFAULTS) {
  const n = lines.length, gap = o.gapMm / pxMm, parent = Array.from({ length: n }, (_, i) => i);
  const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const ends = []; lines.forEach((g, i) => { ends.push({ i, p: g.points[0] }, { i, p: g.points.at(-1) }); });
  // grid hash of the ends, so a join is looked for only among the near ones
  const cell = Math.max(1, gap), key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`, bins = new Map();
  ends.forEach((e, k) => { const kk = key(e.p.x, e.p.y); (bins.get(kk) ?? bins.set(kk, []).get(kk)).push(k); });
  const degree = new Uint8Array(ends.length);
  ends.forEach((e, k) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of bins.get(key(e.p.x + dx * cell, e.p.y + dy * cell)) ?? []) {
      if (j <= k || ends[j].i === e.i || Math.hypot(ends[j].p.x - e.p.x, ends[j].p.y - e.p.y) > gap) continue;
      parent[find(e.i)] = find(ends[j].i); degree[k]++; degree[j]++;
    }
  });
  const sets = new Map();
  lines.forEach((g, i) => { const r = find(i), s = sets.get(r) ?? { ids: [], mm: 0, feature: false, open: 0 }; s.ids.push(i); s.mm += pathMm(g.points, pxMm); s.feature ||= !!isFeature(g.points[g.points.length >> 1].x, g.points[g.points.length >> 1].y); sets.set(r, s); });
  ends.forEach((e, k) => { if (!degree[k]) sets.get(find(e.i)).open++; });
  const out = []; let droppedMm = 0, closed = 0, kept = 0;
  for (const s of sets.values()) {
    const isClosed = s.open === 0 && s.ids.length >= 1 && s.mm >= 1.5;
    if (isClosed) closed++;
    for (const i of s.ids) {
      const g = lines[i], mm = pathMm(g.points, pxMm), need = Math.max(o.componentMm, g.inkMinMm ?? 0);
      const keep = s.feature || isClosed || s.mm >= need;
      if (!keep) { droppedMm += mm; continue; }
      out.push({ ...g, tier: isClosed || s.mm >= o.firstMm ? 1 : 2 }); kept++;
    }
  }
  return { lines: out, stats: { sets: sets.size, closedSets: closed, linesKept: kept, linesDropped: n - kept, droppedMm } };
}
