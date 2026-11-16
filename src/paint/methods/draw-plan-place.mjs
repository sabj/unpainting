// Pipeline: inking, stage 1 (the drawing plan selects the model lines; gestures). The candidate pool is the line file
// the model-line path writes (the lineart models' fused map traced into lines, docs/ink.md): the plan decides which of
// those lines are drawn, as an artist picks the lines of a drawing; it does not place or trace any line itself, and the
// model's lines are the geometry. Pure: lines in, lines out. Distances are millimetres on the sheet.
//
// Select. A planned line claims a candidate line where the candidate runs within the plan's reach of the planned path
// and along it (within 45 degrees, either way round). Each point of a candidate belongs to at most one planned line, the
// nearest that claims it. The sheet's own edge is never claimed: a candidate point within the pen tracer's reach
// (3.7 mm) of the sheet's edge and running along it (pen-trace.mjs alongSheetEdge's test) belongs to no planned line.
// A claimed run is the run of one candidate's points one planned line claims, joined across a gap no longer than the
// tracer's reach. One stroke per edge: where two runs cover the same part of a planned line (a line model draws a thick
// mark's two sides as two lines), each part belongs to the nearer run, and a run that owns less than half of what it
// covers is left out.
// Gestures. The model's skeleton breaks a contour at every junction (median piece 2 mm), so the pieces of one named
// contour are drawn as one stroke: each run a planned line keeps loses the ends another run owns, and in order along
// the planned line each run continues the nearest open stroke whose end lies within the tracer's reach behind its start,
// when the step from that end to its start runs along the planned line (the drawing hand's aim gate, 0.7; the model's
// own short pieces are too jittery to aim by). A piece offset across the line does not join, so the stroke never
// zig-zags between pieces; a longer gap is a pen lift (lost and found). A gesture is
// drawn when the tracer would keep it as a stroke: at least its shortest line (13.1 mm), or half the planned line when
// that is shorter (a nostril, an eye). A planned line is drawn when its drawn gestures cover at least half of it (the
// painter's rule for keeping a line whole, ink-lines.mjs); otherwise it is reported not found. Each gesture keeps the
// model's geometry and per-point widths and takes the plan's pen (opening or closing) and weight. Candidate lines no
// planned line claims are left out.
import { TRACE_MM } from '../../crop/pen-trace.mjs';
import { polyLength } from './draw-plan.mjs';

/** The drawing hand's aim gate (drawing-hand.mjs connect, --drawjoinaim default): how closely a join runs along the line. */
const HAND = Object.freeze({ aim: 0.7 });

/** A planned weight as the pen's pressure share: the pen tracer's lightest, middle and heaviest line weight
 *  (pen-trace.mjs: 0.4 + 0.55 x darkness, at most 0.85). */
export const WEIGHT_SHARE = Object.freeze({ light: 0.4, medium: 0.625, heavy: 0.85 });
const ALONG = Math.cos(Math.PI / 4);

/** Points every `step` along a polyline, each { p, t (unit tangent), at (index of the segment's start point) }. */
export function samplePath(P, step) {
  const out = [];
  for (let j = 1; j < P.length; j++) {
    const [ax, ay] = P[j - 1], [bx, by] = P[j], L = Math.hypot(bx - ax, by - ay);
    if (!(L > 0)) continue;
    const k = Math.max(1, Math.ceil(L / step)), t = [(bx - ax) / L, (by - ay) / L];
    for (let s = 0; s < k; s++) out.push({ p: [ax + (bx - ax) * s / k, ay + (by - ay) * s / k], t, at: j - 1 });
  }
  const prev = out.at(-1);
  if (prev) out.push({ p: [...P.at(-1)], t: prev.t, at: P.length - 1 });
  return out;
}

/** Index ranges [a, b] of the true entries of `on`, joined across gaps of at most `gap` entries. */
export function runsOf(on, gap) {
  const runs = [];
  for (let k = 0; k < on.length;) {
    if (!on[k]) { k++; continue; }
    let e = k; while (e + 1 < on.length && on[e + 1]) e++;
    const last = runs.at(-1);
    if (last && k - last[1] - 1 <= gap) last[1] = e; else runs.push([k, e]);
    k = e + 1;
  }
  return runs;
}

/** Whether a point `p` with unit tangent `t` lies along the sheet's own edge: within `reach` of a side of the `W` by
 *  `H` sheet and running along that side (|cos| at least 0.8, as the pen tracer's alongSheetEdge). */
export function onSheetEdge(p, t, W, H, reach) {
  const [x, y] = p, ux = Math.abs(t[0]), uy = Math.abs(t[1]);
  return ((x <= reach || x >= W - reach) && uy >= 0.8) || ((y <= reach || y >= H - reach) && ux >= 0.8);
}

/**
 * Select the candidate lines a validated drawing plan claims and draw each planned line's pieces as gestures.
 * `candidates`: [{ points: [[x, y]] in millimetres, widths? (per point), width?, ... }]. Returns { lines: { opening,
 * closing } (points and widths in millimetres), record (per planned line), pool: { lines, mm }, claimedMm, edgeMm }.
 */
export function selectPlanned(plan, candidates, { step = 0.5 } = {}) {
  const reach = plan.reachMm, gap = Math.round(TRACE_MM.reach / step), sheetW = plan.sheet?.widthMm, sheetH = plan.sheet?.heightMm;
  const planned = plan.lines.map(g => { const P = g.closed ? [...g.path, g.path[0]] : g.path; return { g, s: samplePath(P, step), len: polyLength(P) }; });
  // planned points binned by the reach, so each candidate point looks only at planned points near it
  const bins = new Map(), key = (x, y) => `${x},${y}`;
  planned.forEach((pl, li) => pl.s.forEach((q, qi) => { const k = key(Math.floor(q.p[0] / reach), Math.floor(q.p[1] / reach)); if (!bins.has(k)) bins.set(k, []); bins.get(k).push([li, qi]); }));
  let edgeMm = 0;
  const claimOf = q => {
    if (sheetW > 0 && sheetH > 0 && onSheetEdge(q.p, q.t, sheetW, sheetH, TRACE_MM.reach)) { edgeMm += step; return null; }
    let best = null; const cx = Math.floor(q.p[0] / reach), cy = Math.floor(q.p[1] / reach);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const [li, qi] of bins.get(key(cx + dx, cy + dy)) ?? []) {
      const r = planned[li].s[qi], d = Math.hypot(q.p[0] - r.p[0], q.p[1] - r.p[1]);
      if (d > reach || Math.abs(q.t[0] * r.t[0] + q.t[1] * r.t[1]) < ALONG) continue;
      if (!best || d < best.d) best = { li, qi, d };
    }
    return best;
  };
  const runs = planned.map(() => []);
  let poolMm = 0;
  candidates.forEach((c, ci) => {
    if (!(c.points?.length >= 2)) return;
    const cs = samplePath(c.points, step); poolMm += polyLength(c.points);
    const claims = cs.map(claimOf), lis = new Set(claims.filter(Boolean).map(x => x.li));
    const widthAt = q => (Array.isArray(c.widths) ? c.widths[Math.min(c.widths.length - 1, q.at)] : c.width);
    for (const li of lis) for (const [a, b] of runsOf(claims.map(x => x?.li === li), gap)) {
      // the run's own points, each with its place along the planned line (qi) and the model's width there
      const pts = [];
      for (let k = a; k <= b; k++) if (claims[k]?.li === li) pts.push({ p: cs[k].p, qi: claims[k].qi, d: claims[k].d, width: widthAt(cs[k]) });
      if (pts.length < 2) continue;
      // drawn the way the planned line runs
      if (pts[0].qi > pts.at(-1).qi) pts.reverse();
      const cover = new Map();
      for (const x of pts) if (!cover.has(x.qi) || x.d < cover.get(x.qi)) cover.set(x.qi, x.d);
      runs[li].push({ ci, pts, cover });
    }
  });
  const out = { opening: [], closing: [] }, record = [];
  let claimedMm = 0;
  planned.forEach(({ g, s, len }, li) => {
    const shortest = Math.min(TRACE_MM.minLength, len / 2);
    // one stroke per edge: each planned point belongs to the nearest run covering it
    const owner = new Map();
    runs[li].forEach((x, xi) => { for (const [qi, d] of x.cover) if (!owner.has(qi) || d < owner.get(qi).d) owner.set(qi, { xi, d }); });
    const kept = runs[li].filter((x, xi) => { let mine = 0; for (const qi of x.cover.keys()) if (owner.get(qi).xi === xi) mine++; return mine >= x.cover.size / 2; });
    // gestures: each kept run loses the ends another run owns (no stretch drawn twice), then the runs are joined as the
    // drawing hand joins a pen's pieces (joinlines.mjs, the hand's gates: the next piece starts within the tracer's reach
    // ahead of the stroke's end, in its direction, and runs on the same way); a piece that joins nothing stands alone
    const pieces = [];
    kept.forEach(x => {
      const xi = runs[li].indexOf(x), mine = q => owner.get(q.qi)?.xi === xi;
      let a = 0, b = x.pts.length - 1;
      while (a < b && !mine(x.pts[a])) a++;
      while (b > a && !mine(x.pts[b])) b--;
      if (b > a) pieces.push({ points: x.pts.slice(a, b + 1).map(q => ({ x: q.p[0], y: q.p[1], width: q.width, qi: q.qi })) });
    });
    // in order along the planned line; a piece continues the open stroke whose end is nearest, when it starts within the
    // tracer's reach of that end and the step from end to start runs along the planned line (the hand's aim); a step
    // of one sample or less always joins
    pieces.sort((x, y) => x.points[0].qi - y.points[0].qi);
    const open = [];
    for (const pc of pieces) {
      const S = pc.points[0], tp = s[Math.min(s.length - 1, Math.max(0, S.qi))].t;
      let best = null;
      for (const G of open) {
        const E = G.points.at(-1), dx = S.x - E.x, dy = S.y - E.y, d = Math.hypot(dx, dy);
        if (d > TRACE_MM.reach || E.qi > S.qi) continue;
        if (d > step && Math.abs(dx * tp[0] + dy * tp[1]) / d < HAND.aim) continue;
        if (!best || d < best.d) best = { G, d };
      }
      if (best) best.G.points.push(...pc.points); else open.push({ points: [...pc.points] });
    }
    const gestures = open.map(G => ({ pts: G.points.map(q => ({ p: [q.x, q.y], width: q.width, qi: q.qi })), cover: new Set(G.points.map(q => q.qi)) }));
    const drawnG = gestures.map(G => ({ ...G, length: polyLength(G.pts.map(q => q.p)) })).filter(G => G.length >= shortest);
    const covered = new Set(); for (const G of drawnG) for (const qi of G.cover) covered.add(qi);
    const found = covered.size / s.length, drawn = found >= 0.5;
    const strokes = drawn ? drawnG.map(G => {
      const widths = G.pts.map(q => q.width), hasW = widths.every(Number.isFinite);
      return { points: G.pts.map(q => q.p), ...(hasW ? { widths } : {}), length: G.length, weight: WEIGHT_SHARE[g.weight], planId: g.id, object: g.what, drawRole: g.role, planWeight: g.weight };
    }) : [];
    out[g.stage].push(...strokes);
    const mm = strokes.reduce((a, x) => a + x.length, 0); claimedMm += mm;
    record.push({ id: g.id, what: g.what, role: g.role, stage: g.stage, weight: g.weight, plannedMm: +len.toFixed(1), found: +found.toFixed(3), drawn,
      pieces: kept.length, gestures: gestures.length, strokes: strokes.length, drawnMm: +mm.toFixed(1) });
  });
  return { lines: out, record, pool: { lines: candidates.length, mm: +poolMm.toFixed(0) }, claimedMm: +claimedMm.toFixed(0), edgeMm: +edgeMm.toFixed(0) };
}
