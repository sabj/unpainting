// A wash as a painter lays it: an outline in millimetres and brush strokes inside it. No cell mask reaches the brush.
//
// outlineLoops: the boundary of a wash's shapes as closed loops in mm, simplified to a tolerance set by the brush (half
// the radius of the smallest wash brush), with each segment marked soft or hard from the two shapes it lies between.
// planWashStrokes: the strokes that lay the wash as one wet film, with the widest brush of the kit that fits it. A flat
// or a mop (a brush of LANE_FROM_MM or wider) lays a band as wide as itself with square ends. It fits a wash it can be
// swept across in a straight lane at least LANE_LEAST of its width long, and it is swept in such lanes side by side.
// A lane never runs outside its wash and its square ends are never the wash's edge: it stops a round's radius inside
// the outline, and the round, steered along the outline, closes the ends and lays the edge. A round fits a wash at least BRUSH_FIT of its widths across; it is steered along the
// outline, its radius inside it, then round again further in until the middle is closed. Each smaller brush of the kit
// then goes round where the wash is too narrow for the one before, and the detail brush inside parts narrower than
// that. So a wall or a sky is laid with a flat or a mop and only its edge and corners with a round. The edge of the wash is where the brush's own footprint ends: a curve, never a cut. What no
// stroke's footprint reaches is counted (uncovered). A wash is laid a little past its outline to meet its neighbours,
// but never onto a reserved light (keepOut).
// The strokes are worked out on a planning grid a sixth of the smallest brush's width, cut from the outline: the grid is
// set in millimetres, so a sheet with finer cells gets the same strokes.
// Plan time only.
import { traceOutlines } from '../../crop/outline.mjs';

/** A round of the brush goes over the wet edge of the one before by this share of the brush's width. */
export const LANE_OVERLAP = 1 / 3;
/** A stroke is laid only when at least this share of what it touches is not yet covered. */
const LEAST_NEW = 0.25;
/** A brush fits a wash that is at least this many brush widths across at its widest. */
const BRUSH_FIT = 1.25;
/** A brush this wide or wider is a flat or a mop: it is swept in straight lanes, not steered round an outline. */
const LANE_FROM_MM = 12;
/** A lane of a flat or a mop goes over the one beside it by this share of the brush's width. */
export const FLAT_OVERLAP = 0.15;
/** The shortest lane a flat or a mop is swept in, in brush widths. */
const LANE_LEAST = 0.6;

function simplify(pts, tol) {
  // Douglas-Peucker on a closed loop: split at vertex 0 and the vertex furthest from it
  const n = pts.length, keep = new Uint8Array(n); let far = 0, fd = -1;
  for (let i = 1; i < n; i++) { const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  keep[0] = keep[far] = 1;
  const at = i => pts[i % n], stack = [[0, far], [far, n]];
  while (stack.length) {
    const [a, b] = stack.pop(), A = at(a), B = at(b), dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1e-9; let worst = -1, wd = tol;
    for (let i = a + 1; i < b; i++) { const P = at(i), d = Math.abs((P[0] - A[0]) * dy - (P[1] - A[1]) * dx) / len; if (d > wd) { wd = d; worst = i; } }
    if (worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

/**
 * A polygon rounded into a smooth closed curve (two passes of corner cutting). A corner is kept where the outline turns
 * by more than 60 degrees between two straight runs each longer than `legMm` (the brush's width): a corner of the
 * subject, not of the grid. `soft[q]` belongs to the segment leaving point q and is carried onto the curve.
 */
function rounded(points, soft, legMm) {
  let P = points, S = soft;
  for (let pass = 0; pass < 2; pass++) {
    const n = P.length, keep = P.map((p, i) => { const a = P[(i + n - 1) % n], b = P[(i + 1) % n], ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1], la = Math.hypot(ux, uy), lb = Math.hypot(vx, vy); return la > legMm && lb > legMm && (ux * vx + uy * vy) / (la * lb) < .5; });
    const Q = [], F = [];
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], j = (i + 1) % n;
      Q.push(keep[i] ? a : [.75 * a[0] + .25 * b[0], .75 * a[1] + .25 * b[1]]); F.push(S[i]);
      if (!keep[j]) { Q.push([.25 * a[0] + .75 * b[0], .25 * a[1] + .75 * b[1]]); F.push(S[i] && S[j]); }
    }
    P = Q; S = F;
  }
  return { points: P, soft: S };
}

/**
 * The outline of the cells with ids[i] === id, as closed loops in mm (outer edges and holes).
 * @param soft (inside cell, outside cell or -1 off the sheet) => true when that boundary is a soft one
 * @returns Array<{points: number[][], soft: boolean[]}> soft[q] is for the segment from points[q] to the next point
 */
export function outlineLoops(ids, id, box, w, h, { cellMm, tolMm, soft = () => false }) {
  const W = w + 1, from = [], to = [], flag = [], next = new Map();
  const add = (a, b, f) => { const e = from.length; from.push(a); to.push(b); flag.push(f ? 1 : 0); const l = next.get(a); if (l) l.push(e); else next.set(a, [e]); };
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const i = y * w + x; if (ids[i] !== id) continue;
    const out = (xx, yy) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? -1 : ids[yy * w + xx] === id ? -2 : yy * w + xx);
    let j;
    if ((j = out(x, y - 1)) !== -2) add(y * W + x, y * W + x + 1, soft(i, j));
    if ((j = out(x + 1, y)) !== -2) add(y * W + x + 1, (y + 1) * W + x + 1, soft(i, j));
    if ((j = out(x, y + 1)) !== -2) add((y + 1) * W + x + 1, (y + 1) * W + x, soft(i, j));
    if ((j = out(x - 1, y)) !== -2) add((y + 1) * W + x, y * W + x, soft(i, j));
  }
  const used = new Uint8Array(from.length), loops = [];
  for (let e0 = 0; e0 < from.length; e0++) {
    if (used[e0]) continue;
    const chain = []; let e = e0;
    for (;;) { used[e] = 1; chain.push(e); const l = next.get(to[e]); let nx = -1; for (const c of l) if (!used[c]) { nx = c; break; } if (nx < 0) break; e = nx; }
    const pts = chain.map(c => [(from[c] % W) * cellMm, Math.floor(from[c] / W) * cellMm]), kept = simplify(pts, tolMm);
    if (kept.length < 3) continue;
    const softs = kept.map((a, q) => { const b = q + 1 < kept.length ? kept[q + 1] : pts.length; let s = 0; for (let c = a; c < b; c++) s += flag[chain[c]]; return s * 2 > b - a; });
    const curve = rounded(kept.map(i => pts[i]), softs, 4 * tolMm);
    loops.push({ points: curve.points.map(q => [+q[0].toFixed(3), +q[1].toFixed(3)]), soft: curve.soft });
  }
  return loops;
}

/**
 * How the brush is held for a stroke of a wash, as the engine's `upright` option. A lane is a flat or a mop swept straight:
 * its edge is held across the run from the lane's first point to its last ('sweep'). Every other stroke is a round steered
 * along the outline: it turns with its path (false), so what it lays is as wide as the brush all the way round and its
 * side is the outline's curve. Held one way for the whole stroke it lays a slanted band with straight-cut ends, thin
 * wherever the path runs along the way it is held, and leaves straight-sided bare patches the plan counts as covered.
 */
export const washStrokeHold = round => (round ? false : 'sweep');

/**
 * The cells of a w x h sheet (each `mm` wide) whose centres lie inside a set of outline loops (even-odd, so a loop inside
 * another is a hole): an outline in millimetres put on a sheet at the sheet's own cell size, whatever grid it was traced on.
 */
export function loopsMask(loops, w, h, mm) {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const py = (y + .5) * mm, xs = [];
    for (const { points: P } of loops) for (let q = 0, m = P.length; q < m; q++) { const a = P[q], b = P[(q + 1) % m]; if ((a[1] <= py) !== (b[1] <= py)) xs.push(a[0] + (py - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) for (let x = Math.max(0, Math.ceil(xs[q] / mm - .5)), e = Math.min(w - 1, Math.ceil(xs[q + 1] / mm - .5) - 1); x <= e; x++) mask[y * w + x] = 1;
  }
  return mask;
}

/** The soft parts of an outline as lines a damp brush is run along: runs of soft segments, each a list of points in mm. */
export function softLines(loops) {
  const lines = [];
  for (const { points, soft } of loops) {
    const n = points.length;
    if (soft.every(Boolean)) { lines.push([...points, points[0]]); continue; }
    const start = soft.findIndex((v, q) => v && !soft[(q + n - 1) % n]); if (start < 0) continue;
    let line = null;
    for (let s = 0; s < n; s++) { const q = (start + s) % n; if (soft[q]) { (line ??= [points[q]]).push(points[(q + 1) % n]); } else if (line) { lines.push(line); line = null; } }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * The strokes that lay a wash inside its outline.
 * @param loops outlineLoops' result. @param kitMm the wash brushes' belly widths in mm. @param pointMm the detail brush's belly width.
 * @param growMm the wash is laid this far past its outline. @param keepOut outlines (as loops) the wash never grows onto.
 * @returns {{strokes: Array<{kind:'lane'|'contour'|'edge'|'point'|'close', radiusMm:number, points:number[][]}>, brushMm:number, depthMm:number, areaMm2:number, uncovered:number}}
 *   brushMm is the widest brush used, depthMm how far the middle of the wash is from its edge, uncovered the share of
 *   the outline's area no stroke's footprint reaches.
 */
export function planWashStrokes(loops, { kitMm, pointMm = 0, growMm = 0, keepOut = null }) {
  const kit = [...kitMm].sort((a, b) => b - a), small = kit[kit.length - 1], pitch = small / 6;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of loops) for (const [x, y] of l.points) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!(x1 > x0) || !(y1 > y0)) return { strokes: [], areaMm2: 0, uncovered: 0 };
  // lanes run along the longer side: work in a frame whose u axis is that side
  const tall = y1 - y0 > x1 - x0, U = p => (tall ? [p[1], p[0]] : p);
  const pad = pitch * (1 + Math.ceil(growMm / pitch)), ou = (tall ? y0 : x0) - pad, ov = (tall ? x0 : y0) - pad, gw = Math.ceil(((tall ? y1 - y0 : x1 - x0) + 2 * pad) / pitch), gh = Math.ceil(((tall ? x1 - x0 : y1 - y0) + 2 * pad) / pitch), gn = gw * gh;
  // the grid cells whose centres lie inside a set of loops (even-odd)
  const fill = ls => {
    const m = new Uint8Array(gn), rows = Array.from({ length: gh }, () => []);
    for (const l of ls) for (let q = 0; q < l.points.length; q++) {
      const P = U(l.points[q]), Q = U(l.points[(q + 1) % l.points.length]); if (P[1] === Q[1]) continue;
      const lo = Math.min(P[1], Q[1]), hi = Math.max(P[1], Q[1]);
      for (let gy = Math.max(0, Math.ceil((lo - ov) / pitch - .5)); gy < gh; gy++) { const v = ov + (gy + .5) * pitch; if (v >= hi) break; if (v < lo) continue; rows[gy].push(P[0] + (v - P[1]) / (Q[1] - P[1]) * (Q[0] - P[0])); }
    }
    for (let gy = 0; gy < gh; gy++) { const xs = rows[gy].sort((a, b) => a - b); for (let q = 0; q + 1 < xs.length; q += 2) for (let gx = Math.max(0, Math.ceil((xs[q] - ou) / pitch - .5)); gx < gw && ou + (gx + .5) * pitch < xs[q + 1]; gx++) m[gy * gw + gx] = 1; }
    return m;
  };
  const inside = fill(loops), barred = growMm > 0 && keepOut?.length ? fill(keepOut) : null;
  let area = 0; for (let i = 0; i < gn; i++) area += inside[i];
  if (!area) return { strokes: [], areaMm2: 0, uncovered: 0 };
  // growMm: the wash is laid this far past its outline, so that it meets its neighbours; rounding an outline must not
  // leave paper between two washes
  if (growMm > 0) {
    const far = new Float32Array(gn), R2g = Math.SQRT2;
    for (let i = 0; i < gn; i++) far[i] = inside[i] ? 0 : 1e9;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; let d = far[i]; if (!d) continue; if (x) d = Math.min(d, far[i - 1] + 1); if (y) { d = Math.min(d, far[i - gw] + 1); if (x) d = Math.min(d, far[i - gw - 1] + R2g); if (x < gw - 1) d = Math.min(d, far[i - gw + 1] + R2g); } far[i] = d; }
    for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) { const i = y * gw + x; let d = far[i]; if (!d) continue; if (x < gw - 1) d = Math.min(d, far[i + 1] + 1); if (y < gh - 1) { d = Math.min(d, far[i + gw] + 1); if (x < gw - 1) d = Math.min(d, far[i + gw + 1] + R2g); if (x) d = Math.min(d, far[i + gw - 1] + R2g); } far[i] = d; }
    for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) { const i = y * gw + x; if (!inside[i] && far[i] * pitch <= growMm && !barred?.[i]) { inside[i] = 1; area++; } }
  }
  // distance in mm from each inside cell to the outline
  const D = new Float32Array(gn), R2 = Math.SQRT2;
  for (let i = 0; i < gn; i++) D[i] = inside[i] ? 1e9 : 0;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; if (!D[i]) continue; let d = D[i]; if (x) d = Math.min(d, D[i - 1] + 1); if (y) { d = Math.min(d, D[i - gw] + 1); if (x) d = Math.min(d, D[i - gw - 1] + R2); if (x < gw - 1) d = Math.min(d, D[i - gw + 1] + R2); } D[i] = d; }
  for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) { const i = y * gw + x; if (!D[i]) continue; let d = D[i]; if (x < gw - 1) d = Math.min(d, D[i + 1] + 1); if (y < gh - 1) { d = Math.min(d, D[i + gw] + 1); if (x < gw - 1) d = Math.min(d, D[i + gw + 1] + R2); if (x) d = Math.min(d, D[i + gw - 1] + R2); } D[i] = d; }
  for (let i = 0; i < gn; i++) if (D[i]) D[i] = (D[i] - .5) * pitch;
  const covered = new Uint8Array(gn), seen = new Int32Array(gn); let stampId = 0, coveredCount = 0;
  // the inside cells a stroke's footprint touches: [not yet covered, all]; commit marks them covered
  const stamp = (pts, radius, commit) => {
    stampId++; const rc = radius / pitch + .5, r2 = rc * rc; let fresh = 0, all = 0;
    for (let q = 0; q < pts.length; q++) {
      const A = pts[q], B = pts[Math.min(pts.length - 1, q + 1)], steps = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / Math.max(1, rc / 2)));
      for (let s = 0; s < (q + 1 < pts.length ? steps : 1); s++) {
        const cx = A[0] + (B[0] - A[0]) * s / steps, cy = A[1] + (B[1] - A[1]) * s / steps;
        for (let y = Math.max(0, Math.floor(cy - rc)); y <= Math.min(gh - 1, Math.ceil(cy + rc)); y++) for (let x = Math.max(0, Math.floor(cx - rc)); x <= Math.min(gw - 1, Math.ceil(cx + rc)); x++) {
          const i = y * gw + x; if (!inside[i] || seen[i] === stampId || (x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
          seen[i] = stampId; all++; if (!covered[i]) { fresh++; if (commit) { covered[i] = 1; coveredCount++; } }
        }
      }
    }
    return [fresh, all];
  };
  const strokes = [], toMm = ([gx, gy]) => { const u = ou + (gx + .5) * pitch, v = ov + (gy + .5) * pitch; return tall ? [+v.toFixed(3), +u.toFixed(3)] : [+u.toFixed(3), +v.toFixed(3)]; };
  let deepest = 0; for (let i = 0; i < gn; i++) if (D[i] > deepest) deepest = D[i];
  // A brush steered along the line `level` mm inside the outline, laid along the stretches where at least `least` of
  // what it touches is not yet covered.
  const follow = (kind, radius, level, least) => {
    const ring = Uint8Array.from(D, v => (v >= level - pitch / 2 ? 1 : 0));
    for (const c of traceOutlines(ring, gw, gh, { minLength: Math.max(2, Math.round(2 * radius / pitch)), step: 2 })) {
      const pts = c.points.map(p => [p.x, p.y]); if (pts.length < 2) continue;
      if (Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 4) pts.push(pts[0]);
      let run = [];
      const long = r => { let l = 0; for (let q = 1; q < r.length; q++) l += Math.hypot(r[q][0] - r[q - 1][0], r[q][1] - r[q - 1][1]); return l * pitch >= 2 * radius; };   // a stroke, not a dab
      const flush = () => { if (run.length >= 2 && long(run)) { stamp(run, radius, true); strokes.push({ kind, radiusMm: radius, points: run.map(toMm) }); } run = []; };
      for (const q of pts) { const [fresh, all] = stamp([q], radius, false); if (all && fresh >= least * all) run.push(q); else flush(); }
      flush();
    }
  };
  // A wash is laid from its edge inward: the brush follows the outline, its radius inside it, then follows it again
  // further in, each round over the wet edge of the last by LANE_OVERLAP of the brush, until the middle is closed.
  const inward = (kind, radius, least) => {
    const step = 2 * radius * (1 - LANE_OVERLAP); let level = radius;
    for (; level <= deepest; level += step) follow(kind, radius, level, least);
    if (deepest > level - step + radius) follow(kind, radius, Math.max(level - step + radius / 2, deepest - pitch), least);
  };
  // A flat or a mop lays a band as wide as itself and as long as it travels, with square ends. A square end is never the
  // edge of a wash: the band stays the width of the widest round, less a small overlap, inside the outline (so the edge is not laid twice and does not dry as a dark ring), and that round, steered along the
  // outline, lays the edge over the band's ends and sides. Where a flat of this radius can be put down so: by row, the
  // runs of the grid it can be swept along.
  const rounds = kit.filter(width => width < LANE_FROM_MM), inset = rounds.length ? rounds[0] * (1 - FLAT_OVERLAP) : 0;
  const column = new Int32Array((gh + 1) * gw); for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) column[(gy + 1) * gw + gx] = column[gy * gw + gx] + (D[gy * gw + gx] >= inset ? 1 : 0);
  const runsFor = radius => {
    const rc = Math.floor(radius / pitch), rows = [];
    for (let gy = rc; gy < gh - rc; gy++) { let from = -1; for (let gx = 0; gx <= gw; gx++) { const ok = gx < gw && column[(gy + rc + 1) * gw + gx] - column[(gy - rc) * gw + gx] === 2 * rc + 1; if (ok && from < 0) from = gx; else if (!ok && from >= 0) { (rows[gy] ??= []).push([from, gx - 1]); from = -1; } } }
    return rows;
  };
  const longest = rows => { let l = 0; for (const runs of rows) if (runs) for (const [a, b] of runs) l = Math.max(l, (b - a) * pitch); return l; };
  // the cells a lane's band touches: [not yet covered, all]; commit marks them covered
  const band = (a, b, gy, rc, commit) => { let fresh = 0, all = 0; for (let y = gy - rc; y <= gy + rc; y++) for (let x = a; x <= b; x++) { const i = y * gw + x; all++; if (!covered[i]) { fresh++; if (commit) { covered[i] = 1; coveredCount++; } } } return [fresh, all]; };
  // Straight lanes side by side across the wash, no further apart than the brush less its overlap: the wash is cut into
  // that many bands and each band's lane is swept where the brush can travel furthest, from edge to edge.
  const sweep = (radius, rows) => {
    const rc = Math.floor(radius / pitch); let top = -1, bottom = -1; rows.forEach((runs, gy) => { if (runs) { if (top < 0) top = gy; bottom = gy; } });
    // as many lanes as cover the wash from its top to its bottom; the outer two hug its edges where the brush travels as far there
    const count = Math.max(1, Math.ceil(((bottom - top) * pitch + 2 * radius * (1 - FLAT_OVERLAP)) / (2 * radius * (1 - FLAT_OVERLAP)) - 1e-9));
    for (let q = 0; q < count; q++) {
      const ideal = count > 1 ? top + q * (bottom - top) / (count - 1) : (top + bottom) / 2; let gy = -1, reach = -1;
      for (let y = Math.ceil(top + q * (bottom - top) / count); y <= top + (q + 1) * (bottom - top) / count; y++) for (const [a, b] of rows[y] ?? []) if (b - a > reach || (b - a === reach && Math.abs(y - ideal) < Math.abs(gy - ideal))) { reach = b - a; gy = y; }
      for (const [a, b] of rows[gy] ?? []) {
        if ((b - a) * pitch < LANE_LEAST * 2 * radius) continue;   // a stroke, not a dab
        const [fresh, all] = band(a, b, gy, rc, false);
        if (fresh >= LEAST_NEW * all) { band(a, b, gy, rc, true); strokes.push({ kind: 'lane', radiusMm: radius, points: [[a, gy], [(a + b) / 2, gy], [b, gy]].map(toMm) }); }
      }
    }
  };
  // The first brush, from the wash's size: the widest of the kit that fits it; the smallest brush for a small wash.
  const brush = kit.find(width => (width >= LANE_FROM_MM ? longest(runsFor(width / 2)) >= LANE_LEAST * width : BRUSH_FIT * width <= 2 * deepest)) ?? small;
  if (brush >= LANE_FROM_MM) sweep(brush / 2, runsFor(brush / 2)); else inward('contour', brush / 2, LEAST_NEW / 2);
  // then each smaller brush where the wash is too narrow for the one before, and the detail brush where it is narrower still
  for (const width of kit) if (width < brush) inward('edge', width / 2, LEAST_NEW);
  if (pointMm > 0 && pointMm < small) follow('point', pointMm / 2, pointMm / 2, LEAST_NEW);
  // A wash covers its whole outline: where a patch as large as a touch of the smallest brush is still bare (the middle of
  // a round too small to trace), one more stroke of that brush is drawn through it, end to end.
  {
    const seenBare = new Uint8Array(gn), stack = new Int32Array(gn), r = small / 2, touch = Math.PI * (r / pitch) ** 2 / 2;
    for (let s0 = 0; s0 < gn; s0++) {
      if (!inside[s0] || covered[s0] || seenBare[s0]) continue;
      let sp = 0, count = 0, ax = gw, bx = -1, ay = gh, by = -1, sx = 0, sy = 0; stack[sp++] = s0; seenBare[s0] = 1;
      while (sp) { const i = stack[--sp], x = i % gw, y = (i / gw) | 0; count++; sx += x; sy += y; if (x < ax) ax = x; if (x > bx) bx = x; if (y < ay) ay = y; if (y > by) by = y; for (const j of [x ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, i - gw, i + gw]) if (j >= 0 && j < gn && inside[j] && !covered[j] && !seenBare[j]) { seenBare[j] = 1; stack[sp++] = j; } }
      if (count < touch) continue;
      const cx = sx / count, cy = sy / count, half = Math.max(r / pitch, (Math.max(bx - ax, by - ay)) / 2), pts = bx - ax >= by - ay ? [[cx - half, cy], [cx, cy], [cx + half, cy]] : [[cx, cy - half], [cx, cy], [cx, cy + half]];
      stamp(pts, r, true); strokes.push({ kind: 'close', radiusMm: r, points: pts.map(toMm) });
    }
  }
  return { strokes, brushMm: brush, depthMm: deepest, areaMm2: area * pitch * pitch, uncovered: 1 - coveredCount / area };
}
