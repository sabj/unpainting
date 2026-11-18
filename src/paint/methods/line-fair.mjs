// Fairing: a kept line follows its ridge, and is drawn as the spec says: a straight run or a clean arc where one fits, else one
// smooth curve, with corners kept and the ends within the tolerance of the trace's own. The line model's ridge is read on a grid of a quarter millimetre or more, so a
// traced centre-line carries that grid's tremor; no pen has it. A fairing that would move the line further than `maxMoveMm`
// leaves it as it was. Pure: arrays in, arrays out. Coordinates are the line file's image pixels.

const FAIR_DEFAULTS = Object.freeze({
  sigmaMm: 1.2,        // the smoothing of an organic curve
  cornerDeg: 50,       // a turn of this much within `cornerReachMm` is a corner, and splits the line
  cornerReachMm: 1.5,
  tolMm: 0.26,         // a straight run or arc stays this close (95th percentile) to the trace: one pixel of the line model's own grid
  maxMoveMm: 0.4,      // no point of the faired line is further than this from the trace
  arcMinRadiusMm: 1,
  arcMaxSweepDeg: 270,
  stepMm: 0.25,
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pathLen = P => { let s = 0; for (let k = 1; k < P.length; k++) s += dist(P[k], P[k - 1]); return s; };

/** `pts` resampled every `step` along their length, widths and weights interpolated; the last point is always kept. */
function resampleBy(pts, step) {
  const s = [0]; for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + dist(pts[k], pts[k - 1]));
  const L = s.at(-1); if (!(L > 0)) return { P: pts.map(p => ({ ...p })), s, L: 0 };
  const n = Math.max(2, Math.round(L / step) + 1), out = []; let j = 0;
  for (let i = 0; i < n; i++) {
    const t = L * i / (n - 1); while (j < pts.length - 2 && s[j + 1] < t) j++;
    const u = s[j + 1] > s[j] ? (t - s[j]) / (s[j + 1] - s[j]) : 0, a = pts[j], b = pts[j + 1], q = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    for (const k of ['width', 'weight']) if (a[k] != null && b[k] != null) q[k] = a[k] + (b[k] - a[k]) * u;
    out.push(q);
  }
  return { P: out, s, L };
}

/** Gaussian smoothing along the samples (spacing `step`), the ends held by odd reflection so a trend through them survives. */
function gauss(P, sigmaSamples) {
  const n = P.length, r = Math.ceil(3 * sigmaSamples), w = []; let tot = 0;
  for (let k = -r; k <= r; k++) { const v = Math.exp(-0.5 * (k / sigmaSamples) ** 2); w.push(v); tot += v; }
  const at = (i, c) => (i < 0 ? 2 * P[0][c] - P[Math.min(n - 1, -i)][c] : i >= n ? 2 * P[n - 1][c] - P[Math.max(0, 2 * (n - 1) - i)][c] : P[i][c]);
  return P.map((p, i) => { let x = 0, y = 0; for (let k = -r; k <= r; k++) { x += w[k + r] * at(i + k, 'x'); y += w[k + r] * at(i + k, 'y'); } return { ...p, x: x / tot, y: y / tot }; });
}

/** Sign changes of curvature along a path (read at 0.6 mm, over 0.15 rad per mm): the count of reversals a hand would not make. */
export function curvatureFlips(points, pxMm, { sigmaMm = 0.6, kappaMin = 0.15, stepMm = 0.25 } = {}) {
  const { P } = resampleBy(points, stepMm / pxMm); if (P.length < 5) return 0;
  const Q = gauss(P, sigmaMm / stepMm), ds = stepMm; let prev = 0, flips = 0, th = null;
  const heading = k => Math.atan2(Q[k + 1].y - Q[k].y, Q[k + 1].x - Q[k].x);
  let last = heading(0);
  for (let k = 1; k < Q.length - 1; k++) {
    let a = heading(k), d = a - last; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; last = a;
    const kappa = d / ds; if (Math.abs(kappa) < kappaMin) continue;
    const sg = Math.sign(kappa); if (prev && sg !== prev) flips++; prev = sg;
  }
  return flips;
}

/** Corners: indices of local maxima of the turn between chords of `reach` either side, over `deg`, on a copy smoothed past the grid's tremor. */
function corners(P, o) {
  const Q = gauss(P, 0.75 / o.stepMm), r = Math.max(2, Math.round(o.cornerReachMm / o.stepMm)), turn = new Float64Array(P.length);
  for (let k = r; k < P.length - r; k++) {
    const a = Math.atan2(Q[k].y - Q[k - r].y, Q[k].x - Q[k - r].x), b = Math.atan2(Q[k + r].y - Q[k].y, Q[k + r].x - Q[k].x);
    let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d; turn[k] = d * 180 / Math.PI;
  }
  const out = [];
  for (let k = r; k < P.length - r; k++) { let top = turn[k] >= o.cornerDeg; for (let j = Math.max(r, k - r); j <= Math.min(P.length - r - 1, k + r) && top; j++) if (turn[j] > turn[k] || (turn[j] === turn[k] && j < k)) top = false; if (top) out.push(k); }
  return out;
}

const p95 = v => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))] ?? 0; };

/** Distance from `p` to the polyline `Q` (segments). */
function toPolyline(p, Q) {
  let best = Infinity;
  for (let k = 1; k < Q.length; k++) {
    const a = Q[k - 1], b = Q[k], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

/** A straight run along the total-least-squares line of the trace, if its 95th percentile residual is within tol. Ends are projected on. */
function asLine(P, tolPx, trimA = 0, trimB = 0) {
  // the fit leaves out the samples next to a corner, which belong half to the other leg
  const F = P.slice(trimA, P.length - trimB), n = P.length, m = F.length; if (m < 3) return null;
  let mx = 0, my = 0; for (const p of F) { mx += p.x; my += p.y; } mx /= m; my /= m;
  let sxx = 0, sxy = 0, syy = 0; for (const p of F) { const u = p.x - mx, v = p.y - my; sxx += u * u; sxy += u * v; syy += v * v; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), dx = Math.cos(th), dy = Math.sin(th);
  if (p95(F.map(p => Math.abs(-(p.x - mx) * dy + (p.y - my) * dx))) > tolPx) return null;
  const t0 = (P[0].x - mx) * dx + (P[0].y - my) * dy, t1 = (P.at(-1).x - mx) * dx + (P.at(-1).y - my) * dy;
  return { P: P.map((p, k) => { const t = t0 + (t1 - t0) * k / (n - 1); return { ...p, x: mx + dx * t, y: my + dy * t }; }), line: { x: mx, y: my, dx, dy } };
}

/** A circular arc through the trace (Kasa fit), if every point but the worst 5 per cent is within tol of it and it turns one way. */
function asArc(P, tolPx, pxMm, o) {
  const n = P.length; if (n < 6) return null;
  let sx = 0, sy = 0; for (const p of P) { sx += p.x; sy += p.y; } const mx = sx / n, my = sy / n;
  let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of P) { const u = p.x - mx, v = p.y - my; suu += u * u; suv += u * v; svv += v * v; suuu += u ** 3; svvv += v ** 3; suvv += u * v * v; svuu += v * u * u; }
  const det = suu * svv - suv * suv; if (Math.abs(det) < 1e-9) return null;
  const c1 = 0.5 * (suuu + suvv), c2 = 0.5 * (svvv + svuu), cx = (c1 * svv - c2 * suv) / det + mx, cy = (suu * c2 - suv * c1) / det + my;
  let r = 0; for (const p of P) r += Math.hypot(p.x - cx, p.y - cy); r /= n;
  if (r * pxMm < o.arcMinRadiusMm || r * pxMm > 2000) return null;
  if (p95(P.map(p => Math.abs(Math.hypot(p.x - cx, p.y - cy) - r))) > tolPx) return null;
  const ang = P.map(p => Math.atan2(p.y - cy, p.x - cx)); let sweep = 0, sign = 0;
  for (let k = 1; k < n; k++) { let d = ang[k] - ang[k - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; if (!sign) sign = Math.sign(d); if (Math.sign(d) !== sign && Math.abs(d) > 0.02) return null; sweep += Math.abs(d); }
  if (sweep * 180 / Math.PI > o.arcMaxSweepDeg || !sign) return null;
  return P.map((p, k) => { const a = ang[0] + sign * sweep * k / (n - 1); return { ...p, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; });
}

function fairPiece(P, pxMm, o, trimA = 0, trimB = 0) {
  const tolPx = o.tolMm / pxMm, movePx = o.maxMoveMm / pxMm;
  const keep = cand => cand && cand.every(q => toPolyline(q, P) <= movePx);
  const line = asLine(P, tolPx, trimA, trimB); if (line && keep(line.P)) return { P: line.P, kind: 'line', line: line.line };
  const arc = asArc(P, tolPx, pxMm, o); if (arc && keep(arc)) return { P: arc, kind: 'arc' };
  for (const f of [1, 0.5, 0.25]) { const sm = gauss(P, f * o.sigmaMm / o.stepMm); if (keep(sm)) return { P: sm, kind: 'smooth' }; }
  return { P, kind: 'original' };
}

/** Where two straight legs meet, so a corner is a corner: the pieces share that point when it lies within `reachPx` of their ends. */
function meetCorners(pieces, reachPx) {
  for (let k = 1; k < pieces.length; k++) {
    const a = pieces[k - 1], b = pieces[k], ea = a.P.at(-1), sb = b.P[0];
    let x = (ea.x + sb.x) / 2, y = (ea.y + sb.y) / 2;
    if (a.line && b.line) {
      const det = a.line.dx * b.line.dy - a.line.dy * b.line.dx;
      if (Math.abs(det) > 0.2) { const t = ((b.line.x - a.line.x) * b.line.dy - (b.line.y - a.line.y) * b.line.dx) / det, ix = a.line.x + a.line.dx * t, iy = a.line.y + a.line.dy * t; if (Math.hypot(ix - x, iy - y) <= reachPx) { x = ix; y = iy; } }
    }
    a.P[a.P.length - 1] = { ...ea, x, y }; b.P[0] = { ...sb, x, y };
  }
}

/**
 * One line faired. Returns { ...line, points, fair: { kind, pieces } } where kind is line, arc, smooth, poly (corners, each leg
 * faired), or original (too short, or fairing would move it too far).
 * @param {{ points: {x, y, width?, weight?}[] }} g
 */
export function fairLine(g, { pxMm, ...rest }) {
  const o = { ...FAIR_DEFAULTS, ...rest }, step = o.stepMm / pxMm;
  if (g.points.length < 3 || pathLen(g.points) * pxMm < 1.5) return { ...g, fair: { kind: 'original', pieces: 1 } };
  const { P } = resampleBy(g.points, step);
  const cuts = [0, ...corners(P, o), P.length - 1], pieces = [];
  const trim0 = Math.ceil(1.25 / o.stepMm);
  for (let k = 1; k < cuts.length; k++) { const part = P.slice(cuts[k - 1], cuts[k] + 1); if (part.length >= 2) { const trim = Math.max(0, Math.min(trim0, Math.floor((part.length - 4) / 4))); pieces.push(fairPiece(part, pxMm, o, k > 1 ? trim : 0, k < cuts.length - 1 ? trim : 0)); } }
  meetCorners(pieces, o.maxMoveMm / pxMm);
  const points = []; for (const pc of pieces) points.push(...(points.length ? pc.P.slice(1) : pc.P));
  // widths and weights stay with the line: by the share of the way along it
  for (const key of ['width', 'weight']) if (g.points.every(p => p[key] != null)) {
    const src = g.points.map(p => p[key]), sl = [0]; for (let k = 1; k < g.points.length; k++) sl.push(sl[k - 1] + dist(g.points[k], g.points[k - 1]));
    const sf = [0]; for (let k = 1; k < points.length; k++) sf.push(sf[k - 1] + dist(points[k], points[k - 1]));
    let j = 0; points.forEach((p, i) => { const t = sf.at(-1) ? sf[i] / sf.at(-1) * sl.at(-1) : 0; while (j < sl.length - 2 && sl[j + 1] < t) j++; const u = sl[j + 1] > sl[j] ? (t - sl[j]) / (sl[j + 1] - sl[j]) : 0; p[key] = src[j] + (src[j + 1] - src[j]) * u; });
  }
  const kinds = new Set(pieces.map(p => p.kind)), kind = pieces.length === 1 ? pieces[0].kind : kinds.size === 1 && kinds.has('original') ? 'original' : 'poly';
  if (kind === 'original') return { ...g, fair: { kind, pieces: pieces.length } };
  return { ...g, points, fair: { kind, pieces: pieces.length } };
}

/** Fair every line. stats: how many came out as a straight run, an arc, a smooth curve, a corner line, or untouched. */
export function fairLines(lines, opts) {
  const stats = { line: 0, arc: 0, smooth: 0, poly: 0, untouched: 0 }, out = [];
  for (const g of lines) { const r = fairLine(g, opts); out.push(r); stats[r.fair.kind === 'original' ? 'untouched' : r.fair.kind]++; }
  return { lines: out, stats };
}

/** A hand draws a contour with at most one inflection: two reversals of curvature make a scribble. */
const WANDER_FLIPS = 2;

/**
 * Leave wandering lines to the wash: a line (already faired) whose curvature reverses WANDER_FLIPS times or more, unless
 * `isFeature(x, y)` says its middle is a face or a hand.
 * @returns {{ lines, stats: { dropped, droppedMm } }}
 */
export function dropWandering(lines, { pxMm, isFeature = () => false }) {
  const out = []; let dropped = 0, droppedMm = 0;
  for (const g of lines) {
    const mid = g.points[g.points.length >> 1];
    if (curvatureFlips(g.points, pxMm) >= WANDER_FLIPS && !isFeature(mid.x, mid.y)) { dropped++; droppedMm += pathLen(g.points) * pxMm; } else out.push(g);
  }
  return { lines: out, stats: { dropped, droppedMm } };
}
