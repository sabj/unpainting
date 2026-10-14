// Line economy for the pen-and-wash style (--style penwash): prune a prepared drawing's small repeated marks (window
// frames, stone joints, texture flicks) into a simplified rhythm with deliberate omissions, while every long
// structural line stays whole with its own widths, weights and hand wobble.
//
//   0. Broken collinear pieces of the same drawing part (within `joinMm`) are joined first so a contour broken by the
//      tracer stays whole instead of having its fragments dropped as specks.
//   1. Specks under 0.8 mm of length go.
//   2. Small marks (spanning under 3 mm) are kept in patches, not at random: a smooth omission field
//      (about 7 mm across) plus a value bias decides. Lit areas (value group 0) lose most of them, the shadow side
//      keeps most, as an illustrator states the shadowed windows and leaves the lit ones to the eye.
//   3. A short mark that nearly repeats a kept neighbour (same place within 0.5 mm, same direction) goes.
//   4. No 4 mm tile carries more than 9 mm of small marks.
//   5. Long lines over lit paper are drawn a little lighter, so the weight hierarchy reads light to dark.
//   6. With `vary` > 0 every kept line's weight follows a score instead: its importance (length, from detailMm up to
//      structMm, on a log scale) and the side the light falls on (lit 0, mid 0.5, shadow 1). Weight is scaled by
//      1 - vary x (1 - score) and width by 1 + 0.8 x vary x (score - 0.5): long shadow-side structure stays full and
//      wide, short lit detail goes light and fine.
// Pure: lines in, lines out, deterministic for a seed. Planning only, before the target guard seals the target.
import { gaussian } from '../../keyframes/density.mjs';
import { joinLines } from '../../crop/joinlines.mjs';
import { samePart } from './line-join.mjs';

const hash = (k, seed) => { let s = (k * 2654435761 + seed * 40503 + 97) >>> 0; s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0; s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0; return ((s ^ (s >>> 16)) >>> 0) / 4294967296; };

// A smooth zero-mean, unit-deviation field on the plan grid, `sigma` cells across.
export function omissionField(w, h, sigma, seed) {
  const f = gaussian(Float32Array.from({ length: w * h }, (_, i) => hash(i, seed) - 0.5), w, h, sigma);
  let m = 0, v = 0; for (const x of f) m += x; m /= f.length; for (const x of f) v += (x - m) ** 2; const sd = Math.sqrt(v / f.length) || 1;
  return Float32Array.from(f, x => (x - m) / sd);
}

const at = (field, w, h, q) => field[Math.min(h - 1, Math.max(0, Math.round(q.y))) * w + Math.min(w - 1, Math.max(0, Math.round(q.x)))];
const mid = g => g.points[Math.floor(g.points.length / 2)];
const extentOf = g => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of g.points) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; } return Math.max(x1 - x0, y1 - y0); };
const dirOf = g => { const a = g.points[0], b = g.points.at(-1), d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return [(b.x - a.x) / d, (b.y - a.y) / d]; };
const pathLen = pts => { let d = 0; for (let k = 1; k < pts.length; k++) d += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return d; };

function joinCollinear(lines, { gap, cos = 0.9, aim = 0.85 }) {
  if (!(gap > 0) || lines.length < 2) return { lines, joined: 0 };
  const buckets = [];
  for (const g of lines) {
    let b = buckets.find(q => samePart(q.rep, g));
    if (!b) { b = { rep: g, items: [] }; buckets.push(b); }
    b.items.push(g);
  }
  let joined = 0;
  const out = [];
  for (const b of buckets) {
    const r = joinLines(b.items, { gap, cos, aim, step: 1 });
    joined += r.joined;
    for (const g of r.gestures) out.push(r.joined ? { ...g, length: pathLen(g.points) } : g);
  }
  return { lines: joined ? out : lines, joined };
}

/**
 * Prune `lines` (plan-grid polylines from loadLines, each { points:[{x,y,width?,weight?}], length }) for pen and wash.
 * `groups` is the plan's three-value map (0 light, 1 mid, 2 dark) on the w x h grid; without it every mark counts as mid.
 * Returns { lines, stats }.
 */
export function prunePenLines(lines0, { w, h, mmPerCell, groups = null, seed = 1, options = {} }) {
  const o = { joinMm: 1.5, joinCos: 0.9, joinAim: 0.85, minMm: 0.8, detailMm: 3, patchMm: 7, bias: [-0.7, 0, 0.6], jitter: 0.35, keepAbove: 0, dupMm: 0.5, tileMm: 4, tileInkMm: 9, litWeight: 0.8, vary: 0, structMm: 15, ...options };
  const cells = mm => mm / mmPerCell, field = omissionField(w, h, Math.max(1, cells(o.patchMm) / 2), seed);
  const { lines, joined } = joinCollinear(lines0, { gap: cells(o.joinMm), cos: o.joinCos, aim: o.joinAim });
  const groupAt = q => (groups ? at(groups, w, h, q) : 1);
  const stats = { in: lines0.length, ...(joined ? { joined } : {}), short: 0, omitted: 0, duplicate: 0, density: 0, inkMmIn: 0, inkMmOut: 0 };
  for (const g of lines0) stats.inkMmIn += (g.length ?? pathLen(g.points)) * mmPerCell;
  const long = [], detail = [];
  lines.forEach((g, k) => {
    const len = g.length ?? pathLen(g.points), mm = len * mmPerCell;
    if (mm < o.minMm) { stats.short++; return; }
    if (extentOf(g) * mmPerCell >= o.detailMm) { long.push(g); return; }
    const q = mid(g), score = at(field, w, h, q) + o.bias[groupAt(q)] + o.jitter * (hash(k, seed + 7) - 0.5);
    if (score <= o.keepAbove) { stats.omitted++; return; }
    detail.push(g);
  });
  // near repeats and per-tile density, longest marks first so the clearest statement of a feature survives
  detail.sort((a, b) => b.length - a.length);
  const tile = Math.max(2, cells(o.tileMm)), tiles = new Map(), near = new Map(), cellOf = q => `${Math.floor(q.x / tile)},${Math.floor(q.y / tile)}`;
  const kept = [];
  for (const g of detail) {
    const q = mid(g), d = dirOf(g), key = cellOf(q), [tx, ty] = key.split(',').map(Number);
    let dup = false;
    for (let dy = -1; dy <= 1 && !dup; dy++) for (let dx = -1; dx <= 1 && !dup; dx++) for (const o2 of near.get(`${tx + dx},${ty + dy}`) ?? []) {
      if (Math.hypot(o2.q.x - q.x, o2.q.y - q.y) < cells(o.dupMm) && Math.abs(o2.d[0] * d[0] + o2.d[1] * d[1]) > 0.9) { dup = true; break; }
    }
    if (dup) { stats.duplicate++; continue; }
    const used = tiles.get(key) ?? 0, mm = (g.length ?? pathLen(g.points)) * mmPerCell;
    if (used + mm > o.tileInkMm) { stats.density++; continue; }
    tiles.set(key, used + mm);
    if (!near.has(key)) near.set(key, []);
    near.get(key).push({ q, d });
    kept.push(g);
  }
  // keep the file's order (big shapes first) among the survivors
  const keep = new Set([...long, ...kept]), longSet = new Set(long);
  const scoreOf = g => {
    const mm = Math.max(o.detailMm, (g.length ?? pathLen(g.points)) * mmPerCell), imp = Math.min(1, Math.log(mm / o.detailMm) / Math.log(o.structMm / o.detailMm));
    return 0.6 * imp + 0.4 * [0, 0.5, 1][groupAt(mid(g))];
  };
  const varied = g => {
    const sc = scoreOf(g), fw = 1 - o.vary * (1 - sc), fx = 1 + 0.8 * o.vary * (sc - 0.5);
    return { ...g, weight: (g.weight ?? 1) * fw, points: g.points.map(p => ({ ...p, weight: (p.weight ?? 1) * fw, ...(p.width == null ? {} : { width: p.width * fx }) })) };
  };
  const out = lines.filter(g => keep.has(g)).map(g => (o.vary > 0 ? varied(g) : groupAt(mid(g)) === 0 && longSet.has(g)
    ? { ...g, points: g.points.map(p => (p.weight == null ? p : { ...p, weight: p.weight * o.litWeight })) } : g));
  for (const g of out) stats.inkMmOut += (g.length ?? pathLen(g.points)) * mmPerCell;
  stats.out = out.length; stats.long = long.length;
  stats.inkMmIn = +stats.inkMmIn.toFixed(1); stats.inkMmOut = +stats.inkMmOut.toFixed(1);
  return { lines: out, stats };
}
