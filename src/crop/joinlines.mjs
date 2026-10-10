// Join fragments that continue one another into one line. Two fragments join when the end of one points at the
// start of the other, their tangents agree and neither turns sharply, so a column is not stitched to the arch
// behind it. DOM free.

/** The unit tangent at an end of a polyline over `span` points: enough to ignore one jittery point, few enough
 *  that a curve's chord still reads as its tangent. */
function tangentAt(pts, atStart, span = 2) {
  const n = pts.length, k = Math.max(1, Math.min(span, n - 1));
  const a = atStart ? pts[k] : pts[n - 1 - k], b = atStart ? pts[0] : pts[n - 1];
  const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy);
  return m > 1e-6 ? { x: dx / m, y: dy / m } : { x: 1, y: 0 };
}

const dot = (a, b) => a.x * b.x + a.y * b.y;

/**
 * Join gesture fragments that continue one another.
 *
 * @param gestures  [{ pts | points: [{x, y, ...}], ... }] or [[{x, y}]]
 * @param gap       the widest gap in cells that may be bridged
 * @param cos       how closely the two tangents must agree, as a cosine (0.94 is about twenty degrees)
 * @param aim       how closely each tangent must point along the gap itself, as a cosine; this is the test that keeps
 *                  two parallel lines lying side by side from being stitched end to end
 * @param maxJoins  a cap, so one bad pair cannot cascade
 * @returns { gestures, joined } with each joined pair replaced by one gesture carrying a straight bridge between them
 */
export function joinLines(gestures, { gap = 12, cos = 0.94, aim = 0.9, maxJoins = Infinity, step = 2, explain = 0 } = {}) {
  // gestures carry their points as `points`; the crop tools use `pts`. Read either, write back the one it came with.
  const key = gestures.find(g => g && !Array.isArray(g) && g.points) ? 'points' : 'pts';
  const items = gestures.map(g => (Array.isArray(g) ? { pts: g } : { ...g, pts: g.points ?? g.pts })).filter(g => g.pts && g.pts.length >= 2);
  const ends = [];
  items.forEach((g, i) => {
    ends.push({ i, start: true, p: g.pts[0], t: tangentAt(g.pts, true) });
    ends.push({ i, start: false, p: g.pts[g.pts.length - 1], t: tangentAt(g.pts, false) });
  });

  // Every pair passing all three tests, cheapest first. `explain`: also record pairs within that many cells, with
  // their readings and the first gate that refused them.
  const pairs = [], candidates = [];
  for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) {
    const A = ends[a], B = ends[b];
    if (A.i === B.i) continue;
    const dx = B.p.x - A.p.x, dy = B.p.y - A.p.y, d = Math.hypot(dx, dy);
    if (!(d > 1e-6) || d > Math.max(gap, explain)) continue;
    // A's tangent points out of A's end; B's points out of B's end, so they face each other when their dot is -1
    const facing = -dot(A.t, B.t);
    const u = { x: dx / d, y: dy / d };
    // the gap must lie along both lines, not across them
    const aimA = dot(A.t, u), aimB = dot(B.t, { x: -u.x, y: -u.y });
    const gate = d > gap ? 'gap' : facing < cos ? 'cos' : Math.min(aimA, aimB) < aim ? 'aim' : 'ok';
    if (explain) candidates.push({ a: A.i, b: B.i, aStart: A.start, bStart: B.start, gap: d, cos: facing, aim: Math.min(aimA, aimB), gate, from: A.p, to: B.p });
    if (gate !== 'ok') continue;
    pairs.push({ a, b, cost: d * (2 - aimA) });
  }
  pairs.sort((p, q) => p.cost - q.cost);

  const usedEnd = new Uint8Array(ends.length);
  // one chain per fragment, so a join never doubles back into a fragment already in the same chain
  const chain = items.map((_, i) => i);
  const rootOf = i => { while (chain[i] !== i) i = chain[i] = chain[chain[i]]; return i; };
  const links = [];
  let joined = 0;
  for (const { a, b } of pairs) {
    if (joined >= maxJoins) break;
    if (usedEnd[a] || usedEnd[b]) continue;
    const ra = rootOf(ends[a].i), rb = rootOf(ends[b].i);
    if (ra === rb) continue;
    usedEnd[a] = usedEnd[b] = 1;
    chain[ra] = rb;
    links.push([a, b]);
    joined++;
  }
  const back = g => (key === 'points' ? { ...g, points: g.pts, pts: undefined } : g);
  if (!joined) return { gestures: gestures.filter(g => (Array.isArray(g) ? g.length : (g.points ?? g.pts)?.length) >= 2), joined: 0, candidates };

  // walk each chain from an unjoined end and lay its fragments out head to tail, bridging each gap
  const link = new Map();
  for (const [a, b] of links) { link.set(a, b); link.set(b, a); }
  const endIndex = (i, start) => 2 * i + (start ? 0 : 1);
  const done = new Uint8Array(items.length);
  const out = [];
  const bridge = (from, to) => {
    const d = Math.hypot(to.x - from.x, to.y - from.y), steps = Math.max(1, Math.round(d / step));
    const pts = [];
    for (let s = 1; s < steps; s++) { const u = s / steps; pts.push({ ...from, x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u }); }
    return pts;
  };
  for (let i = 0; i < items.length; i++) {
    if (done[i]) continue;
    const headFree = !usedEnd[endIndex(i, true)], tailFree = !usedEnd[endIndex(i, false)];
    if (headFree && tailFree) { out.push(back(items[i])); done[i] = 1; continue; }
    if (!headFree && !tailFree) continue;      // middle of a chain: reached from an end
    let cur = i, enter = headFree;             // entering at the free end, leaving by the other
    const pts = [];
    while (cur != null && !done[cur]) {
      done[cur] = 1;
      const seg = enter ? items[cur].pts : [...items[cur].pts].reverse();
      if (pts.length) pts.push(...bridge(pts[pts.length - 1], seg[0]));
      pts.push(...seg);
      const leaving = endIndex(cur, !enter);
      const nextEnd = link.get(leaving);
      if (nextEnd == null) break;
      const nx = ends[nextEnd];
      cur = nx.i; enter = nx.start;
    }
    out.push(back({ ...items[i], pts }));
  }
  // any fragment only reachable from inside a ring
  for (let i = 0; i < items.length; i++) if (!done[i]) { out.push(back(items[i])); done[i] = 1; }
  return { gestures: out, joined, candidates, links: links.map(([a, b]) => ({ from: ends[a].p, to: ends[b].p, a: ends[a].i, b: ends[b].i })) };
}
