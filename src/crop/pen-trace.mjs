// The pen tracer: the subject's own lines drawn as a pen draws them. One module for the bench's trace-ink tool (through
// bench/v4v5/tools/pen-trace.mjs, a link to this file, so a planning workspace gets a self-contained copy) and for the
// painter. Pure: luminance in, lines out.
// Every tolerance is a distance on the sheet the line will be drawn on (TRACE_MM), turned into the subject's pixels by
// the sheet's millimetres per pixel. The subject's lightest value (paper, the 99th percentile of luminance) and darkest
// (the ink, the 0.1th percentile) span a nine-step value scale, the painter's usual one. A pixel is line if it is at
// least one step of that scale darker than both sides along x, y or a diagonal, TRACE_MM.flank out (a thin dark line,
// not a dark mass), and it lies in the darker half of the scale. A pen follows the line it is on, carries no pixel
// staircase (one pixel), lifts where the line turns back on itself, joins only where one piece continues another
// across TRACE_MM.reach, and goes on contours, not inside dark masses: on one side, the band from TRACE_MM.reach to
// TRACE_MM.minLength out is a light shape (its median lighter than the middle of the scale). Spans shorter than TRACE_MM.minLength are dropped, and wiggly ones shorter than TRACE_MM.wiggle.
// Each line is drawn with one nib and one weight from its mean darkness. Points are [x, y] in the target's pixels.
// Nothing is settable. The millimetres are the tracer's pixel limits on a bench subject (300 px on its 280 mm sheet,
// BENCH_PIXEL_MM a pixel) restated on the sheet, so a bench subject traces exactly as before.

const BENCH_PIXEL_MM = 280 / 300;
const mm = px => px * BENCH_PIXEL_MM;
/** The tracer's tolerances in sheet millimetres: flank 1.9 to 3.7, reach 3.7, shortest line 13.1, wiggly lines
 *  shorter than 37.3. A contour's side is read over the band from the reach to the shortest line. */
export const TRACE_MM = Object.freeze({ flank: [mm(2), mm(4)], reach: mm(4), minLength: mm(14), wiggle: mm(40) });
const VALUE_STEPS = 9;

const unit = (x, y) => { const m = Math.hypot(x, y); return m > 1e-9 ? [x / m, y / m] : [1, 0]; };
const plen = P => { let l = 0; for (let j = 1; j < P.length; j++) l += Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]); return l; };

/** Thinned mask (1 = line pixel) to pixel chains (index arrays). From each end, and at a junction the walk takes the
 *  neighbour that best continues the direction of the last few pixels, so a crossing is walked straight through. */
export function walkChains(M, W, H) {
  const n = W * H, seen = new Uint8Array(n);
  const nb = i => { const x = i % W, y = (i / W) | 0, r = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && M[yy * W + xx]) r.push(yy * W + xx); } return r; };
  const walk = s => {
    const path = [s]; seen[s] = 1; let c = s;
    for (;;) {
      const next = nb(c).filter(j => !seen[j]);
      if (!next.length) break;
      if (next.length > 1 && path.length >= 2) {
        const b = path[Math.max(0, path.length - 4)], dx = c % W - b % W, dy = ((c / W) | 0) - ((b / W) | 0), m = Math.hypot(dx, dy) || 1;
        const along = k => { const ex = k % W - c % W, ey = ((k / W) | 0) - ((c / W) | 0); return (ex * dx + ey * dy) / (m * Math.hypot(ex, ey)); };
        next.sort((i, j) => along(j) - along(i));
      }
      c = next[0]; seen[c] = 1; path.push(c);
    }
    return path;
  };
  const chains = [];
  for (let i = 0; i < n; i++) if (M[i] && nb(i).length === 1 && !seen[i]) chains.push(walk(i));
  for (let i = 0; i < n; i++) if (M[i] && !seen[i]) chains.push(walk(i));
  return chains;
}

/** Douglas-Peucker: drop points within `tol` pixels of the chord. At one pixel this removes the thinning's staircase,
 *  which is the trace's sampling, not a direction the pen took. */
export function simplify(P, tol = 1) {
  if (P.length < 3) return P;
  const a = P[0], b = P.at(-1), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let k = -1, dm = 0;
  for (let i = 1; i < P.length - 1; i++) {
    const d = L > 1e-9 ? Math.abs((b[0] - a[0]) * (a[1] - P[i][1]) - (a[0] - P[i][0]) * (b[1] - a[1])) / L : Math.hypot(P[i][0] - a[0], P[i][1] - a[1]);
    if (d > dm) { dm = d; k = i; }
  }
  return dm > tol ? [...simplify(P.slice(0, k + 1), tol).slice(0, -1), ...simplify(P.slice(k), tol)] : [a, b];
}

/** Split a line where it turns back on itself (more than a right angle between consecutive segments): a pen lifts
 *  there, so a zigzag is several strokes, each judged on its own. */
export function splitAtTurns(P) {
  const out = []; let cur = [P[0]];
  for (let j = 1; j < P.length; j++) {
    cur.push(P[j]);
    if (j < P.length - 1) {
      const ax = P[j][0] - P[j - 1][0], ay = P[j][1] - P[j - 1][1], bx = P[j + 1][0] - P[j][0], by = P[j + 1][1] - P[j][1];
      if (ax * bx + ay * by < 0) { out.push(cur); cur = [P[j]]; }
    }
  }
  out.push(cur);
  return out;
}

/** Join pieces where the end of one points at the start of another across at most `gap` pixels, with tangents that
 *  agree (cos) and a gap that lies along both (aim): the painter's hand gates (drawing-hand.mjs, 0.8 and 0.7). A piece
 *  meeting another at a corner, or lying beside it, is not joined. The closest join is made first (ties in scan order:
 *  piece, other piece, end, other end), the joined piece goes to the end of the list, and the search starts again.
 *  Ends are binned by the gap, so each search looks only at ends near each other. */
export function joinPieces(pieces, { gap, cos = 0.8, aim = 0.7 } = {}) {
  let items = pieces.filter(P => P.length >= 2).map(P => P.slice());
  const end = (P, atStart) => { const p = atStart ? P[0] : P.at(-1), q = atStart ? P[1] : P.at(-2); return { p, t: unit(p[0] - q[0], p[1] - q[1]) }; };
  const cell = Math.max(gap, 1e-9);
  for (;;) {
    const bins = new Map(), ends = items.map(P => [end(P, false), end(P, true)]);
    items.forEach((_, b) => { for (const sb of [true, false]) { const { p } = ends[b][sb ? 1 : 0], k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`; if (!bins.has(k)) bins.set(k, []); bins.get(k).push([b, sb]); } });
    let best = null;
    const order = (a, b, sa, sb) => [a, b, sa ? 1 : 0, sb ? 0 : 1];
    const before = (x, y) => { for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
    for (let a = 0; a < items.length; a++) for (const sa of [false, true]) {
      const A = ends[a][sa ? 1 : 0], cx = Math.floor(A.p[0] / cell), cy = Math.floor(A.p[1] / cell);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const [b, sb] of bins.get(`${cx + dx},${cy + dy}`) ?? []) {
        if (a === b) continue;
        const B = ends[b][sb ? 1 : 0], ex = B.p[0] - A.p[0], ey = B.p[1] - A.p[1], d = Math.hypot(ex, ey);
        if (d > gap) continue;
        if (-(A.t[0] * B.t[0] + A.t[1] * B.t[1]) < cos) continue;
        if (d > 1e-9) { const u = [ex / d, ey / d]; if (Math.min(A.t[0] * u[0] + A.t[1] * u[1], -(B.t[0] * u[0] + B.t[1] * u[1])) < aim) continue; }
        const o = order(a, b, sa, sb);
        if (!best || d < best.d || (d === best.d && before(o, best.o))) best = { a, b, sa, sb, d, o };
      }
    }
    if (!best) return items;
    const A = best.sa ? items[best.a].slice().reverse() : items[best.a], B = best.sb ? items[best.b] : items[best.b].slice().reverse();
    items = items.filter((_, i) => i !== best.a && i !== best.b).concat([[...A, ...B]]);
  }
}

/** Whether the line is a contour: on at least half its points one side is a light shape, i.e. the median luminance of
 *  the band `band` = [from, to] pixels out across it is lighter than `mid`, the middle of the subject's value scale.
 *  The band runs from the tracer's reach to its shortest line: a shape at least as wide as the shortest line it draws.
 *  A line with dark shapes on both sides lies inside a dark mass, where the wash states the form; a white fleck or a
 *  sheen streak beside it is not a shape. `at(x, y)` is luminance 0..1. */
export function hasLightSide(P, at, mid, band) {
  const pts = [];
  for (let j = 1; j < P.length; j++) { const L = Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]), k = Math.max(1, Math.ceil(L)); for (let s = 0; s < k; s++) pts.push([P[j - 1][0] + (P[j][0] - P[j - 1][0]) * s / k, P[j - 1][1] + (P[j][1] - P[j - 1][1]) * s / k, P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]]); }
  if (!pts.length) return false;
  const rs = []; for (let r = band[0]; r <= band[1]; r++) rs.push(r);
  let lit = 0;
  for (const [x, y, dx, dy] of pts) {
    const [tx, ty] = unit(dx, dy), nx = -ty, ny = tx;
    const side = s => { const v = rs.map(r => at(Math.floor(x + s * nx * r), Math.floor(y + s * ny * r))).sort((a, b) => a - b); return v[v.length >> 1]; };
    if (Math.max(side(1), side(-1)) > mid) lit++;
  }
  return lit >= pts.length / 2;
}

/**
 * Trace the subject's pen lines. `lum` is luminance 0..1, W by H; `pixelMm` is the sheet's millimetres per pixel of it.
 * @returns {{ lines: {points:number[][], length, weight, width}[], scale: {paper, ink, step, mid}, px, stats: {linePixels, inMass} }}
 */
export function tracePen(lum, W, H, { pixelMm }) {
  if (!(pixelMm > 0)) throw new Error('pen trace: the sheet millimetres of one pixel');
  // a tolerance in pixels (to a millionth, so a bench subject lands on its old whole pixels); never under one pixel
  const px = v => +(v / pixelMm).toFixed(6), f0 = Math.max(1, Math.round(px(TRACE_MM.flank[0])));
  const P = { flank: [f0, Math.max(f0 + 1, Math.round(px(TRACE_MM.flank[1])))], side: [Math.max(1, Math.round(px(TRACE_MM.reach))), Math.max(1, Math.round(px(TRACE_MM.minLength)))],
    reach: Math.max(1, px(TRACE_MM.reach)), minLength: px(TRACE_MM.minLength), wiggle: px(TRACE_MM.wiggle) };
  const n = W * H, sorted = Float32Array.from(lum).sort(), q = f => sorted[Math.min(n - 1, Math.floor(f * n))];
  const paper = q(0.99), ink = q(0.001), step = (paper - ink) / (VALUE_STEPS - 1), mid = ink + (paper - ink) / 2;
  const at = (x, y) => lum[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  const M = new Uint8Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = at(x, y); if (v > mid) continue; let best = 0;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) for (let d = P.flank[0]; d < P.flank[1]; d++) {
      const a = Math.max(at(x + dx * d, y + dy * d), at(x + dx * (d + 1), y + dy * (d + 1))), b = Math.max(at(x - dx * d, y - dy * d), at(x - dx * (d + 1), y - dy * (d + 1)));
      best = Math.max(best, Math.min(a, b) - v);
    }
    if (best > 0 && best >= step) M[y * W + x] = 1;
  }
  thin(M, W, H);
  let linePixels = 0; for (const v of M) linePixels += v;
  const pieces = joinPieces(walkChains(M, W, H).map(p => simplify(p.map(i => [i % W + 0.5, ((i / W) | 0) + 0.5]), 1)).flatMap(splitAtTurns), { gap: P.reach });
  const lines = []; let inMass = 0;
  for (const pts of pieces) {
    const len = plen(pts);
    if (len < P.minLength) continue;
    const chord = Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]);
    if (chord / len < 0.55 && len < P.wiggle) continue;
    if (!hasLightSide(pts, at, mid, P.side)) { inMass++; continue; }
    const d = pts.reduce((a, [x, y]) => a + 1 - at(Math.floor(x), Math.floor(y)), 0) / pts.length;
    lines.push({ points: pts, length: len, weight: Math.min(0.85, 0.4 + 0.55 * d), width: +(1.6 + 2.4 * d).toFixed(2) });
  }
  return { lines, scale: { paper, ink, step, mid }, px: P, stats: { linePixels, inMass } };
}

// Zhang-Suen thinning, in place.
function thin(M, W, H) {
  const N = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : M[y * W + x]);
  for (let changed = true; changed;) {
    changed = false;
    for (const pass of [0, 1]) {
      const del = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!M[y * W + x]) continue;
        const p = [N(x, y - 1), N(x + 1, y - 1), N(x + 1, y), N(x + 1, y + 1), N(x, y + 1), N(x - 1, y + 1), N(x - 1, y), N(x - 1, y - 1)];
        const b = p.reduce((a, c) => a + c, 0); if (b < 2 || b > 6) continue;
        let a = 0; for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
        if (a !== 1) continue;
        if (pass === 0 ? (p[0] * p[2] * p[4] || p[2] * p[4] * p[6]) : (p[0] * p[2] * p[6] || p[0] * p[4] * p[6])) continue;
        del.push(y * W + x);
      }
      for (const i of del) M[i] = 0;
      if (del.length) changed = true;
    }
  }
}

/** RGB bytes (W by H) to luminance 0..1. */
export function luminance(rgb, W, H) {
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = (0.2126 * rgb[3 * i] + 0.7152 * rgb[3 * i + 1] + 0.0722 * rgb[3 * i + 2]) / 255;
  return lum;
}
