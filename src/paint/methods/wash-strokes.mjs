// A wash as a painter lays it: an outline in millimetres and brush strokes inside it. No cell mask reaches the brush.
//
// outlineLoops: the boundary of a wash's shapes as closed loops in mm, simplified to a tolerance set by the brush (half
// the radius of the smallest wash brush), with each segment marked soft or hard from the two shapes it lies between.
// planWashStrokes: the strokes that fill the outline. The smallest brush is steered round the inside of the outline, its
// radius from it, to state the edge. Then the widest brush of the kit that fits is laid in lanes along the wash's
// longer side, the brush's whole width inside the outline all along each lane, then the smaller brushes where the
// wider ones could not go. The edge of the wash is where the brush's own footprint ends. A part of a wash narrower than the smallest
// wash brush is laid with the detail brush run round inside it. What no stroke's footprint reaches is counted (uncovered).
// The lanes are worked out on a planning grid a sixth of the smallest brush's width, cut from the outline: the grid is
// set in millimetres, so a sheet with finer cells gets the same strokes.
// Plan time only.
import { traceOutlines } from '../../crop/outline.mjs';

/** Lanes of one brush overlap by this share of the brush's width. */
const LANE_OVERLAP = 0.15;
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
    loops.push({ points: kept.map(i => [+pts[i][0].toFixed(3), +pts[i][1].toFixed(3)]), soft: softs });
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
 * @returns {{strokes: Array<{kind:'lane'|'edge'|'point', radiusMm:number, points:number[][]}>, areaMm2:number, uncovered:number}}
 *   uncovered is the share of the outline's area no stroke's footprint reaches.
 */
export function planWashStrokes(loops, { kitMm, pointMm = 0 }) {
  const kit = [...kitMm].sort((a, b) => b - a), small = kit[kit.length - 1], pitch = small / 6;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of loops) for (const [x, y] of l.points) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!(x1 > x0) || !(y1 > y0)) return { strokes: [], areaMm2: 0, uncovered: 0 };
  // lanes run along the longer side: work in a frame whose u axis is that side
  const tall = y1 - y0 > x1 - x0, U = p => (tall ? [p[1], p[0]] : p);
  const ou = (tall ? y0 : x0) - pitch, ov = (tall ? x0 : y0) - pitch, gw = Math.ceil(((tall ? y1 - y0 : x1 - x0)) / pitch) + 2, gh = Math.ceil(((tall ? x1 - x0 : y1 - y0)) / pitch) + 2, gn = gw * gh;
  const inside = new Uint8Array(gn), rows = Array.from({ length: gh }, () => []);
  for (const l of loops) for (let q = 0; q < l.points.length; q++) {
    const P = U(l.points[q]), Q = U(l.points[(q + 1) % l.points.length]); if (P[1] === Q[1]) continue;
    const lo = Math.min(P[1], Q[1]), hi = Math.max(P[1], Q[1]);
    for (let gy = Math.max(0, Math.ceil((lo - ov) / pitch - .5)); gy < gh; gy++) { const v = ov + (gy + .5) * pitch; if (v >= hi) break; if (v < lo) continue; rows[gy].push(P[0] + (v - P[1]) / (Q[1] - P[1]) * (Q[0] - P[0])); }
  }
  let area = 0;
  for (let gy = 0; gy < gh; gy++) { const xs = rows[gy].sort((a, b) => a - b); for (let q = 0; q + 1 < xs.length; q += 2) for (let gx = Math.max(0, Math.ceil((xs[q] - ou) / pitch - .5)); gx < gw && ou + (gx + .5) * pitch < xs[q + 1]; gx++) { inside[gy * gw + gx] = 1; area++; } }
  if (!area) return { strokes: [], areaMm2: 0, uncovered: 0 };
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
  const lay = (kind, radius, pts, least) => { const [fresh, all] = stamp(pts, radius, false); if (!all || fresh < least * all) return; stamp(pts, radius, true); strokes.push({ kind, radiusMm: radius, points: pts.map(toMm) }); };
  // A lane is a flat brush drawn straight: its hairs lie across the stroke, so the whole line of them, one radius to
  // either side, must be inside the outline at every point of the lane, and the lane covers a band, square at its ends.
  // A wider brush's lanes also keep off what is already laid, so no band is charged twice; the smallest brush goes over
  // the strips that leaves.
  const clear = new Float32Array(gn);   // how far a lane's brush may reach straight across it (in grid cells), the nearer side
  const clearance = open => { for (let x = 0; x < gw; x++) { let run = 0; for (let y = 0; y < gh; y++) { const i = y * gw + x; run = open(i) ? run + 1 : 0; clear[i] = run; } run = 0; for (let y = gh - 1; y >= 0; y--) { const i = y * gw + x; run = open(i) ? run + 1 : 0; clear[i] = Math.min(clear[i], run); } } };
  const band = (gy, a, b, rc, commit) => { let fresh = 0, all = 0; for (let y = Math.max(0, Math.ceil(gy - rc)); y <= Math.min(gh - 1, Math.floor(gy + rc)); y++) for (let x = a; x <= b; x++) { const i = y * gw + x; if (!inside[i]) continue; all++; if (!covered[i]) { fresh++; if (commit) { covered[i] = 1; coveredCount++; } } } return [fresh, all]; };
  const lanes = (radius, least, overLaid) => {
    clearance(overLaid ? i => inside[i] : i => inside[i] && !covered[i]);
    const rc = radius / pitch, step = Math.max(1, Math.round(2 * rc * (1 - LANE_OVERLAP))), ok = i => clear[i] >= rc;
    let first = -1; for (let i = 0; i < gn && first < 0; i++) if (ok(i)) first = (i / gw) | 0;
    if (first < 0) return;
    for (let gy = first, turn = 0; gy < gh; gy += step, turn++) for (let gx = 0; gx < gw; gx++) {
      if (!ok(gy * gw + gx)) continue;
      let end = gx; while (end + 1 < gw && ok(gy * gw + end + 1)) end++;
      const [fresh, all] = band(gy, gx, end, rc, false);
      if (end - gx >= rc && all && fresh >= least * all) {
        band(gy, gx, end, rc, true);
        const count = Math.max(2, Math.ceil((end - gx) / rc) + 1), pts = Array.from({ length: count }, (_, q) => [gx + (end - gx) * q / (count - 1), gy]);
        strokes.push({ kind: 'lane', radiusMm: radius, points: (turn % 2 ? pts.reverse() : pts).map(toMm) });
      }
      gx = end;
    }
  };
  // the smallest brush steered round the inside of the outline first, to state the edge; then lanes, widest brush first
  const r = small / 2, ring = Uint8Array.from(D, v => (v >= r - pitch / 2 ? 1 : 0));
  for (const c of traceOutlines(ring, gw, gh, { minLength: Math.round(2 * r / pitch), step: 2 })) {
    const pts = c.points.map(p => [p.x, p.y]); if (pts.length < 2) continue;
    if (Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 4) pts.push(pts[0]);
    lay('edge', r, pts, LEAST_NEW);
  }
  for (const width of kit) lanes(width / 2, LEAST_NEW, false);
  lanes(small / 2, LEAST_NEW, true);
  // parts narrower than the smallest wash brush: the detail brush run round inside them, only along the stretches no
  // stroke has reached
  if (pointMm > 0 && pointMm < small) {
    const rp = pointMm / 2, thin = Uint8Array.from(D, v => (v >= rp - pitch / 2 ? 1 : 0));
    for (const c of traceOutlines(thin, gw, gh, { minLength: Math.round(2 * rp / pitch), step: 2 })) {
      let run = [];
      const flush = () => { if (run.length >= 2) { stamp(run, rp, true); strokes.push({ kind: 'point', radiusMm: rp, points: run.map(toMm) }); } run = []; };
      for (const q of c.points) { const [fresh, all] = stamp([[q.x, q.y]], rp, false); if (all && fresh >= LEAST_NEW * all) run.push([q.x, q.y]); else flush(); }
      flush();
    }
  }
  return { strokes, areaMm2: area * pitch * pitch, uncovered: 1 - coveredCount / area };
}
