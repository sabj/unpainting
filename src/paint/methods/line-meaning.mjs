// Pipeline: inking, stage 2 (decide): the meaning of each line of the line model's pool, and the decision and stroke by
// meaning (INK-SPEC.md: pool -> meaning -> decision by meaning -> stroke by meaning). Pure: arrays in, arrays out.
//
// Pool: every line the line model drew, made into contours as the pen tracer makes its lines (draw-plan-contours.mjs
// joinedContours). Meaning, from the SAM regions on either side of a contour (read at the tracer's flank, 1.9 mm, across
// it) and their semantic labels (ink-labels.mjs), whether it is a pen line of the source (the tracer's line: one value step
// darker than both flanks), and whether it lies in a shadow mass:
//   border     along the sheet's own edge: never drawn
//   landmark   a real feature label and rough path from the drawing plan (eye, nose, mouth, hand, window...): drawn
//   structure  a boundary between two SAM parts on at least half its length, both of them made things, figures, trunks
//              or ground on either side, including against sky, foliage or paper; or a regular pen line inside a made thing (its fitted straight segments and arcs average at least
//              the tracer's shortest line, 13.1 mm: a mullion, a course, a sill, an arch moulding) that is not the edge of a
//              shadow mass: drawn, whatever the values either side (a structure contour between a dark mass and a light
//              one is drawn)
//   texture    inside or bounding foliage, sky, water or the bare paper (a leaf mass's outline is leaves), or an irregular
//              pen line inside a part (stone grain, fur, grass): left to the wash (a plan may suggest a few)
//   shadow     an edge between two tones inside one part, the edge of a shadow mass, or a line lying in one: the wash's
// A semantically admitted contour is a speck only below one detector pixel in sheet mm. Stroke: a contour
// of a made thing (architecture, ground) is fitted with straight segments and clean arcs within the line model's own
// resolution (line-fit.mjs), the pen lifting at a corner sharper than the hand's join gate; any other is one smooth curve.
import { TRACE_MM, markWidth } from '../../crop/pen-trace.mjs';
import { joinedContours, alongEdge } from './draw-plan-contours.mjs';
import { fitManMade, fitOrganic, strokesAtCorners } from './line-fit.mjs';

const MADE = new Set(['architecture', 'ground']);
const BUILT_OR_BODY = new Set(['architecture', 'ground', 'figure', 'face', 'hands', 'drapery', 'tree_trunk']);
const WASH_GROUND = new Set(['foliage', 'sky', 'water', 'paper']);
const SEMANTIC_LABELS = new Set([...BUILT_OR_BODY, ...WASH_GROUND, 'shadow_mass']);
export const LANDMARK_FEATURES = Object.freeze(['eye', 'nose', 'mouth', 'ear', 'hand', 'finger', 'window', 'door', 'gate', 'mullion']);
const LINE_CLASSES = Object.freeze(['border', 'landmark', 'structure', 'texture', 'shadow']);
const DRAWN = new Set(['landmark', 'structure']);

/** The unit direction out of an end of P (`atEnd`), read over the last `span` of its length. */
function endDir(P, atEnd, span) {
  const Q = atEnd ? P : [...P].reverse(), e = Q.at(-1);
  let k = Q.length - 2, run = 0;
  while (k > 0 && run < span) { run += Math.hypot(Q[k][0] - Q[k + 1][0], Q[k][1] - Q[k + 1][1]); if (run < span) k--; }
  const s = Q[Math.max(0, k)], m = Math.hypot(e[0] - s[0], e[1] - s[1]) || 1;
  return [(e[0] - s[0]) / m, (e[1] - s[1]) / m];
}

/** Pieces of one contour joined end to end, nearest ends first, across at most `gap`, where the step from one end to
 *  the other runs on along both pieces' own directions (the hand's aim gate, 0.7, each read over the tracer's reach):
 *  pieces lying side by side are never stitched into a zig-zag. */
export function joinNearest(pieces, gap, aim = 0.7, span = TRACE_MM.reach) {
  let items = pieces.map(P => P.slice());
  for (;;) {
    let best = null;
    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) for (const ea of [0, 1]) for (const eb of [0, 1]) {
      const A = ea ? items[a].at(-1) : items[a][0], B = eb ? items[b].at(-1) : items[b][0], d = Math.hypot(A[0] - B[0], A[1] - B[1]);
      if (d > gap || (best && d >= best.d)) continue;
      if (d > 1e-9) {
        const u = [(B[0] - A[0]) / d, (B[1] - A[1]) / d], ta = endDir(items[a], !!ea, span), tb = endDir(items[b], !!eb, span);
        if (ta[0] * u[0] + ta[1] * u[1] < aim || -(tb[0] * u[0] + tb[1] * u[1]) < aim) continue;
      }
      best = { a, b, ea, eb, d };
    }
    if (!best) return items;
    const A = best.ea ? items[best.a] : items[best.a].slice().reverse(), B = best.eb ? items[best.b].slice().reverse() : items[best.b];
    items = items.filter((_, i) => i !== best.a && i !== best.b).concat([[...A, ...B]]);
  }
}

/** A made thing's line is regular when the straight segments and arcs fitted to it within the line model's resolution
 *  are on average at least the pen tracer's shortest line (13.1 mm) long: a sill, a jamb, an arch, not stone grain. */
function regular(P, tol) { const f = fitManMade(P, tol); return lengthOf(P) / f.parts.length >= TRACE_MM.minLength; }

const lengthOf = P => { let s = 0; for (let k = 1; k < P.length; k++) s += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); return s; };

/** Points every `step` along P. */
function resampleAt(P, step) {
  const out = [P[0]];
  for (let k = 1; k < P.length; k++) {
    const [ax, ay] = P[k - 1], [bx, by] = P[k], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / step));
    for (let i = 1; i <= n; i++) out.push([ax + (bx - ax) * i / n, ay + (by - ay) * i / n]);
  }
  return out;
}

/**
 * The meaning of one contour P (mm). `ctx`: { lum (0..1), W, H (grid), pxMm (mm a grid cell), regionAt(x, y) -> id,
 * labelOf(id) -> label, shadow (0/1 per cell) | null, step (one value step of the subject's scale), sheet: { W, H } mm,
 * landmarkAt?(P) -> name | null }. Returns { cls, label, made, shares }.
 */
export function meaningOf(P, ctx) {
  const { lum, W, H, pxMm } = ctx;
  if (alongEdge(P, ctx.sheet.W, ctx.sheet.H)) return { cls: 'border', label: null, made: false, shares: {} };
  const cell = (x, y) => Math.max(0, Math.min(H - 1, Math.round(y / pxMm))) * W + Math.max(0, Math.min(W - 1, Math.round(x / pxMm)));
  const S = resampleAt(P, pxMm), side = TRACE_MM.flank[0], f1 = TRACE_MM.flank[1];
  let bound = 0, pen = 0, shade = 0, shadeEdge = 0;
  const count = new Map(), boundLabels = new Map(), pairs = new Map();
  for (let k = 0; k < S.length; k++) {
    const a = S[Math.max(0, k - 1)], b = S[Math.min(S.length - 1, k + 1)], m = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / m, ny = (b[0] - a[0]) / m, [x, y] = S[k];
    const ra = ctx.regionAt(x + nx * side, y + ny * side), rb = ctx.regionAt(x - nx * side, y - ny * side), la = ctx.labelOf(ra), lb = ctx.labelOf(rb);
    if (!SEMANTIC_LABELS.has(la) || !SEMANTIC_LABELS.has(lb)) throw new Error(`ink meaning: unlabelled or unknown semantic region ${!SEMANTIC_LABELS.has(la) ? ra : rb}`);
    for (const l of [la, lb]) count.set(l, (count.get(l) ?? 0) + 1);
    if (ra !== rb) { bound++; for (const l of [la, lb]) boundLabels.set(l, (boundLabels.get(l) ?? 0) + 1); const key = ra < rb ? `${ra}|${rb}` : `${rb}|${ra}`; pairs.set(key, (pairs.get(key) ?? 0) + 1); }
    let mark = Infinity; for (let r = -pxMm; r <= pxMm; r += pxMm) mark = Math.min(mark, lum[cell(x + nx * r, y + ny * r)]);
    const flank = d => { let v = 0, n = 0; for (let r = side; r <= f1; r += pxMm) { v += lum[cell(x + nx * r * d, y + ny * r * d)]; n++; } return v / Math.max(1, n); };
    if (mark <= flank(1) - ctx.step && mark <= flank(-1) - ctx.step) pen++;
    if (ctx.shadow?.[cell(x, y)]) shade++;
    if (ctx.shadow && ctx.shadow[cell(x + nx * side, y + ny * side)] !== ctx.shadow[cell(x - nx * side, y - ny * side)]) shadeEdge++;
  }
  const n = S.length, shares = { boundary: bound / n, pen: pen / n, shadow: shade / n, shadowEdge: shadeEdge / n, straight: Math.hypot(P.at(-1)[0] - P[0][0], P.at(-1)[1] - P[0][1]) / Math.max(1e-9, lengthOf(P)) };
  const label = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const labels = new Set(count.keys());
  // A building silhouette remains architecture against sky, foliage or bare paper.
  const structuralLabel = [...boundLabels.keys()].find(l => BUILT_OR_BODY.has(l));
  const made = MADE.has(structuralLabel ?? label);
  const named = ctx.planAt?.(P) ?? null;
  const landmark = LANDMARK_FEATURES.includes(named?.feature) ? named.what : null;
  let cls;
  if (landmark) cls = 'landmark';
  else if (named) cls = 'structure';
  else if (labels.has('shadow_mass')) cls = 'shadow';
  else if ([...labels].every(l => WASH_GROUND.has(l))) cls = 'texture';
  else if (shares.boundary >= 0.5) cls = [...boundLabels.keys()].some(l => BUILT_OR_BODY.has(l)) ? 'structure' : 'texture';
  else if (made && shares.pen >= 0.5 && shares.shadow < 0.5 && shares.shadowEdge < 0.5 && regular(P, ctx.tolMm)) cls = 'structure';
  else cls = shares.pen >= 0.5 && shares.shadow < 0.5 ? 'texture' : 'shadow';
    // the contour it belongs to, by meaning: the plan line it runs along, else the two parts it divides
  const part = named ? `plan:${named.id}` : shares.boundary >= 0.5 ? `parts:${[...pairs.entries()].sort((a, b) => b[1] - a[1])[0][0]}` : null;
  return { cls, label, made, shares, part, ...(landmark ? { landmark } : {}), ...(named ? { planId: named.id, plannedMm: named.plannedMm } : {}) };
}

/**
 * Decide the pool `lines` (points in grid cells, `pxMm` mm a cell) by meaning and draw each kept contour by meaning.
 * `ctx` as meaningOf, plus `tolMm` (the line model's resolution: the subject's pixel in mm). Returns { lines: [{ points
 * (cells), inkClass, inkLabel, fit }], record: { byClass: { cls: { lines, mm } }, kept, keptMm, specks, ... } }.
 */
export function decideByMeaning(lines, ctx) {
  const { pxMm } = ctx, tol = ctx.tolMm;
  const pool = lines.filter(g => g.points?.length >= 2).map(g => ({ points: g.points.map(p => (Array.isArray(p) ? [p[0] * pxMm, p[1] * pxMm] : [p.x * pxMm, p.y * pxMm])) }));
  const byClass = Object.fromEntries(LINE_CLASSES.map(c => [c, { lines: 0, mm: 0 }])), out = [];
  let specks = 0, specksMm = 0;
  const classified = [], groups = new Map();
  // Meaning precedes joining: every original detector line is accounted for, and texture or
  // shadow cannot acquire structural meaning by being joined to a neighbouring contour.
  for (const { points: P } of pool) {
    const len = lengthOf(P), m = meaningOf(P, ctx);
    classified.push({ id: `pool-${classified.length + 1}`, pointsMm: P, mm: len, ...m, decision: DRAWN.has(m.cls) ? 'draw' : 'wash or omit' });
    byClass[m.cls].lines++; byClass[m.cls].mm += len;
    if (!DRAWN.has(m.cls)) continue;
    const key = `${m.cls}|${m.made}|${m.part ?? m.label}`;
    if (!groups.has(key)) groups.set(key, { m, pieces: [] });
    groups.get(key).pieces.push(P);
  }
  // Only pieces sharing semantic meaning may form one gesture. Join along their ends, never
  // sideways; simplify at the detector's physical resolution before fitting the stroke.
  const joined = [];
  for (const { m, pieces } of groups.values()) {
    const j = joinedContours(pieces.map(points => ({ points })), { pixelMm: tol });
    for (const P of joinNearest(j.contours, TRACE_MM.reach)) joined.push({ P, m });
  }
  const sorted = Float32Array.from(ctx.lum).sort(), ink = sorted[Math.floor(0.001 * (sorted.length - 1))];
  for (const { P, m } of joined) {
    // Meaning has already excluded texture and value edges. A resolved piece of structure or a
    // named feature must not be removed by the old tracer's 13.1 mm line-length gate.
    // Below one detector pixel the model cannot resolve a stroke at all.
    const shortest = tol;
    // a made thing's line in straight runs and arcs, the pen lifting at a sharp corner between legs of at least the tracer's
    // reach; anything else one smooth curve
    if (lengthOf(P) < shortest) { specks++; specksMm += lengthOf(P); continue; }
    const strokes = m.made ? strokesAtCorners(fitManMade(P, tol).parts, 0.8, TRACE_MM.reach) : [fitOrganic(P, TRACE_MM.reach).points];
    const kind = m.made ? 'straight runs and arcs' : 'curve';
    // weight reads as ink: the width the source's pen drew it, the ink laid across its mark over the subject's full ink
    // depth (pen-trace.mjs markWidth, the tracer's own width)
    const inkWidth = markWidth(P.map(([x, y]) => [x / pxMm, y / pxMm]), ctx.lum, ctx.W, ctx.H, TRACE_MM.reach / pxMm, ink);
    for (const Q of strokes) {
      const len = lengthOf(Q);
      const pts = resampleAt(Q, Math.min(0.5, tol)).map(([x, y]) => [+(x / pxMm).toFixed(2), +(y / pxMm).toFixed(2)]);
      out.push({ points: pts, length: +(len / pxMm).toFixed(1), role: 'subject', kind: 'line', inkWidth: +inkWidth.toFixed(2), widthBy: 'ink',
        inkClass: m.cls, inkLabel: m.label, fit: kind, ...(m.landmark ? { object: m.landmark } : {}), ...(m.planId ? { planId: m.planId } : {}) });
    }
  }
  for (const c of LINE_CLASSES) byClass[c].mm = +byClass[c].mm.toFixed(0);
  const budget = inkBudget(out, ctx.budgetMm ?? Infinity, pxMm);
  out.splice(0, out.length, ...budget.lines);
  const keptMm = out.reduce((a, g) => a + g.length * pxMm, 0);
  return { lines: out, record: { classified, pieces: pool.length, contours: classified.length, gestures: joined.length, byClass, specks, specksMm: +specksMm.toFixed(0), budget: budget.record, kept: out.length, keptMm: +keptMm.toFixed(0), tolMm: +tol.toFixed(3) } };
}

/** Along: the drawing hand's join gate (cos 0.8, drawing-hand.mjs connect). */
const ALONG = 0.8;

/**
 * The drawing plan as a reader of meaning: for a contour P (mm), the plan line (id, what, role) that runs along at least
 * half of it, within the plan's reach and the same way (the hand's join gate, cos 0.8), or null. A plan line given by contour ids is
 * not read here (it names contours of the plan's own proposal).
 */
export function planReader(plan) {
  if (plan.lines.some(g => !Array.isArray(g.path))) throw new Error('ink meaning plan: every named line requires a rough path in sheet mm; contour ids alone do not locate semantic features');
  const reach = plan.reachMm ?? TRACE_MM.reach, lines = plan.lines.filter(g => Array.isArray(g.path)).map(g => { const Q = g.closed ? [...g.path, g.path[0]] : g.path; return { g, S: resampleAt(Q, 0.5), len: lengthOf(Q) }; });
  return P => {
    const S = resampleAt(P, 0.5), votes = new Map(), lens = new Map();
    for (let k = 0; k < S.length; k++) {
      const a = S[Math.max(0, k - 1)], b = S[Math.min(S.length - 1, k + 1)], m = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = [(b[0] - a[0]) / m, (b[1] - a[1]) / m];
      let best = null;
      for (const L of lines) for (let i = 0; i < L.S.length; i++) {
        const d = Math.hypot(L.S[i][0] - S[k][0], L.S[i][1] - S[k][1]); if (d > reach || (best && d >= best.d)) continue;
        const c = L.S[Math.min(L.S.length - 1, i + 1)], e = L.S[Math.max(0, i - 1)], n = Math.hypot(c[0] - e[0], c[1] - e[1]) || 1;
        if (Math.abs(t[0] * (c[0] - e[0]) / n + t[1] * (c[1] - e[1]) / n) >= ALONG) best = { d, g: L.g, len: L.len };
      }
      if (best) votes.set(best.g, (votes.get(best.g) ?? 0) + 1), lens.set(best.g, best.len);
    }
    const top = [...votes.entries()].sort((x, y) => y[1] - x[1])[0];
    return top && top[1] >= S.length / 2 ? { id: top[0].id, what: top[0].what, role: top[0].role, feature: top[0].feature, plannedMm: lens.get(top[0]) } : null;
  };
}

/** Spend a sheet-mm stroke budget on whole landmarks, then structure, then suggested texture.
 * Stable within each class: detector order cannot make texture displace a feature. */
export function inkBudget(lines, budgetMm, pxMm) {
  if (!(budgetMm >= 0) || !(pxMm > 0)) throw new Error('ink budget: nonnegative sheet mm and positive cell size required');
  const rank = { landmark: 0, structure: 1, texture: 2 };
  const ordered = lines.map((g, i) => ({ g, i })).sort((a, b) => (rank[a.g.inkClass] ?? 3) - (rank[b.g.inkClass] ?? 3) || a.i - b.i);
  let spentMm = 0; const kept = [], dropped = [];
  for (const { g } of ordered) {
    const mm = lengthOf(g.points) * pxMm;
    if (spentMm + mm <= budgetMm) { kept.push(g); spentMm += mm; }
    else dropped.push({ inkClass: g.inkClass, object: g.object ?? null, mm });
  }
  return { lines: kept, record: { limitMm: Number.isFinite(budgetMm) ? budgetMm : null, spentMm, dropped } };
}
