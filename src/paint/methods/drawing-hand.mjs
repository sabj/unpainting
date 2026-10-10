// --drawinglogic 1: lays the lines drawing-rank.mjs chose as a hand would: joins continuing lines into gestures,
// orders them tier by tier from where the pen last lifted, and tapers pressure and width at both ends.
// DOM free, no file IO.
import { joinLines } from '../../crop/joinlines.mjs';
import { pathLength } from '../../crop/inktiers.mjs';

/** Join lines that continue one another. `gap` in cells. Loose gates: a segmenter breaks contours at every junction. */
export function connect(lines, { gap = 4, cos = 0.8, aim = 0.7 } = {}) {
  if (!lines.length) return { gestures: [], joined: 0 };
  const r = joinLines(lines, { gap, cos, aim, step: 1 });
  return { gestures: r.gestures.map(g => ({ ...g, length: pathLength(g.points) })), joined: r.joined };
}

/** Tier by tier (ascending, tier 0 last), nearest-neighbour within a tier from the last lift, reversing a gesture when
 *  its far end is the nearer. The pen starts at the top left. */
export function handOrder(gestures) {
  const tiers = [...new Set(gestures.map(g => g.tier ?? 0))].sort((a, b) => (a || 99) - (b || 99));
  const out = [];
  let pen = { x: 0, y: 0 };
  for (const t of tiers) {
    const left = gestures.filter(g => (g.tier ?? 0) === t);
    const used = new Uint8Array(left.length);
    for (let k = 0; k < left.length; k++) {
      let best = -1, bestD = Infinity, flip = false;
      for (let i = 0; i < left.length; i++) {
        if (used[i]) continue;
        const P = left[i].points, a = P[0], b = P[P.length - 1];
        const da = Math.hypot(a.x - pen.x, a.y - pen.y), db = Math.hypot(b.x - pen.x, b.y - pen.y);
        if (da < bestD) { bestD = da; best = i; flip = false; }
        if (db < bestD) { bestD = db; best = i; flip = true; }
      }
      used[best] = 1;
      const g = left[best], points = flip ? [...g.points].reverse() : g.points;
      out.push(flip ? { ...g, points } : g);
      pen = points[points.length - 1];
    }
  }
  return out;
}

/**
 * Pressure share and contact width along a gesture.
 *
 * @param base   the pressure share at darkness 1 (--drawwant for the first pen, --drawtonewant for the closing one)
 * @param inLen  cells over which the pen presses into the line, from `start` of the share
 * @param outLen cells over which it lifts off, down to `end`
 * @param gain,margin,minNib  the file's measured width to a contact width (drawing-file.mjs's calibration)
 * @param scale  a further factor on the share, per gesture (the toning's need)
 * @param floor  the darkness a line is drawn at when the file says 0, so faint file values still state the form
 */
export function shapeGesture(g, { base = 0.6, inLen = 3, outLen = 5, start = 0.45, end = 0.3, gain = 1.39, margin = 0.42, minNib = 0.3, scale = 1, floor = 0 } = {}) {
  const P = g.points, n = P.length, s = [0];
  for (let k = 1; k < n; k++) s.push(s[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y));
  const L = s[n - 1] || 1, tin = Math.min(inLen, 0.25 * L), tout = Math.min(outLen, 0.3 * L);
  const ease = u => u * u * (3 - 2 * u);
  const env = d => {
    const a = tin > 0 && d < tin ? start + (1 - start) * ease(d / tin) : 1;
    const b = tout > 0 && L - d < tout ? end + (1 - end) * ease((L - d) / tout) : 1;
    return Math.min(a, b);
  };
  const lineWeight = g.weight ?? 1;
  const points = P.map((q, k) => {
    const e = env(s[k]), dark = floor + (1 - floor) * Math.max(0, Math.min(1, q.weight ?? lineWeight));
    const out = { x: q.x, y: q.y, s: Math.min(1, base * dark * e * scale) };
    if (q.width != null) out.nw = Math.max(minNib, (q.width * gain - margin) * (0.5 + 0.5 * e));
    return out;
  });
  return { ...g, points };
}

/** A gesture cut into strokes of length `L`, each ending where the pen may be dipped. The cuts do not taper:
 *  the envelope is applied to the whole gesture first. */
export function personStrokes(g, L, { dipFirst = false, load = 1, low = null } = {}) {
  const out = []; let cur = [g.points[0]], d = 0;
  for (let k = 1; k < g.points.length; k++) {
    d += Math.hypot(g.points[k].x - g.points[k - 1].x, g.points[k].y - g.points[k - 1].y);
    cur.push(g.points[k]);
    if (d >= L && k < g.points.length - 1) { out.push(cur); cur = [g.points[k]]; d = 0; }
  }
  if (cur.length >= 2) out.push(cur);
  // dipFirst: the gesture starts on a fresh dip and runs on it; the pen is dipped again inside it only when low
  return out.map((points, i) => ({ points, length: pathLength(points), tier: 1, weight: g.weight ?? 1,
    ...(dipFirst && i === 0 ? { dip: load === 1 ? true : load } : {}), ...(dipFirst && low != null ? { low } : {}) }));
}
