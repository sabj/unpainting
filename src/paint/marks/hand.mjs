// The hand: how one stroke of the brush is driven. A stroke is a path the hand moves along, made of arcs (a turtle's
// moves: go so far, turning so much), and along it the pressure (how much of the tuft lies down: a round's width), the
// hand's speed (how long the tuft stands on each place: a slow landing or a pause before the lift leaves more paint) and,
// for a flat, how the blade is held. A real stroke is rarely one even pressure in a straight line: it lands, swells,
// eases, swells again, turns at the wrist and lifts, and every repeat of it differs a little. `seed` is that difference.
//
// The result is a plan stroke (src/paint/methods/study-washes.mjs, laid by tools/plate/paint.mjs): millimetres on the
// sheet, { kind: 'sweep', mark, radiusMm, points: [[x, y, pressure, speed mm/s, radius share]], flat?, angle?, held?,
// water?, charge? }. The radius share is always 1 here: the brush does not change size within a stroke; its width comes
// from the pressure, as the section brush (src/media/tuft-section.mjs) lays more of its tuft down. Plan time only.

/** A hash of integers, 0..1: a mark's irregularity is fixed by its seed, the same at every run. */
export function hash(a, b = 0, c = 0) {
  let x = Math.imul((a | 0) * 73856093 ^ (b | 0) * 19349663 ^ (c | 0) * 83492791, 2654435761) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}
/** A smooth wander in -1..1 along u (0..1), two slow waves with seeded phases. */
const wander = (seed, k, u, f = 1) => 0.6 * Math.sin(6.283 * (hash(seed, k, 1) + f * (1 + hash(seed, k, 2)) * u)) + 0.4 * Math.sin(6.283 * (hash(seed, k, 3) + f * (2.3 + 2 * hash(seed, k, 4)) * u));

/** A profile along the stroke from knots [[u, value], ...] (u 0..1, ascending): eased between knots, flat beyond them. */
export function profile(knots, u) {
  if (u <= knots[0][0]) return knots[0][1];
  for (let k = 1; k < knots.length; k++) {
    const [u1, v1] = knots[k];
    if (u <= u1) { const [u0, v0] = knots[k - 1], t = u1 > u0 ? (u - u0) / (u1 - u0) : 1, e = t * t * (3 - 2 * t); return v0 + (v1 - v0) * e; }
  }
  return knots[knots.length - 1][1];
}

/**
 * The path of a hand's moves from (0, 0) heading along +x: each move { len (a share of the whole), turn (radians,
 * positive turns clockwise on the sheet, y down) } is an arc of even curvature. Returns [[x, y], ...] every `step`
 * (in the same units as `length`), with each move's length and turn varied a little by the seed.
 */
export function movesPath(moves, length, step, seed = 0, vary = 0.1) {
  const total = moves.reduce((a, m) => a + m.len, 0) || 1, out = [[0, 0]];
  let x = 0, y = 0, h = 0;
  moves.forEach((m, k) => {
    const L = length * m.len / total * (1 + vary * (2 * hash(seed, k, 11) - 1)), T = (m.turn ?? 0) * (1 + vary * (2 * hash(seed, k, 12) - 1));
    const n = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i < n; i++) { h += T / n / 2; x += Math.cos(h) * L / n; y += Math.sin(h) * L / n; h += T / n / 2; out.push([x, y]); }
  });
  return out;
}

/** Arc-length share u (0..1) at each point of a polyline. */
export function arcShares(path) {
  const d = [0];
  for (let i = 1; i < path.length; i++) d.push(d[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const L = d[d.length - 1] || 1;
  return { u: d.map(v => v / L), length: d[d.length - 1] };
}

/** A polyline resampled every `step`. */
export function resample(path, step) {
  const { u, length } = arcShares(path);
  if (!(length > 0)) return [path[0].slice()];
  const n = Math.max(2, Math.ceil(length / step)), out = [];
  let i = 1;
  for (let k = 0; k <= n; k++) {
    const t = k / n; while (i < path.length - 1 && u[i] < t) i++;
    const a = path[i - 1], b = path[i], s = u[i] > u[i - 1] ? (t - u[i - 1]) / (u[i] - u[i - 1]) : 0;
    out.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]);
  }
  return out;
}

const r3 = v => Math.round(v * 1000) / 1000;

/**
 * One stroke of the hand.
 * - `path`: [[x, y], ...] in mm, in the order the hand moves (from movesPath, placed; or a shape's spine).
 * - `widthMm`: the brush's belly width (a round's diameter, a flat's blade); the stroke is that wide where the pressure is 1.
 * - `pressure`, `speed`: knots [[u, value], ...] along the stroke (speed in mm/s).
 * - `wob`: the hand's sideways wander, a share of the width; `jitter`: the pressure's wander, a share of itself.
 * Options for a flat: `flat`, `angle` (the blade to the heading, degrees: 90 square across, 0 along it), `held: 'fixed'`
 * (the blade keeps its angle on the sheet, `angle` measured from the sheet's x axis, so the width follows the path's
 * direction, thick across the blade and thin along it). `water` (0..1, the brush's wetness; under 0.5 a dry brush),
 * `charge` (the paint's strength against the passage's own).
 */
export function hand(name, path, widthMm, { pressure = [[0, 1], [1, 1]], speed = [[0, 60], [1, 60]], seed = 0, wob = 0.06, jitter = 0.06, step, flat = false, angle, held, water, charge } = {}) {
  const st = step ?? Math.max(0.12, Math.min(0.6, widthMm / 6));
  const pts = resample(path, st), { u } = arcShares(pts), n = pts.length;
  const out = pts.map((q, k) => {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // the wander fades at the ends, where the hand places and lifts the brush on purpose
    const o = wob * widthMm * wander(seed, 1, u[k]) * Math.sin(Math.PI * u[k]);
    const p = profile(pressure, u[k]) * (1 + jitter * wander(seed, 2, u[k], 1.5));
    const v = profile(speed, u[k]) * (1 + 0.5 * jitter * wander(seed, 3, u[k]));
    return [r3(q[0] - (b[1] - a[1]) / tl * o), r3(q[1] + (b[0] - a[0]) / tl * o), r3(Math.max(0.02, Math.min(1.2, p))), Math.max(2, Math.round(v)), 1];
  });
  return {
    kind: 'sweep', mark: name, radiusMm: r3(widthMm / 2), points: out,
    ...(flat ? { flat: true, angle: angle ?? 90 } : {}), ...(held ? { held } : {}),
    ...(water != null ? { water: r3(water) } : {}), ...(charge != null ? { charge: r3(charge) } : {}),
  };
}

/** A path from moves, turned to `angle` (radians) and placed with its start at (x, y), or its middle there with `centre`. */
export function place(path, x, y, angle, centre = true) {
  const c = Math.cos(angle), s = Math.sin(angle);
  let pts = path.map(([px, py]) => [px * c - py * s, px * s + py * c]);
  if (centre) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of pts) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; pts = pts.map(([px, py]) => [px - mx + x, py - my + y]);
  } else pts = pts.map(([px, py]) => [px + x, py + y]);
  return pts;
}

/** Peaks of a profile: local maxima whose prominence (the height above the higher of the lowest points between them and
 *  the nearest higher ground on each side) is at least `share` of the profile's highest value. */
export function peakCount(p, share = 0.15) {
  const top = Math.max(...p); let n = 0;
  for (let i = 0; i < p.length; i++) {
    if ((i > 0 && p[i] <= p[i - 1]) || (i < p.length - 1 && p[i] < p[i + 1])) continue;
    let l = p[i], r = p[i];
    for (let j = i - 1; j >= 0 && p[j] <= p[i]; j--) l = Math.min(l, p[j]);
    for (let j = i + 1; j < p.length && p[j] <= p[i]; j++) r = Math.min(r, p[j]);
    if (i === 0 || i === p.length - 1) continue;
    if (p[i] - Math.max(l, r) >= share * top) n++;
  }
  return n;
}

/** What a stroke's own data says about it (the test sheet's diagram and measures): per point u, pressure, speed; the
 *  number of pressure peaks (local maxima standing 0.15 above the dips either side), the widest-to-narrowest pressure
 *  ratio inside its ends, and the path's total turning in degrees. */
export function strokeData(st) {
  const P = st.points, { u, length } = arcShares(P.map(q => [q[0], q[1]])), p = P.map(q => q[2]);
  const peaks = peakCount(p);
  const core = p.filter((_, i) => u[i] > 0.1 && u[i] < 0.9);
  // the turning of the path drawn at 1 mm, so the hand's small wander is not counted
  const C = resample(P.map(q => [q[0], q[1]]), Math.max(0.5, Math.min(1, length / 20)));
  let turn = 0;
  for (let i = 2; i < C.length; i++) {
    const a = Math.atan2(C[i - 1][1] - C[i - 2][1], C[i - 1][0] - C[i - 2][0]), b = Math.atan2(C[i][1] - C[i - 1][1], C[i][0] - C[i - 1][0]);
    let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += Math.abs(d);
  }
  return { u, p, v: P.map(q => q[3]), length, peaks, wideToNarrow: core.length ? Math.max(...core) / Math.max(0.02, Math.min(...core)) : 1, turningDeg: turn * 180 / Math.PI };
}
