// Pipeline: inking, stage 3d (the pen-physics dial: bounded human variation on the drawing's vector strokes). DOM free, no file IO.
// The vector strokes of a prepared drawing (tools/seg/ink-vectors.py) are exact at 0. Above 0 each LINE the fitter drew as a
// path (`drawn: 'path'`: a path with a width at every point) is redrawn as a nib would lay it: the width breathes a little
// with pressure and thins with speed, the path wobbles by a fraction of a millimetre, a long fast stroke starves towards its
// end, and the pen runs a touch past the end. Bounded: no point of a path moves more than MAX_SHIFT_MM, no stroke is added
// or dropped, the order is kept. Ink a line carries beside its path (`rest`) stays as it is. Fills and outlined shapes are not touched. Seeded: the same dial and seed give the same lines.

/** No point of a path moves farther than this at any dial setting (mm). */
export const MAX_SHIFT_MM = 0.3;
const WOBBLE_MM = 0.15, OVERSHOOT_MM = 0.25, WIDTH_BREATH = 0.12, SPEED_THIN = 0.12, STARVE_THIN = 0.35, STARVE_PALE = 0.15;
const STARVE_FROM_MM = 25, STARVE_FULL_MM = 85, FAST_MM = 20;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** A smooth wave in -1..1 along a length (mm): two sines of the given wavelengths at random phases. */
function wave(rand, longMm, shortMm) { const p1 = rand() * 6.2832, p2 = rand() * 6.2832; return s => 0.65 * Math.sin(6.2832 * s / longMm + p1) + 0.35 * Math.sin(6.2832 * s / shortMm + p2); }

/** The closed outline of a line along P (mm) with widths W (mm): both sides offset along the normal, round ends. */
export function lineOutline(P, W, cap = 5) {
  const n = P.length, T = P.map((p, k) => { const a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; });
  const L = [], R = [];
  for (let k = 0; k < n; k++) { const h = W[k] / 2, nx = -T[k][1], ny = T[k][0]; L.push([P[k][0] + nx * h, P[k][1] + ny * h]); R.push([P[k][0] - nx * h, P[k][1] - ny * h]); }
  const end = (p, t, h) => { const a0 = Math.atan2(t[1], t[0]), out = []; for (let i = 1; i < cap; i++) { const a = a0 + Math.PI / 2 - Math.PI * i / cap; out.push([p[0] + h * Math.cos(a), p[1] + h * Math.sin(a)]); } return out; };
  const round = v => Math.round(v * 1000) / 1000;
  return [...L, ...end(P[n - 1], T[n - 1], W[n - 1] / 2), ...R.reverse(), ...end(P[0], [-T[0][0], -T[0][1]], W[0] / 2)].map(p => [round(p[0]), round(p[1])]);
}

/** One path-drawn stroke as the nib lays it at `amount` (0..1). Returns a new stroke; `amount` 0 returns the stroke itself. */
export function nibStroke(stroke, amount, seed = 1) {
  if (!(amount > 0) || stroke.drawn !== 'path' || !stroke.widths || stroke.widths.length !== stroke.path.length || stroke.path.length < 3) return stroke;
  const rand = rng((seed * 2654435761 + Math.round(stroke.seq * 100) * 40503 + 1) >>> 0), P = stroke.path, n = P.length;
  const s = [0]; for (let k = 1; k < n; k++) s.push(s[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
  const len = s[n - 1]; if (!(len > 0)) return stroke;
  const press = wave(rand, Math.max(6, len * 0.9), 7 + 5 * rand()), sway = wave(rand, 9 + 8 * rand(), Math.max(12, len * 0.7));
  const fast = Math.min(1, len / FAST_MM), starve = Math.max(0, Math.min(1, (len - STARVE_FROM_MM) / (STARVE_FULL_MM - STARVE_FROM_MM)));
  const path = [], widths = [];
  for (let k = 0; k < n; k++) {
    const u = s[k] / len, a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / tl, ny = (b[0] - a[0]) / tl;
    const speed = Math.sqrt(Math.max(0, Math.sin(Math.PI * u))) * fast;   // slow at both ends, quickest in the middle of a long stroke
    const d = amount * WOBBLE_MM * Math.max(-1, Math.min(1, sway(s[k])));
    const dry = u > 0.6 ? (u - 0.6) / 0.4 : 0;
    const f = Math.max(0.6, Math.min(1.2, 1 + amount * (WIDTH_BREATH * press(s[k]) - SPEED_THIN * speed - STARVE_THIN * starve * dry)));
    path.push([P[k][0] + nx * d, P[k][1] + ny * d]); widths.push(stroke.widths[k] * f);
  }
  // the pen runs a little past the end of a line of some length, thinning out
  if (len > 3) {
    const e = amount * OVERSHOOT_MM * rand(), a = path[n - 2], b = path[n - 1], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (e > 0.02) { path.push([b[0] + (b[0] - a[0]) / tl * e, b[1] + (b[1] - a[1]) / tl * e]); widths.push(widths[n - 1] * 0.5); }
  }
  const round = v => Math.round(v * 1000) / 1000;
  return { ...stroke, dark: round(stroke.dark * (1 - amount * STARVE_PALE * starve)), path: path.map(p => [round(p[0]), round(p[1])]), widths: widths.map(round), outline: [lineOutline(path, widths), ...(stroke.rest ?? [])] };
}

/** The vectors document at the pen-physics dial `amount` (0 exact .. 1). Same strokes, same order. 0 returns the document itself. */
export function penPhysics(doc, amount, seed = 1) {
  if (!(amount >= 0 && amount <= 1)) throw new Error(`pen physics: the dial is 0 to 1, got ${amount}`);
  if (amount === 0) return doc;
  return { ...doc, penPhysics: { amount, seed }, strokes: doc.strokes.map(st => nibStroke(st, amount, seed)) };
}
