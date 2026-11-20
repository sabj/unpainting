// The marks a painting script names (docs/painting-script.md), each made as whole strokes of a brush from a path, a
// pressure along it, a direction and a size. A passage's region is a guide to the hand: it places the strokes (where a
// lane starts and ends, where a touch is set down) and never cuts one; a stroke runs on past it as a brush does. Nothing
// here reads a picture. A seeded hand (`rng`) gives each stroke its own small irregularity of place, angle, length and
// pressure, so no two marks are the same and none sits on a grid.
//
// A stroke is {kind: 'sweep', radiusMm, points: [[x, y, pressure], ...]} in sheet millimetres, as the wash plan's
// strokes are (tools/plate/paint.mjs lays them unclipped with a round whose half-width is r (0.25 + 0.75 p)).

/** A hand's random numbers, from a string: mulberry32 seeded by an FNV hash. */
export function handOf(seed) {
  let h = 2166136261 >>> 0; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let a = h || 1;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), sign: () => (next() < 0.5 ? -1 : 1), normal: () => { let s = 0; for (let i = 0; i < 4; i++) s += next(); return (s - 2) * 1.732; } };
}

/** Pressure words to a peak pressure. */
export const PRESSURE = Object.freeze({ light: 0.45, medium: 0.7, firm: 0.95 });

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

/** Area of polygon(s), mm2 (even-odd, as the sum of absolute areas). */
export function areaOf(polys) {
  let a = 0; for (const P of polys) { let s = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) s += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1]); a += Math.abs(s) / 2; }
  return a;
}

const boxOf = polys => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const P of polys) for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; };

/**
 * About `n` places over the region, loosely even (a jittered grid, found by search for its pitch), in the order a hand
 * visits them: bands from the top down, each band crossed one way and the next the other.
 */
export function placesIn(polys, n, rng) {
  if (!(n >= 1)) return [];
  const b = boxOf(polys), A = Math.max(1e-6, areaOf(polys));
  let pitch = Math.sqrt(A / n), got = [];
  const ox = rng.next(), oy = rng.next(), jit = [];
  for (let it = 0; it < 10; it++) {
    got = [];
    let k = 0;
    for (let gy = 0; b.y0 + (gy + oy) * pitch <= b.y1 + pitch; gy++) for (let gx = 0; b.x0 + (gx + ox) * pitch <= b.x1 + pitch; gx++, k++) {
      if (jit.length <= k) jit.push([rng.next(), rng.next()]);
      const x = b.x0 + (gx + ox - 0.5 + jit[k][0]) * pitch, y = b.y0 + (gy + oy - 0.5 + jit[k][1]) * pitch;
      if (inside(polys, x, y)) got.push([x, y]);
    }
    if (Math.abs(got.length - n) <= Math.max(1, 0.1 * n)) break;
    pitch *= Math.sqrt(Math.max(1, got.length) / n);
    jit.length = 0;
  }
  // too many: leave out some at random (a hand does not fill every place); none: the region's middle
  while (got.length > n) got.splice(Math.floor(rng.next() * got.length), 1);
  if (!got.length) { const c = centroid(polys); if (c) got.push(c); }
  const band = Math.max(pitch * 2.5, 1e-6);
  return got.map(p => ({ p, b: Math.floor((p[1] - b.y0) / band) })).sort((a, c) => a.b - c.b || (a.b % 2 ? c.p[0] - a.p[0] : a.p[0] - c.p[0])).map(q => q.p);
}

function centroid(polys) {
  let sx = 0, sy = 0, c = 0; for (const P of polys) for (const [x, y] of P) { sx += x; sy += y; c++; }
  return c ? [sx / c, sy / c] : null;
}

/**
 * The stretch of the line through (x, y) along `deg` that lies in the region, as [t0, t1] about (x, y) (t in mm along the
 * direction): a stroke placed there is held to that chord, as a hand keeps a streak inside the shape it is laying, but it
 * is not cut: it is shortened and moved, and its ends taper where they fall.
 */
export function chordAt(polys, x, y, deg) {
  const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), ts = [];
  for (const P of polys) for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [x1, y1] = P[j], [x2, y2] = P[i], ex = x2 - x1, ey = y2 - y1, den = ux * ey - uy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((x1 - x) * ey - (y1 - y) * ex) / den, s = ((x1 - x) * uy - (y1 - y) * ux) / den;
    if (s >= 0 && s < 1) ts.push(t);
  }
  ts.sort((p, q) => p - q);
  let lo = -Infinity, hi = Infinity;
  for (const t of ts) { if (t <= 0) lo = t; else { hi = t; break; } }
  return [Number.isFinite(lo) ? lo : 0, Number.isFinite(hi) ? hi : 0];
}

/** A stroke of length `len` about (x, y) along `deg`, kept to the region's chord there (with `over` of its length allowed past each end). */
function fitted(polys, x, y, deg, len, over = 0.08) {
  const [t0, t1] = chordAt(polys, x, y, deg), room = (t1 - t0) * (1 + 2 * over);
  const L = Math.max(Math.min(len, room), Math.min(len, 1)), lo = t0 - over * (t1 - t0), hi = t1 + over * (t1 - t0);
  let c = 0; if (c - L / 2 < lo) c = lo + L / 2; if (c + L / 2 > hi) c = hi - L / 2;
  const a = deg * Math.PI / 180;
  return { x: x + Math.cos(a) * c, y: y + Math.sin(a) * c, len: L };
}

/** A single stroke from (x, y) along `deg` of length `len`: `profile(t)` gives the pressure along it, `bow` its curve. */
function pulled(x, y, deg, len, r, profile, { bow = 0, points = 9, centre = true } = {}) {
  const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, out = [];
  for (let j = 0; j < points; j++) {
    const t = j / (points - 1), s = (centre ? t - 0.5 : t) * len, off = bow * len * 4 * t * (1 - t);
    out.push(pt(x + ux * s + nx * off, y + uy * s + ny * off, profile(t)));
  }
  return { kind: 'sweep', radiusMm: round3(r), points: out };
}

/**
 * A wash laid in sweeps: lanes across the region along `deg`, `lanes` of them (or as many as a brush of this width
 * needs at about two-thirds overlap), each running from the region's edge to its edge and a little past or short of it,
 * wavering; up to `perLoad` lanes laid back and forth as one stroke before the brush is lifted and recharged. Lanes go
 * from the top of the sheet down. Each stroke carries a charge factor: full after a recharge, thinning along the load.
 */
export function sweeps(polys, { widthMm, deg = 0, lanes = 0, pressure = 0.8, perLoad = 3, rng }) {
  const r = widthMm / 2, a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
  const U = ([x, y]) => x * ux + y * uy, V = ([x, y]) => x * vx + y * vy;
  let v0 = Infinity, v1 = -Infinity; for (const P of polys) for (const q of P) { v0 = Math.min(v0, V(q)); v1 = Math.max(v1, V(q)); }
  const span = v1 - v0, most = Math.ceil(span / (0.85 * widthMm)), n = Math.max(1, lanes > 0 ? Math.max(Math.round(lanes), most) : Math.ceil(span / (0.65 * widthMm)));
  const step = span / n, runs = [];
  for (let i = 0; i < n; i++) {
    const v = v0 + step * (i + 0.5) + rng.range(-0.12, 0.12) * step;
    // the lane's crossings of the region (even-odd), as runs along u
    const xs = [];
    for (const P of polys) for (let k = 0, j = P.length - 1; k < P.length; j = k++) {
      const va = V(P[j]), vb = V(P[k]);
      if ((va > v) !== (vb > v)) { const t = (v - va) / (vb - va); xs.push(U(P[j]) + t * (U(P[k]) - U(P[j]))); }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] >= 0.6 * widthMm || xs[k + 1] - xs[k] >= 2) runs.push({ i, v, u0: xs[k] - r * rng.range(-0.2, 0.6), u1: xs[k + 1] + r * rng.range(-0.2, 0.6) });
  }
  // the order a hand lays them: the topmost lane first (screen y of the lane's middle), each lane's runs in turn
  const mid = q => { const u = (q.u0 + q.u1) / 2; return [u * ux + q.v * vx, u * uy + q.v * vy]; };
  runs.sort((p, q) => p.i - q.i || p.u0 - q.u0);
  if (mid(runs[0] ?? { u0: 0, u1: 0, v: v0 })[1] > mid(runs.at(-1) ?? { u0: 0, u1: 0, v: v1 })[1]) runs.reverse();
  const strokes = [];
  let cur = null, inLoad = 0, back = false, last = null;
  const lane = (q, rev) => {
    const len = q.u1 - q.u0, m = Math.max(3, Math.ceil(len / Math.max(1.5, r * 0.8))), wob = rng.range(-0.1, 0.1) * step, tilt = rng.range(-0.025, 0.025), pts = [];
    for (let j = 0; j <= m; j++) {
      const t = j / m, u = q.u0 + len * (rev ? 1 - t : t), v = q.v + wob * Math.sin(Math.PI * t) + tilt * (u - (q.u0 + q.u1) / 2);
      pts.push([u * ux + v * vx, u * uy + v * vy]);
    }
    return pts;
  };
  for (const q of runs) {
    const joins = cur && inLoad < perLoad && last && Math.abs(q.i - last.i) === 1 && Math.min(q.u1, last.u1) - Math.max(q.u0, last.u0) > 0.5 * Math.min(q.u1 - q.u0, last.u1 - last.u0);
    if (!joins) { if (cur) strokes.push(cur); cur = { pts: [], loads: strokes.length }; inLoad = 0; back = rng.next() < 0.5 ? false : true; }
    cur.pts.push(...lane(q, back)); back = !back; inLoad++; last = q;
  }
  if (cur) strokes.push(cur);
  return strokes.map((s, k) => {
    const L = s.pts.length, out = s.pts.map(([x, y], j) => {
      const t = L > 1 ? j / (L - 1) : 0.5, land = Math.min(1, t * L / 2.5), lift = Math.min(1, (1 - t) * L / 2);
      return pt(x, y, pressure * (0.55 + 0.45 * Math.min(land, lift)) * (1 + rng.range(-0.05, 0.05)));
    });
    return { kind: 'sweep', radiusMm: round3(r), points: out, charge: round3(1.12 - 0.24 * (k % 3) / 2) };
  });
}

/**
 * Tapered strokes: pressed on and lifted off, fullest a third of the way along; about `n` of them over the region, each
 * about `lengthMm` long along `deg` (a hand's spread of a few degrees), slightly bowed.
 */
export function tapers(polys, { widthMm, deg = 0, n, lengthMm, pressure = 0.7, rng, spreadDeg = 9 }) {
  const r = widthMm / 2;
  return placesIn(polys, n, rng).map(([x, y]) => {
    const d = deg + spreadDeg * rng.normal() * 0.5, f = fitted(polys, x, y, d, lengthMm * rng.range(0.7, 1.3)), len = f.len, peak = rng.range(0.28, 0.45), pk = pressure * rng.range(0.85, 1.1);
    return pulled(f.x, f.y, d, len, r, t => pk * (t < peak ? 0.15 + 0.85 * Math.sin(0.5 * Math.PI * t / peak) : 0.1 + 0.9 * Math.cos(0.5 * Math.PI * (t - peak) / (1 - peak))), { bow: rng.range(-0.06, 0.06), points: Math.max(7, Math.min(17, Math.round(len / Math.max(1, r * 0.6)))) });
  });
}

/** Dabs: short touches pressed and lifted (a leaf, a stone), about `n` over the region, turned about `deg`. */
export function dabs(polys, { widthMm, deg = 0, n, lengthMm, pressure = 0.8, rng, spreadDeg = 35 }) {
  const r = widthMm / 2, L = lengthMm > 0 ? lengthMm : 2.6 * r;
  return placesIn(polys, n, rng).map(([x, y]) => {
    const d = deg + spreadDeg * rng.normal() * 0.5, f = fitted(polys, x, y, d, L * rng.range(0.7, 1.35), 0.25), len = f.len, pk = pressure * rng.range(0.75, 1.1);
    return pulled(f.x, f.y, d, len, r * rng.range(0.8, 1.15), t => pk * Math.max(0.08, Math.sin(Math.PI * t) ** 0.6), { bow: rng.range(-0.1, 0.1), points: 9 });
  });
}

/** Wedges: a stroke that starts on the point and ends pressed, lifted square (the side of a block, a window's shadow). */
export function wedges(polys, { widthMm, deg = 0, n, lengthMm, pressure = 0.85, rng }) {
  const r = widthMm / 2, L = lengthMm > 0 ? lengthMm : 3 * r;
  return placesIn(polys, n, rng).map(([x, y]) => {
    const d = deg + 6 * rng.normal() * 0.5, f = fitted(polys, x, y, d, L * rng.range(0.8, 1.2)), len = f.len, pk = pressure * rng.range(0.85, 1.05);
    return pulled(f.x, f.y, d, len, r, t => pk * (t < 0.9 ? 0.2 + 0.8 * t / 0.9 : 0.85), { points: 8 });
  });
}

/** Lines with the point: each path followed by one stroke, the pressure swelling and easing along it, the ends tapered. */
export function lines(paths, { widthMm, pressure = 0.6, rng }) {
  const r = widthMm / 2;
  return paths.filter(P => P.length >= 2).map(P => {
    const pts = [];
    for (let k = 0; k + 1 < P.length; k++) {
      const [ax, ay] = P[k], [bx, by] = P[k + 1], m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.2));
      for (let j = 0; j < m; j++) pts.push([ax + (bx - ax) * j / m, ay + (by - ay) * j / m]);
    }
    pts.push(P.at(-1));
    const ph = rng.range(0, 6.28), L = pts.length;
    return { kind: 'sweep', radiusMm: round3(r), points: pts.map(([x, y], j) => { const t = L > 1 ? j / (L - 1) : 0.5; return pt(x + rng.range(-0.08, 0.08), y + rng.range(-0.08, 0.08), pressure * (0.75 + 0.25 * Math.sin(ph + 5 * t)) * Math.min(1, 0.3 + 2.5 * t, 0.3 + 2.5 * (1 - t))); }) };
  });
}

/** Scumble: short broken strokes of a dry brush on its side, turned every way about `deg`. */
export function scumbles(polys, { widthMm, deg = 0, n, lengthMm, pressure = 0.55, rng }) {
  const r = widthMm / 2, L = lengthMm > 0 ? lengthMm : 4 * r;
  return placesIn(polys, n, rng).map(([x, y]) => pulled(x, y, deg + 60 * rng.normal() * 0.5, L * rng.range(0.6, 1.3), r, t => pressure * (0.6 + 0.4 * Math.sin(Math.PI * t)), { bow: rng.range(-0.15, 0.15), points: 7 }));
}

/** One dab of a charge, dropped at (x, y). */
export function chargeDab(x, y, { widthMm, rng, pressure = 0.85 }) {
  const r = widthMm / 2;
  return pulled(x + rng.range(-0.3, 0.3), y + rng.range(-0.3, 0.3), rng.range(0, 180), r * rng.range(1.2, 2), r, t => pressure * Math.max(0.1, Math.sin(Math.PI * t) ** 0.5), { points: 7 });
}
