// Smooth curves for strokes: one cubic through a ridge, the curvature sign changes of a polyline, and a ridge cut where
// the cubic cannot follow it. Shared by single ridges (src/crop/thin-lights.mjs) and strand fields
// (src/crop/strand-field.mjs). Pixels in, pixels out. DOM free.

/** A polyline resampled every `step` pixels, so a fit sees the ridge and not the few vertices that describe it. */
export function densify(P, step = 1) {
  const out = [P[0]];
  for (let j = 1; j < P.length; j++) {
    const a = P[j - 1], b = P[j], m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= m; k++) out.push([a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m]);
  }
  return out;
}

export const plen = P => { let l = 0; for (let j = 1; j < P.length; j++) l += Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]); return l; };

// ----------------------------------------------------------------------------------------------------------------
// one cubic curve through a ridge

const bez = (P, t) => {
  const u = 1 - t, a = u * u * u, b = 3 * t * u * u, c = 3 * t * t * u, d = t * t * t;
  return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]];
};

/** Cubic through the points with the ends kept, by least squares on chord-length parameters, refined by projection. */
export function fitCubic(Q) {
  const n = Q.length, a = Q[0], d = Q[n - 1];
  if (n < 4) return { C: [a, [a[0] + (d[0] - a[0]) / 3, a[1] + (d[1] - a[1]) / 3], [a[0] + 2 * (d[0] - a[0]) / 3, a[1] + 2 * (d[1] - a[1]) / 3], d], dev: 0, max: 0 };
  let t = [0]; for (let i = 1; i < n; i++) t.push(t[i - 1] + Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]));
  t = t.map(v => v / (t[n - 1] || 1));
  let C = null, dev = Infinity, max = Infinity;
  for (let round = 0; round < 4; round++) {
    let m00 = 0, m01 = 0, m11 = 0; const r1 = [0, 0], r2 = [0, 0];
    for (let i = 0; i < n; i++) {
      const u = 1 - t[i], b0 = u * u * u, b1 = 3 * t[i] * u * u, b2 = 3 * t[i] * t[i] * u, b3 = t[i] ** 3;
      m00 += b1 * b1; m01 += b1 * b2; m11 += b2 * b2;
      for (let c = 0; c < 2; c++) { const e = Q[i][c] - b0 * a[c] - b3 * d[c]; r1[c] += b1 * e; r2[c] += b2 * e; }
    }
    const det = m00 * m11 - m01 * m01;
    const p1 = [0, 0], p2 = [0, 0];
    for (let c = 0; c < 2; c++) {
      if (Math.abs(det) < 1e-9) { p1[c] = a[c] + (d[c] - a[c]) / 3; p2[c] = a[c] + 2 * (d[c] - a[c]) / 3; }
      else { p1[c] = (m11 * r1[c] - m01 * r2[c]) / det; p2[c] = (m00 * r2[c] - m01 * r1[c]) / det; }
    }
    C = [a, p1, p2, d];
    // project each point on the curve to refine its parameter, and measure how far the ridge lies from it
    const S = 120, samples = []; for (let k = 0; k <= S; k++) samples.push(bez(C, k / S));
    let sum = 0, mx = 0;
    for (let i = 0; i < n; i++) {
      let best = Infinity, bk = 0;
      for (let k = 0; k <= S; k++) { const dd = (samples[k][0] - Q[i][0]) ** 2 + (samples[k][1] - Q[i][1]) ** 2; if (dd < best) { best = dd; bk = k; } }
      t[i] = bk / S; const dist = Math.sqrt(best); sum += dist; if (dist > mx) mx = dist;
    }
    dev = sum / n; max = mx;
  }
  return { C, dev, max };
}

/** Curvature sign changes of a polyline, ignoring turns under a deadband (radians). */
export function turnSigns(P, dead = 0.02) {
  let sign = 0, changes = 0;
  for (let i = 1; i < P.length - 1; i++) {
    const ax = P[i][0] - P[i - 1][0], ay = P[i][1] - P[i - 1][1], bx = P[i + 1][0] - P[i][0], by = P[i + 1][1] - P[i][1];
    const ang = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    if (Math.abs(ang) < dead) continue;
    const s = ang > 0 ? 1 : -1;
    if (sign && s !== sign) changes++;
    sign = s;
  }
  return changes;
}

/**
 * One ridge as smooth, whole strokes. A ridge the cubic cannot follow within `tol` pixels is cut at its worst point and
 * each part fitted again, down to `minLen` pixels; a part that still does not fit is dropped.
 * @returns [{ curve: [[x, y]], dev, max, turns }] with the curve sampled about every `step` pixels
 */
export function smoothStrokes(Q, { tol, minLen, step = 1, depth = 2 }) {
  const fit = fitCubic(Q), len = plen(Q);
  const out = [];
  if (fit.max <= tol) {
    const m = Math.max(3, Math.ceil(len / step)), curve = []; for (let k = 0; k <= m; k++) curve.push(bez(fit.C, k / m));
    out.push({ curve, dev: fit.dev, max: fit.max, turns: turnSigns(curve) });
    return out;
  }
  if (depth <= 0 || Q.length < 8) return out;
  // cut where the ridge leaves the curve
  let k = -1, worst = 0; const S = 120, samples = []; for (let j = 0; j <= S; j++) samples.push(bez(fit.C, j / S));
  for (let i = 2; i < Q.length - 2; i++) {
    let best = Infinity; for (const s of samples) best = Math.min(best, (s[0] - Q[i][0]) ** 2 + (s[1] - Q[i][1]) ** 2);
    if (best > worst) { worst = best; k = i; }
  }
  if (k < 0) return out;
  for (const part of [Q.slice(0, k + 1), Q.slice(k)]) if (plen(part) >= minLen) out.push(...smoothStrokes(part, { tol, minLen, step, depth: depth - 1 }));
  return out;
}

