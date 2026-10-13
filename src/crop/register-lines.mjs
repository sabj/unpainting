// Register a line file to the target it is painted on. The painter maps a line file's image box onto the target's
// (lines.mjs scaleLines), so a drawing traced from another image (an image model's sketch drawn at another aspect, a
// crop, a padded frame) lands stretched or shifted. This finds the axis-aligned scale and shift that lay the lines on
// the target's own edges. The score is a two-sided chamfer distance: the mean distance in cells from points along the
// lines to the nearest target edge, and from the target's edge cells to the nearest line, each capped so that what one
// side does not show counts as a fixed miss. One side alone rewards squeezing the drawing into a busy patch of edges.
// A coarse grid over scale, aspect and shift, then finer steps around the best. Pure: lines in, a transform and a new
// line file out.
import { nearestEdge } from '../paint/methods/line-evidence.mjs';

/** Points every `step` file pixels along each polyline ([x, y] pairs), as a flat Float32Array. */
export function samplePoints(lines, step = 2) {
  const out = [];
  for (const g of lines) {
    const P = g.points ?? [];
    for (let k = 1; k < P.length; k++) {
      const [x0, y0] = P[k - 1], [x1, y1] = P[k], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let s = k === 1 ? 0 : 1; s <= n; s++) out.push(x0 + (x1 - x0) * s / n, y0 + (y1 - y0) * s / n);
    }
  }
  return Float32Array.from(out);
}

/** Mean capped distance to the nearest edge of points under x' = sx x + tx, y' = sy y + ty, on a w x h distance map. */
export function chamfer(pts, { sx, sy, tx, ty }, dist, w, h, cap, stride = 1) {
  let sum = 0, n = 0;
  for (let i = 0; i < pts.length; i += 2 * stride) {
    const X = Math.round(pts[i] * sx + tx), Y = Math.round(pts[i + 1] * sy + ty);
    sum += X < 0 || Y < 0 || X >= w || Y >= h ? cap : Math.min(cap, dist[Y * w + X]);
    n++;
  }
  return n ? sum / n : cap;
}

/** Share of the points within `near` cells of an edge under a transform. */
function within(pts, T, dist, w, h, near) {
  let k = 0, n = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const X = Math.round(pts[i] * T.sx + T.tx), Y = Math.round(pts[i + 1] * T.sy + T.ty);
    if (X >= 0 && Y >= 0 && X < w && Y < h && dist[Y * w + X] <= near) k++;
    n++;
  }
  return n ? k / n : 0;
}

/** The lines' own distance map: points rasterised on a grid `q` cells per file pixel, and its exact distance transform. */
function lineDistance(pts, image, q) {
  const W = Math.max(2, Math.ceil(image.w * q)), H = Math.max(2, Math.ceil(image.h * q)), mask = new Uint8Array(W * H);
  for (let i = 0; i < pts.length; i += 2) {
    const X = Math.round(pts[i] * q), Y = Math.round(pts[i + 1] * q);
    if (X >= 0 && Y >= 0 && X < W && Y < H) mask[Y * W + X] = 1;
  }
  return { dist: nearestEdge(mask, W, H).dist, W, H, q };
}

/** Mean capped distance in target cells from target edge points to the nearest line, under T. */
function reverse(edgePts, T, L, cap, stride = 1) {
  const sc = Math.sqrt(T.sx * T.sy) / L.q;
  let sum = 0, n = 0;
  for (let i = 0; i < edgePts.length; i += 2 * stride) {
    const X = Math.round((edgePts[i] - T.tx) / T.sx * L.q), Y = Math.round((edgePts[i + 1] - T.ty) / T.sy * L.q);
    sum += X < 0 || Y < 0 || X >= L.W || Y >= L.H ? cap : Math.min(cap, L.dist[Y * L.W + X] * sc);
    n++;
  }
  return n ? sum / n : 0;
}

/**
 * The transform from the line file's pixels to the target grid that best lays its lines on the target's edges and
 * covers them. Bounded: the aspect change (sx over sy) runs from the uniform fit (1) to the naive box map's, a tenth
 * beyond each; the overall scale within `scaleSpan` of the uniform fit; the shift within `shiftSpan` of centring.
 * @param lines  the file's lines, points as [x, y] in its image's pixels
 * @param image  { w, h } of the file's image
 * @param edges  { edge, dist, w, h }: the target grid's edge cells and each cell's distance to the nearest one
 * @returns { naive, uniform, best } transforms with their scores (two-sided, lines-to-edges and edges-to-lines, in
 *          cells) and the share of line within `near` cells of an edge
 */
export function registerLines(lines, image, edges, { scaleSpan = 0.25, shiftSpan = 0.15, steps = 10, capShare = 0.03, near = 1.5 } = {}) {
  const { dist, w, h } = edges, pts = samplePoints(lines), cap = capShare * Math.min(w, h);
  if (!pts.length) throw new Error('register lines: the file has no lines');
  const sx0 = w / image.w, sy0 = h / image.h, su = Math.min(sx0, sy0), rn = sx0 / sy0;
  const edgePts = []; for (let i = 0; i < w * h; i++) if (edges.edge[i]) edgePts.push(i % w, (i / w) | 0);
  const E = Float32Array.from(edgePts), L = lineDistance(pts, image, Math.min(1, 2 * su));
  const rLo = Math.min(1, rn) / 1.1, rHi = Math.max(1, rn) * 1.1, sLo = su * (1 - scaleSpan), sHi = su * (1 + scaleSpan);
  // a transform from (s, r, fx, fy): sx = s sqrt(r), sy = s / sqrt(r), shifted by fx, fy of the grid from centring
  const make = ({ s, r, fx, fy }) => { const sx = s * Math.sqrt(r), sy = s / Math.sqrt(r); return { sx, sy, tx: (w - image.w * sx) / 2 + fx * w, ty: (h - image.h * sy) / 2 + fy * h }; };
  const inside = p => p.s >= sLo && p.s <= sHi && p.r >= rLo && p.r <= rHi && Math.abs(p.fx) <= shiftSpan && Math.abs(p.fy) <= shiftSpan;
  const both = (T, stride) => (chamfer(pts, T, dist, w, h, cap, stride.f) + reverse(E, T, L, cap, stride.r)) / 2;
  const coarse = T => both(T, { f: Math.max(1, Math.round(pts.length / 2 / 3000)), r: Math.max(1, Math.round(E.length / 2 / 3000)) });
  const fine = T => both(T, { f: 1, r: 1 });
  const rate = T => ({ ...T, score: +fine(T).toFixed(4), toEdges: +chamfer(pts, T, dist, w, h, cap).toFixed(4), toLines: +reverse(E, T, L, cap).toFixed(4), near: +within(pts, T, dist, w, h, near).toFixed(4) });
  const span = (a, b, n) => Array.from({ length: n + 1 }, (_, k) => a + (b - a) * k / n);
  let best = null;
  for (const s of span(sLo, sHi, steps)) for (const r of span(rLo, rHi, steps)) for (const fx of span(-shiftSpan, shiftSpan, 2 * steps)) for (const fy of span(-shiftSpan, shiftSpan, 2 * steps)) {
    const p = { s, r, fx, fy }, v = coarse(make(p));
    if (!best || v < best.v) best = { p, v };
  }
  // finer coordinate steps around the best, inside the bounds, halving until a shift step is under a twentieth of a cell
  let p = best.p, v = fine(make(p));
  const d0 = { s: (sHi - sLo) / steps, r: (rHi - rLo) / steps, fx: shiftSpan / steps, fy: shiftSpan / steps };
  for (let f = 0.5; f * d0.fx * Math.min(w, h) > 0.05; f /= 2) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const k of ['s', 'r', 'fx', 'fy']) for (const sign of [1, -1]) {
        const q = { ...p, [k]: p[k] + sign * f * d0[k] };
        if (!inside(q)) continue;
        const u = fine(make(q));
        if (u < v - 1e-6) { p = q; v = u; moved = true; }
      }
    }
  }
  return {
    naive: rate({ sx: sx0, sy: sy0, tx: 0, ty: 0 }),
    uniform: rate(make({ s: su, r: 1, fx: 0, fy: 0 })),
    best: rate(make(p)),
    cap: +cap.toFixed(3),
  };
}

/** The line file mapped onto the target grid by `T` ({ sx, sy, tx, ty }), with a registration record. Widths scale by
 *  the mean of the two scales. A line that leaves the grid is cut there: its runs on the grid stay, each with its own
 *  widths and weights. */
export function applyRegistration(doc, T, grid, record = {}) {
  const sw = Math.sqrt(T.sx * T.sy), r = v => +v.toFixed(2);
  const on = ([x, y]) => x >= 0 && y >= 0 && x <= grid.w - 1 && y <= grid.h - 1;
  const lines = [];
  let cut = 0;
  for (const g of doc.lines) {
    const P = g.points.map(([x, y]) => [r(x * T.sx + T.tx), r(y * T.sy + T.ty)]);
    const ws = Array.isArray(g.widths) ? g.widths.map(v => +(v * sw).toFixed(3)) : null, wt = Array.isArray(g.weights) ? g.weights : null;
    let run = [];
    const close = () => {
      if (run.length >= 2) lines.push({ ...g, points: run.map(k => P[k]), ...(ws ? { widths: run.map(k => ws[k]) } : {}), ...(wt ? { weights: run.map(k => wt[k]) } : {}) });
      run = [];
    };
    P.forEach((q, k) => { if (on(q)) run.push(k); else { if (run.length) cut++; close(); } });
    close();
  }
  return {
    ...doc,
    image: { w: grid.w, h: grid.h },
    registration: { method: 'two-sided chamfer, axis-aligned scale and shift (src/crop/register-lines.mjs)', from: doc.image, transform: { sx: +T.sx.toFixed(5), sy: +T.sy.toFixed(5), tx: r(T.tx), ty: r(T.ty) }, linesIn: doc.lines.length, linesOut: lines.length, cutAtEdge: cut, ...record },
    lines,
  };
}
