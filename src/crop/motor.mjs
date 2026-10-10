// Executes a fitted path as a hand would: minimum-jerk reaches, the two-thirds power law into bends, aim errors mostly
// corrected on the next reach, and heavier pulls than pushes. Tremor, pressure bias and pull direction are sampled
// once per sheet, because independent randomness per stroke is itself a tell. DOM free.
import { gesture } from './gesture.mjs';
import { arcLengths, polylineLength, resample } from '../util.js';

// A mixed hash, not a plain linear generator: neighbouring stroke seeds must not come out with neighbouring misses.
const rand = seed => { let s = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0; return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x27d4eb2f) >>> 0; return ((s ^ (s >>> 13)) >>> 0) / 4294967296; }; };
const mix = (r, a, b) => a + (b - a) * r();
// One hand per sheet, sampled once, so every stroke leans the same way.
export function handOf(seed = 1, over = {}) {
  const r = rand(seed + 7);
  return {
    seed, speed: mix(r, 0.22, 0.34), down: mix(r, 1.6, 2.5), anisotropy: mix(r, 0.26, 0.42), gamma: mix(r, 0.28, 0.42),
    tremor: mix(r, 0.16, 0.30), aim: mix(r, 0.45, 0.85), correct: mix(r, 0.62, 0.84), land: mix(r, 55, 115), hook: mix(r, 0.35, 0.7),
    reach: mix(r, 34, 58), overshoot: mix(r, 0.18, 0.34), bias: mix(r, -0.35, 0.35), ...over,
  };
}
// Turn per unit of travel, read a few samples either side so the sampling spacing is not mistaken for a bend.
function curvatures(P, span = 2) {
  const n = P.length, k = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const a = P[Math.max(0, j - span)], b = P[j], c = P[Math.min(n - 1, j + span)];
    let da = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    k[j] = da / Math.max(1e-6, (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y)) / 2);
  }
  return k;
}
const smooth = (A, passes = 2) => { let B = Array.from(A); for (let q = 0; q < passes; q++) B = B.map((v, j) => (B[Math.max(0, j - 1)] + 2 * v + B[Math.min(B.length - 1, j + 1)]) / 4); return B; };
const jerk = t => t * t * t * (10 - 15 * t + 6 * t * t);     // minimum jerk: rest to rest, no step at either end
const bell = t => 30 * t * t * (1 - t) * (1 - t);            // its speed, whose mean over a reach is exactly 1

/**
 * Execute a planned path. `points` are the fit's own points and may carry evidence (w, d) which is interpolated along.
 * Returns the drawn points with a pressure p, a speed v and a time t, plus what the motor did to get them.
 */
export function motorStroke(points, hand = handOf(1), { scale = 1, closed = false, seed = 0, tolerance = 0.6 * scale, spacing = 0.6 * scale, tremor = 1, bellWeight = 1, aimWeight = 1, p0 = 0.5, swing = 0.04, reach = hand.reach * scale } = {}) {
  if (!points || points.length < 2) return { points: (points || []).map(p => ({ ...p, p: p0, v: hand.speed, t: 0 })), submovements: 0, corrections: 0, duration: 0 };
  const plan = resample(points.map(p => ({ ...p })), spacing), len = polylineLength(plan);
  if (len < 2 * scale) return { points: plan.map(p => ({ ...p, p: p0, v: hand.speed, t: 0 })), submovements: 1, corrections: 0, duration: len / hand.speed };
  const carry = Object.keys(points[0]).filter(key => !['x', 'y'].includes(key) && typeof points[0][key] === 'number');
  { // resample() keeps only x, y and w; carry the rest of the evidence across by arc length
    const s0 = arcLengths(points), s1 = arcLengths(plan), total = s0[s0.length - 1] || 1;
    let j = 0; for (let i = 0; i < plan.length; i++) { const target = s1[i] / (s1[s1.length - 1] || 1) * total; while (j < points.length - 2 && s0[j + 1] < target) j++; const u = (target - s0[j]) / Math.max(1e-6, s0[j + 1] - s0[j]); for (const key of carry) plan[i][key] = points[j][key] + (points[j + 1][key] - points[j][key]) * Math.max(0, Math.min(1, u)); }
  }
  const n = plan.length, s = arcLengths(plan), kappa = smooth(curvatures(plan, Math.max(2, Math.round(1.5 * scale / spacing))), 2);
  // One to four reaches per mark, set by the arm's span. A reach ends where the form turns hardest, where a hand re-aims.
  const count = Math.max(1, Math.min(4, Math.round(len / reach)));
  const cuts = [0];
  for (let m = 1; m < count; m++) {
    const centre = len * m / count, lo = centre - len / count * 0.3, hi = centre + len / count * 0.3;
    let best = -1, bestK = -1; for (let j = 1; j < n - 1; j++) if (s[j] >= lo && s[j] <= hi && Math.abs(kappa[j]) > bestK) { bestK = Math.abs(kappa[j]); best = j; }
    cuts.push(best > 0 ? best : Math.round(n * m / count));
  }
  cuts.push(n - 1);
  // Each reach lands a little off its via-point and the next takes most of that miss out, so the path errs and returns.
  const r = rand(seed * 131 + hand.seed * 17 + 1), miss = [0]; let corrections = 0;
  for (let m = 1; m <= count; m++) {
    // the miss grows with the reach, as an aimed movement's endpoint scatter does, not with the size of a pixel
    const last = miss[m - 1], want = (mix(r, -1, 1) + hand.bias) * hand.aim * aimWeight * Math.max(scale, 0.025 * (s[cuts[m]] - s[cuts[m - 1]]));
    const e = m === count && !closed ? last * (1 - hand.correct) * 0.5 : last * (1 - hand.correct) + want;
    if (Math.abs(last) > tolerance) corrections++;
    miss.push(Math.max(-2.5 * scale, Math.min(2.5 * scale, e)));
  }
  const lateral = new Float64Array(n);
  for (let m = 0; m < count; m++) for (let j = cuts[m]; j <= cuts[m + 1]; j++) { const u = (s[j] - s[cuts[m]]) / Math.max(1e-6, s[cuts[m + 1]] - s[cuts[m]]); lateral[j] = miss[m] + (miss[m + 1] - miss[m]) * jerk(u); }
  // A corner overshoots before the next reach hauls it back, unlike a tracer's rounded shortcut.
  for (let m = 1; m < count; m++) {
    const j = cuts[m], turn = kappa[j]; if (Math.abs(turn) * scale < 0.04) continue;
    const width = Math.max(2 * scale, Math.min(len / count * 0.5, 8 * scale)), mag = -Math.sign(turn) * hand.overshoot * scale * Math.min(2.5, Math.abs(turn) * 12 * scale);
    for (let q = 0; q < n; q++) lateral[q] += mag * Math.exp(0 - ((s[q] - s[j]) / width) ** 2);
  }
  const aimed = plan.map((p, j) => { const a = plan[Math.max(0, j - 1)], b = plan[Math.min(n - 1, j + 1)], L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { ...p, x: p.x + lateral[j] * -(b.y - a.y) / L, y: p.y + lateral[j] * (b.x - a.x) / L }; });
  // Speed follows the plan, not the tremor: two-thirds power law (v with the cube root of the radius) under a
  // minimum-jerk bell per reach.
  const speed = new Float64Array(n); let work = 0;
  for (let j = 0; j < n; j++) {
    const radius = Math.max(0.5 * scale, Math.min(80 * scale, 1 / Math.max(1e-4, Math.abs(kappa[j]))));
    let m = 0; while (m < count - 1 && j > cuts[m + 1]) m++;
    const u = Math.max(0, Math.min(1, (s[j] - s[cuts[m]]) / Math.max(1e-6, s[cuts[m + 1]] - s[cuts[m]])));
    speed[j] = Math.cbrt(radius) * (1 - bellWeight + bellWeight * (0.15 + 0.85 * bell(u)));
  }
  for (let j = 1; j < n; j++) work += (s[j] - s[j - 1]) * 2 / (speed[j] + speed[j - 1]);
  const kv = work > 0 ? (len / hand.speed) / work : 1;               // one constant per stroke sets the pace
  for (let j = 0; j < n; j++) speed[j] /= kv;
  // Tremor and the swing in and out are applied after aiming. A mark runs a little past the form; a closed loop does not.
  let drawn = tremor ? gesture(aimed, seed * 7 + hand.seed, { wander: hand.tremor * scale * tremor, overshoot: closed ? 0 : Math.min(swing, 5 * scale / len), breathe: 0, curve: 0, hook: hand.hook }) : aimed;
  if (closed) { drawn = drawn.length > aimed.length ? drawn.slice(1, -1) : drawn; drawn[drawn.length - 1] = { ...drawn[0] }; }
  // Pressure: the pull direction is heavier, a slower lead leaves more ink, and the nib lands and lifts over tens of ms.
  // Only the speed term is levelled to a mean of one, so ink cost does not depend on speed.
  const ds = arcLengths(drawn), dl = ds[ds.length - 1] || 1, vAt = frac => { const target = Math.max(0, Math.min(1, frac)) * (n - 1); const j = Math.floor(target), u = target - j; return speed[j] + ((speed[Math.min(n - 1, j + 1)] ?? speed[j]) - speed[j]) * u; };
  const vRef = len / Math.max(1e-6, work * kv), landLen = Math.min(dl * 0.3, hand.land * hand.speed);
  let sum = 0, weight = 0; const raw = drawn.map((p, j) => {
    const a = drawn[Math.max(0, j - 1)], b = drawn[Math.min(drawn.length - 1, j + 1)], theta = Math.atan2(b.y - a.y, b.x - a.x), v = Math.max(1e-4, vAt(ds[j] / dl));
    const pace = Math.pow(vRef / v, hand.gamma), w = j === 0 ? 0 : ds[j] - ds[j - 1];
    sum += pace * w; weight += w; return { v, pace, lean: 1 + hand.anisotropy * Math.cos(theta - hand.down) };
  });
  const norm = weight > 0 ? p0 / (sum / weight) : p0;
  let time = 0; const out = drawn.map((p, j) => {
    const ends = Math.min(1, 0.25 + 0.75 * Math.min(ds[j], dl - ds[j]) / Math.max(1e-6, landLen));
    if (j) time += (ds[j] - ds[j - 1]) / ((raw[j].v + raw[j - 1].v) / 2);
    return { ...p, p: Math.max(0.05, Math.min(2.4, raw[j].pace * raw[j].lean * norm * ends)), v: raw[j].v, t: time };
  });
  return { points: out, submovements: count, corrections, duration: time, plan: aimed };
}

/**
 * Numbers that separate a drawn line from a traced one: the slope of speed into a bend (about a third in logs), reaches
 * per mark, width swing within a stroke, and spacing evenness. Measured off executed strokes.
 */
export function motorSignature(strokes, { scale = 1 } = {}) {
  let sxx = 0, sxy = 0, sx = 0, sy = 0, m = 0, reaches = 0, reachN = 0, ratioSum = 0, ratioN = 0, lengths = [], times = [];
  for (const stroke of strokes) {
    const P = stroke.points || stroke; if (!P || P.length < 8) continue;
    reachN++;
    const kappa = smooth(curvatures(P, Math.max(2, Math.round(scale))), 2), s = arcLengths(P);
    for (let j = 3; j < P.length - 3; j++) {
      const radius = 1 / Math.max(1e-4, Math.abs(kappa[j])), v = P[j].v; if (!(v > 0) || radius < 0.5 * scale || radius > 60 * scale) continue;
      const x = Math.log(radius), y = Math.log(v); sxx += x * x; sxy += x * y; sx += x; sy += y; m++;
    }
    const widths = P.map(p => p.r ?? p.p).filter(v => v > 0).sort((a, b) => a - b);
    if (widths.length > 8) { ratioSum += widths[Math.floor(widths.length * 0.97)] / Math.max(1e-6, widths[Math.floor(widths.length * 0.03)]); ratioN++; }
    reaches += stroke.submovements ?? 1;
    if (s[s.length - 1] > 4 * scale && P[P.length - 1].t > 0) { lengths.push(Math.log(s[s.length - 1])); times.push(Math.log(P[P.length - 1].t)); }
  }
  const slope = m > 4 ? (m * sxy - sx * sy) / Math.max(1e-9, m * sxx - sx * sx) : null;
  const lm = lengths.length, lx = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lm), ly = times.reduce((a, b) => a + b, 0) / Math.max(1, lm);
  const duration = lm > 4 ? lengths.reduce((a, x, i) => a + (x - lx) * (times[i] - ly), 0) / Math.max(1e-9, lengths.reduce((a, x) => a + (x - lx) ** 2, 0)) : null;
  return { speedSlope: slope, reaches: reaches / Math.max(1, reachN), widthRatio: ratioN ? ratioSum / ratioN : null, durationExponent: duration, samples: m };
}

/** Coefficient of variation of parallel-mark gaps: 0.2 to 0.4 indicates irregular spacing; 0.05 indicates regular spacing. */
export function spacingVariation(strokes, { scale = 1 } = {}) {
  const mid = strokes.map(s => { const P = s.points || s, p = P[Math.floor(P.length / 2)], a = P[0], b = P[P.length - 1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: p.x, y: p.y, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L }; });
  const gaps = [];
  for (let i = 0; i < mid.length; i++) { let best = Infinity; for (let j = 0; j < mid.length; j++) { if (i === j || Math.abs(mid[i].ux * mid[j].ux + mid[i].uy * mid[j].uy) < 0.9) continue; const d = Math.hypot(mid[i].x - mid[j].x, mid[i].y - mid[j].y); if (d > 0.5 * scale && d < best) best = d; } if (best < 30 * scale) gaps.push(best); }
  if (gaps.length < 4) return null;
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length) / Math.max(1e-6, mean);
}
