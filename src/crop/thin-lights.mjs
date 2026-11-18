// Thin lights a wash cannot reserve: a whisker, a light hair over a dark coat, the glint in an eye or on a nose.
// The wash planner goes round lights down to about a rigger touch (TOUCH_MM). Anything thinner is laid last, in
// opaque white, with the rigger (src/media/gouache.mjs). This module finds those lights in the planning data (the
// source's optical density, read once before painting) and returns each as one smooth, whole stroke, never as cells.
//
// A ridge qualifies by what a painter could not reserve: it is narrower than a rigger touch, lighter than its
// surround by a clear step (STEP_OD), the surround is dark (DARK_OD, so no light on pale ground and no broad light
// area is ever touched), and it is long for its width (ASPECT). A dot qualifies only as a true glint: a few tenths of
// a millimetre across, near paper white, ringed by dark. Each ridge is fitted with one cubic curve, and a ridge the
// curve cannot follow within FIT_MM is cut at its worst point or dropped, so a stroke never wobbles. Constants are
// painter's limits in millimetres and optical density, the same for every subject. DOM free.
import { components, thin, minFilter, maxFilter, distanceToOne } from '../raster.js';
import { walkChains, simplify, splitAtTurns, joinPieces } from './pen-trace.mjs';

export const TOUCH_MM = 1.2;            // the narrowest light the wash planner can go round (a rigger touch)
export const RIGGER_MM = Object.freeze({ min: 0.25, max: 1.0 });   // a rigger's line, point to belly
const STEP_OD = 0.25;                   // lighter than its surround by at least this much density (about 22% in luminance)
const DARK_OD = 0.45;                   // the surround, closed over the light, is at least this dense
const MIN_LENGTH_MM = 4;                // a stroke shorter than this is a fragment, not a hair
const ASPECT = 8;                       // length over width
const FIT_MM = 0.3;                     // the most a stroke may leave its ridge
const MAX_TURNS_PER_CM = 0.75;          // curvature sign changes per cm of a laid stroke
const GLINT = Object.freeze({ maxMm: 1.8, lightOd: 0.2, stepOd: 0.5, darkOd: 0.7 });
const CHAINS_MAX = 1500;                // chains kept for joining, longest and clearest first (joining is the costly step)
const CLUSTER_MM = 10;                  // a hair stands among others: a short stroke with no neighbour is a fleck

/** A polyline resampled every `step` pixels, so a fit sees the ridge and not the few vertices that describe it. */
function densify(P, step = 1) {
  const out = [P[0]];
  for (let j = 1; j < P.length; j++) {
    const a = P[j - 1], b = P[j], m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= m; k++) out.push([a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m]);
  }
  return out;
}

const plen = P => { let l = 0; for (let j = 1; j < P.length; j++) l += Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]); return l; };

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

/** The density at each side of a stroke, a little beyond its own width: a hair has dark on both sides; the notches along
 *  the edge of a broad light have the light on one. The median over the stroke of the lighter side. */
function sideDensity(curve, D, w, h, offsetPx) {
  const at = (x, y) => D[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  const v = [];
  for (let i = 1; i < curve.length - 1; i++) {
    const tx = curve[i + 1][0] - curve[i - 1][0], ty = curve[i + 1][1] - curve[i - 1][1], m = Math.hypot(tx, ty) || 1, nx = -ty / m, ny = tx / m;
    const side = k => Math.max(at(curve[i][0] + k * nx * offsetPx, curve[i][1] + k * ny * offsetPx), at(curve[i][0] + k * nx * (offsetPx + 1), curve[i][1] + k * ny * (offsetPx + 1)));
    v.push(Math.min(side(1), side(-1)));
  }
  v.sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : 0;
}

// ----------------------------------------------------------------------------------------------------------------

/**
 * The thin lights in a density field.
 * @param D        optical density per pixel (0 at paper), w * h
 * @param pixelMm  millimetres of the sheet one pixel spans
 * @param rgb      optional RGB bytes, 3 * w * h: the light's own colour is read from it along each stroke
 * @param limits   optional overrides of { strokesMax, glintsMax } (strokes per sheet)
 * @returns {{ strokes, stats }} strokes: [{ kind: 'strand'|'glint', points: [[x, y]] (pixels), widthMm, lengthMm,
 *   lightOd, surroundOd, rgb|null, fit: { maxMm, meanMm, turnsPerCm } }], best first
 */
export function thinLights(D, w, h, { pixelMm, rgb = null, strokesMax = Infinity, glintsMax = Infinity } = {}) {
  if (!(pixelMm > 0)) throw new Error('thin lights: the millimetres of one pixel');
  const n = w * h, r = Math.max(1, Math.round(TOUCH_MM / 2 / pixelMm));
  const closed = minFilter(maxFilter(D, w, h, r), w, h, r);
  const margin = r + 1;
  const mask = new Uint8Array(n);
  for (let y = margin; y < h - margin; y++) for (let x = margin; x < w - margin; x++) {
    const i = y * w + x;
    if (closed[i] >= DARK_OD && closed[i] - D[i] >= STEP_OD) mask[i] = 1;
  }
  const { labels, areas, count } = components(mask, w, h, 8);
  const skeleton = thin(mask, w, h);
  // per component: skeleton length (for its width), extents, and the best contrast
  const comp = Array.from({ length: count + 1 }, () => ({ skel: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, minD: Infinity, closedMax: 0, sx: 0, sy: 0 }));
  for (let i = 0; i < n; i++) {
    const l = labels[i]; if (!l) continue;
    const c = comp[l], x = i % w, y = (i - x) / w;
    if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
    if (D[i] < c.minD) c.minD = D[i];
    if (closed[i] > c.closedMax) c.closedMax = closed[i];
    c.sx += x; c.sy += y;
    if (skeleton[i]) c.skel++;
  }
  const ridgeDist = distanceToOne(skeleton, w, h);
  const strokes = [], glints = [];
  const colourOf = pts => {
    if (!rgb) return null;
    const px = pts.map(([x, y]) => { const i = Math.min(h - 1, Math.max(0, Math.floor(y))) * w + Math.min(w - 1, Math.max(0, Math.floor(x))); return [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2]]; });
    px.sort((a, b) => b[3] - a[3]);
    const top = px.slice(0, Math.max(1, Math.ceil(px.length / 2)));
    return [0, 1, 2].map(c => Math.round(top.reduce((s, p) => s + p[c], 0) / top.length));
  };
  const densityAlong = (pts, F) => { const v = pts.map(([x, y]) => F[Math.min(h - 1, Math.max(0, Math.floor(y))) * w + Math.min(w - 1, Math.max(0, Math.floor(x)))]).sort((a, b) => a - b); return v[v.length >> 1]; };

  // glints: compact, near paper white, ringed by dark
  for (let l = 1; l <= count; l++) {
    const c = comp[l], ext = Math.max(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1) * pixelMm;
    if (ext > GLINT.maxMm || c.minD > GLINT.lightOd || c.closedMax < GLINT.darkOd) continue;
    let contrast = 0;
    const cx = c.sx / areas[l] + 0.5, cy = c.sy / areas[l] + 0.5, ci = Math.min(h - 1, Math.floor(cy)) * w + Math.min(w - 1, Math.floor(cx));
    contrast = closed[ci] - c.minD;
    if (contrast < GLINT.stepOd) continue;
    // ringed by dark on every side: the tip of a broad light, or a notch in its edge, has light on one
    const ring = ext / 2 / pixelMm + 2;
    let ringed = true;
    for (let k = 0; k < 8 && ringed; k++) {
      const a = k * Math.PI / 4, at = q => D[Math.min(h - 1, Math.max(0, Math.round(cy + Math.sin(a) * q))) * w + Math.min(w - 1, Math.max(0, Math.round(cx + Math.cos(a) * q)))];
      if (Math.max(at(ring), at(ring + 1)) < GLINT.darkOd) ringed = false;
    }
    if (!ringed) continue;
    const half = Math.max(ext, RIGGER_MM.min) / 2 / pixelMm;
    const pts = [[cx - half * 0.5, cy], [cx + half * 0.5, cy]];
    glints.push({ kind: 'glint', points: pts, widthMm: Math.min(RIGGER_MM.max, Math.max(RIGGER_MM.min, ext)), lengthMm: Math.max(ext, RIGGER_MM.min), lightOd: c.minD, surroundOd: closed[ci], rgb: null, fit: { maxMm: 0, meanMm: 0, turnsPerCm: 0 }, score: contrast });
  }

  // strands: the skeleton's chains, one smooth curve each
  const gap = TOUCH_MM / pixelMm, tolPx = FIT_MM / pixelMm, minLen = MIN_LENGTH_MM / pixelMm;
  // a chain is kept for joining only if it could belong to a hair: at least a millimetre long, on a ridge no wider than a
  // rigger touch, with dark on both sides. The rest is the skeleton's spurs and the texture of the coat.
  const labelAt = ([x, y]) => labels[Math.min(h - 1, Math.floor(y)) * w + Math.min(w - 1, Math.floor(x))];
  const hairlike = P => {
    const l = labelAt(P[P.length >> 1]) || labelAt(P[0]);
    if (!l || comp[l].skel < 1 || areas[l] / comp[l].skel * pixelMm > TOUCH_MM) return 0;
    const dense = densify(P), sides = sideDensity(dense, D, w, h, Math.ceil(RIGGER_MM.min / 2 / pixelMm) + 2);
    return dense.length >= 3 && sides >= DARK_OD && sides - densityAlong(dense, D) >= STEP_OD ? (sides - densityAlong(dense, D)) * plen(P) : 0;
  };
  const chains = walkChains(skeleton, w, h).map(ch => simplify(ch.map(i => [i % w + 0.5, ((i / w) | 0) + 0.5]), 1)).filter(P => P.length >= 2 && plen(P) * pixelMm >= 1).flatMap(splitAtTurns).filter(P => P.length >= 2 && plen(P) * pixelMm >= 1).map(P => [hairlike(P), P]).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).slice(0, CHAINS_MAX).map(([, P]) => P);
  const pieces = joinPieces(chains, { gap });
  for (const P of pieces) {
    if (plen(P) < minLen) continue;
    const l = labels[Math.min(h - 1, Math.floor(P[0][1])) * w + Math.min(w - 1, Math.floor(P[0][0]))] || labels[Math.min(h - 1, Math.floor(P[P.length >> 1][1])) * w + Math.min(w - 1, Math.floor(P[P.length >> 1][0]))];
    if (!l || comp[l].skel < 1) continue;
    // a ridge this wide at its middle is a light the planner can reserve, not a hair
    const widthMm = areas[l] / comp[l].skel * pixelMm;
    if (widthMm > TOUCH_MM) continue;
    for (const s of smoothStrokes(densify(P), { tol: tolPx, minLen, step: 1 })) {
      const lengthMm = plen(s.curve) * pixelMm;
      // how far the laid curve lies from the ridge's own skeleton, not from the points that described it
      let sum = 0, mx = 0;
      for (const [x, y] of s.curve) { const d = ridgeDist[Math.min(h - 1, Math.max(0, Math.floor(y))) * w + Math.min(w - 1, Math.max(0, Math.floor(x)))]; sum += d; if (d > mx) mx = d; }
      s.dev = sum / s.curve.length; s.max = mx;
      if (s.max * pixelMm > FIT_MM) continue;
      const perCm = s.turns / Math.max(0.1, lengthMm / 10);
      if (lengthMm < MIN_LENGTH_MM || lengthMm / Math.max(widthMm, 0.05) < ASPECT || perCm > MAX_TURNS_PER_CM) continue;
      const lightOd = densityAlong(s.curve, D), surroundOd = densityAlong(s.curve, closed);
      const sides = sideDensity(s.curve, D, w, h, Math.ceil(widthMm / 2 / pixelMm) + 2);
      if (sides < DARK_OD || sides - lightOd < STEP_OD) continue;
      strokes.push({ kind: 'strand', points: s.curve, widthMm: Math.min(RIGGER_MM.max, Math.max(RIGGER_MM.min, widthMm)), lengthMm, lightOd, surroundOd, rgb: colourOf(s.curve),
        fit: { maxMm: +(s.max * pixelMm).toFixed(3), meanMm: +(s.dev * pixelMm).toFixed(3), turnsPerCm: +perCm.toFixed(3) }, score: (surroundOd - lightOd) * lengthMm });
    }
  }
  // a hair stands among others: keep a short stroke only beside another one
  const mid = s => s.points[s.points.length >> 1];
  const near = s => strokes.reduce((k, o) => (o !== s && Math.hypot(mid(o)[0] - mid(s)[0], mid(o)[1] - mid(s)[1]) * pixelMm <= CLUSTER_MM ? k + 1 : k), 0);
  const clustered = strokes.filter(s => s.lengthMm >= 3 * MIN_LENGTH_MM || near(s) > 0);
  const byScore = (a, b) => b.score - a.score;
  const keptStrokes = clustered.sort(byScore).slice(0, strokesMax), keptGlints = glints.sort(byScore).slice(0, glintsMax);
  return { strokes: [...keptStrokes, ...keptGlints], stats: { found: strokes.length + glints.length, strands: keptStrokes.length, glints: keptGlints.length, closingRadiusPx: r } };
}
