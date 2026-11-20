// The marks a painting script asks for (docs/painting-script.md), each made as whole strokes of a brush: a path whose
// direction may turn, with a pressure at every point (the mark's width follows it). A passage's region is a guide to the
// hand: it places the strokes (where a lane starts and ends, where a touch is set down) and never cuts one; a stroke runs
// on past it as a brush does. The sheet's lights (paper the author keeps) are worked round: no lane runs through one and
// no touch is set down in one. Nothing here reads a picture. A seeded hand (`rng`) gives each stroke its own small
// irregularity of place, angle, length and pressure, so no two marks are the same and none sits on a grid.
//
// A stroke is {kind: 'sweep', radiusMm, points: [[x, y, pressure], ...]} in sheet millimetres, as the wash plan's
// strokes are (tools/plate/paint.mjs lays them unclipped with a round whose half-width is r (0.25 + 0.75 p)).

/** A hand's random numbers, from a string: mulberry32 seeded by an FNV hash. */
export function handOf(seed) {
  let h = 2166136261 >>> 0; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let a = h || 1;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), normal: () => { let s = 0; for (let i = 0; i < 4; i++) s += next(); return (s - 2) * 1.732; } };
}

const round3 = v => +v.toFixed(3);
const pt = (x, y, p) => [round3(x), round3(y), round3(Math.max(0.05, Math.min(1, p)))];

/** Even-odd point in polygon(s). */
export function inside(polys, x, y) {
  let c = false;
  for (const P of polys) for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** In the region and in none of the lights. */
const open = (polys, lights, x, y) => inside(polys, x, y) && !lights.some(L => inside([L], x, y));

/** Area of polygon(s), mm2 (the sum of absolute areas). */
export function areaOf(polys) {
  let a = 0; for (const P of polys) { let s = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) s += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1]); a += Math.abs(s) / 2; }
  return a;
}
const boxOf = polys => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const P of polys) for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; };

/** Every crossing (t, mm along `deg` from (x, y)) of the line through (x, y) with the polygons' edges, sorted. */
function crossings(polys, x, y, deg) {
  const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), ts = [];
  for (const P of polys) for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [x1, y1] = P[j], [x2, y2] = P[i], ex = x2 - x1, ey = y2 - y1, den = ux * ey - uy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((x1 - x) * ey - (y1 - y) * ex) / den, s = ((x1 - x) * uy - (y1 - y) * ux) / den;
    if (s >= 0 && s < 1) ts.push(t);
  }
  return ts.sort((p, q) => p - q);
}

/**
 * The stretch of the line through (x, y) along `deg` that lies in the region (and out of the lights), as [t0, t1] about
 * (x, y): a stroke placed there is held to that chord, as a hand keeps a streak inside the shape it is laying, but it is
 * not cut: it is shortened and moved, and its ends taper where they fall.
 */
export function chordAt(polys, x, y, deg, lights = []) {
  const ts = crossings([...polys, ...lights], x, y, deg);
  let lo = -Infinity, hi = Infinity;
  for (const t of ts) { if (t <= 0) lo = t; else { hi = t; break; } }
  return [Number.isFinite(lo) ? lo : 0, Number.isFinite(hi) ? hi : 0];
}

/** The runs of the line through (x, y) along `deg` that lie in the region and out of the lights, as [t0, t1] pairs. */
function runsOn(polys, lights, x, y, deg) {
  const ts = crossings([...polys, ...lights], x, y, deg), a = deg * Math.PI / 180, out = [];
  for (let k = 0; k + 1 < ts.length; k++) { const m = (ts[k] + ts[k + 1]) / 2; if (ts[k + 1] - ts[k] > 1e-6 && open(polys, lights, x + Math.cos(a) * m, y + Math.sin(a) * m)) { if (out.length && Math.abs(out.at(-1)[1] - ts[k]) < 1e-6) out.at(-1)[1] = ts[k + 1]; else out.push([ts[k], ts[k + 1]]); } }
  return out;
}

/** The region's centre and long axis (degrees), from its outline points. */
function axisOf(polys) {
  let mx = 0, my = 0, c = 0; for (const P of polys) for (const [x, y] of P) { mx += x; my += y; c++; } mx /= c; my /= c;
  let a = 0, b = 0, d = 0; for (const P of polys) for (const [x, y] of P) { a += (x - mx) ** 2; b += (x - mx) * (y - my); d += (y - my) ** 2; }
  return { mx, my, deg: 0.5 * Math.atan2(2 * b, a - d) * 180 / Math.PI };
}

/**
 * About `n` places over the region (out of the lights), set down as a hand sets touches: `spread` scattered (no two
 * closer than about half the even spacing, never on a grid), clustered (a few clumps of varied size), or along a line
 * (the region's long axis); `denser` weights them toward a side, the edges or the middle. Visited in a hand's order: the
 * nearest next, from the top left.
 */
export function placesIn(polys, n, rng, { lights = [], spread = 'scattered', denser = 'none' } = {}) {
  if (!(n >= 1)) return [];
  const b = boxOf(polys), A = Math.max(1e-6, areaOf(polys)), ax = axisOf(polys), W = b.x1 - b.x0 || 1, H = b.y1 - b.y0 || 1;
  const weight = (x, y) => {
    const u = (x - b.x0) / W, v = (y - b.y0) / H, e = Math.min(1, 2 * Math.hypot(u - 0.5, v - 0.5));
    const t = { top: 1 - v, bottom: v, left: 1 - u, right: u, edges: e, middle: 1 - e }[denser];
    return t == null ? 1 : 0.15 + 0.85 * t;
  };
  const draw = () => { for (let k = 0; k < 400; k++) { const x = rng.range(b.x0, b.x1), y = rng.range(b.y0, b.y1); if (open(polys, lights, x, y) && rng.next() < weight(x, y)) return [x, y]; } return null; };
  const got = [], minD = 0.45 * Math.sqrt(A / n);
  if (spread === 'clustered') {
    const m = Math.max(1, Math.round(n / rng.range(3, 7))), centres = Array.from({ length: m }, draw).filter(Boolean), sig = 0.35 * Math.sqrt(A / Math.max(1, centres.length));
    for (let k = 0; got.length < n && k < 50 * n && centres.length; k++) {
      const c = centres[Math.floor(rng.next() * centres.length)], x = c[0] + rng.normal() * sig, y = c[1] + rng.normal() * sig;
      if (open(polys, lights, x, y)) got.push([x, y]);
    }
  } else if (spread === 'along a line') {
    const a = ax.deg * Math.PI / 180, [t0, t1] = chordAt(polys, ax.mx, ax.my, ax.deg, lights), w = 0.18 * Math.sqrt(A / Math.max(1, t1 - t0));
    for (let k = 0; got.length < n && k < 50 * n; k++) {
      const t = rng.range(t0, t1), o = rng.normal() * w, x = ax.mx + Math.cos(a) * t - Math.sin(a) * o, y = ax.my + Math.sin(a) * t + Math.cos(a) * o;
      if (open(polys, lights, x, y)) got.push([x, y]);
    }
  } else {
    for (let k = 0; got.length < n && k < 60 * n; k++) { const q = draw(); if (!q) break; if (got.every(g => Math.hypot(g[0] - q[0], g[1] - q[1]) >= minD * (k > 30 * n ? 0.5 : 1))) got.push(q); }
  }
  if (!got.length) { const q = draw(); if (q) got.push(q); }
  // the hand's order: start at the top left, then always the nearest not yet touched
  const left = [...got], out = [];
  let cur = left.reduce((best, q) => (q[0] + q[1] < best[0] + best[1] ? q : best), left[0]);
  while (left.length) { const i = left.reduce((bi, q, j) => (Math.hypot(q[0] - cur[0], q[1] - cur[1]) < Math.hypot(left[bi][0] - cur[0], left[bi][1] - cur[1]) ? j : bi), 0); cur = left.splice(i, 1)[0]; out.push(cur); }
  return out;
}

/** The pressure at t (0..1) along a stroke from a list of pressures from its start to its end. */
export function pressureAt(list, t) {
  if (!list?.length) return 0.7;
  if (list.length === 1) return list[0];
  const s = Math.max(0, Math.min(1, t)) * (list.length - 1), i = Math.min(list.length - 2, Math.floor(s)), f = s - i;
  return list[i] + (list[i + 1] - list[i]) * (0.5 - 0.5 * Math.cos(Math.PI * f));
}

/** Pressure lists for the handling words a script may use instead of numbers. */
export const PRESSURES = Object.freeze({ light: [0.2, 0.45, 0.4, 0.15], medium: [0.25, 0.7, 0.6, 0.15], firm: [0.35, 0.95, 0.85, 0.2] });

/**
 * One stroke handled as the script says: from (x, y) (its middle, or its start with `from`), along `deg`, `len` long,
 * the brush `r` in radius; `pressure` a list from start to end; `path` the line it follows (straight, curved, s-curve,
 * zigzag, flick, wobble); `hold` side lays the belly (the width steadier, the pressure a floor); `speed` slow (more
 * points, a waver) or fast (fewer, a longer lift); `start` point lands on the tip (the first pressure held low).
 */
export function handled(x, y, { deg = 0, len, r, pressure = PRESSURES.medium, path = 'straight', hold = 'upright', speed = 'medium', start = 'point', from = false, rng }) {
  const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const bend = rng.range(0.6, 1.2) * (rng.next() < 0.5 ? -1 : 1), wav = speed === 'slow' ? 0.03 : speed === 'fast' ? 0.004 : 0.012;
  const shape = {
    straight: t => 0.02 * bend * 4 * t * (1 - t),
    curved: t => 0.14 * bend * 4 * t * (1 - t),
    's-curve': t => 0.1 * bend * Math.sin(2 * Math.PI * t),
    zigzag: t => 0.12 * bend * (2 * Math.abs(((t * 3) % 1) - 0.5) - 0.5),
    flick: t => (t < 0.7 ? 0.02 * bend * t : 0.02 * bend * 0.7 + 0.5 * bend * (t - 0.7) ** 2 / 0.3),
    wobble: t => 0.05 * bend * Math.sin(5 * Math.PI * t + rng.next()),
  }[path] ?? (t => 0);
  const m = Math.max(5, Math.min(40, Math.round(len / Math.max(0.5, r * (speed === 'slow' ? 0.4 : speed === 'fast' ? 0.9 : 0.6))))), ph = rng.range(0, 6.28), out = [];
  const pres = start === 'belly' ? pressure.map((v, i) => (i === 0 ? Math.max(v, 0.6) : v)) : pressure;
  for (let j = 0; j <= m; j++) {
    const t = j / m, s = (from ? t : t - 0.5) * len, off = (shape(t) + wav * Math.sin(ph + 9 * t)) * len;
    let p = pressureAt(pres, t) * rng.range(0.94, 1.06); if (hold === 'side') p = 0.5 + 0.5 * p;
    out.push(pt(x + ux * s + nx * off, y + uy * s + ny * off, p));
  }
  return { kind: 'sweep', radiusMm: round3(r), points: out };
}

/** A stroke of length `len` about (x, y) along `deg`, moved and shortened to keep to the region's chord there. */
function fitted(polys, x, y, deg, len, lights = [], over = 0.1) {
  const [t0, t1] = chordAt(polys, x, y, deg, lights), room = (t1 - t0) * (1 + 2 * over);
  const L = Math.max(Math.min(len, room), Math.min(len, 1)), lo = t0 - over * (t1 - t0), hi = t1 + over * (t1 - t0);
  let c = 0; if (c - L / 2 < lo) c = lo + L / 2; if (c + L / 2 > hi) c = hi - L / 2;
  const a = deg * Math.PI / 180;
  return { x: x + Math.cos(a) * c, y: y + Math.sin(a) * c, len: L };
}

/**
 * Separate strokes or touches over a region: about `n`, set down by `placesIn` (spread, denser), each `handled` along
 * `deg` (a hand's spread of a few degrees, more for touches), `lengthMm` long (varied a little, or a lot with size
 * 'varied'), kept to the region's chord.
 */
export function scattered(polys, { n, widthMm, deg = 0, lengthMm, pressure, path, hold, speed, start, size = 'even', spread, denser, touches = false, lights = [], rng }) {
  const r = widthMm / 2;
  return placesIn(polys, n, rng, { lights, spread: spread ?? (touches ? 'clustered' : 'scattered'), denser }).map(([x, y]) => {
    const k = size === 'varied' ? Math.exp(rng.normal() * 0.35) : rng.range(0.85, 1.15), d = deg + (touches ? 30 : 8) * rng.normal() * 0.5;
    const f = fitted(polys, x, y, d, lengthMm * k, lights, touches ? 0.3 : 0.1);
    return handled(f.x, f.y, { deg: d, len: f.len, r: r * (size === 'varied' ? Math.min(1.3, Math.max(0.7, k)) : 1), pressure, path, hold, speed, start, rng });
  });
}

/** Lines with the point: each path followed by one stroke, its pressure along it from `pressure`, a small waver. */
export function lines(paths, { widthMm, pressure = PRESSURES.medium, hold = 'upright', rng }) {
  const r = widthMm / 2;
  return paths.filter(P => P.length >= 2).map(P => {
    const pts = []; let total = 0;
    for (let k = 0; k + 1 < P.length; k++) total += Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]);
    let run = 0;
    for (let k = 0; k + 1 < P.length; k++) {
      const [ax, ay] = P[k], [bx, by] = P[k + 1], seg = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.ceil(seg / 1.2));
      for (let j = 0; j < m; j++) { pts.push([ax + (bx - ax) * j / m, ay + (by - ay) * j / m, (run + seg * j / m) / (total || 1)]); }
      run += seg;
    }
    pts.push([...P.at(-1), 1]);
    return { kind: 'sweep', radiusMm: round3(r), points: pts.map(([x, y, t]) => { let p = pressureAt(pressure, t) * rng.range(0.93, 1.07); if (hold === 'side') p = 0.5 + 0.5 * p; return pt(x + rng.range(-0.08, 0.08), y + rng.range(-0.08, 0.08), p); }) };
  });
}

/** A stroke given point by point in the script ([x, y, pressure] each), laid as written with a hand's small waver. */
export function written(points, { widthMm, rng }) {
  return { kind: 'sweep', radiusMm: round3(widthMm / 2), points: points.map(([x, y, p]) => pt(x + rng.range(-0.06, 0.06), y + rng.range(-0.06, 0.06), (p ?? 0.7) * rng.range(0.96, 1.04))) };
}

/**
 * A wash: overlapping strokes across the region along `deg`, a brush of `widthMm`; the lanes irregularly spaced (half to
 * four-fifths of the brush apart), each tilted a little its own way, wavering, running from the region's edge (or a
 * light's) to its edge and a little past or short of it; up to three lanes laid back and forth as one stroke before the
 * brush is lifted and recharged; from the top down. Each stroke carries a charge factor: full after a recharge, thinning
 * along the load.
 */
export function sweeps(polys, { widthMm, deg = 0, pressure = 0.8, perLoad = 3, lights = [], rng }) {
  const r = widthMm / 2, a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
  const V = ([x, y]) => x * vx + y * vy, U = ([x, y]) => x * ux + y * uy;
  let v0 = Infinity, v1 = -Infinity, u0 = Infinity, u1 = -Infinity; for (const P of polys) for (const q of P) { v0 = Math.min(v0, V(q)); v1 = Math.max(v1, V(q)); u0 = Math.min(u0, U(q)); u1 = Math.max(u1, U(q)); }
  const runs = []; let v = v0 + rng.range(0.3, 0.5) * widthMm, i = 0;
  while (v < v1) {
    const tilt = rng.normal() * 2.5, um = (u0 + u1) / 2, cx = um * ux + v * vx, cy = um * uy + v * vy;
    for (const [t0, t1] of runsOn(polys, lights, cx, cy, deg + tilt)) if (t1 - t0 >= Math.min(2, 0.6 * widthMm)) runs.push({ i, cx, cy, d: deg + tilt, t0: t0 - r * rng.range(-0.25, 0.6), t1: t1 + r * rng.range(-0.25, 0.6) });
    // the last lane is carried down to the region's far edge (the bead is taken to the bottom)
    const was = v; v += widthMm * rng.range(0.45, 0.7); i++;
    if (v >= v1 && was < v1 - 0.45 * widthMm) v = v1 - 0.35 * widthMm;
  }
  const centre = q => { const t = (q.t0 + q.t1) / 2, d = q.d * Math.PI / 180; return [q.cx + Math.cos(d) * t, q.cy + Math.sin(d) * t]; };
  runs.sort((p, q) => p.i - q.i || p.t0 - q.t0);
  if (runs.length > 1 && centre(runs[0])[1] > centre(runs.at(-1))[1]) runs.reverse();
  const strokes = []; let cur = null, inLoad = 0, back = false, last = null;
  const lane = (q, rev) => {
    const len = q.t1 - q.t0, m = Math.max(3, Math.ceil(len / Math.max(1.5, r * 0.8))), d = q.d * Math.PI / 180, wob = rng.range(-0.08, 0.08) * widthMm, pts = [];
    for (let j = 0; j <= m; j++) { const t = j / m, s = q.t0 + len * (rev ? 1 - t : t), o = wob * Math.sin(Math.PI * t); pts.push([q.cx + Math.cos(d) * s - Math.sin(d) * o, q.cy + Math.sin(d) * s + Math.cos(d) * o]); }
    return pts;
  };
  for (const q of runs) {
    const joins = cur && inLoad < perLoad && last && Math.abs(q.i - last.i) === 1 && Math.min(q.t1, last.t1) - Math.max(q.t0, last.t0) > 0.5 * Math.min(q.t1 - q.t0, last.t1 - last.t0);
    if (!joins) { if (cur) strokes.push(cur); cur = { pts: [] }; inLoad = 0; back = rng.next() < 0.5; }
    cur.pts.push(...lane(q, back)); back = !back; inLoad++; last = q;
  }
  if (cur) strokes.push(cur);
  return strokes.map((s, k) => {
    const L = s.pts.length, out = s.pts.map(([x, y], j) => { const t = L > 1 ? j / (L - 1) : 0.5, land = Math.min(1, t * L / 2.5), lift = Math.min(1, (1 - t) * L / 2); return pt(x, y, pressure * (0.55 + 0.45 * Math.min(land, lift)) * rng.range(0.93, 1.07)); });
    return { kind: 'sweep', radiusMm: round3(r), points: out, charge: round3(1.12 - 0.12 * (k % 3)) };
  });
}

/** One dab of a charge, dropped at (x, y). */
export function chargeDab(x, y, { widthMm, rng, pressure = 0.85 }) {
  const r = widthMm / 2;
  return handled(x + rng.range(-0.3, 0.3), y + rng.range(-0.3, 0.3), { deg: rng.range(0, 180), len: r * rng.range(1.2, 2), r, pressure: [0.4 * pressure, pressure, 0.3 * pressure], rng });
}
