// A wash as a painter lays it: an outline in millimetres and brush strokes inside it. No cell mask reaches the brush.
//
// outlineLoops: the boundary of a wash's shapes as closed loops in mm, simplified to a tolerance set by the brush (half
// the radius of the smallest wash brush), with each segment marked soft or hard from the two shapes it lies between.
// planWashStrokes: the strokes that lay the wash as one wet film. One brush is chosen from the wash's size and steered
// along the outline, its radius inside it, then round again further in, each round over the wet edge of the last by a
// third of the brush, until the middle is closed. The smallest wash brush does the same where the wash is too narrow
// for the first, and the detail brush goes round inside parts narrower than that. The edge of the wash is where the
// brush's own footprint ends: a curve, never a cut. What no stroke's footprint reaches is counted (uncovered).
// The strokes are worked out on a planning grid a sixth of the smallest brush's width, cut from the outline: the grid is
// set in millimetres, so a sheet with finer cells gets the same strokes.
// Plan time only.
import { traceOutlines } from '../../crop/outline.mjs';

/** A round of the brush goes over the wet edge of the one before by this share of the brush's width. */
const LANE_OVERLAP = 1 / 3;
/** A stroke is laid only when at least this share of what it touches is not yet covered. */
const LEAST_NEW = 0.25;

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
 * @returns {{strokes: Array<{kind:'contour'|'edge'|'point'|'close', radiusMm:number, points:number[][]}>, brushMm:number, areaMm2:number, uncovered:number}}
 *   uncovered is the share of the outline's area no stroke's footprint reaches.
 */
export function planWashStrokes(loops, { kitMm, pointMm = 0, growMm = 0 }) {
  const kit = [...kitMm].sort((a, b) => b - a), small = kit[kit.length - 1], pitch = small / 6;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of loops) for (const [x, y] of l.points) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!(x1 > x0) || !(y1 > y0)) return { strokes: [], areaMm2: 0, uncovered: 0 };
  // lanes run along the longer side: work in a frame whose u axis is that side
  const tall = y1 - y0 > x1 - x0, U = p => (tall ? [p[1], p[0]] : p);
  const pad = pitch * (1 + Math.ceil(growMm / pitch)), ou = (tall ? y0 : x0) - pad, ov = (tall ? x0 : y0) - pad, gw = Math.ceil(((tall ? y1 - y0 : x1 - x0) + 2 * pad) / pitch), gh = Math.ceil(((tall ? x1 - x0 : y1 - y0) + 2 * pad) / pitch), gn = gw * gh;
  const inside = new Uint8Array(gn), rows = Array.from({ length: gh }, () => []);
  for (const l of loops) for (let q = 0; q < l.points.length; q++) {
    const P = U(l.points[q]), Q = U(l.points[(q + 1) % l.points.length]); if (P[1] === Q[1]) continue;
    const lo = Math.min(P[1], Q[1]), hi = Math.max(P[1], Q[1]);
    for (let gy = Math.max(0, Math.ceil((lo - ov) / pitch - .5)); gy < gh; gy++) { const v = ov + (gy + .5) * pitch; if (v >= hi) break; if (v < lo) continue; rows[gy].push(P[0] + (v - P[1]) / (Q[1] - P[1]) * (Q[0] - P[0])); }
  }
  let area = 0;
  for (let gy = 0; gy < gh; gy++) { const xs = rows[gy].sort((a, b) => a - b); for (let q = 0; q + 1 < xs.length; q += 2) for (let gx = Math.max(0, Math.ceil((xs[q] - ou) / pitch - .5)); gx < gw && ou + (gx + .5) * pitch < xs[q + 1]; gx++) { inside[gy * gw + gx] = 1; area++; } }
  if (!area) return { strokes: [], areaMm2: 0, uncovered: 0 };
  // growMm: the wash is laid this far past its outline, so that it meets its neighbours; rounding an outline must not
  // leave paper between two washes
  if (growMm > 0) {
    const far = new Float32Array(gn), R2g = Math.SQRT2;
    for (let i = 0; i < gn; i++) far[i] = inside[i] ? 0 : 1e9;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; let d = far[i]; if (!d) continue; if (x) d = Math.min(d, far[i - 1] + 1); if (y) { d = Math.min(d, far[i - gw] + 1); if (x) d = Math.min(d, far[i - gw - 1] + R2g); if (x < gw - 1) d = Math.min(d, far[i - gw + 1] + R2g); } far[i] = d; }
    for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) { const i = y * gw + x; let d = far[i]; if (!d) continue; if (x < gw - 1) d = Math.min(d, far[i + 1] + 1); if (y < gh - 1) { d = Math.min(d, far[i + gw] + 1); if (x < gw - 1) d = Math.min(d, far[i + gw + 1] + R2g); if (x) d = Math.min(d, far[i + gw - 1] + R2g); } far[i] = d; }
    for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) { const i = y * gw + x; if (!inside[i] && far[i] * pitch <= growMm) { inside[i] = 1; area++; } }
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
  // One brush for the wash, from its size: the widest of the kit whose radius is no more than half the depth of the wash
  // (how far its middle is from its edge), so the wash is closed in a few rounds; the smallest brush for a small wash.
  const brush = kit.find(width => width / 2 <= deepest / 2) ?? small;
  inward('contour', brush / 2, LEAST_NEW / 2);
  // then the smallest brush where the wash is too narrow for that one, and the detail brush where it is narrower still
  if (brush > small) inward('edge', small / 2, LEAST_NEW);
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
  return { strokes, brushMm: brush, areaMm2: area * pitch * pitch, uncovered: 1 - coveredCount / area };
}
