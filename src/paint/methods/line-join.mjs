// Join, then prune: a traced drawing is broken where its contour faded, crossed a texture or met a junction. A hand
// draws such a contour as one line, so broken pieces are joined first, selectively, and only marks that sit on no
// contour at all are deleted. Two pieces are joined only when they belong to one contour:
//
//   1. their ends face each other and the gap is small next to both pieces (at most `gapShare` of the shorter, and
//      under `maxGapMm`);
//   2. their directions agree, and the joined path does not turn sharply at either end of the gap;
//   3. the target shows the same edge across the gap: every few cells along the gap a target edge (any gradient in its
//      strongest 30%) runs the same way, with its light side on the same side as at both ends (a contour passing into
//      light has no edge there, so its deliberate break stays). A gap under `skipMm` is a skip of the nib or the tracer
//      and needs no evidence;
//   4. the gap crosses no other line (never through a crossing);
//   5. both pieces belong to the same part of the drawing: a file's role, kind, object and region, where it names them,
//      agree (from the ink-track hand route, drawing-hand.mjs handDrawing), so a window is never stitched to its wall.
// Pieces are joined shortest gap first, each end once per pass, for a few passes. Then a mark is deleted only when it
// is isolated: shorter than `isolatedMm`, mostly off every target edge, and with no other line within `aloneMm`. Widths, weights and wobble of the pieces are kept; the gap is drawn at the
// mean of the two ends. Pure, planning only. Lines are plan-grid polylines [{ points: [{x, y, width?, weight?}] }].

const JOIN = Object.freeze({ maxGapMm: 2.5, gapShare: 0.5, facing: 0.9, agree: 0.9, turnDeg: 25, endMm: 0.8, edgeCells: 1.5, edgeAgree: 0.85,
  support: 0.75, skipMm: 0.5, weakQuantile: 0.7, isolatedMm: 1.5, offEdge: 0.6, aloneMm: 1, passes: 3 });

import { nearestEdge } from './line-evidence.mjs';

// The target's weak edges: every cell whose gradient is in the strongest (1 - q) of the sheet, with the distance to
// the nearest and its index. Thicker than the thinned edges, so a faint stretch of a contour still counts.
function weakEdges(ev, q) {
  const m = Float32Array.from(ev.mag).filter(v => v > 0).sort(), cut = m.length ? m[Math.floor(q * (m.length - 1))] : Infinity;
  const mask = Uint8Array.from(ev.mag, v => (v >= cut ? 1 : 0));
  return { ...ev, ...nearestEdge(mask, ev.w, ev.h) };
}

// Two lines are parts of one drawing element when every label both carry agrees.
const PART_KEYS = Object.freeze(['role', 'kind', 'object', 'region']);
export const samePart = (g, h) => PART_KEYS.every(k => g[k] == null || h[k] == null || g[k] === h[k]);

const len = pts => { let d = 0; for (let k = 1; k < pts.length; k++) d += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return d; };

// The outward direction at an end of a polyline, read over about `reach` cells.
function endDir(pts, atStart, reach) {
  const P = atStart ? pts : [...pts].reverse(), e = P[0];
  let k = 1, d = 0;
  while (k < P.length - 1 && d < reach) { d += Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y); k++; }
  const q = P[Math.min(k, P.length - 1)], L = Math.hypot(e.x - q.x, e.y - q.y) || 1;
  return { x: (e.x - q.x) / L, y: (e.y - q.y) / L, p: e };
}

// Which side of the direction (dx, dy) is lighter at (x, y), from the target lightness: +1 left, -1 right, 0 unclear.
function lightSide(L, w, h, x, y, dx, dy, r = 2, min = 0.03) {
  const at = (u, v) => L[Math.min(h - 1, Math.max(0, Math.round(v))) * w + Math.min(w - 1, Math.max(0, Math.round(u)))];
  const d = at(x - dy * r, y + dx * r) - at(x + dy * r, y - dx * r);
  return Math.abs(d) < min ? 0 : Math.sign(d);
}

/**
 * Whether the target shows one edge across the gap from a to b, with the light on the same side as at both ends.
 * `ev` from line-evidence.mjs edgeEvidence (edge, ori, dist, near), `L` the target's smoothed lightness.
 */
export function gapSupported(a, b, ev, L, { edgeCells = JOIN.edgeCells, edgeAgree = JOIN.edgeAgree, support = JOIN.support } = {}) {
  const { w, h } = ev, dx = b.x - a.x, dy = b.y - a.y, G = Math.hypot(dx, dy);
  if (!(G > 0)) return true;
  const ux = dx / G, uy = dy / G, side = lightSide(L, w, h, a.x, a.y, ux, uy), sideB = lightSide(L, w, h, b.x, b.y, ux, uy);
  if (side !== 0 && sideB !== 0 && side !== sideB) return false;
  const want = side || sideB, n = Math.max(2, Math.ceil(G));
  let ok = 0;
  for (let k = 1; k < n; k++) {
    const x = a.x + dx * k / n, y = a.y + dy * k / n, X = Math.round(x), Y = Math.round(y);
    if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
    const i = Y * w + X, j = ev.near[i];
    if (j < 0 || ev.dist[i] > edgeCells) continue;
    const gx = Math.cos(ev.ori[j]), gy = Math.sin(ev.ori[j]);
    if (Math.abs(ux * gy - uy * gx) < edgeAgree) continue;
    const s = lightSide(L, w, h, x, y, ux, uy);
    if (want && s && s !== want) continue;
    ok++;
  }
  return ok / Math.max(1, n - 1) >= support;
}

// Cells each line passes through, for the crossing test.
function occupancy(lines, w, h) {
  const own = new Int32Array(w * h).fill(-1);
  lines.forEach((g, li) => {
    const p = g.points;
    for (let k = 0; k < p.length; k++) {
      const a = p[k], b = p[Math.min(k + 1, p.length - 1)], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let s = 0; s <= n; s++) { const X = Math.round(a.x + (b.x - a.x) * s / n), Y = Math.round(a.y + (b.y - a.y) * s / n); if (X >= 0 && Y >= 0 && X < w && Y < h) own[Y * w + X] = li; }
    }
  });
  return own;
}

function crosses(a, b, own, w, h, i, j) {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let s = 1; s < n; s++) {
    const X = Math.round(a.x + (b.x - a.x) * s / n), Y = Math.round(a.y + (b.y - a.y) * s / n);
    if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
    const o = own[Y * w + X];
    if (o >= 0 && o !== i && o !== j) return true;
  }
  return false;
}

// The gap's points, at the mean width and weight of the two ends.
function bridge(a, b) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y))), out = [];
  const mid = (u, v) => (u == null || v == null ? (u ?? v) : (u + v) / 2);
  for (let s = 1; s < n; s++) {
    const q = { x: a.x + (b.x - a.x) * s / n, y: a.y + (b.y - a.y) * s / n };
    const width = mid(a.width, b.width), weight = mid(a.weight, b.weight);
    if (width != null) q.width = width;
    if (weight != null) q.weight = weight;
    out.push(q);
  }
  return out;
}

/**
 * Join broken pieces of one contour, then delete isolated marks that lie on no target edge.
 * @returns { lines, stats: { in, joined, deleted, out } }
 */
export function joinThenPrune(lines, ev0, L, { mmPerCell, options = {} } = {}) {
  const o = { ...JOIN, ...options }, cells = mm => mm / mmPerCell, { w, h } = ev0, cosTurn = Math.cos(o.turnDeg * Math.PI / 180);
  const ev = weakEdges(ev0, o.weakQuantile);
  let cur = lines.filter(g => g.points?.length >= 2).map(g => ({ ...g, points: g.points.slice() }));
  const stats = { in: cur.length, joined: 0, deleted: 0 };
  for (let pass = 0; pass < o.passes; pass++) {
    const own = occupancy(cur, w, h), ends = [];
    cur.forEach((g, i) => { const L0 = len(g.points); for (const atStart of [true, false]) ends.push({ i, atStart, L: L0, ...endDir(g.points, atStart, cells(o.endMm)) }); });
    // a coarse grid of ends, so each end looks only at near ones
    const G = Math.max(2, cells(o.maxGapMm)), key = (x, y) => `${Math.floor(x / G)},${Math.floor(y / G)}`, grid = new Map();
    ends.forEach((e, k) => { const kk = key(e.p.x, e.p.y); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(k); });
    const pairs = [];
    ends.forEach((a, ka) => {
      const gx = Math.floor(a.p.x / G), gy = Math.floor(a.p.y / G);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const kb of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
        if (kb <= ka) continue;
        const b = ends[kb]; if (b.i === a.i) continue;
        const vx = b.p.x - a.p.x, vy = b.p.y - a.p.y, gap = Math.hypot(vx, vy);
        if (gap > Math.min(cells(o.maxGapMm), o.gapShare * Math.min(a.L, b.L))) continue;
        if (gap > 0.5) {
          const ux = vx / gap, uy = vy / gap;
          if (a.x * ux + a.y * uy < o.facing || -(b.x * ux + b.y * uy) < o.facing) continue;
          if (a.x * ux + a.y * uy < cosTurn || -(b.x * ux + b.y * uy) < cosTurn) continue;
        }
        if (-(a.x * b.x + a.y * b.y) < o.agree) continue;
        if (!samePart(cur[a.i], cur[b.i])) continue;
        pairs.push({ ka, kb, gap });
      }
    });
    pairs.sort((p, q) => p.gap - q.gap);
    const usedEnd = new Set(), usedLine = new Set(), merges = [];
    for (const { ka, kb } of pairs) {
      const a = ends[ka], b = ends[kb];
      if (usedEnd.has(ka) || usedEnd.has(kb) || usedLine.has(a.i) || usedLine.has(b.i)) continue;
      if (crosses(a.p, b.p, own, w, h, a.i, b.i)) continue;
      if (Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y) > cells(o.skipMm) && !gapSupported(a.p, b.p, ev, L, o)) continue;
      usedEnd.add(ka); usedEnd.add(kb); usedLine.add(a.i); usedLine.add(b.i);
      merges.push([a, b]);
    }
    if (!merges.length) break;
    const gone = new Set(), added = [];
    for (const [a, b] of merges) {
      const A = a.atStart ? [...cur[a.i].points].reverse() : cur[a.i].points, B = b.atStart ? cur[b.i].points : [...cur[b.i].points].reverse();
      const first = cur[a.i], second = cur[b.i], La = len(first.points), Lb = len(second.points);
      const weight = first.weight == null && second.weight == null ? undefined : ((first.weight ?? 1) * La + (second.weight ?? 1) * Lb) / (La + Lb);
      added.push({ ...first, ...(weight == null ? {} : { weight }), points: [...A, ...bridge(A.at(-1), B[0]), ...B] });
      gone.add(a.i); gone.add(b.i);
    }
    stats.joined += merges.length;
    cur = [...cur.filter((_, i) => !gone.has(i)), ...added];
  }
  // delete isolated marks: short, mostly off every target edge, and with no other line near
  const own = occupancy(cur, w, h), R = Math.ceil(cells(o.aloneMm));
  const alone = (g, i) => {
    for (const q of g.points) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const X = Math.round(q.x) + dx, Y = Math.round(q.y) + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h && own[Y * w + X] >= 0 && own[Y * w + X] !== i) return false;
    }
    return true;
  };
  const kept = cur.filter((g, i) => {
    if (len(g.points) >= cells(o.isolatedMm)) return true;
    let off = 0;
    for (const q of g.points) { const X = Math.round(q.x), Y = Math.round(q.y); if (X < 0 || Y < 0 || X >= w || Y >= h || ev.dist[Y * w + X] > o.edgeCells) off++; }
    if (off / g.points.length >= o.offEdge && alone(g, i)) { stats.deleted++; return false; }
    return true;
  });
  return { lines: kept, stats: { ...stats, out: kept.length } };
}
