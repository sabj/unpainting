// Pipeline: inking, stage 1 (the drawing plan: proposed contours, numbered). Propose contours -> select contours ->
// gestures -> pen (Sam's blog, part 1, "Pause to Decompose the Problem"). The line model's pool is a skeleton broken at
// every junction (median piece 2 mm, about 4,000 pieces on a bench subject), so before the plan chooses, the pieces are
// made into contours as the pen tracer makes its lines: the skeleton's staircase dropped at the tracer's pixel (0.93
// mm), a piece split where it turns back on itself (a pen lift), pieces joined with the drawing hand's gates (the next
// piece starts within the tracer's reach, 3.7 mm, of the end, pointing along it, and runs on the same way: joinPieces),
// and each path rounded between lifts (smoothPath). A contour the
// tracer would not keep as a stroke (shorter than its shortest line, 13.1 mm) and a contour lying along the sheet's own
// edge (pen-trace.mjs alongSheetEdge's test) are not proposed. The rest are numbered c1, c2, ... longest first, and the
// planner names a line by the contours it is drawn from, in order (draw-plan.mjs `contours`): the painter draws exactly
// those, so a plan cannot claim a line it did not name. Pure: lines in millimetres in, contours out.
import { createHash } from 'node:crypto';
import { TRACE_MM, simplify, splitAtTurns, joinPieces, smoothPath } from '../../crop/pen-trace.mjs';
import { onSheetEdge } from './draw-plan-place.mjs';

/** The drawing hand's join gates (drawing-hand.mjs connect: --drawjoincos, --drawjoinaim defaults). */
const HAND = Object.freeze({ cos: 0.8, aim: 0.7 });

const lengthOf = P => { let s = 0; for (let k = 1; k < P.length; k++) s += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); return s; };

/** Whether at least half of a contour lies along the sheet's edge (`W` by `H` mm). */
export function alongEdge(P, W, H) {
  let on = 0;
  for (let k = 0; k < P.length; k++) {
    const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], m = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (onSheetEdge(P[k], [(b[0] - a[0]) / m, (b[1] - a[1]) / m], W, H, TRACE_MM.reach)) on++;
  }
  return on >= P.length / 2;
}

/**
 * The numbered contours of a candidate pool `pool` ([{ points: [[x, y]] mm, widths? }]) on a sheet `W` by `H` mm.
 * Returns { contours: [{ id, points, widths?, length }], sha256 (of the ids and points: the set a plan names from),
 * pieces, joined, leftOut: { short, sheetEdge } }.
 */
/** The pool's pieces (points in mm) joined into contours as the pen tracer makes its lines, before rounding: each
 *  piece's staircase dropped at `pixelMm` (the line model's own resolution: the subject's pixel; the tracer's 0.93 mm
 *  on a bench subject), split where it turns back on itself, joined with the hand's gates across the tracer's reach.
 *  Returns { contours: [[x, y]...][], pieces, joined }. */
export function joinedContours(pool, { pixelMm = TRACE_MM.pixel } = {}) {
  const items = pool.filter(l => l.points?.length >= 2).map(l => l.points);
  const split = items.map(P => simplify(P, pixelMm)).flatMap(splitAtTurns).filter(P => P.length >= 2);
  const contours = joinPieces(split, { gap: TRACE_MM.reach, cos: HAND.cos, aim: HAND.aim });
  return { contours, pieces: items.length, joined: split.length - contours.length };
}

export function proposeContours(pool, { W, H }) {
  // as the pen tracer draws a line (pen-trace.mjs tracePen): joinedContours, then the path rounded between lifts
  const j = joinedContours(pool), items = { length: j.pieces }, split = { length: j.joined + j.contours.length }, joinedPieces = j.contours;
  let short = 0, sheetEdge = 0;
  const kept = [];
  for (const P0 of joinedPieces) {
    const P = smoothPath(P0, TRACE_MM.reach).map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]), length = lengthOf(P);
    if (length < TRACE_MM.minLength) { short++; continue; }
    if (alongEdge(P, W, H)) { sheetEdge++; continue; }
    kept.push({ points: P, length: +length.toFixed(1) });
  }
  // longest first; ties by position, so the numbering is the same on every run of the same pool
  kept.sort((a, b) => b.length - a.length || a.points[0][0] - b.points[0][0] || a.points[0][1] - b.points[0][1]);
  const contours = kept.map((c, i) => ({ id: `c${i + 1}`, ...c }));
  const sha256 = createHash('sha256').update(JSON.stringify(contours.map(c => [c.id, c.points]))).digest('hex');
  return { contours, sha256, pieces: items.length, joined: split.length - joinedPieces.length, leftOut: { short, sheetEdge } };
}

/**
 * The strokes of the plan's lines that name contours (`line.contours`, ids in order): each named contour drawn whole,
 * turned so it starts at the end nearer the stroke so far; a contour starting within the tracer's reach of that end
 * continues the stroke (the pieces of one named line drawn as one stroke), a longer gap lifts the pen. Returns
 * { strokes: per line id [{ points, widths?, length }], missing: [{ line, id }] }.
 */
export function drawContours(lines, contours) {
  const byId = new Map(contours.map(c => [c.id, c])), strokes = new Map(), missing = [];
  for (const g of lines) {
    if (!Array.isArray(g.contours)) continue;
    const out = [];
    let cur = null;
    g.contours.forEach((id, k) => {
      const c = byId.get(id);
      if (!c) { missing.push({ line: g.id, id }); return; }
      let P = c.points, W = c.widths;
      const end = cur?.points.at(-1);
      // turned to start at the end nearer the stroke so far; the first contour turned to end nearer the next one
      const flip = () => { P = [...P].reverse(); if (W) W = [...W].reverse(); };
      if (end) { if (Math.hypot(P.at(-1)[0] - end[0], P.at(-1)[1] - end[1]) < Math.hypot(P[0][0] - end[0], P[0][1] - end[1])) flip(); }
      else {
        const next = byId.get(g.contours[k + 1]);
        if (next) {
          const toNext = q => Math.min(...[next.points[0], next.points.at(-1)].map(e => Math.hypot(e[0] - q[0], e[1] - q[1])));
          if (toNext(P[0]) < toNext(P.at(-1))) flip();
        }
      }
      if (cur && Math.hypot(P[0][0] - end[0], P[0][1] - end[1]) <= TRACE_MM.reach) {
        cur.points.push(...P); if (cur.widths && W) cur.widths.push(...W); else delete cur.widths;
      } else { cur = { points: [...P], ...(W ? { widths: [...W] } : {}) }; out.push(cur); }
    });
    for (const s of out) s.length = lengthOf(s.points);
    strokes.set(g.id, out);
  }
  return { strokes, missing };
}

/**
 * The proposed contours that are the source's own pen lines, by the pen tracer's definition of a line (pen-trace.mjs):
 * on at least half its points the mark (the darkest cell within one pixel across it) is at least one step of the
 * subject's nine-step value scale darker than both its flanks, read from the tracer's flank to its far flank (1.9 to
 * 3.7 mm) out on either side. `lum` is the target's luminance W by H; `mmPerPx` its millimetres a pixel; contour points
 * in millimetres. Returns the ids. The plan accounts for each: drawn, or left to the wash by name (draw-plan-file.mjs).
 */
export function sourcePenLines(contours, lum, W, H, mmPerPx) {
  const s = Float32Array.from(lum).sort(), paper = s[Math.floor(0.99 * (s.length - 1))], ink = s[Math.floor(0.001 * (s.length - 1))], step = (paper - ink) / 8;
  const at = (x, y) => lum[Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)))];
  const f0 = TRACE_MM.flank[0] / mmPerPx, f1 = TRACE_MM.flank[1] / mmPerPx;
  const ids = [];
  for (const c of contours) {
    const P = c.points.map(([x, y]) => [x / mmPerPx, y / mmPerPx]);
    let on = 0;
    for (let k = 0; k < P.length; k++) {
      const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], m = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / m, ny = (b[0] - a[0]) / m;
      let mark = Infinity; for (let r = -1; r <= 1; r++) mark = Math.min(mark, at(P[k][0] + nx * r, P[k][1] + ny * r));
      const side = d => { let v = 0, n = 0; for (let r = f0; r <= f1; r += 1) { v += at(P[k][0] + nx * r * d, P[k][1] + ny * r * d); n++; } return v / Math.max(1, n); };
      if (mark <= side(1) - step && mark <= side(-1) - step) on++;
    }
    if (on >= P.length / 2) ids.push(c.id);
  }
  return ids;
}
