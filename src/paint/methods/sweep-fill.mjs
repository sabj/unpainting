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
export const SWEEP_OVERLAP = 0.3;
/** A brush fits a shape whose widest part is at least this many brush widths across. */
const BRUSH_FIT = 1.1;
/** A part left bare is filled when it is at least this share of a touch of the brush that fills it. */
const LEAST_BARE = 0.5;
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
    const emit = line => { stamp(line, radius); strokes.push({ kind: 'sweep', radiusMm: +radius.toFixed(3), points: line.map(([gx2, gy2]) => toXY([ou + gx2 * pitch, ov + gy2 * pitch])) }); made++; };
    const insideLine = (A, B) => { for (let t = 0; t <= 8; t++) { const x = Math.round(A[0] + (B[0] - A[0]) * t / 8 - .5), y = Math.round(A[1] + (B[1] - A[1]) * t / 8 - .5); if (!(D[y * gw + x] >= .9 * rc)) return false; } return true; };
    for (const ch of chains) {
      let line = [];
      ch.runs.forEach(({ gy, run: [a, b] }, k) => {
        const rightward = k % 2 === 0, start = rightward ? a : b, end = rightward ? b : a, y = gy + .5;
        if (line.length) {
          // the turn: in from the last lane's end, down beside the outline, out to this lane's end
          const last = line[line.length - 1], inA = [last[0] + (rightward ? rc : -rc), last[1]], inB = [start + .5 + (rightward ? rc : -rc), y];
          if (insideLine(inA, inB)) line.push(inA, inB);
          else { if (line.length >= 2) emit(line); line = []; }
        }
        line.push([start + .5, y], [(a + b) / 2 + .5, y], [end + .5, y]);
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
