// Pipeline: drawing, stage 3c (the hand that lays a traced pencil drawing). DOM free, no file IO.
// A traced drawing gives where the lines go, one clean line each. A person drawing it in pencil does not rule those lines:
// the big masses are placed first with a few very light long marks; a long contour is found in two or three overlapping
// pulls that do not quite coincide, the odd one searched twice; a line may run a little past its corner; and a few firm
// lines are restated darker, late. One setting, `finish`, sets how much of this the hand does: tight lays the lines as
// given, medium a little, loose the most. Every rule is general: nothing reads what the subject is.
// Lines are { points: [[x, y]], weights?, weight?, seq?, object?, part? } in the file's pixels; `pxMm` is a pixel in mm.

export const FINISH = Object.freeze({
  tight: { splitMm: Infinity, pulls: 1, overlapMm: 0, driftMm: 0, searchShare: 0, overshootMm: 0, overshootShare: 0, construction: 0, restateShare: 0 },
  medium: { splitMm: 30, pulls: 2, overlapMm: 2.5, driftMm: 0.2, searchShare: 0.08, overshootMm: 0.8, overshootShare: 0.25, construction: 2, restateShare: 0.05 },
  loose: { splitMm: 14, pulls: 3, overlapMm: 3.5, driftMm: 0.4, searchShare: 0.25, overshootMm: 1.6, overshootShare: 0.5, construction: 4, restateShare: 0.1 },
});
/** The pressure of a construction mark and of a searching pass, as a share of the drawing's firmest line. */
const CONSTRUCTION_WEIGHT = 0.18, SEARCH_WEIGHT = 0.45, RESTATE_GAIN = 1.35;

/** A small seeded generator (mulberry32), so a drawing is laid the same way every time. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cum = P => P.reduce((s, q, k) => (s.push(k ? s[k - 1] + dist(P[k - 1], q) : 0), s), []);

/** The part of a polyline between arc lengths a and b (clamped), with its weights. */
function slice(P, W, a, b) {
  const s = cum(P), L = s.at(-1), lo = Math.max(0, a), hi = Math.min(L, b), out = [], ow = [];
  const at = t => { let k = 1; while (k < P.length - 1 && s[k] < t) k++; const u = (t - s[k - 1]) / (s[k] - s[k - 1] || 1); return [[P[k - 1][0] + (P[k][0] - P[k - 1][0]) * u, P[k - 1][1] + (P[k][1] - P[k - 1][1]) * u], W ? W[k - 1] + (W[k] - W[k - 1]) * u : null]; };
  const [p0, w0] = at(lo); out.push(p0); ow.push(w0);
  for (let k = 0; k < P.length; k++) if (s[k] > lo && s[k] < hi) { out.push(P[k]); ow.push(W ? W[k] : null); }
  const [p1, w1] = at(hi); out.push(p1); ow.push(w1);
  return { points: out, weights: W ? ow : null };
}

/** Each point moved sideways by a slow drift (one or two half waves along the pull), at most `amp` pixels. */
function drift(P, amp, rand) {
  if (!(amp > 0) || P.length < 2) return P.map(p => [...p]);
  const s = cum(P), L = s.at(-1) || 1, phase = rand() * Math.PI, waves = 0.5 + rand(), sign = rand() < 0.5 ? -1 : 1, base = (rand() - 0.5) * amp;
  return P.map((p, k) => {
    const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], n = dist(a, b) || 1, nx = -(b[1] - a[1]) / n, ny = (b[0] - a[0]) / n;
    const d = base + sign * 0.5 * amp * Math.sin(phase + Math.PI * waves * s[k] / L);
    return [p[0] + nx * d, p[1] + ny * d];
  });
}

/** The line run on past either end along its own direction by `px` pixels (an end chosen by `ends`: 'start', 'end', 'both'). */
function overshoot(P, W, px, ends) {
  const out = P.map(p => [...p]), ow = W ? [...W] : null;
  const run = (a, b) => { const n = dist(a, b) || 1; return [b[0] + (b[0] - a[0]) / n * px, b[1] + (b[1] - a[1]) / n * px]; };
  const back = k => P[Math.max(0, Math.min(P.length - 1, k))];
  if (ends !== 'start' && P.length >= 2) { out.push(run(back(P.length - 4), P.at(-1))); ow?.push(ow.at(-1) * 0.6); }
  if (ends !== 'end' && P.length >= 2) { out.unshift(run(back(3), P[0])); ow?.unshift(ow[0] * 0.6); }
  return { points: out, weights: ow };
}

/** A light mark placing a mass: an ellipse of the object's points (two standard deviations), as two sweeping arcs, and its long axis. */
function massMarks(P, rand, pxMm) {
  const n = P.length, mx = P.reduce((s, p) => s + p[0], 0) / n, my = P.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0; for (const [x, y] of P) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  sxx /= n; syy /= n; sxy /= n;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = Math.max(0, tr - l1), th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const a = 2 * Math.sqrt(l1), b = 2 * Math.sqrt(l2), c = Math.cos(th), s = Math.sin(th);
  const pt = (u, k = 1) => [mx + k * (a * Math.cos(u) * c - b * Math.sin(u) * s), my + k * (a * Math.cos(u) * s + b * Math.sin(u) * c)];
  // each arc is a little larger or smaller than the ellipse, and swells once along its sweep: a hand's arc, not a ruled one
  const arc = (u0, u1) => { const m = Math.max(8, Math.round(Math.abs(u1 - u0) * a / (2 / pxMm))), k0 = 0.96 + 0.08 * rand(), sw = 0.03 * (rand() - 0.5); return Array.from({ length: m + 1 }, (_, i) => pt(u0 + (u1 - u0) * i / m, k0 + sw * Math.sin(Math.PI * i / m))); };
  const u = rand() * 2 * Math.PI;
  return [arc(u, u + 2.6 + 0.4 * rand()), arc(u + Math.PI, u + Math.PI + 2.4 + 0.4 * rand()), [pt(0, 1.05), pt(Math.PI, 1.05)]];
}

/**
 * The drawing as a hand lays it at `finish` (FINISH key). Keeps the given order (`seq`, else file order), puts the
 * construction marks first and the restatements last, and numbers every stroke again. Each stroke keeps `object` and
 * `part`; added strokes say what they are in `hand` (construction, pull, search, restate).
 * @returns {{ lines, stats }}
 */
export function layByHand(lines, { finish = 'medium', pxMm, seed = 1 } = {}) {
  const f = FINISH[finish];
  if (!f) throw new Error(`pencil hand: finish must be one of ${Object.keys(FINISH).join(', ')}`);
  if (!(pxMm > 0)) throw new Error('pencil hand: pxMm must be positive');
  const rand = rng(seed), mm = v => v / pxMm;
  const order = [...lines].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const main = [], late = [], first = [];
  const firm = order.map(g => g.weight ?? 1).sort((a, b) => a - b), firmCut = firm[Math.floor(0.8 * (firm.length - 1))] ?? 1;
  for (const g of order) {
    const P = g.points, W = g.weights ?? null, L = cum(P).at(-1);
    const keep = { ...g }; delete keep.points; delete keep.weights; delete keep.seq;
    // the ends run on a little past where the line stops
    let base = { points: P, weights: W };
    if (f.overshootShare > 0 && rand() < f.overshootShare && L > mm(3)) base = overshoot(P, W, mm(f.overshootMm) * (0.5 + rand()), ['start', 'end', 'both'][Math.floor(rand() * 3)]);
    const BL = cum(base.points).at(-1);
    // a long line found in overlapping pulls, each drifting a little off the line
    const pulls = BL > mm(f.splitMm) ? Math.min(f.pulls, Math.max(2, Math.round(BL / mm(f.splitMm)))) : 1;
    const step = BL / pulls;
    for (let k = 0; k < pulls; k++) {
      const a = k ? k * step - mm(f.overlapMm) * (0.5 + 0.5 * rand()) : 0, b = k < pulls - 1 ? (k + 1) * step + mm(f.overlapMm) * 0.3 * rand() : BL;
      const piece = pulls > 1 ? slice(base.points, base.weights, a, b) : base;
      main.push({ ...keep, points: drift(piece.points, mm(f.driftMm), rand), ...(piece.weights ? { weights: piece.weights } : {}), hand: pulls > 1 ? 'pull' : 'line' });
    }
    // the odd contour searched twice: a lighter pass beside the first
    if (f.searchShare > 0 && L > mm(6) && rand() < f.searchShare) {
      const w = (g.weight ?? 1) * SEARCH_WEIGHT;
      main.push({ ...keep, points: drift(P, mm(f.driftMm) * 2, rand), weights: P.map(() => w), weight: w, hand: 'search' });
    }
    // a firm line restated darker over its middle, late
    if (f.restateShare > 0 && (g.weight ?? 1) >= firmCut && L > mm(4) && rand() < 2 * f.restateShare) {
      const piece = slice(P, W, L * (0.15 + 0.15 * rand()), L * (0.7 + 0.2 * rand())), w = Math.min(1, (g.weight ?? 1) * RESTATE_GAIN);
      late.push({ ...keep, points: drift(piece.points, mm(f.driftMm) * 0.5, rand), weights: piece.points.map(() => w), weight: w, hand: 'restate' });
    }
  }
  // the big masses placed first: the largest objects by their points' spread, a few very light sweeping marks each
  if (f.construction > 0) {
    const byObj = new Map();
    for (const g of order) { const o = g.object ?? -1; if (o < 0) continue; if (!byObj.has(o)) byObj.set(o, []); byObj.get(o).push(...g.points); }
    const spread = P => { const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };
    const big = [...byObj.entries()].filter(([, P]) => P.length >= 20).sort((a, b) => spread(b[1]) - spread(a[1])).slice(0, f.construction);
    for (const [o, P] of big) for (const pts of massMarks(P, rand, pxMm)) first.push({ points: pts, weights: pts.map(() => CONSTRUCTION_WEIGHT), weight: CONSTRUCTION_WEIGHT, object: o, part: 'construction', role: 'pencil stroke', hand: 'construction' });
  }
  const out = [...first, ...main, ...late].map((g, seq) => ({ ...g, points: g.points.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]), ...(g.weights ? { weights: g.weights.map(v => +(+v).toFixed(3)) } : {}), seq }));
  const count = h => out.filter(g => g.hand === h).length;
  return { lines: out, stats: { finish, given: lines.length, strokes: out.length, construction: count('construction'), pulls: count('pull'), search: count('search'), restate: count('restate') } };
}

/** Mean and 90th percentile distance (mm) from each laid point of the drawing's own lines (construction left out) to the given lines. */
export function placementMm(laid, given, pxMm) {
  const cell = 4, grid = new Map(), key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  for (const g of given) for (let k = 1; k < g.points.length; k++) {
    const a = g.points[k - 1], b = g.points[k], n = Math.max(1, Math.ceil(dist(a, b) / 0.5));
    for (let i = 0; i <= n; i++) { const p = [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n], q = key(...p); if (!grid.has(q)) grid.set(q, []); grid.get(q).push(p); }
  }
  const d = [];
  for (const g of laid) if (g.hand !== 'construction') for (const p of g.points) {
    let best = Infinity; const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell);
    for (let r = 0; r <= 8 && best > r * cell; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      for (const q of grid.get(`${cx + dx},${cy + dy}`) ?? []) best = Math.min(best, dist(p, q));
    }
    d.push(Math.min(best, 8 * cell) * pxMm);
  }
  d.sort((a, b) => a - b);
  return { meanMm: d.reduce((s, v) => s + v, 0) / (d.length || 1), p90Mm: d[Math.floor(0.9 * (d.length - 1))] ?? 0 };
}
