// Pipeline: inking, stroke by meaning (docs/INK-SPEC; the squiggle fix). A man-made line is drawn as the straight
// segments and clean arcs fitted to its pieces within the line model's own resolution `tol` (mm): the subject's pixel,
// finer than which the model cannot place a line. A straight run within `tol` of one line is one straight segment; a run
// within `tol` of one circle, turning at least a little, is one arc; otherwise the run is split at its point farthest from
// its chord and each half is fitted again. An organic line is one smooth curve through its pieces (the pen tracer's
// rounding, pen-trace.mjs smoothPath). Pure: points in, points out.
import { smoothPath } from '../../crop/pen-trace.mjs';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The least-squares line through P: its mean point and unit direction, and the farthest point's distance from it. */
export function lineFit(P) {
  const n = P.length, mx = P.reduce((a, p) => a + p[0], 0) / n, my = P.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of P) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), u = [Math.cos(th), Math.sin(th)];
  let dev = 0; for (const [x, y] of P) dev = Math.max(dev, Math.abs(-(x - mx) * u[1] + (y - my) * u[0]));
  return { m: [mx, my], u, dev };
}

/** The circle through P by least squares (Kasa): centre, radius and the farthest point's distance from it, or null. */
function circleFit(P) {
  const n = P.length; if (n < 3) return null;
  const mx = P.reduce((a, p) => a + p[0], 0) / n, my = P.reduce((a, p) => a + p[1], 0) / n;
  let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const [x, y] of P) { const u = x - mx, v = y - my; suu += u * u; suv += u * v; svv += v * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u; }
  const det = suu * svv - suv * suv; if (Math.abs(det) < 1e-12) return null;
  const a = (suuu + suvv) / 2, b = (svvv + svuu) / 2, uc = (a * svv - b * suv) / det, vc = (b * suu - a * suv) / det;
  const c = [uc + mx, vc + my], r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  let dev = 0; for (const p of P) dev = Math.max(dev, Math.abs(dist(p, c) - r));
  return { c, r, dev };
}

/** The angle P runs through about centre c, signed, unwrapped point to point. */
function sweep(P, c) {
  let s = 0;
  for (let k = 1; k < P.length; k++) { let d = Math.atan2(P[k][1] - c[1], P[k][0] - c[0]) - Math.atan2(P[k - 1][1] - c[1], P[k - 1][0] - c[0]); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; s += d; }
  return s;
}

/**
 * The straight segments and arcs fitted to a man-made line's points P (mm) within `tol`. Returns { points, parts:
 * [{ kind: 'line' | 'arc', from, to }] }: one polyline, a straight part as its two ends, an arc sampled every `tol`.
 */
export function fitManMade(P, tol) {
  const parts = [];
  const fit = (a, b) => {
    const Q = P.slice(a, b + 1);
    if (Q.length <= 2) { parts.push({ kind: 'line', pts: [Q[0], Q.at(-1)] }); return; }
    const L = lineFit(Q);
    if (L.dev <= tol) {
      // the line's own ends, projected onto it
      const proj = p => { const t = (p[0] - L.m[0]) * L.u[0] + (p[1] - L.m[1]) * L.u[1]; return [L.m[0] + t * L.u[0], L.m[1] + t * L.u[1]]; };
      parts.push({ kind: 'line', pts: [proj(Q[0]), proj(Q.at(-1))] }); return;
    }
    const C = circleFit(Q);
    // a clean arc turns no more than a right angle: past that a pen lifts (pen-trace.mjs splitAtTurns)
    const sw = C && C.dev <= tol ? sweep(Q, C.c) : Infinity;
    if (Math.abs(sw) <= Math.PI / 2) {
      const a0 = Math.atan2(Q[0][1] - C.c[1], Q[0][0] - C.c[0]), n = Math.max(2, Math.ceil(Math.abs(sw) * C.r / tol));
      parts.push({ kind: 'arc', pts: Array.from({ length: n + 1 }, (_, i) => { const t = a0 + sw * i / n; return [C.c[0] + C.r * Math.cos(t), C.c[1] + C.r * Math.sin(t)]; }) }); return;
    }
    // split at the point farthest from the chord
    let k = a + 1, dm = -1;
    const A = P[a], B = P[b], len = dist(A, B) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((B[0] - A[0]) * (A[1] - P[i][1]) - (A[0] - P[i][0]) * (B[1] - A[1])) / len; if (d > dm) { dm = d; k = i; } }
    fit(a, k); fit(k, b);
  };
  if (P.length >= 2) fit(0, P.length - 1);
  // one polyline: each part starts where the last ended
  const points = [];
  for (const pt of parts) { const [s, ...rest] = pt.pts; if (!points.length) points.push(s); else points[points.length - 1] = [(points.at(-1)[0] + s[0]) / 2, (points.at(-1)[1] + s[1]) / 2]; points.push(...rest); }
  return { points, parts: parts.map(p => ({ kind: p.kind, from: p.pts[0], to: p.pts.at(-1), pts: p.pts })) };
}

/** An organic line: one smooth curve through its points (the tracer's rounding between lifts at its `reach`). */
export function fitOrganic(P, reach) { return { points: smoothPath(P, reach), parts: [{ kind: 'curve', from: P[0], to: P.at(-1) }] }; }

/**
 * A fitted man-made line as the strokes a pen draws: consecutive parts continue one stroke while the turn where they meet
 * is gentler than the drawing hand's join gate (cos 0.8); at a sharper corner the pen lifts (pen.md: a sharp turn is a
 * lift), unless a leg is shorter than `minLeg`, round which the pen goes on. Returns [[x, y]...][].
 */
export function strokesAtCorners(parts, cos = 0.8, minLeg = 0) {
  const dir = (a, b) => { const m = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / m, (b[1] - a[1]) / m]; };
  const out = [];
  for (const p of parts) {
    const cur = out.at(-1), pts = p.pts;
    if (cur) {
      const a = dir(cur.at(-2), cur.at(-1)), b = dir(pts[0], pts[1]);
      if (a[0] * b[0] + a[1] * b[1] >= cos) { cur.push(...pts.slice(1)); continue; }
    }
    out.push([...pts]);
  }
  // a leg shorter than `minLeg` is not a stroke of its own: the pen goes on round that corner
  const len = Q => { let t = 0; for (let k = 1; k < Q.length; k++) t += Math.hypot(Q[k][0] - Q[k - 1][0], Q[k][1] - Q[k - 1][1]); return t; };
  for (let i = 0; i < out.length && out.length > 1;) {
    if (len(out[i]) >= minLeg) { i++; continue; }
    if (i > 0) { out[i - 1].push(...out[i].slice(1)); out.splice(i, 1); } else { out[1] = [...out[0], ...out[1].slice(1)]; out.splice(0, 1); }
  }
  return out;
}

/** Distances in sheet mm to an independently frozen straight/curve reference, sampled by arc length.
 * Pass the SAME subject reference for every candidate; never fit a candidate to itself for comparison.
 * A real arch has zero residual against its arch, regardless of its length/chord ratio. */
export function curveResidual(P, reference, sampleMm = 0.25) {
  if (!(sampleMm > 0) || reference.length < 2 || P.length < 2) throw new Error('curve residual: two paths and a positive sheet-mm sampling interval required');
  const distances = [];
  const distance = p => {
    let best = Infinity;
    for (let i = 1; i < reference.length; i++) {
      const a = reference[i - 1], b = reference[i], dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
    }
    return best;
  };
  let carry = 0;
  distances.push(distance(P[0]));
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], len = dist(a, b);
    for (let d = sampleMm - carry; d <= len; d += sampleMm) {
      const t = d / len; distances.push(distance([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]));
    }
    carry = (carry + len) % sampleMm;
  }
  distances.sort((a, b) => a - b);
  const q = f => distances[Math.floor(f * (distances.length - 1))];
  return { medianMm: q(0.5), p90Mm: q(0.9), maxMm: distances.at(-1), samples: distances.length };
}
