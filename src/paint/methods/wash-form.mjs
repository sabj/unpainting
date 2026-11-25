// How a wash's lanes follow what the script (or the shape) asks of them, beyond running straight across it: bent along a
// path (curved, s-curve, zigzag, flick, wobble), bent along the shape's own middle line (a wash laid "with the form":
// lanes that run round a crescent of shadow, down a curving stripe), and given a named mark's character (its pressure
// rising and falling along each lane, its speed, a flat's blade). Nothing here reads a picture.
//
// A bend is one curve for the whole wash, o(u): how far the lanes stand off a straight line at u along them. The lanes
// are laid straight in a frame sheared by o (every outline moved across by -o(u)), then sheared back, so all the lanes
// nest: their spacing and lap are the straight lanes', and the region they fill is the region given, exactly.
import { makeMark, MARK_KINDS } from '../marks/index.mjs';

const clampTo = (v, m) => Math.max(-m, Math.min(m, v));

/**
 * A path word as one bend for a whole wash: o(f) over f 0..1 along the lanes, as a share of the wash's length.
 * Gentler than a single stroke's (script-marks.mjs handled): every lane of the wash takes it, and they must stay lapped.
 * `side` is -1 or 1 (the hand's choice), `phase` the wobble's start. Null for straight (the lanes keep their own bow).
 */
export function pathBend(path, side = 1, phase = 0) {
  const s = side < 0 ? -1 : 1;
  switch (path) {
    case 'curved': return f => 0.08 * s * 4 * f * (1 - f);
    case 's-curve': return f => 0.06 * s * Math.sin(2 * Math.PI * f);
    case 'zigzag': return f => 0.05 * s * (2 * Math.abs(((f * 3) % 1) - 0.5) - 0.5);
    case 'flick': return f => (f < 0.7 ? 0 : 0.25 * s * (f - 0.7) ** 2 / 0.3);
    case 'wobble': return f => 0.025 * s * Math.sin(5 * Math.PI * f + phase);
    default: return null;
  }
}

/** The steepest a shape's middle line may turn the lanes from their axis (a slope): steeper, the lanes would close up. */
const MIDLINE_SLOPE = 1.5;
/** A shape is laid along its long axis when it is this many times as long as it is wide; else level. */
const FORM_LONG = 1.25;
/** Columns across a shape that its middle line is read in. */
const COLUMNS = 48;

/** The extent of points along a unit direction (ux, uy). */
const extent = (pts, ux, uy) => { let lo = Infinity, hi = -Infinity; for (const [x, y] of pts) { const t = x * ux + y * uy; if (t < lo) lo = t; if (t > hi) hi = t; } return [lo, hi]; };

/** The direction (degrees) a shape is laid along: its long axis when it is clearly long, else level. */
export function formAxis(P) {
  let mx = 0, my = 0; for (const [x, y] of P) { mx += x; my += y; } mx /= P.length; my /= P.length;
  let a = 0, b = 0, c = 0; for (const [x, y] of P) { const dx = x - mx, dy = y - my; a += dx * dx; b += dx * dy; c += dy * dy; }
  const mean = (a + c) / 2, d = Math.sqrt(((a - c) / 2) ** 2 + b * b), long = Math.sqrt((mean + d) / Math.max(1e-9, mean - d));
  if (long < FORM_LONG) return 0;
  let deg = 0.5 * Math.atan2(2 * b, a - c) * 180 / Math.PI;
  // an upright shape is laid down its length from the top
  if (deg > 45) deg -= 180; else if (deg < -135) deg += 180;
  return +deg.toFixed(3);
}

/**
 * A shape's middle line along `deg`, as a bend o(u) (mm across the axis at u mm along it, u measured on the axis through
 * the origin): the middle of the shape's widest span in each column across it, smoothed over about a tenth of its length
 * (and at least `widthMm`), its slope held to MIDLINE_SLOPE. Beyond the shape it runs on level. Also the shape's height
 * across the axis at u (`across(u)`), for lanes that narrow where the shape does.
 */
export function midline(P, deg, widthMm = 1) {
  const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
  const [u0, u1] = extent(P, ux, uy), L = Math.max(1e-6, u1 - u0), n = COLUMNS, du = L / n, mids = [], hs = [];
  for (let k = 0; k < n; k++) {
    const u = u0 + (k + 0.5) * du, vs = [];
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const pu = P[j][0] * ux + P[j][1] * uy, qu = P[i][0] * ux + P[i][1] * uy;
      if ((pu <= u) !== (qu <= u)) { const pv = P[j][0] * vx + P[j][1] * vy, qv = P[i][0] * vx + P[i][1] * vy; vs.push(pv + (u - pu) / (qu - pu) * (qv - pv)); }
    }
    vs.sort((p, q) => p - q);
    let best = null; for (let q = 0; q + 1 < vs.length; q += 2) if (!best || vs[q + 1] - vs[q] > best[1] - best[0]) best = [vs[q], vs[q + 1]];
    mids.push(best ? (best[0] + best[1]) / 2 : null); hs.push(best ? best[1] - best[0] : 0);
  }
  // fill the columns without a span from their neighbours, then smooth
  const known = mids.map((m, k) => (m == null ? null : k)).filter(k => k != null);
  if (!known.length) return { o: () => 0, across: () => 0, u0, u1 };
  const filled = mids.map((m, k) => { if (m != null) return m; const lo = known.filter(q => q < k).at(-1), hi = known.find(q => q > k); return lo == null ? mids[hi] : hi == null ? mids[lo] : mids[lo] + (mids[hi] - mids[lo]) * (k - lo) / (hi - lo); });
  const sm = smooth(filled, Math.max(widthMm, 0.1 * L) / du);
  // the slope held (each step's change clamped, then the whole put back about the smoothed line's mean)
  const capped = [sm[0]]; for (let k = 1; k < n; k++) capped.push(capped[k - 1] + clampTo(sm[k] - sm[k - 1], MIDLINE_SLOPE * du));
  const shift = sm.reduce((s, v) => s + v, 0) / n - capped.reduce((s, v) => s + v, 0) / n, line = capped.map(v => v + shift);
  const at = (arr, u) => { const s = (u - u0) / du - 0.5; if (s <= 0) return arr[0]; if (s >= n - 1) return arr[n - 1]; const i = Math.floor(s), f = s - i; return arr[i] + (arr[i + 1] - arr[i]) * f; };
  return { o: u => at(line, u), across: u => at(hs, u), u0, u1 };
}

/** A line smoothed by a local straight fit under a Gaussian of `sig` samples: unlike an average it keeps the slope at
 *  its ends (an arch's ends stay steep instead of flattening toward its middle). */
function smooth(y, sig) {
  return y.map((_, k) => {
    let w = 0, wx = 0, wy = 0, wxx = 0, wxy = 0;
    for (let q = 0; q < y.length; q++) { const x = q - k, g = Math.exp(-0.5 * (x / sig) ** 2); w += g; wx += g * x; wy += g * y[q]; wxx += g * x * x; wxy += g * x * y[q]; }
    const det = w * wxx - wx * wx;
    return Math.abs(det) < 1e-12 ? wy / w : (wy * wxx - wx * wxy) / det;
  });
}

/** An outline with a point at least every `step` mm along it (a shear moves straight edges into curves). */
export function densify(P, step) {
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}

/**
 * The shear that straightens a bend o(u) along `deg`: `to` moves a point across the axis by -o(u) (into the frame where the
 * lanes are straight), `from` moves it back. u is unchanged, so the two are exact inverses.
 */
export function shear(deg, o) {
  const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const by = s => ([x, y, ...rest]) => { const d = s * o(x * ux + y * uy); return [x + nx * d, y + ny * d, ...rest]; };
  return { to: by(-1), from: by(1) };
}

/**
 * A named mark of the shared library (src/paint/marks) as the character of a wash's lanes: laid at a lane's length, the
 * mark's pressure (as a share of its own highest) and the hand's speed at each share t of the way along, and the blade a
 * flat is held at. Null for a name the library does not have. A mark of several strokes (a hatch, a branch) lends its
 * first stroke.
 */
export function laneCharacter(kind, { widthMm, seed = 0 }) {
  if (!MARK_KINDS[kind]) return null;
  if (typeof seed !== 'number') seed = [...String(seed)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  return lenMm => {
    const st = makeMark(kind, { x: 0, y: 0, length: Math.max(1, lenMm), width: widthMm, angle: 0, seed, place: 'start' })[0], P = st.points;
    const d = [0]; for (let k = 1; k < P.length; k++) d.push(d[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    const total = d.at(-1) || 1, top = Math.max(...P.map(q => q[2])) || 1;
    const look = (t, i) => { const s = Math.max(0, Math.min(1, t)) * total; let k = 1; while (k < P.length - 1 && d[k] < s) k++; const f = d[k] > d[k - 1] ? (s - d[k - 1]) / (d[k] - d[k - 1]) : 0; return P[k - 1][i] + (P[k][i] - P[k - 1][i]) * Math.max(0, Math.min(1, f)); };
    return { pressure: t => look(t, 2) / top, speed: t => look(t, 3), blade: { ...(st.flat ? { flat: true, angle: st.angle } : {}), ...(st.held ? { held: st.held } : {}), mark: kind } };
  };
}

/** A part's middle line bends its lanes when it stands this share of the part's strip width off straight (Auto, cellsBend). */
const BEND_LEAST = 0.2;
/** A part whose columns across are mostly one piece (at least this share) bends along the middle of each; any other (a
 *  ragged mass, a shape with holes or arms) along the middle of its paint in each column, more gently. */
const BEND_SIMPLE = 0.75;
/** The steepest a mass's lanes turn from its axis (a slope). */
const MASS_SLOPE = 0.5;
/** A lane's own waver about the flow, a share of the brush's radius. */
const OWN_WAVER = 0.06;

/**
 * The flow of a part of a wash the code planner lays (sweep-fill.mjs laneFill): `P` the part's cell centres (mm), its
 * lanes along (tx, ty) and spaced across (nx, ny). The middle of the part in each column across its length (the middle
 * of its span for a simple shape, of its paint for a ragged one), smoothed over about a tenth of its length (at least
 * `stripMm`, its typical width) with its slope held: c(u) is how far the lanes stand across at u along (0 everywhere when
 * the middle runs straight). own(lane, r) is a lane's own small seeded waver (a share of the brush's radius r), so no two
 * lanes are copies of each other. `bent` says whether c bends at all. Null for a part too short to read.
 */
export function cellsBend(P, tx, ty, nx, ny, pitch, stripMm) {
  let u0 = Infinity, u1 = -Infinity;
  for (const [x, y] of P) { const u = x * tx + y * ty; if (u < u0) u0 = u; if (u > u1) u1 = u; }
  const L = u1 - u0; if (!(L > 0) || !(stripMm > 0)) return null;
  const n = Math.max(8, Math.min(64, Math.round(L / Math.max(2 * pitch, stripMm / 4)))), bw = L / n;
  const lo = new Array(n).fill(Infinity), hi = new Array(n).fill(-Infinity), cnt = new Array(n).fill(0), sum = new Array(n).fill(0);
  for (const [x, y] of P) { const k = Math.min(n - 1, Math.floor((x * tx + y * ty - u0) / bw)), v = x * nx + y * ny; cnt[k]++; sum[k] += v; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  const used = cnt.map((c, k) => (c ? k : -1)).filter(k => k >= 0);
  if (used.length < 4) return null;
  const simple = used.filter(k => cnt[k] * pitch * pitch >= 0.8 * (hi[k] - lo[k] + pitch) * bw).length / used.length >= BEND_SIMPLE;
  const at = k => (simple ? (lo[k] + hi[k]) / 2 : sum[k] / cnt[k]);
  const mid = new Array(n);
  for (let k = 0; k < n; k++) { if (cnt[k]) { mid[k] = at(k); continue; } const a = used.filter(q => q < k).at(-1), b = used.find(q => q > k); mid[k] = a == null ? at(b) : b == null ? at(a) : (at(a) * (b - k) + at(b) * (k - a)) / (b - a); }
  const sm = smooth(mid, Math.max(stripMm, (simple ? 0.1 : 0.15) * L) / bw), most = simple ? MIDLINE_SLOPE : MASS_SLOPE;
  const capped = [sm[0]]; for (let k = 1; k < n; k++) capped.push(capped[k - 1] + clampTo(sm[k] - sm[k - 1], most * bw));
  const mean = capped.reduce((s, v) => s + v, 0) / n, line = capped.map(v => v - mean);
  const bent = Math.max(...line.map(Math.abs)) >= BEND_LEAST * stripMm;
  const c = !bent ? () => 0 : u => { const s = (u - u0) / bw - 0.5; if (s <= 0) return line[0]; if (s >= n - 1) return line[n - 1]; const i = Math.floor(s), f = s - i; return line[i] + (line[i + 1] - line[i]) * f; };
  // the seed: the part itself (its size and place), so the same part is laid the same at every run
  const seed = Math.round(P.length * 7 + u0 * 131 + L * 17) | 0;
  const own = (lane, r) => { const h = k => hashUnit(seed, lane, k), f = 1 + h(1), ph = 6.283 * h(2), amp = OWN_WAVER * r * (0.5 + h(3)); return u => amp * Math.sin(6.283 * f * (u - u0) / L + ph); };
  return { c, own, bent };
}

/** A hash of three integers, 0..1. */
function hashUnit(a, b, c) {
  let x = Math.imul((a | 0) * 73856093 ^ (b | 0) * 19349663 ^ (c | 0) * 83492791, 2654435761) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}
