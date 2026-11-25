// A wash's edge as a hand lays it. A script's region is a guide to the hand (docs/painting-script.md), written as a
// polygon of straight sides; laid exactly along it, a wash ends in a hard outline of straight facets and sharp corners,
// like a stamped slab. A painter's wash ends where the bead was carried: round at the corners, wandering a little in
// and out of the guide at every scale, more for a wetter or a bigger wash. This module gives the lanes that outline:
// the region's corners rounded off, then the line pushed in and out along its normal by seeded noise of a few scales
// (about 0.3 to 3 mm). The script's region itself is untouched; only where the lanes are placed follows this outline.
import { handOf, areaOf } from './script-marks.mjs';

/** The edge's wander (mm): least, most, and its share of the wash's size (square root of its area). */
export const EDGE_HAND = Object.freeze({ least: 0.3, most: 3, share: 0.035, wet: 1.6, dry: 0.6, corner: 0.18 });

/** Resample a closed outline at about `step` mm. */
function resample(P, step) {
  const out = [];
  for (let k = 0; k < P.length; k++) {
    const a = P[k], b = P[(k + 1) % P.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let s = 0; s < n; s++) out.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]);
  }
  return out;
}

/** Corner cutting (Chaikin) of a closed outline, `times` over: the straight facets' corners rounded off. */
function chaikin(P, times) {
  let Q = P;
  for (let t = 0; t < times; t++) {
    const R = [];
    for (let k = 0; k < Q.length; k++) { const a = Q[k], b = Q[(k + 1) % Q.length]; R.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); }
    Q = R;
  }
  return Q;
}

/** Periodic smooth value noise on [0, L) with `knots` knots, from rng: -1..1, cosine-eased between knots. */
function loopNoise(rng, knots) {
  const v = Array.from({ length: knots }, () => rng.range(-1, 1));
  return t => { const x = ((t % 1) + 1) % 1 * knots, i = Math.floor(x), f = x - i, e = (1 - Math.cos(Math.PI * f)) / 2; return v[i % knots] * (1 - e) + v[(i + 1) % knots] * e; };
}

/** How far a wash's edge wanders (mm), from its size and its wetness ('wet', 'dry' or plain). */
export function edgeWanderMm(P, wetness = 'plain') {
  const H = EDGE_HAND, size = Math.sqrt(Math.max(0, areaOf([P])));
  const k = wetness === 'wet' ? H.wet : wetness === 'dry' ? H.dry : 1;
  return Math.max(H.least, Math.min(H.most, size * H.share * k));
}

/**
 * The outline a wash's lanes are laid by: `P` (mm, closed) rounded at its corners and wandering in and out along its
 * normal at three scales. Seeded: the same seed gives the same edge. Returns a new outline; P is not changed.
 */
export function organicOutline(P, { seed = 0, wetness = 'plain' } = {}) {
  if (!P || P.length < 3) return P;
  const H = EDGE_HAND, amp = edgeWanderMm(P, wetness), size = Math.sqrt(Math.max(1e-6, areaOf([P])));
  // corners rounded over a share of the wash's size (at least a couple of mm), then resampled fine
  let per = 0; for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const round = Math.max(1.5, Math.min(8, size * H.corner)), coarse = resample(P, round);
  const Q = resample(chaikin(coarse, 3), Math.max(0.25, Math.min(1, amp / 2)));
  const rng = handOf(`${seed}/edge`), sign = areaSign(Q);
  // three scales of wander: long swells, a bead's length, and a ragged fine edge (knots by perimeter in mm)
  const octaves = [[per / 40, 0.6], [per / 10, 0.3], [per / 2.5, 0.12]].map(([kn, w]) => [loopNoise(rng, Math.max(3, Math.round(kn))), w]);
  const m = Q.length, out = new Array(m);
  for (let k = 0; k < m; k++) {
    const a = Q[(k - 1 + m) % m], b = Q[(k + 1) % m], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    // outward normal for this winding
    const nx = sign * ty / tl, ny = -sign * tx / tl, t = k / m;
    let d = 0; for (const [f, w] of octaves) d += f(t) * w;
    out[k] = [Q[k][0] + nx * d * amp, Q[k][1] + ny * d * amp];
  }
  return out;
}

function areaSign(P) { let s = 0; for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s >= 0 ? 1 : -1; }
