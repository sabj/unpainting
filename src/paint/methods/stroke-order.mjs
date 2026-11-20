// Pipeline: inking, stage 3b (the order a person draws a traced drawing in). DOM free, no file IO.
// Level 1: the long, smooth structural lines (silhouette, main verticals and horizontals, big curves).
// Level 2: openings and their divisions: middling lines that are smooth and tied into the structure (an end on another
//          line, or closed on themselves).
// Level 3: short detail and texture (short, jagged or free-floating marks).
// Within a level the pen goes to the nearest start of a stroke not yet drawn; each stroke is pulled one way: downward
// when it runs more up and down than across, else left to right. Levels come from length, straightness and enclosure only.

/** Default thresholds, in mm. */
export const ORDER_DEFAULTS = Object.freeze({
  longShare: 0.1,      // level 1: at least this share of the sheet's width ...
  smoothDegPerMm: 6,   // ... turning at most this many degrees a millimetre (a big curve, not a scribble)
  midMm: 4,            // level 2: at least this long ...
  midDegPerMm: 15,     // ... at most this jagged ...
  touchMm: 0.6,        // ... and an end within this of another stroke, or closed on itself
  stepMm: 0.5,         // the resampling step that turning is read at
});

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const pathLength = P => P.reduce((s, q, k) => (k ? s + dist(P[k - 1], q) : 0), 0);

function resample(P, step) {
  const out = [P[0]]; let carry = 0;
  for (let k = 1; k < P.length; k++) {
    const a = P[k - 1], b = P[k], d = dist(a, b); let t = step - carry;
    while (t <= d) { out.push([a[0] + (b[0] - a[0]) * t / d, a[1] + (b[1] - a[1]) * t / d]); t += step; }
    carry = d - (t - step);
  }
  if (dist(out[out.length - 1], P[P.length - 1]) > 1e-9) out.push(P[P.length - 1]);
  return out;
}

/** Total absolute turning in degrees per mm of length (0 for a straight line), read at `step` mm. */
export function turningPerMm(P, step = ORDER_DEFAULTS.stepMm) {
  const L = pathLength(P);
  if (L <= 0 || P.length < 3) return 0;
  const Q = resample(P, Math.min(step, L / 2));
  let turn = 0;
  for (let k = 1; k < Q.length - 1; k++) {
    const ax = Q[k][0] - Q[k - 1][0], ay = Q[k][1] - Q[k - 1][1], bx = Q[k + 1][0] - Q[k][0], by = Q[k + 1][1] - Q[k][1];
    if (Math.hypot(ax, ay) < 1e-9 || Math.hypot(bx, by) < 1e-9) continue;
    turn += Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
  }
  return turn * 180 / Math.PI / L;
}

/** A stroke pulled the way a hand pulls it: downward if it runs more up-down than across, else left to right. */
export function pullDirection(P) {
  const a = P[0], b = P[P.length - 1], dx = b[0] - a[0], dy = b[1] - a[1];
  const wrong = Math.abs(dy) > Math.abs(dx) ? dy < 0 : dx < 0;
  return wrong ? [...P].reverse() : P;
}

/** Ends that lie within `touch` mm of another stroke's line (a coarse grid of all strokes' points). */
function attachedEnds(strokes, touch) {
  const cell = Math.max(touch, 1e-6), grid = new Map(), key = (i, j) => `${i},${j}`;
  strokes.forEach((P, s) => resample(P, touch / 2).forEach(q => {
    const k = key(Math.floor(q[0] / cell), Math.floor(q[1] / cell));
    if (!grid.has(k)) grid.set(k, []); grid.get(k).push([q[0], q[1], s]);
  }));
  const near = (q, s) => {
    const ci = Math.floor(q[0] / cell), cj = Math.floor(q[1] / cell);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++)
      for (const r of grid.get(key(i, j)) ?? []) if (r[2] !== s && Math.hypot(r[0] - q[0], r[1] - q[1]) <= touch) return true;
    return false;
  };
  return strokes.map((P, s) => (near(P[0], s) ? 1 : 0) + (near(P[P.length - 1], s) ? 1 : 0));
}

/**
 * The level of each stroke (1, 2 or 3) from its length, straightness and enclosure.
 * @param strokes arrays of [x, y] points in mm
 * @param sheetMm the sheet's width in mm
 */
export function strokeLevels(strokes, sheetMm, o = {}) {
  const c = { ...ORDER_DEFAULTS, ...o }, ends = attachedEnds(strokes, c.touchMm);
  return strokes.map((P, s) => {
    const L = pathLength(P), turn = turningPerMm(P, c.stepMm);
    const closed = P.length > 2 && dist(P[0], P[P.length - 1]) <= Math.max(c.touchMm, 0.05 * L);
    if (L >= c.longShare * sheetMm && turn <= c.smoothDegPerMm) return 1;
    if (L >= c.midMm && turn <= c.midDegPerMm && (ends[s] > 0 || closed)) return 2;
    return 3;
  });
}

/**
 * The strokes in drawing order: level by level, each pulled its hand's way, the nearest next start from where the pen
 * lifted (the first from the sheet's top left). Returns [{ index, level, points }] with points in the pulled direction.
 */
export function orderStrokes(strokes, sheetMm, o = {}) {
  const levels = strokeLevels(strokes, sheetMm, o), out = [];
  let pen = [0, 0];
  for (const lv of [1, 2, 3]) {
    const left = strokes.map((P, i) => ({ i, P: pullDirection(P) })).filter(r => levels[r.i] === lv);
    const used = new Uint8Array(left.length);
    for (let n = 0; n < left.length; n++) {
      let best = -1, bd = Infinity;
      for (let k = 0; k < left.length; k++) {
        if (used[k]) continue;
        const d = dist(pen, left[k].P[0]);
        if (d < bd || (d === bd && left[k].i < left[best].i)) { bd = d; best = k; }
      }
      used[best] = 1;
      const r = left[best];
      out.push({ index: r.i, level: lv, points: r.P });
      pen = r.P[r.P.length - 1];
    }
  }
  return out;
}

/** Hand travel between consecutive strokes (end of one to start of the next), in the strokes' unit. */
export function handTravel(ordered) {
  return ordered.slice(1).map((r, k) => dist(ordered[k].points[ordered[k].points.length - 1], r.points[0]));
}
