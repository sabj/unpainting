// How a painter fills a shape with one wash: parallel, overlapping sweeps in one direction, carrying the wet edge (the
// bead) down from one sweep to the next, so the sweeps merge into one even film. No concentric rings.
//
// The direction is the shape's long axis unless one is given. The brush is the widest of the kit that fits the shape.
// Its centre runs inside the outline by its own radius, so the outline is met by the edge of the brush. The sweeps go
// back and forth (a zigzag), each turn running along the outline from the end of one sweep to the start of the next:
// so a zigzag is one stroke with two ends, and the sides of the shape are laid by the brush's edge as it turns. A part of
// the shape the sweeps cannot reach (a corner, a narrow arm) is filled the same way with the next smaller brush.
// Every path is a smooth line in millimetres: nothing follows a grid's steps.
// Plan time only.
import { traceOutlines } from '../../crop/outline.mjs';

/** Neighbouring sweeps overlap by this share of the brush's width, so the bead is carried. */
const SWEEP_OVERLAP = 0.3;
/** A brush fits a shape whose widest part is at least this many brush widths across. */
const BRUSH_FIT = 1.1;
/** A part left bare is filled when it is at least this share of a touch of the brush that fills it. */
const LEAST_BARE = 0.5;
/** The pressure a lane's end lifts to (a round brush at this pressure is a little over half as wide). */
const LIFT = 0.4;
/** The brush is recharged (a new stroke, from where the last one ended) every this many lanes. */
const LANES_PER_LOAD = 2;
/** A lane's square end may reach this far (mm, or this share of the brush's radius) past where the brush fits, at a slanting outline. */
const OVERSHOOT_MM = 2, OVERSHOOT_SHARE = 0.3;
/** A bare sliver narrower than this (mm) is closed by the wet wash itself and gets no stroke. */
const SLIVER_MM = 2.5;
/** The first brush is the widest whose sweeps leave no more than this share of the shape to a smaller brush. */
const SWEPT_SHARE = 0.2;
/** The first brush leaves at least this many sweeps across the shape (a broad brush in a small shape is a blot). */
const LEAST_SWEEPS = 2.5;

/** A shape this many times longer than it is wide is swept along its length; any other across the sheet, top down. */
const ELONGATED = 2.5;

/**
 * The direction a painter sweeps a shape: along its long axis when it is clearly long (a post, a band, a slanting
 * shadow), else level, from the top down, the board tilted so the bead runs down. `points` are the outline's vertices.
 */
export function sweepAngle(points) {
  let sx = 0, sy = 0; for (const [x, y] of points) { sx += x; sy += y; }
  const n = points.length || 1, mx = sx / n, my = sy / n; let a = 0, b = 0, c = 0;
  for (const [x, y] of points) { const dx = x - mx, dy = y - my; a += dx * dx; b += dx * dy; c += dy * dy; }
  const mean = (a + c) / 2, d = Math.sqrt(((a - c) / 2) ** 2 + b * b), l1 = mean + d, l2 = Math.max(1e-9, mean - d);
  if (Math.sqrt(l1 / l2) < ELONGATED) return 0;
  let th = 0.5 * Math.atan2(2 * b, a - c);
  // a near-vertical shape is swept down its length, from the top
  if (th > Math.PI / 4) th -= Math.PI; else if (th < -3 * Math.PI / 4) th += Math.PI;
  return th;
}

function distance(inside, gw, gh) {
  // two-pass chamfer distance (in grid cells) from each inside cell to the nearest outside cell
  const D = new Float32Array(gw * gh), R2 = Math.SQRT2;
  for (let i = 0; i < D.length; i++) D[i] = inside[i] ? 1e9 : 0;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; if (!D[i]) continue; let d = D[i]; if (x) d = Math.min(d, D[i - 1] + 1); if (y) { d = Math.min(d, D[i - gw] + 1); if (x) d = Math.min(d, D[i - gw - 1] + R2); if (x < gw - 1) d = Math.min(d, D[i - gw + 1] + R2); } else d = Math.min(d, 1); if (!x || x === gw - 1) d = Math.min(d, 1); D[i] = d; }
  for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) { const i = y * gw + x; if (!D[i]) continue; let d = D[i]; if (x < gw - 1) d = Math.min(d, D[i + 1] + 1); if (y < gh - 1) { d = Math.min(d, D[i + gw] + 1); if (x < gw - 1) d = Math.min(d, D[i + gw + 1] + R2); if (x) d = Math.min(d, D[i + gw - 1] + R2); } else d = Math.min(d, 1); D[i] = d; }
  return D;
}

/** Clears the 4-connected parts of `m` smaller than `least` cells. */
function dropSmall(m, gw, gh, least) {
  const seen = new Uint8Array(m.length), stack = [];
  for (let s0 = 0; s0 < m.length; s0++) {
    if (!m[s0] || seen[s0]) continue;
    const part = []; stack.push(s0); seen[s0] = 1;
    while (stack.length) { const i = stack.pop(), x = i % gw; part.push(i); for (const j of [x ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, i - gw, i + gw]) if (j >= 0 && j < m.length && m[j] && !seen[j]) { seen[j] = 1; stack.push(j); } }
    if (part.length < least) for (const i of part) m[i] = 0;
  }
}

/** A polyline with points no closer than `gap` (its ends kept). */
function thin(P, gap) {
  const out = [P[0]];
  for (let q = 1; q < P.length - 1; q++) if (Math.hypot(P[q][0] - out[out.length - 1][0], P[q][1] - out[out.length - 1][1]) >= gap) out.push(P[q]);
  if (P.length > 1) out.push(P[P.length - 1]);
  return out;
}

/** A polyline smoothed by corner cutting (Chaikin), its two ends kept. */
function smoothLine(P, passes = 2) {
  let Q = P;
  for (let s = 0; s < passes && Q.length > 2; s++) {
    const R = [Q[0]];
    for (let i = 0; i + 1 < Q.length; i++) { const a = Q[i], b = Q[i + 1]; R.push([.75 * a[0] + .25 * b[0], .75 * a[1] + .25 * b[1]], [.25 * a[0] + .75 * b[0], .25 * a[1] + .75 * b[1]]); }
    R.push(Q[Q.length - 1]); Q = R;
  }
  return Q;
}

/**
 * The strokes that fill `loops` (closed outlines in mm, even-odd) as one wash.
 * @param kitMm brush widths (mm) the painter has for washes; @param angle the sweeps' direction (radians), or the long axis
 * @param growMm the wash is laid this far past its outline (to meet a neighbour); never onto `keepOut` (loops)
 * @returns {{strokes: Array<{kind:'sweep', radiusMm:number, points:number[][]}>, brushMm:number, angle:number, depthMm:number, areaMm2:number, uncovered:number}}
 */
export function sweepFill(loops, { kitMm, angle = null, growMm = 0, keepOut = null, overlap = SWEEP_OVERLAP }) {
  const kit = [...kitMm].sort((a, b) => b - a), small = kit[kit.length - 1];
  const all = loops.flatMap(l => l.points);
  if (all.length < 3) return { strokes: [], brushMm: 0, angle: 0, depthMm: 0, areaMm2: 0, uncovered: 0 };
  if (angle == null) { const spine = spineFill(loops, kit); if (spine) return spine; }
  const th = angle ?? sweepAngle(all), c = Math.cos(th), s = Math.sin(th);
  // the frame turned so the sweeps run along u
  const toU = ([x, y]) => [x * c + y * s, -x * s + y * c], toXY = ([u, v]) => [+(u * c - v * s).toFixed(3), +(u * s + v * c).toFixed(3)];
  const pitch = Math.max(0.2, Math.min(0.5, small / 10));
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const p of all) { const [u, v] = toU(p); if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
  const pad = 2 + Math.ceil(growMm / pitch), ou = u0 - pad * pitch, ov = v0 - pad * pitch, gw = Math.ceil((u1 - u0) / pitch) + 2 * pad + 1, gh = Math.ceil((v1 - v0) / pitch) + 2 * pad + 1, gn = gw * gh;
  const fill = ls => {
    const m = new Uint8Array(gn);
    for (let gy = 0; gy < gh; gy++) {
      const v = ov + (gy + .5) * pitch, xs = [];
      for (const l of ls) for (let q = 0; q < l.points.length; q++) { const P = toU(l.points[q]), Q = toU(l.points[(q + 1) % l.points.length]); if ((P[1] <= v) !== (Q[1] <= v)) xs.push(P[0] + (v - P[1]) / (Q[1] - P[1]) * (Q[0] - P[0])); }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) for (let gx = Math.max(0, Math.ceil((xs[q] - ou) / pitch - .5)); gx < gw && ou + (gx + .5) * pitch < xs[q + 1]; gx++) m[gy * gw + gx] = 1;
    }
    return m;
  };
  const inside = fill(loops);
  if (growMm > 0) {
    const out = distance(Uint8Array.from(inside, v => 1 - v), gw, gh), barred = keepOut?.length ? fill(keepOut) : null;
    for (let i = 0; i < gn; i++) if (!inside[i] && out[i] * pitch <= growMm && !barred?.[i]) inside[i] = 1;
  }
  let area = 0; for (let i = 0; i < gn; i++) area += inside[i];
  if (!area) return { strokes: [], brushMm: 0, angle: th, depthMm: 0, areaMm2: 0, uncovered: 0 };
  const D = distance(inside, gw, gh); let deepest = 0; for (let i = 0; i < gn; i++) if (D[i] * pitch > deepest) deepest = D[i] * pitch;
  const covered = new Uint8Array(gn);
  // A stroke's footprint as the engine lays it: the brush is a band across its heading as wide as itself, so each
  // segment of the path lays a rectangle (a stroke's end is cut square across its heading, not rounded).
  const stamp = (pts, r) => {
    const rc = r / pitch;
    for (let q = 0; q + 1 < pts.length; q++) {
      const A = pts[q], B = pts[q + 1], dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy); if (len < 1e-9) continue;
      const tx = dx / len, ty = dy / len;
      for (let y = Math.max(0, Math.floor(Math.min(A[1], B[1]) - rc)); y <= Math.min(gh - 1, Math.ceil(Math.max(A[1], B[1]) + rc)); y++) for (let x = Math.max(0, Math.floor(Math.min(A[0], B[0]) - rc)); x <= Math.min(gw - 1, Math.ceil(Math.max(A[0], B[0]) + rc)); x++) {
        const px = x + .5 - A[0], py = y + .5 - A[1], along = px * tx + py * ty, across = Math.abs(-px * ty + py * tx);
        if (along >= -.5 && along <= len + .5 && across <= rc) covered[y * gw + x] = 1;
      }
    }
  };
  const strokes = [];
  // One brush's sweeps over `region`: level lanes, top down, each overlapping the one above by `overlap` of the brush,
  // each run from one side of the shape to the other. The brush is held across its heading, so a lane's end is square:
  // it stops where its end meets the outline (where the outline slants, at the first corner of its end to meet it).
  const zigzag = (radius, region) => {
    const rc = radius / pitch, fit = new Uint8Array(gn), band = new Uint8Array(gn), R = Math.round(rc);
    for (let i = 0; i < gn; i++) if (region[i] && D[i] >= rc) fit[i] = 1;
    // where the brush's whole width fits across a lane (the inside cells from rc above to rc below)
    for (let x = 0; x < gw; x++) { let run = 0; const up = new Int32Array(gh); for (let y = 0; y < gh; y++) { run = inside[y * gw + x] ? run + 1 : 0; up[y] = run; } for (let y = R; y < gh - R; y++) if (region[y * gw + x] && up[y + R] >= 2 * R + 1) band[y * gw + x] = 1; }
    let top = -1, bottom = -1; for (let i = 0; i < gn; i++) if (band[i]) { const y = (i / gw) | 0; if (top < 0) top = y; bottom = y; }
    if (top < 0) return 0;
    const span = bottom - top, step = 2 * rc * (1 - overlap), lanes = Math.max(1, Math.ceil(span / step - 1e-9) + 1), gap = lanes > 1 ? span / (lanes - 1) : 0;
    // the runs of each lane where the brush's width fits across
    const rows = [];
    for (let q = 0; q < lanes; q++) {
      const gy = Math.round(top + q * gap), runs = []; let from = -1;
      for (let gx = 0; gx <= gw; gx++) {
        const ok = gx < gw && band[gy * gw + gx];
        if (ok && from < 0) from = gx;
        else if (!ok && from >= 0) {
          let a = from, b = gx - 1; from = -1;
          // where the outline slants the square end reaches on past the band's fit, up to OVERSHOOT_MM, half of it outside
          // the outline and half filling the corner the slant leaves
          let a0 = a, b0 = b; while (a0 > 0 && inside[gy * gw + a0 - 1]) a0--; while (b0 < gw - 1 && inside[gy * gw + b0 + 1]) b0++;
          const over = Math.max(OVERSHOOT_MM, OVERSHOOT_SHARE * radius) / pitch; a -= Math.min((a - a0) / 2, over); b += Math.min((b0 - b) / 2, over);
          if ((b - a) * pitch >= radius) runs.push([a, b]);   // a stroke, not a dab
        }
      }
      rows.push({ gy, runs });
    }
    // The lanes of one part of the shape are one stroke, back and forth, top down, the bead carried from each lane to
    // the next: at a lane's end the brush steps in by its radius, runs down beside the outline (so its band, held across
    // its heading, reaches the outline and lays the side), and steps out to the next lane's end.
    const chains = []; let open = [];
    for (const { gy, runs } of rows) {
      const next = [], taken = new Set();
      for (const run of runs) {
        let best = null, bo = 0;
        for (const ch of open) { if (taken.has(ch)) continue; const [a, b] = ch.runs[ch.runs.length - 1].run, o = Math.min(b, run[1]) - Math.max(a, run[0]); if (o > bo) { bo = o; best = ch; } }
        if (best) { taken.add(best); best.runs.push({ gy, run }); next.push(best); } else { const ch = { runs: [{ gy, run }] }; chains.push(ch); next.push(ch); }
      }
      open = next;
    }
    let made = 0;
    // a point may carry the hand's pressure as a third number (a lane's end lifts, so its end is round, not square)
    const emit = line => { stamp(line, radius); strokes.push({ kind: 'sweep', radiusMm: +radius.toFixed(3), points: line.map(([gx2, gy2, p]) => (p == null ? toXY([ou + gx2 * pitch, ov + gy2 * pitch]) : [...toXY([ou + gx2 * pitch, ov + gy2 * pitch]), p])) }); made++; };
    const insideLine = (A, B) => { for (let t = 0; t <= 8; t++) { const x = Math.round(A[0] + (B[0] - A[0]) * t / 8 - .5), y = Math.round(A[1] + (B[1] - A[1]) * t / 8 - .5); if (!(D[y * gw + x] >= .8 * rc)) return false; } return true; };
    for (const ch of chains) {
      let line = [];
      ch.runs.forEach(({ gy, run: [a, b] }, k) => {
        const rightward = k % 2 === 0, start = rightward ? a : b, end = rightward ? b : a, y = gy + .5;
        if (line.length) {
          // the turn: in from the last lane's end, down beside the outline, out to this lane's end
          // each turn point is where the brush's whole disc first fits, walking in from the lane's end
          const fitFrom = (x0, yy, dir) => { let x = x0; for (let t = 0; t < 3 * rc && !(D[Math.round(yy - .5) * gw + Math.round(x - .5)] >= rc); t++) x += dir; return [x, yy]; };
          const last = line[line.length - 1], inA = fitFrom(last[0], last[1], rightward ? 1 : -1), inB = fitFrom(start + .5, y, rightward ? 1 : -1);
          if (insideLine(inA, inB)) line.push(inA, inB);
          else { if (line.length >= 2) emit(line); line = []; }
        }
        // the hand eases off over the last radius of a lane, so its end is rounded by the brush, not cut square
        const dir = end > start ? 1 : -1, ease = Math.min(rc, Math.abs(end - start) / 3);
        line.push([start + .5, y, k ? 1 : LIFT], [start + .5 + dir * ease, y, 1], [end + .5 - dir * ease, y, 1], [end + .5, y, LIFT]);
        // the brush is recharged every LANES_PER_LOAD lanes: the next load starts where this one ended, on the bead
        if ((k + 1) % LANES_PER_LOAD === 0 && k + 1 < ch.runs.length) { const at = line[line.length - 1]; emit(line); line = [at]; }
      });
      if (line.length >= 2) emit(line);
    }
    return made;
  };
  // the first brush: the widest of the kit that fits the shape; the smallest for a small shape
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < gn; i++) if (inside[i]) { const y = (i / gw) | 0; if (y < lo) lo = y; if (y > hi) hi = y; }
  const across = (hi - lo + 1) * pitch;
  // and whose sweeps lay most of it: a broad brush in a shape it cannot sweep leaves its whole edge to a small brush,
  // which then runs round it as a ring
  // (a shape full of holes, which no broad brush sweeps cleanly, takes the broad brush that leaves least, if it leaves
  // under twice that share)
  let brush = small, best = null;
  for (const width of kit.filter(w => w > small && BRUSH_FIT * w <= 2 * deepest && w * (1 + (LEAST_SWEEPS - 1) * (1 - overlap)) <= across)) {
    zigzag(width / 2, inside);
    let left = 0; for (let i = 0; i < gn; i++) if (inside[i] && !covered[i]) left++;
    const share = left / area;
    if (!best || share < best.share - 0.02) best = { width, share };
    strokes.length = 0; covered.fill(0);
    if (share <= SWEPT_SHARE) break;
  }
  if (best && best.share <= 2 * SWEPT_SHARE) brush = best.width;
  zigzag(brush / 2, inside);
  // Where the lanes' square ends leave the outline bare (a slanting or curved side, a corner), a smaller brush runs along
  // the outline, its edge on it, over the stretches that are bare: an edge laid once, not a ring inside a ring. A bare
  // part far from the outline (rare) is swept in lanes of that brush.
  for (const width of kit) {
    if (width >= brush) continue;
    const r = width / 2, rc = r / pitch;
    // a sliver the wet wash closes by itself (under SLIVER_MM across) is no bare part: opened away first
    const raw = Uint8Array.from(inside, (v, i) => (v && !covered[i] ? 1 : 0)), o = SLIVER_MM / 2 / pitch;
    const shrunk = Uint8Array.from(distance(raw, gw, gh), d => (d > o ? 1 : 0)), back = distance(Uint8Array.from(shrunk, v => 1 - v), gw, gh);
    const bare = Uint8Array.from(raw, (v, i) => (v && back[i] <= o + 1 ? 1 : 0));
    dropSmall(bare, gw, gh, LEAST_BARE * Math.PI * rc * rc);
    if (!bare.some(v => v)) continue;
    const near = distance(Uint8Array.from(bare, v => 1 - v), gw, gh), ring = Uint8Array.from(D, v => (v >= rc ? 1 : 0));
    for (const c of traceOutlines(ring, gw, gh, { minLength: Math.max(2, Math.round(rc)), step: 1 })) {
      const pts = c.points.map(p => [p.x + .5, p.y + .5]);
      if (pts.length > 4 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 2) pts.push(pts[0]);
      // the stretches of this line whose brush reaches bare paper
      let run = [];
      const flush = () => {
        let len = 0; for (let q = 1; q < run.length; q++) len += Math.hypot(run[q][0] - run[q - 1][0], run[q][1] - run[q - 1][1]);
        if (len >= 2 * rc) { const line = smoothLine(thin(run, Math.max(1, rc / 2)), 2); stamp(line, r); strokes.push({ kind: 'sweep', radiusMm: +r.toFixed(3), points: line.map(([gx, gy]) => toXY([ou + gx * pitch, ov + gy * pitch])) }); }
        run = [];
      };
      for (const q of pts) { const i = Math.floor(q[1]) * gw + Math.floor(q[0]); if (near[i] <= rc) run.push(q); else flush(); }
      flush();
    }
    const left = Uint8Array.from(inside, (v, i) => (v && !covered[i] ? 1 : 0));
    dropSmall(left, gw, gh, LEAST_BARE * Math.PI * rc * rc * 4);
    if (left.some(v => v)) { const far = distance(Uint8Array.from(left, v => 1 - v), gw, gh), region = Uint8Array.from(far, (d, i) => (inside[i] && d <= rc ? 1 : 0)); zigzag(r, region); }
  }
  // a part too narrow for the smallest brush to fit inside is laid by its middle line: one stroke of the smallest brush
  if (!strokes.length) {
    let best = -1; for (let i = 0; i < gn; i++) if (inside[i] && (best < 0 || D[i] > D[best])) best = i;
    let a = gw, b = -1; const gy = (best / gw) | 0; for (let gx = 0; gx < gw; gx++) if (inside[gy * gw + gx]) { a = Math.min(a, gx); b = Math.max(b, gx); }
    const line = [[a + .5 + Math.min(small / 2 / pitch, (b - a) / 3), gy + .5], [b + .5 - Math.min(small / 2 / pitch, (b - a) / 3), gy + .5]];
    stamp(line, small / 2); strokes.push({ kind: 'sweep', radiusMm: small / 2, points: line.map(([gx, gy2]) => toXY([ou + gx * pitch, ov + gy2 * pitch])) });
  }
  let cov = 0; for (let i = 0; i < gn; i++) if (inside[i] && covered[i]) cov++;
  return { strokes, brushMm: brush, angle: th, depthMm: deepest, areaMm2: area * pitch * pitch, uncovered: 1 - cov / area };
}

/** A shape this many times (at least) as long as its widest cross-section is laid down its spine. */
const SPINE_LONG = 1.6;
/** A shape is laid down its spine only when this share of its cross-sections are one piece. */
const SPINE_SIMPLE = 0.9;
/** The spine's brush is at most this many times as wide as the shape. */
const SPINE_FATTEST = 1.6;
/** A shape at least this share of the smallest brush's width, and narrower than it, is pulled with it held light. */
const SPINE_THINNEST = 0.3;
/** The least pressure down the spine and at its ends. */
const SPINE_TIP = 0.3;

/**
 * A shape a brush can lay in one pull: the brush whose belly is about the shape's widest part, drawn down the shape's
 * spine (its middle line along its length) from one end to the other, pressed wide where the shape is wide and eased to
 * the tip where it narrows and in its ends. Null when the shape is wider than the widest brush, not long enough, or
 * branches (its cross-sections are not one piece each).
 */
function spineFill(loops, kit) {
  const all = loops.flatMap(l => l.points);
  let sx = 0, sy = 0; for (const [x, y] of all) { sx += x; sy += y; }
  const n = all.length, mx = sx / n, my = sy / n; let a = 0, b = 0, cc = 0;
  for (const [x, y] of all) { const dx = x - mx, dy = y - my; a += dx * dx; b += dx * dy; cc += dy * dy; }
  const th = 0.5 * Math.atan2(2 * b, a - cc), c = Math.cos(th), s = Math.sin(th);
  const toU = ([x, y]) => [x * c + y * s, -x * s + y * c], toXY = ([u, v]) => [+(u * c - v * s).toFixed(3), +(u * s + v * c).toFixed(3)];
  const pitch = 0.25;
  let u0 = Infinity, u1 = -Infinity; for (const p of all) { const [u] = toU(p); if (u < u0) u0 = u; if (u > u1) u1 = u; }
  // the cross-sections across the long axis, every pitch along it
  const cols = [];
  for (let u = u0 + pitch / 2; u < u1; u += pitch) {
    const vs = [];
    for (const l of loops) for (let q = 0; q < l.points.length; q++) { const P = toU(l.points[q]), Q = toU(l.points[(q + 1) % l.points.length]); if ((P[0] <= u) !== (Q[0] <= u)) vs.push(P[1] + (u - P[0]) / (Q[0] - P[0]) * (Q[1] - P[1])); }
    vs.sort((p, q) => p - q);
    cols.push({ u, spans: vs.length >= 2 ? Array.from({ length: vs.length >> 1 }, (_, k) => [vs[2 * k], vs[2 * k + 1]]) : [] });
  }
  if (cols.length < 4) return null;
  const single = cols.filter(col => col.spans.length === 1).length / cols.length;
  const widest = Math.max(...cols.flatMap(col => col.spans.map(([p, q]) => q - p))), length = u1 - u0;
  if (single < SPINE_SIMPLE || length < SPINE_LONG * widest || widest > kit[0] * 1.05) return null;
  // the brush whose belly is about the shape's width: the smallest that is at least nine tenths of it, or the widest
  // (but not one more than SPINE_FATTEST times as wide: pressed that lightly it hardly lays paint; the widest narrower one instead,
  const asc = [...kit].sort((p, q) => p - q), over = asc.find(w => w >= 0.9 * widest);
  // (or not one less than two thirds as wide; else the shape is no spine stroke)
  // (and a shape narrower than any brush, a mast or a rope, is pulled with the smallest held light, if it is at least
  // SPINE_THINNEST of that brush's width: in lanes it would come out as a row of dots)
  const under = [...asc].reverse().find(w => w < 0.9 * widest), brush = over != null && over <= SPINE_FATTEST * widest ? over : under != null && under >= 0.66 * widest ? under : over === asc[0] && widest >= SPINE_THINNEST * asc[0] ? asc[0] : null;
  if (brush == null) return null;
  const r = brush / 2;
  // a point every half radius down the spine, its pressure from the width there (a round lays r (0.25 + 0.75 p) each side)
  const pts = [], step = Math.max(1, Math.round(r / 2 / pitch));
  for (let k = 0; k < cols.length; k += step) {
    const col = cols[k], span = col.spans.reduce((best, sp) => (sp[1] - sp[0] > best[1] - best[0] ? sp : best), [0, 0]); if (!(span[1] > span[0])) continue;
    const half = (span[1] - span[0]) / 2, p = Math.max(SPINE_TIP, Math.min(1, (half / r - 0.25) / 0.75));
    pts.push([...toXY([col.u, (span[0] + span[1]) / 2]), +p.toFixed(3)]);
  }
  if (pts.length < 2) return null;
  // the tip goes into the ends: the first and last points sit at the shape's ends, the brush eased off
  pts[0][2] = Math.min(pts[0][2], SPINE_TIP); pts[pts.length - 1][2] = Math.min(pts[pts.length - 1][2], SPINE_TIP);
  return { strokes: [{ kind: 'sweep', radiusMm: +r.toFixed(3), points: pts }], brushMm: brush, angle: th, depthMm: widest / 2, areaMm2: 0, uncovered: 0, spine: true };
}

// --- lanes ---------------------------------------------------------------------------------------------------------
// Why the zigzag above leaves a stepped edge: each lane is a band 2r tall that has to stop at ONE place, read on the
// lane's centre row (where the brush's whole width fits, plus a little overshoot). Where the outline slants, the lane's
// upper and lower edges meet the outline at different places, so every lane ends in a step one lane tall. The steps were
// then covered by a smaller brush steered along the outline, which laid the outline twice (a dark rim) and, round a
// whole shape, a ring.
// laneFill instead lays each lane as its own stroke along the shape's long axis, from outline to outline on its own
// centre line, landing and lifting on the brush's tip: the end of a lane is a taper the width of the tip, so the ends of
// neighbouring lanes follow the slant instead of stepping. Nothing runs along the outline. What the lanes leave bare (a
// corner, an arm) is laid the same way with a smaller brush along that part's own long axis.

/** The least pressure a lane is laid at (a round lays r (0.25 + 0.75 p) to each side; lighter, it hardly lays paint). */
const TIP = 0.35;
/** A lane runs on, at the tip's pressure, until the outline is this share of the tip's half-width away: its end reaches
 * the outline (overrunning it by at most half the tip's half-width) instead of stopping a round's radius short. */
const END_REACH = 0.5;
/** Lanes overlap by this share of the brush's width. */
const LANE_OVERLAP = 1 / 3;
/** A lane may lay its paint this far (mm, or this share of the brush's radius) past the outline beside it: held to the
 * outline exactly, every lane near an edge or a notch was pressed so lightly it laid a thin line with bare paper between
 * it and the next (a round lays r (0.25 + 0.75 p) to each side). The wash's edge is where the brush ends, a little loose. */
const SPILL_MM = 1.5, SPILL_SHARE = 0.2;
/** A shape is laid along its long axis when it is at least this many times as long as it is wide; else level (a tall window
 * laid in level lanes is a stack of short strokes, each end a cap). */
const LONG = 1.5;
/** A part the lanes left bare (a wedge along a slanting side, a corner) is laid along its own length when it is this long. */
const LEFT_LONG = 1.3;
/** The brush is the smallest of the kit that lays the shape in at most this many lanes... */
const MOST_LANES = 4;
/** ... and is never wider than this many times the shape's widest inscribed width. */
const FATTEST = 1.3;
/** A bare part is laid again when it is at least this big (mm2) and wider than this (mm). */
const BARE_LEAST_MM2 = 10, BARE_WIDE_MM = 2;

/** ... or when its edges run one way this strongly (coherence of the outline's directions, 0 to 1). */
const EDGE_COHERENT = 0.35;

const halfAt = (r, p) => r * (0.25 + 0.75 * p);

/**
 * The strokes that fill `loops` (closed outlines in mm, even-odd) as one wash, in lanes along its long axis.
 * @returns {{strokes: Array<{kind:'sweep', radiusMm:number, points:number[][]}>, brushMm:number, angle:number, depthMm:number, areaMm2:number, uncovered:number}}
 */
export function laneFill(loops, { kitMm, growMm = 0, keepOut = null, spine = true }) {
  const kit = [...kitMm].sort((a, b) => a - b), small = kit[0];
  const all = loops.flatMap(l => l.points);
  if (all.length < 3) return { strokes: [], brushMm: 0, angle: 0, depthMm: 0, areaMm2: 0, uncovered: 0 };
  if (spine) { const s = spineFill(loops, [...kit].reverse()); if (s) return s; }
  const pitch = Math.max(0.2, Math.min(0.5, small / 10));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of all) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const pad = 2 + Math.ceil(growMm / pitch), ox = x0 - pad * pitch, oy = y0 - pad * pitch;
  const gw = Math.ceil((x1 - x0) / pitch) + 2 * pad + 1, gh = Math.ceil((y1 - y0) / pitch) + 2 * pad + 1, gn = gw * gh;
  const fill = ls => {
    const m = new Uint8Array(gn);
    for (let gy = 0; gy < gh; gy++) {
      const v = oy + (gy + .5) * pitch, xs = [];
      for (const l of ls) for (let q = 0; q < l.points.length; q++) { const P = l.points[q], Q = l.points[(q + 1) % l.points.length]; if ((P[1] <= v) !== (Q[1] <= v)) xs.push(P[0] + (v - P[1]) / (Q[1] - P[1]) * (Q[0] - P[0])); }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) for (let gx = Math.max(0, Math.ceil((xs[q] - ox) / pitch - .5)); gx < gw && ox + (gx + .5) * pitch < xs[q + 1]; gx++) m[gy * gw + gx] = 1;
    }
    return m;
  };
  const inside = fill(loops);
  if (growMm > 0) {
    const out = distance(Uint8Array.from(inside, v => 1 - v), gw, gh), barred = keepOut?.length ? fill(keepOut) : null;
    for (let i = 0; i < gn; i++) if (!inside[i] && out[i] * pitch <= growMm && !barred?.[i]) inside[i] = 1;
  }
  let area = 0; for (let i = 0; i < gn; i++) area += inside[i];
  if (!area) return { strokes: [], brushMm: 0, angle: 0, depthMm: 0, areaMm2: 0, uncovered: 0 };
  const covered = new Uint8Array(gn), strokes = [];
  const at = (x, y) => { const gx = Math.floor((x - ox) / pitch), gy = Math.floor((y - oy) / pitch); return gx >= 0 && gy >= 0 && gx < gw && gy < gh ? gy * gw + gx : -1; };
  // a round's footprint: a disc of the half-width its pressure gives, every half cell along the path
  const stamp = (pts, r) => {
    for (let q = 0; q + 1 < pts.length; q++) {
      const A = pts[q], B = pts[q + 1], len = Math.hypot(B[0] - A[0], B[1] - A[1]), steps = Math.max(1, Math.ceil(len / (pitch / 2)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, cx = A[0] + (B[0] - A[0]) * t, cy = A[1] + (B[1] - A[1]) * t, hr = halfAt(r, (A[2] ?? 1) + ((B[2] ?? 1) - (A[2] ?? 1)) * t), rc = hr / pitch;
        const gx = (cx - ox) / pitch, gy = (cy - oy) / pitch;
        for (let y = Math.max(0, Math.floor(gy - rc)); y <= Math.min(gh - 1, Math.ceil(gy + rc)); y++) for (let x = Math.max(0, Math.floor(gx - rc)); x <= Math.min(gw - 1, Math.ceil(gx + rc)); x++) if ((x + .5 - gx) ** 2 + (y + .5 - gy) ** 2 <= rc * rc) covered[y * gw + x] = 1;
      }
    }
  };
  let first = null;
  // one part (a 0/1 grid) laid in lanes by the brushes of `kit` that are no wider than `widest`
  const layPart = (part, widest, depth) => {
    const cells = []; for (let i = 0; i < gn; i++) if (part[i]) cells.push(i);
    if (!cells.length) return;
    const P = cells.map(i => [ox + (i % gw + .5) * pitch, oy + (((i / gw) | 0) + .5) * pitch]);
    let mx = 0, my = 0; for (const [x, y] of P) { mx += x; my += y; } mx /= P.length; my /= P.length;
    let a = 0, b = 0, c = 0; for (const [x, y] of P) { const dx = x - mx, dy = y - my; a += dx * dx; b += dx * dy; c += dy * dy; }
    const mean = (a + c) / 2, d = Math.sqrt(((a - c) / 2) ** 2 + b * b), long = Math.sqrt((mean + d) / Math.max(1e-9, mean - d));
    let th = long >= (depth ? LEFT_LONG : LONG) ? 0.5 * Math.atan2(2 * b, a - c) : 0;
    // a part that is not long overall but whose edges mostly run one way (a mass of slanting shadow streaks) is laid along
    // its edges: level lanes would end in a step at every slanting edge
    if (!th && !depth) {
      let jxx = 0, jxy = 0, jyy = 0;
      for (const i of cells) { const x = i % gw; const gx = (x < gw - 1 ? part[i + 1] : 0) - (x ? part[i - 1] : 0), gy = (i + gw < gn ? part[i + gw] : 0) - (i >= gw ? part[i - gw] : 0); if (gx || gy) { jxx += gx * gx; jxy += gx * gy; jyy += gy * gy; } }
      const tr = jxx + jyy, dd = Math.sqrt(((jxx - jyy) / 2) ** 2 + jxy * jxy);
      if (tr > 0 && 2 * dd / tr >= EDGE_COHERENT) th = 0.5 * Math.atan2(2 * jxy, jxx - jyy) + Math.PI / 2;
    }
    const tx = Math.cos(th), ty = Math.sin(th);
    // the lanes' normal points down the sheet (or right, for an upright shape), so the lanes go top down
    let nx = -ty, ny = tx; if (ny < -1e-6 || (Math.abs(ny) <= 1e-6 && nx < 0)) { nx = -nx; ny = -ny; }
    let v0 = Infinity, v1 = -Infinity, u0 = Infinity, u1 = -Infinity;
    for (const [x, y] of P) { const v = x * nx + y * ny, u = x * tx + y * ty; if (v < v0) v0 = v; if (v > v1) v1 = v; if (u < u0) u0 = u; if (u > u1) u1 = u; }
    v0 -= pitch / 2; v1 += pitch / 2; u0 -= pitch; u1 += pitch;
    const D = distance(part, gw, gh); let deep = 0, meanD = 0; for (const i of cells) { if (D[i] > deep) deep = D[i]; meanD += D[i] / cells.length; }
    // the brush is held to the part's typical width (four times its mean depth: a strip's width), not its widest: a mass of
    // shadow streaks with lit stone between them is laid streak by streak, not blotted over with a mop
    const across = v1 - v0, fat = Math.min(2 * deep, 4 * meanD) * pitch * FATTEST;
    // the brush: the smallest that lays the part in MOST_LANES lanes, never much fatter than the part
    const fits = kit.filter(wd => wd <= widest && (wd <= fat || wd === kit[0]));
    if (!fits.length) return;
    let brush = fits.find(wd => Math.ceil(Math.max(0, across - wd) / (wd * (1 - LANE_OVERLAP))) + 1 <= MOST_LANES) ?? fits[fits.length - 1];
    const r = brush / 2, spill = Math.min(SPILL_MM, SPILL_SHARE * r);
    if (!first) first = { brush, th, deep: deep * pitch };
    // lane centres: the outer ones nine tenths of the brush's radius in, so its edge lays the part's edge
    const inset = Math.min(across / 2, 0.9 * r), lanes = Math.max(1, Math.ceil(Math.max(0, across - 2 * inset) / (2 * r * (1 - LANE_OVERLAP))) + 1);
    // the lanes sit on a grid fixed to the sheet (multiples of their spacing), so a small change to the outline moves
    // only the outermost lanes, not every one; the outermost lie on the part's edges
    const step = 2 * r * (1 - LANE_OVERLAP), a0 = v0 + inset, a1 = v1 - inset, vs = [];
    if (lanes === 1 || a1 - a0 < step) vs.push(...(a1 - a0 < 0.2 * step ? [(v0 + v1) / 2] : [a0, a1]));
    else { for (let g = Math.ceil(a0 / step) * step; g <= a1 + 1e-9; g += step) vs.push(g); if (vs[0] - a0 > 0.5 * step) vs.unshift(a0); if (a1 - vs[vs.length - 1] > 0.5 * step) vs.push(a1); }
    let k = 0;
    for (const v of vs) {
      // along the lane's centre line the hand presses as wide as the part allows there (half-width no more than the
      // distance to the outline), so where the outline slants or narrows the lane narrows and ends on its tip: the lane
      // never runs past the outline and its end follows the slant. Where not even the tip fits, the lane lifts.
      const samples = [];
      for (let u = u0; u <= u1 + 1e-9; u += pitch / 2) {
        const x = u * tx + v * nx, y = u * ty + v * ny, i = at(x, y), dmm = i >= 0 && part[i] ? D[i] * pitch : 0;
        samples.push({ u, dmm: dmm > 0 ? dmm + spill : 0, in: dmm >= END_REACH * halfAt(r, TIP) });
      }
      const runs = []; let cur = null;
      for (const sm of samples) { if (sm.in) (cur ??= []).push(sm); else if (cur) { runs.push(cur); cur = null; } }
      if (cur) runs.push(cur);
      for (const run0 of runs) {
        const len = run0[run0.length - 1].u - run0[0].u; if (len < 0.6 * r) continue;
        // the engine lays a strip across the heading at each point and nothing past a stroke's last point, so the lane's
        // ends are carried on to the outline, at the tip, where the outline
        // is met; a lane's end that stops a cap's width short leaves a white seam against its neighbour
        const ext = END_REACH * halfAt(r, TIP), a0 = run0[0], a1 = run0[run0.length - 1];
        const run = [...(samples[0].u < a0.u ? [{ u: a0.u - ext, dmm: a0.dmm, in: true }] : []), ...run0, ...(a1.u < samples[samples.length - 1].u ? [{ u: a1.u + ext, dmm: a1.dmm, in: true }] : [])];
        const seq = k % 2 === 0 ? run : [...run].reverse(), every = Math.max(1, Math.round(r / 3 / (pitch / 2))), pts = [];
        seq.forEach((sm, q) => {
          if (q % every && q !== seq.length - 1) return;
          const p = Math.max(TIP, Math.min(1, (sm.dmm / r - 0.25) / 0.75));
          // drop a point between two of the same pressure on a straight run
          if (pts.length >= 2 && Math.abs(pts[pts.length - 1][2] - p) < 0.04 && Math.abs(pts[pts.length - 2][2] - p) < 0.04 && q !== seq.length - 1) pts.pop();
          pts.push([+(sm.u * tx + v * nx).toFixed(3), +(sm.u * ty + v * ny).toFixed(3), +p.toFixed(3)]);
        });
        if (pts.length < 2) continue;
        stamp(pts, r); strokes.push({ kind: 'sweep', radiusMm: +r.toFixed(3), points: pts }); k++;
      }
    }
    if (depth >= 3) return;
    // what the lanes left bare, less the slivers the wet wash closes by itself, laid with a smaller brush
    const raw = Uint8Array.from(part, (vv, i) => (vv && !covered[i] ? 1 : 0)), o = BARE_WIDE_MM / 2 / pitch;
    const shrunk = Uint8Array.from(distance(raw, gw, gh), dd => (dd > o ? 1 : 0)), back = distance(Uint8Array.from(shrunk, vv => 1 - vv), gw, gh);
    const bare = Uint8Array.from(raw, (vv, i) => (vv && back[i] <= o + 1 ? 1 : 0));
    dropSmall(bare, gw, gh, BARE_LEAST_MM2 / (pitch * pitch));
    // each bare part on its own, a little grown into what is laid so its lanes meet the wash
    const seen = new Uint8Array(gn);
    for (let s0 = 0; s0 < gn; s0++) {
      if (!bare[s0] || seen[s0]) continue;
      const comp = new Uint8Array(gn), stack = [s0]; seen[s0] = 1;
      while (stack.length) { const i = stack.pop(), x = i % gw; comp[i] = 1; for (const j of [x ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, i - gw, i + gw]) if (j >= 0 && j < gn && bare[j] && !seen[j]) { seen[j] = 1; stack.push(j); } }
      const near = distance(Uint8Array.from(comp, vv => 1 - vv), gw, gh), grown = Uint8Array.from(near, (dd, i) => (part[i] && dd * pitch <= 1 ? 1 : 0));
      layPart(grown, brush - 1e-6, depth + 1);
    }
  };
  layPart(inside, Infinity, 0);
  let cov = 0; for (let i = 0; i < gn; i++) if (inside[i] && covered[i]) cov++;
  return { strokes, brushMm: first?.brush ?? 0, angle: first?.th ?? 0, depthMm: first?.deep ?? 0, areaMm2: area * pitch * pitch, uncovered: 1 - cov / area };
}
