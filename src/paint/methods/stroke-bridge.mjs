// Pipeline: inking, stage 3a (before the order). A traced drawing breaks a line a person pulls in one go into dashes: a
// course line of a wall, a kerb, a paving joint drawn as five pieces with gaps. Pieces that run on along one line across a
// small gap are one stroke: the ends face each other, the gap runs along both, the second piece starts on the first one's
// line (not beside it), and the two are drawn alike (weight, width). The gap is inked: the hand pulls through it.
// Pure: arrays in, arrays out. Coordinates in mm.

const BRIDGE_DEFAULTS = Object.freeze({
  gapMm: 10,        // the widest gap bridged ...
  gapShare: 1.5,   // ... and no wider than this share of the two pieces' length together (two crumbs far apart stay apart)
  minMm: 1.2,       // a piece shorter than this has no direction to continue; it is not bridged
  cos: 0.94,        // each end's direction and the gap within 20 degrees of one line
  sideMm: 0.8,      // the second piece starts within this of the first one's line ...
  sideShare: 0.15,  // ... plus this share of the gap
  weightDiff: 0.6,  // the two pieces' darkness (0..1) within this
  widthRatio: 3,    // and their widths within this ratio
  reachMm: 4,       // an end's direction is read over this length
  overlapMm: 2,     // two pieces of one line that overlap end to end by up to this (side by side within sideMm) are joined too
});

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lengthOf = P => P.reduce((s, q, k) => (k ? s + dist(P[k - 1], q) : 0), 0);

// the unit direction out of a path's end (`atStart`: out of its first point), read over `reach` mm
function outward(P, atStart, reach) {
  const Q = atStart ? P : [...P].reverse(), a = Q[0];
  let b = Q[1], s = 0;
  for (let k = 1; k < Q.length; k++) { s += dist(Q[k - 1], Q[k]); b = Q[k]; if (s >= reach) break; }
  const d = dist(a, b) || 1;
  return [(a[0] - b[0]) / d, (a[1] - b[1]) / d];
}

/**
 * Pieces that continue one another across a small gap, chained.
 * @param strokes arrays of [x, y] in mm
 * @param o options (BRIDGE_DEFAULTS), and `weights`, `widths` (per stroke) and `skip` (per stroke: true leaves it alone,
 *          e.g. strokes laid along dense ink)
 * @returns { strokes: [{ points, parts }], bridges: number of gaps bridged, bridgedMm: their total length }
 */
export function bridgeGaps(strokes, o = {}) {
  const c = { ...BRIDGE_DEFAULTS, ...o }, n = strokes.length, len = strokes.map(lengthOf);
  const ok = i => strokes[i].length >= 2 && len[i] >= c.minMm && !(c.skip && c.skip[i]);
  const ends = [];
  for (let i = 0; i < n; i++) if (ok(i)) for (const start of [true, false]) ends.push({ i, start, p: start ? strokes[i][0] : strokes[i].at(-1), d: outward(strokes[i], start, c.reachMm) });
  const g = c.gapMm, grid = new Map(), key = (x, y) => `${Math.floor(x / g)},${Math.floor(y / g)}`;
  ends.forEach((e, k) => { const q = key(...e.p); (grid.get(q) ?? grid.set(q, []).get(q)).push(k); });
  const pairs = [];
  ends.forEach((A, a) => {
    const i0 = Math.floor(A.p[0] / g), j0 = Math.floor(A.p[1] / g);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const b of grid.get(`${i},${j}`) ?? []) {
      if (b <= a) continue;
      const B = ends[b];
      if (A.i === B.i) continue;
      const gap = dist(A.p, B.p);
      if (gap > c.gapMm || gap > c.gapShare * (len[A.i] + len[B.i])) continue;
      // the ends face each other: A runs out along A.d, B's outward direction is the opposite
      if (-(A.d[0] * B.d[0] + A.d[1] * B.d[1]) < c.cos) continue;
      // B starts on A's line: its offset across A's direction; ahead of A's end, or overlapping it a little
      const along = (B.p[0] - A.p[0]) * A.d[0] + (B.p[1] - A.p[1]) * A.d[1], side = Math.abs(-(B.p[0] - A.p[0]) * A.d[1] + (B.p[1] - A.p[1]) * A.d[0]);
      if (along < -c.overlapMm || side > c.sideMm + c.sideShare * Math.max(0, along)) continue;
      if (along > 0.5) {
        const u = [(B.p[0] - A.p[0]) / gap, (B.p[1] - A.p[1]) / gap];
        if (A.d[0] * u[0] + A.d[1] * u[1] < c.cos || -(B.d[0] * u[0] + B.d[1] * u[1]) < c.cos) continue;
      }
      if (c.weights && Math.abs((c.weights[A.i] ?? 1) - (c.weights[B.i] ?? 1)) > c.weightDiff) continue;
      if (c.widths) { const wa = c.widths[A.i] || 1, wb = c.widths[B.i] || 1; if (Math.max(wa, wb) / Math.min(wa, wb) > c.widthRatio) continue; }
      const turn = Math.acos(Math.min(1, -(A.d[0] * B.d[0] + A.d[1] * B.d[1])));
      pairs.push([gap + 4 * turn, a, b, gap]);
    }
  });
  pairs.sort((x, y) => x[0] - y[0]);
  const root = Array.from({ length: n }, (_, i) => i), find = i => (root[i] === i ? i : (root[i] = find(root[i])));
  const used = new Set(), link = new Map();
  let bridges = 0, bridgedMm = 0;
  for (const [, a, b, gap] of pairs) {
    if (used.has(a) || used.has(b)) continue;
    const A = ends[a], B = ends[b];
    if (find(A.i) === find(B.i)) continue;
    used.add(a); used.add(b); root[find(A.i)] = find(B.i);
    link.set(`${A.i}:${A.start}`, B); link.set(`${B.i}:${B.start}`, A);
    bridges++; bridgedMm += gap;
  }
  const done = new Uint8Array(n), out = [];
  for (let i = 0; i < n; i++) {
    if (done[i]) continue;
    if (!link.has(`${i}:true`) && !link.has(`${i}:false`)) { done[i] = 1; out.push({ points: strokes[i], parts: [i] }); continue; }
    // walk back to a free end, then forward along the chain
    let cur = i, fromStart = true, guard = 0;
    for (;;) { const nx = link.get(`${cur}:${fromStart}`); if (!nx || guard++ > n) break; cur = nx.i; fromStart = !nx.start; }
    const parts = [], pts = [];
    let at = cur, enter = fromStart;
    while (at != null && !done[at]) {
      done[at] = 1; parts.push(at);
      let P = enter ? strokes[at] : [...strokes[at]].reverse();
      // where the pieces overlap, the next one starts where it passes the last one's end (no step back)
      if (pts.length >= 2) {
        const e = pts.at(-1), q = pts[Math.max(0, pts.length - 4)], L = dist(e, q) || 1, d = [(e[0] - q[0]) / L, (e[1] - q[1]) / L];
        let k = 0; while (k < P.length - 1 && (P[k][0] - e[0]) * d[0] + (P[k][1] - e[1]) * d[1] <= 0.05) k++;
        P = P.slice(k);
      }
      pts.push(...P);
      const nx = link.get(`${at}:${!enter}`);
      if (!nx) break;
      at = nx.i; enter = nx.start;
    }
    out.push({ points: pts, parts });
  }
  return { strokes: out, bridges, bridgedMm };
}
