// The marks a painting script asks for (docs/painting-script.md), each made as whole strokes of a brush: a path whose
// direction may turn, with a pressure at every point (the mark's width follows it). A passage's region is a guide to the
// hand: it places the strokes (where a lane starts and ends, where a touch is set down) and never cuts one; a stroke runs
// on past it as a brush does. The sheet's lights (paper the author keeps) are worked round: no lane runs through one and
// no touch is set down in one. Nothing here reads a picture. A seeded hand (`rng`) gives each stroke its own small
// irregularity of place, angle, length and pressure, so no two marks are the same and none sits on a grid.
//
// A stroke is {kind: 'sweep', radiusMm, points: [[x, y, pressure], ...]} in sheet millimetres, as the wash plan's
// strokes are (tools/plate/paint.mjs lays them unclipped with a round whose half-width is r (0.25 + 0.75 p)).
import { pathBend, formAxis, midline, densify, shear } from './wash-form.mjs';

import { PRESSURE_WORDS } from './script-short.mjs';

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
  const ts = crossings([...polys, ...lights], x, y, deg), lt = new Set(crossings(lights, x, y, deg).map(t => t.toFixed(6))), a = deg * Math.PI / 180, out = [];
  // each run says whether its ends are a light's edge (worked up to, short of it, not over it) or the region's (run past)
  for (let k = 0; k + 1 < ts.length; k++) { const m = (ts[k] + ts[k + 1]) / 2; if (ts[k + 1] - ts[k] > 1e-6 && open(polys, lights, x + Math.cos(a) * m, y + Math.sin(a) * m)) { if (out.length && Math.abs(out.at(-1)[1] - ts[k]) < 1e-6) { out.at(-1)[1] = ts[k + 1]; out.at(-1).lightEnd = lt.has(ts[k + 1].toFixed(6)); } else { const run = [ts[k], ts[k + 1]]; run.lightStart = lt.has(ts[k].toFixed(6)); run.lightEnd = lt.has(ts[k + 1].toFixed(6)); out.push(run); } } }
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
  if (spread === 'clustered' || spread === 'mass') {
    // a mass: a few tight clumps whose touches overlap and fuse; clustered: looser clumps with paper between
    const m = Math.max(1, Math.round(n / (spread === 'mass' ? rng.range(8, 14) : rng.range(3, 7)))), centres = Array.from({ length: m }, draw).filter(Boolean), sig = (spread === 'mass' ? 0.22 : 0.35) * Math.sqrt(A / Math.max(1, centres.length));
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
export const PRESSURES = PRESSURE_WORDS;

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

/** The slowest and fastest hand speed (mm/s) a written point may give; the mark library's own run 6 to about 180. */
const SPEED_LEAST = 2, SPEED_MOST = 400;

/** A stroke given point by point in the script ([x, y, pressure] each, or [x, y, pressure, speed] with the hand's speed
 *  there in mm/s), laid as written with a hand's small waver. A point without a speed leaves it to the brush. */
export function written(points, { widthMm, rng }) {
  return { kind: 'sweep', radiusMm: round3(widthMm / 2), points: points.map(([x, y, p, v]) => {
    const q = pt(x + rng.range(-0.06, 0.06), y + rng.range(-0.06, 0.06), (p ?? 0.7) * rng.range(0.96, 1.04));
    return Number.isFinite(v) && v > 0 ? [...q, round3(Math.max(SPEED_LEAST, Math.min(SPEED_MOST, v)))] : q;
  }) };
}

/**
 * The hand in a wash's lanes, at amount 1 (`hand` scales the turning, bowing, swelling and the unevenness of the lap; 0 is
 * a ruler: straight parallel lanes at one lap).
 * lap: each lane overlaps the one before by this share of the width the brush really lays at the lane's pressure (a
 *   round lays r (0.25 + 0.75 p) to each side), so lanes run into one wash and are never bars with paper between them.
 * tilt: each lane's own turn (degrees, sd). fan: the lanes turn steadily from the first to the last, as a wrist pivots
 *   (degrees, sd of the whole turn). bow: the arm's arc, one for the whole wash: a lane's bulge as a share of its length,
 *   never more than `bowMost` brush widths; ownBow: each lane's own bulge, in brush widths.
 * swell: the pressure rises and falls along a stroke by this share. perLoad: lanes laid back and forth before the brush
 *   is lifted and recharged, from this many to this many.
 * short: a region whose lanes along the passage's direction would be shorter than this many brush widths, and which is
 *   clearly longer another way, is laid along its own length instead (a band of shadow under a rail is one or two strokes
 *   along the band, not a row of dashes across it).
 */
export const LANE_HAND = Object.freeze({ lap: [0.3, 0.55], tilt: 2.5, fan: 7, bow: 0.05, bowMost: 0.7, ownBow: 0.1, swell: 0.1, perLoad: [2, 4], short: 2.5, longer: 1.4 });

/** The extent of one outline along a direction (degrees). */
const extentAlong = (P, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); let lo = Infinity, hi = -Infinity; for (const [x, y] of P) { const t = x * c + y * s; lo = Math.min(lo, t); hi = Math.max(hi, t); } return hi - lo; };

/**
 * A wash: overlapping strokes across the region along `deg`, a brush of `widthMm`, as a hand lays them (LANE_HAND): the
 * lanes unevenly lapped, each turned a little its own way and all turning steadily across the wash, bowed along the arm's
 * arc, the pressure swelling along them, running from the region's edge (or a light's) to its edge and a little past or
 * short of it; two to four lanes laid back and forth as one stroke before the brush is lifted and recharged; from the
 * top down. Each stroke carries a charge factor: full after a recharge, thinning along the load. A part of the region
 * too short for lanes along `deg` is laid along its own length. `hand` (default 1) is the amount of all of it; the same
 * `rng` gives the same wash, another seed another hand.
 * `deg: 'form'` lays each outline along its own flow instead (wash-form.mjs): its long axis bent along its middle line,
 * the lanes narrowing where the shape does. `path` (curved, s-curve, zigzag, flick, wobble) bends every lane of the wash
 * the same way, so they nest. `pressure` may be a list from a lane's start to its end (each lane's width follows it).
 * `character` (wash-form.mjs laneCharacter) lays each lane as a named mark: its own stroke, the mark's pressure and
 * speed along it, a flat's blade.
 */
export function sweeps(polys, opts) {
  return everyPartLaid(polys, sweepsOf(polys, opts), opts);
}

/**
 * Every part of a wash's region with open paper gets a lane: a part no lane of the wash reached (a small part, the
 * hand's turn carrying its only lane off it, or its lane cut away by a light) is given one stroke along its own long
 * axis through its open middle, held to its chord. A part wholly under the lights stays paper.
 */
function everyPartLaid(polys, strokes, { widthMm, pressure = 0.8, lights = [] }) {
  const reach = widthMm / 2, extra = [];
  for (const P of polys) {
    if (!P || P.length < 3 || !(areaOf([P]) > 0)) continue;
    const near = st => st.points.some(([x, y]) => inside([P], x, y) || P.some(([px, py]) => Math.hypot(px - x, py - y) < reach));
    if (strokes.some(near)) continue;
    const { mx, my, deg } = axisOf([P]);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < P.length; k++) { const [px, py] = P[k]; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
    // the open point nearest the part's middle: its centroid, else a grid point inside it and out of the lights
    let at = open([P], lights, mx, my) ? [mx, my] : null;
    for (let n = 6; !at && n <= 24; n *= 2) for (let i = 1; i < n && !at; i++) for (let j = 1; j < n && !at; j++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * j / n; if (open([P], lights, x, y)) at = [x, y]; }
    if (!at) continue;
    const [t0, t1] = chordAt([P], at[0], at[1], deg, lights), a = deg * Math.PI / 180, inset = Math.min(0.25 * (t1 - t0), widthMm * 0.15), list = Array.isArray(pressure) ? pressure.map(Number) : [pressure];
    const pts = [0, 0.25, 0.5, 0.75, 1].map(f => { const t = t0 + inset + (t1 - t0 - 2 * inset) * f; return pt(at[0] + Math.cos(a) * t, at[1] + Math.sin(a) * t, pressureAt(list, f)); });
    extra.push({ kind: 'sweep', radiusMm: round3(widthMm / 2), points: pts, charge: 1 });
  }
  return extra.length ? [...strokes, ...extra] : strokes;
}

function sweepsOf(polys, { widthMm, deg = 0, pressure = 0.8, perLoad = null, lights = [], rng, hand = 1, path = null, character = null }) {
  const fn = pathBend(path), side = fn ? (rng.next() < 0.5 ? -1 : 1) : 1, phase = fn && path === 'wobble' ? rng.range(0, 6.28) : 0, bendFn = fn ? pathBend(path, side, phase) : null;
  const opts = { widthMm, pressure, perLoad, lights, rng, hand, character };
  if (deg === 'form') return formSweeps(polys, opts, bendFn);
  const H = LANE_HAND, own = [], rest = [];
  for (const P of polys) {
    // a lane's usual length in this part: its area over its extent across the lanes
    const area = areaOf([P]), ax = axisOf([P]).deg, along = area / Math.max(1e-6, extentAlong(P, deg + 90)), length = area / Math.max(1e-6, extentAlong(P, ax + 90));
    (along < H.short * widthMm && length >= H.longer * along ? own : rest).push({ P, deg: ax });
  }
  const lay = (ps, d) => bent(ps, d, bendFn ? pathOver(ps, d, bendFn) : null, opts);
  if (!own.length) return lay(polys, deg);
  // the main region first, then each short part along its own length, top down
  const top = P => { let m = Infinity; for (let i = 0; i < P.length; i++) if (P[i][1] < m) m = P[i][1]; return m; };
  return [...(rest.length ? lay(rest.map(q => q.P), deg) : []),
    ...own.sort((p, q) => top(p.P) - top(q.P)).flatMap(q => lay([q.P], q.deg))];
}

/** A path's bend (a share of the wash's length at each share of the way along it) as mm across at u mm along `deg`. */
function pathOver(polys, deg, fn) {
  const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
  let u0 = Infinity, u1 = -Infinity; for (const P of polys) for (const [x, y] of P) { const u = x * ux + y * uy; u0 = Math.min(u0, u); u1 = Math.max(u1, u); }
  const L = Math.max(1e-6, u1 - u0);
  return u => L * fn(Math.max(0, Math.min(1, (u - u0) / L)));
}

/** Lanes along `deg` bent by o(u) (null: straight): laid straight in the sheared frame, then sheared back (wash-form.mjs). */
function bent(polys, deg, o, opts, cap = null) {
  if (!o) return lanes(polys, { ...opts, deg, cap });
  const sh = shear(deg, o), step = Math.max(0.5, opts.widthMm / 3);
  const W = polys.map(P => densify(P, step).map(sh.to)), L = opts.lights.map(P => densify(P, step).map(sh.to));
  return lanes(W, { ...opts, deg, lights: L, cap: cap ? cap(W) : null, joinMost: JOIN_MOST }).map(s => ({ ...s, points: s.points.map(q => { const [x, y, ...rest] = sh.from(q); return [round3(x), round3(y), ...rest]; }) }));
}

/** The longest turn from one lane's end to the next lane's start, in widths the brush lays: a longer one is a new stroke. */
const JOIN_MOST = 3;
/** The least a lane narrows to where its shape narrows (a pressure). */
const FORM_TIP = 0.3;

/** A wash laid with the form: each outline along its long axis bent along its middle line, top down. */
function formSweeps(polys, opts, bendFn) {
  const top = P => { let m = Infinity; for (let i = 0; i < P.length; i++) if (P[i][1] < m) m = P[i][1]; return m; }, W = opts.widthMm;
  return [...polys].filter(P => P.length >= 3).sort((p, q) => top(p) - top(q)).flatMap(P => {
    const d = formAxis(P), ml = midline(P, d, W), mid = ml.o((ml.u0 + ml.u1) / 2), L = ml.u1 - ml.u0;
    const o = u => ml.o(u) - mid + (bendFn ? L * bendFn(Math.max(0, Math.min(1, (u - ml.u0) / L))) : 0);
    // where the shape is narrower than the brush lays, the lane is pressed only as wide as the shape there (its height
    // across the sheared lanes, times the cosine of the bend's slope: the shape's own thickness)
    const a = d * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
    const cap = ([Q]) => (x, y) => { const u = x * ux + y * uy, slope = (o(u + 0.5) - o(u - 0.5)), [t0, t1] = chordAt([Q], x, y, d + 90), h = (t1 - t0) / Math.hypot(1, slope); return Math.max(FORM_TIP, Math.min(1, ((h + 0.2 * W) / W - 0.25) / 0.75)); };
    return bent([P], d, o, opts, cap);
  });
}

function lanes(polys, { widthMm, deg, pressure, perLoad, lights, rng, hand, character = null, cap = null, joinMost = Infinity }) {
  const H = LANE_HAND, r = widthMm / 2, a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
  const V = ([x, y]) => x * vx + y * vy, U = ([x, y]) => x * ux + y * uy;
  let v0 = Infinity, v1 = -Infinity, u0 = Infinity, u1 = -Infinity; for (const P of polys) for (const q of P) { v0 = Math.min(v0, V(q)); v1 = Math.max(v1, V(q)); u0 = Math.min(u0, U(q)); u1 = Math.max(u1, U(q)); }
  // a list of pressures: the lanes are spaced at its mean (at least 0.6), and pressed no lighter than keeps them lapped
  const list = Array.isArray(pressure) ? pressure.map(Number) : null, level = list ? Math.max(0.6, list.reduce((s, v) => s + v, 0) / list.length) : pressure;
  // the width the brush lays at the lane's pressure, and the lap's range about its middle
  const laid = widthMm * (0.25 + 0.75 * Math.min(1, level)), lapMid = (H.lap[0] + H.lap[1]) / 2, lapHalf = hand * (H.lap[1] - H.lap[0]) / 2;
  const least = Math.max(0.05, (0.75 * laid / widthMm - 0.25) / 0.75);
  const fan = rng.normal() * H.fan * hand, arc = rng.range(-1, 1) * H.bow * hand;
  const runs = [], steps = []; let v = v0 + rng.range(0.3, 0.5) * laid, i = 0;
  while (v < v1) {
    const tilt = fan * ((v - v0) / Math.max(1e-6, v1 - v0) - 0.5) + rng.normal() * H.tilt * hand, um = (u0 + u1) / 2, cx = um * ux + v * vx, cy = um * uy + v * vy;
    // a lane runs a little past the region's edge, but stops short of a light by a hand's varying margin (a light is worked
    // round, its edge ragged, never cut cell-exact)
    for (const run of runsOn(polys, lights, cx, cy, deg + tilt)) { const [t0, t1] = run; if (t1 - t0 >= Math.min(2, 0.6 * widthMm)) runs.push({ i, cx, cy, d: deg + tilt, t0: run.lightStart ? t0 + r * rng.range(0.3, 0.9) : t0 - r * rng.range(-0.25, 0.6), t1: run.lightEnd ? t1 - r * rng.range(0.3, 0.9) : t1 + r * rng.range(-0.25, 0.6) }); }
    // the last lane is carried down to the region's far edge (the bead is taken to the bottom)
    const was = v; v += laid * (1 - rng.range(lapMid - lapHalf, lapMid + lapHalf)); i++;
    if (v >= v1 && was < v1 - 0.45 * laid) v = v1 - 0.35 * laid;
    if (v < v1) steps.push(v - was);
  }
  const centre = q => { const t = (q.t0 + q.t1) / 2, d = q.d * Math.PI / 180; return [q.cx + Math.cos(d) * t, q.cy + Math.sin(d) * t]; };
  runs.sort((p, q) => p.i - q.i || p.t0 - q.t0);
  // level lanes from the top down; upright lanes from the left to the right (their middles are at one height, and which
  // was "higher" came down to the lanes' small tilts: the same wash began at the left with one seed and the right with another)
  const first = centre(runs[0] ?? { cx: 0, cy: 0, d: 0, t0: 0, t1: 0 }), final = centre(runs.at(-1) ?? { cx: 0, cy: 0, d: 0, t0: 0, t1: 0 }), level2 = Math.abs(vy) >= Math.abs(vx);
  if (runs.length > 1 && (level2 ? first[1] > final[1] : first[0] > final[0])) runs.reverse();
  const strokes = []; let cur = null, inLoad = 0, back = false, last = null, most = 3;
  // each point carries the share of the way along its own lane, in the way it is drawn (a pressure list and a mark run along it)
  const lane = (q, rev) => {
    // the arm's arc (the same way for every lane of the wash, whichever way the lane is drawn) and the lane's own bulge
    const len = q.t1 - q.t0, m = Math.max(3, Math.ceil(len / Math.max(1.5, r * 0.8))), d = q.d * Math.PI / 180, pts = [];
    const bulge = Math.max(-H.bowMost, Math.min(H.bowMost, arc * len / widthMm)) * widthMm + rng.range(-1, 1) * H.ownBow * hand * widthMm;
    for (let j = 0; j <= m; j++) { const t = j / m, f = rev ? 1 - t : t, s = q.t0 + len * f, o = bulge * Math.sin(Math.PI * f); pts.push([q.cx + Math.cos(d) * s - Math.sin(d) * o, q.cy + Math.sin(d) * s + Math.cos(d) * o, t, len]); }
    return pts;
  };
  for (const q of runs) {
    // a mark is one stroke a lane: it lands and lifts as the mark does
    // (bent lanes: never across paper, the turn to the next lane is short, a few lane widths at most, so a lane cut in two
    // by a hole or a bend is not joined to the far side of it; straight lanes are joined as they always were)
    const near = () => { const e = cur.pts.at(-1), d = q.d * Math.PI / 180, s = back ? q.t1 : q.t0; return Math.hypot(q.cx + Math.cos(d) * s - e[0], q.cy + Math.sin(d) * s - e[1]) <= joinMost * laid; };
    const joins = !character && cur && inLoad < most && last && Math.abs(q.i - last.i) === 1 && Math.min(q.t1, last.t1) - Math.max(q.t0, last.t0) > 0.5 * Math.min(q.t1 - q.t0, last.t1 - last.t0) && near();
    if (!joins) { if (cur) strokes.push(cur); cur = { pts: [] }; inLoad = 0; back = rng.next() < 0.5; most = perLoad ?? Math.round(rng.range(H.perLoad[0] - 0.49, H.perLoad[1] + 0.49)); }
    cur.pts.push(...lane(q, back)); back = !back; inLoad++; last = q;
  }
  if (cur) strokes.push(cur);
  // how far the lanes lap, as a share of the brush's whole width, to the nearest LAP_STEP: the scrap swatch that sets this
  // wash's charge is laid in lanes lapped the same (a tuft levels with the wet film it finds, so what lapped lanes
  // leave is not the sum of what each would leave alone; charged from a swatch lapped by a third, lanes lapped by
  // more than half left 0.83 of the planned pigment where the looser lanes before them left 0.91)
  const lap = steps.length ? +Math.max(0, Math.min(0.8, Math.round((1 - steps.reduce((x, y) => x + y, 0) / steps.length / widthMm) / LAP_STEP) * LAP_STEP)).toFixed(2) : null;
  // the load: full after the brush is dipped, thinner on each stroke until it is dipped again, after two strokes or three
  let sinceDip = 0, dipAfter = 0, fresh = 1.12;
  return strokes.map(s => {
    if (sinceDip >= dipAfter) { sinceDip = 0; dipAfter = rng.next() < 0.5 ? 2 : 3; fresh = 1.12 + 0.05 * hand * rng.range(-1, 1); }
    const charge = fresh - 0.115 * sinceDip++;
    const L = s.pts.length, turns = rng.range(0.5, 1.5), phase = rng.range(0, 2 * Math.PI), ch = character ? character(s.pts[0][3]) : null;
    const out = s.pts.map(([x, y, tl], j) => {
      const t = L > 1 ? j / (L - 1) : 0.5, land = Math.min(1, t * L / 2.5), lift = Math.min(1, (1 - t) * L / 2);
      let base = list ? Math.max(least, pressureAt(list, tl)) : pressure;
      // a mark's own rise and fall along the lane in place of the lanes' landing and lift; inside its ends never lighter
      // than keeps the lanes lapped
      const env = ch ? (tl > 0.12 && tl < 0.88 ? Math.max(least / Math.max(1e-6, base), ch.pressure(tl)) : ch.pressure(tl)) : 0.55 + 0.45 * Math.min(land, lift);
      if (cap) base = Math.min(base, cap(x, y));
      const q = pt(x, y, base * env * (1 + H.swell * hand * Math.sin(2 * Math.PI * turns * t + phase)) * rng.range(0.95, 1.05));
      return ch ? [...q, Math.max(2, Math.round(ch.speed(tl)))] : q;
    });
    return { kind: 'sweep', radiusMm: round3(r), points: out, charge: round3(charge), ...(lap == null ? {} : { lap }), ...(ch ? ch.blade : {}) };
  });
}

/** The steps a wash's lap is told to the swatch in (shares of the brush's width): each step is a swatch of its own. */
const LAP_STEP = 0.1;

/** One dab of a charge, dropped at (x, y). */
export function chargeDab(x, y, { widthMm, rng, pressure = 0.85 }) {
  const r = widthMm / 2;
  return handled(x + rng.range(-0.3, 0.3), y + rng.range(-0.3, 0.3), { deg: rng.range(0, 180), len: r * rng.range(1.2, 2), r, pressure: [0.4 * pressure, pressure, 0.3 * pressure], rng });
}
