// --drawinglogic 2: the walker's long connected gestures (gestures.mjs) redrawn on the drawing file's own lines and widths.
// The walker is run but not drawn; a walk with no file line under it never reaches the paper.
// File lines no gesture uses are left to the closing pen's toning. DOM free, no file IO.
import { pathLength } from '../../crop/inktiers.mjs';

const resample = (P, step) => {
  const out = [P[0]];
  for (let k = 1; k < P.length; k++) {
    const a = P[k - 1], b = P[k], L = Math.hypot(b.x - a.x, b.y - a.y), m = Math.max(1, Math.ceil(L / step));
    for (let q = 1; q <= m; q++) out.push({ x: a.x + (b.x - a.x) * q / m, y: a.y + (b.y - a.y) * q / m });
  }
  return out;
};
const tangent = (P, k) => {
  const a = P[Math.max(0, k - 2)], b = P[Math.min(P.length - 1, k + 2)], m = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / m, y: (b.y - a.y) / m };
};

/** The length of a path that runs between bridged points. */
const bridgedLength = P => { let L = 0; for (let k = 1; k < P.length; k++) if (P[k].bridged || P[k - 1].bridged) L += Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y); return L; };

/** Every file point in buckets of `cell` cells, with its line, index and tangent. */
function indexLines(lines, cell) {
  const grid = new Map();
  lines.forEach((g, li) => g.points.forEach((q, k) => {
    const key = `${Math.floor(q.x / cell)},${Math.floor(q.y / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push({ li, k, x: q.x, y: q.y, t: tangent(g.points, k) });
  }));
  return { grid, cell };
}
function nearest(I, p, t, reach, par, owner, li0, gi, stay) {
  const cx = Math.floor(p.x / I.cell), cy = Math.floor(p.y / I.cell), r = Math.ceil(reach / I.cell);
  let best = null, bd = reach;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    for (const e of I.grid.get(`${cx + dx},${cy + dy}`) ?? []) {
      if (Math.abs(e.t.x * t.x + e.t.y * t.y) < par) continue;
      if (owner[e.li] >= 0 && owner[e.li] !== gi) continue;
      // staying on the line already being followed beats hopping to a neighbour a little nearer
      const d = Math.hypot(e.x - p.x, e.y - p.y) - (li0 != null && e.li === li0 ? stay : 0);
      if (d < bd) { bd = d; best = e; }
    }
  }
  return best;
}

/**
 * Each walker gesture collects the file lines within `reach` cells and roughly parallel, in walk order.
 * A gap the walk crosses in up to `bridge` cells is bridged; a longer one ends the gesture.
 * @param walker  the walker's gestures [{ points }] in plan cells, in the order it found them
 * @param lines   the file's lines on the same grid, with per-point width and weight
 * @param field   the ridge field the walker read (w by h); pressure is its value over its 95th percentile under the walk
 * @returns { gestures: [{ points: [{x, y, s, width}] }], used: Set of line indices }
 */
export function walkOnLines(walker, lines, field, w, h, { reach = 3, par = 0.7, bridge = 8, minLen = 6, cover = 0.5, extend = 6, sFloor = 0.25, smooth = 9, support = 0.5, stay = 2 } = {}) {
  const at = (x, y) => field[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  const vals = []; for (const g of walker) for (const q of g.points) vals.push(at(q.x, q.y));
  vals.sort((a, b) => a - b);
  const peak = vals.length ? Math.max(1e-4, vals[Math.floor(0.95 * (vals.length - 1))]) : 1;
  const sOf = (x, y) => Math.max(sFloor, Math.min(1, at(x, y) / peak));
  const I = indexLines(lines, Math.max(2, reach)), owner = new Int32Array(lines.length).fill(-1);
  const out = [];
  walker.forEach((g, gi) => {
    if (g.points.length < 2) return;
    const P = resample(g.points, 1);
    // the walk, point by point: which file point it lies on, if any
    const hits = []; let li0 = null;
    for (let k = 0; k < P.length; k++) {
      const e = nearest(I, P[k], tangent(P, k), reach, par, owner, li0, gi, stay);
      hits.push(e ? { ...e, s: sOf(P[k].x, P[k].y), wk: k } : null);
      li0 = e ? e.li : li0;
    }
    // runs on one line, in the walk's order; each becomes that line's points between the run's first and last index
    const runs = [];
    for (const e of hits) {
      if (!e) continue;
      const r = runs[runs.length - 1];
      const direction = r ? Math.sign(e.k - r.k1) : 0;
      if (r && r.li === e.li && e.wk - r.wk1 <= bridge && (!r.direction || !direction || direction === r.direction)) {
        r.direction ||= direction; r.k1 = e.k; r.wk1 = e.wk; r.s.push([e.k, e.s]);
      } else runs.push({ li: e.li, k0: e.k, k1: e.k, wk0: e.wk, wk1: e.wk, direction: 0, s: [[e.k, e.s]] });
    }
    // A looping walker can visit a file contour repeatedly. Keep its longest
    // monotone visit instead of drawing out-and-back knots on the same contour.
    const longest = new Map();
    for (const r of runs) {
      r.span = pathLength(lines[r.li].points.slice(Math.min(r.k0, r.k1), Math.max(r.k0, r.k1) + 1));
      if (!longest.has(r.li) || r.span > longest.get(r.li).span) longest.set(r.li, r);
    }
    const uniqueRuns = runs.filter(r => longest.get(r.li) === r);
    let cur = [], claimed = [];
    // a gesture mostly made of bridges is the walk's own path again, and is not drawn; a gesture that is not drawn
    // gives its lines back, so the closing pen still draws them
    const flush = () => {
      const L = cur.length >= 2 ? pathLength(cur) : 0, on = L ? L - bridgedLength(cur) : 0;
      if (L >= minLen && on >= support * L) out.push({ points: cur, walker: gi, lines: claimed });
      else for (const li of claimed) owner[li] = -1;
      cur = []; claimed = [];
    };
    uniqueRuns.forEach((r, ri) => {
      const L = lines[r.li].points, fwd = r.k1 >= r.k0;
      let a = r.k0, b = r.k1;
      // a run that covers most of its line takes the ends the walk just missed
      const lineLen = lines[r.li].length ?? pathLength(L);
      const span = pathLength(L.slice(Math.min(a, b), Math.max(a, b) + 1));
      if (span < cover * lineLen && span < minLen) return;
      if (span >= cover * lineLen) {
        const head = pathLength(L.slice(0, Math.min(a, b) + 1)), tail = pathLength(L.slice(Math.max(a, b)));
        if (head <= extend) { if (fwd) a = 0; else b = 0; }
        if (tail <= extend) { if (fwd) b = L.length - 1; else a = L.length - 1; }
      }
      // a line the walk drew any of is this gesture's; the closing pen does not draw it again
      if (owner[r.li] !== gi) claimed.push(r.li);
      owner[r.li] = gi;
      const ks = []; for (let k = a; fwd ? k <= b : k >= b; k += fwd ? 1 : -1) ks.push(k);
      const sAt = k => { const S = r.s; if (S.length === 1) return S[0][1]; let lo = S[0], hi = S[S.length - 1];
        for (const p of S) { if ((fwd ? p[0] <= k : p[0] >= k) && Math.abs(p[0] - k) <= Math.abs(lo[0] - k)) lo = p; if ((fwd ? p[0] >= k : p[0] <= k) && Math.abs(p[0] - k) <= Math.abs(hi[0] - k)) hi = p; }
        return lo[0] === hi[0] ? lo[1] : lo[1] + (hi[1] - lo[1]) * (k - lo[0]) / (hi[0] - lo[0]); };
      const seg = ks.map(k => ({ ...L[k], s: sAt(k) }));
      const prev = uniqueRuns[ri - 1];
      if (cur.length) {
        const gapWalk = r.wk0 - (prev ? prev.wk1 : r.wk0), end = cur[cur.length - 1], d = Math.hypot(seg[0].x - end.x, seg[0].y - end.y);
        // the walk carries on through a short gap: its own path there, smoothed hard (a moving mean over `smooth`
        // points) and pinned to the two ends, so the gesture goes on round the form without the walk's wobble
        if (gapWalk <= bridge && d <= bridge) {
          const W = P.slice(prev.wk1, r.wk0 + 1), n = W.length, half = Math.max(smooth >> 1, n >> 2);
          const sm = W.map((_, i) => { let x = 0, y = 0, c = 0; for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) { x += W[j].x; y += W[j].y; c++; } return { x: x / c, y: y / c }; });
          const o0 = { x: end.x - sm[0].x, y: end.y - sm[0].y }, o1 = { x: seg[0].x - sm[n - 1].x, y: seg[0].y - sm[n - 1].y };
          for (let q = 1; q < n - 1; q++) {
            const u = q / (n - 1);
            cur.push({ x: sm[q].x + o0.x * (1 - u) + o1.x * u, y: sm[q].y + o0.y * (1 - u) + o1.y * u, s: end.s + (seg[0].s - end.s) * u,
              width: end.width != null && seg[0].width != null ? 0.8 * (end.width + (seg[0].width - end.width) * u) : undefined, weight: end.weight, bridged: true });
          }
        } else flush();
      }
      cur.push(...seg);
    });
    flush();
  });
  const used = new Set(); owner.forEach((o, i) => { if (o >= 0) used.add(i); });
  return { gestures: out, used, peak };
}

/** Median of the lengths of gestures, and their count, for the log. */
export function gestureStats(gs) {
  const L = gs.map(g => g.length ?? pathLength(g.points)).sort((a, b) => a - b);
  return { n: L.length, median: L.length ? L[Math.floor(L.length / 2)] : 0, total: L.reduce((a, b) => a + b, 0) };
}

/**
 * Pressure, speed and pauses along a hybrid gesture, so the pen's own physics makes the line. The file's width becomes
 * a pressure target through the nib law (contact = nib + flex x p, p = 0.25 + 0.6 s), mixed with the walker's.
 * Speed is fast on a straight run, slow into turns and at the ends; the pen rests where it lands, lifts and turns hard.
 *
 * @param nib,flex   the pen's (paint-plate's PEN) in the gesture's cells
 * @param mix        the file width's share of the pressure; the rest is the walker's
 * @param fast,slow  the speeds on a straight run and at a hard turn
 * @param land,lift,turnDwell  the rests at the start, the end and a hard turn, in the pen's time units
 */
export function shapeHybrid(g, { want = 1, inLen = 3, outLen = 5, start = 0.45, end = 0.3, gain = 1.39, margin = 0.42, nib = 0.8, flex = 1.5,
  mix = 0.6, fast = 2.4, slow = 0.6, slowEnds = 4, land = 1.2, lift = 0.6, turnDwell = 0.5, hardTurn = 0.9,
  pressureFloor=.25, pressureGain=.6, pressureExponent=1 } = {}) {
  const P = g.points, n = P.length, s = [0];
  for (let k = 1; k < n; k++) s.push(s[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y));
  const L = s[n - 1] || 1, tin = Math.min(inLen, 0.25 * L), tout = Math.min(outLen, 0.3 * L), ease = u => u * u * (3 - 2 * u);
  const env = d => Math.min(tin > 0 && d < tin ? start + (1 - start) * ease(d / tin) : 1, tout > 0 && L - d < tout ? end + (1 - end) * ease((L - d) / tout) : 1);
  // the turn at each point, read over about two cells either side
  const turn = k => {
    let a = k, b = k; while (a > 0 && s[k] - s[a] < 2) a--; while (b < n - 1 && s[b] - s[k] < 2) b++;
    if (a === k || b === k) return 0;
    let t = Math.atan2(P[b].y - P[k].y, P[b].x - P[k].x) - Math.atan2(P[k].y - P[a].y, P[k].x - P[a].x);
    while (t > Math.PI) t -= 2 * Math.PI; while (t < -Math.PI) t += 2 * Math.PI;
    return Math.abs(t);
  };
  const points = [];
  let lastDwell = -Infinity;
  for (let k = 0; k < n; k++) {
    const q = P[k], e = env(s[k]), tk = turn(k);
    const contactShare=q.width!=null?Math.max(0,Math.min(1,(q.width*gain-margin-nib)/flex)):null;
    const sWidth = contactShare!=null ? Math.max(0, Math.min(1, (contactShare**(1/pressureExponent)-pressureFloor)/pressureGain)) : q.s ?? 1;
    const share = Math.min(1, want * e * (mix * sWidth + (1 - mix) * (q.s ?? 1)));
    const nearEnd = Math.min(s[k], L - s[k]) < slowEnds ? 1 - Math.min(s[k], L - s[k]) / slowEnds : 0;
    const bend = Math.min(1, tk / hardTurn);
    const v = Math.max(slow, fast - (fast - slow) * Math.max(bend, nearEnd)) * (1.15 - 0.3 * share);
    const o = { x: q.x, y: q.y, s: share, v };
    if (k === 0) o.dwell = land;
    else if (k === n - 1) o.dwell = lift;
    else if (tk >= hardTurn && s[k] - lastDwell > 4) { o.dwell = turnDwell; lastDwell = s[k]; }
    // a dwell point holds the pen and is not a step of the path (penStroke draws no segment into or out of it), so
    // the same point goes in as a step on either side
    if (o.dwell && k > 0) points.push({ x: q.x, y: q.y, s: share, v });
    points.push(o);
    if (o.dwell && k < n - 1) points.push({ x: q.x, y: q.y, s: share, v });
  }
  return { ...g, points };
}
