import { LANDMARK_FEATURES } from './line-meaning.mjs';
// Pipeline: inking, stage 1 (the drawing plan). An artist plans a pen drawing before the pen goes down: which lines,
// in what order, what each one is for, how heavy, and what is left to the wash. The drawing plan (--drawplan <file>)
// is that plan, written by the planner from the subject. The source only places and weighs the lines it names
// (draw-plan-place.mjs): a line the plan does not name is never drawn. Format: docs/plan-format.md "Drawing plans".
// Pure: a parsed plan in, a validated plan out, or a loud error naming every fault.

const DRAW_PLAN_VERSION = 1;
/** What a line is for, in the order an artist draws them: features that place the subject, the contours that explain
 *  its forms, then a few accents (small blacks, a pressed junction). */
const LINE_ROLES = Object.freeze(['landmark', 'contour', 'accent']);
/** Which pen draws it: the opening pen before the washes, or the closing pen over the dry washes. */
const LINE_STAGES = Object.freeze(['opening', 'closing']);
/** A note on what the line follows in the subject, for people: a drawn line, or an edge where one shape meets another. */
const LINE_FOLLOWS = Object.freeze(['line', 'edge']);
/** How heavy the hand is, from a fine line to a pressed one. */
const LINE_WEIGHTS = Object.freeze(['light', 'medium', 'heavy']);
/** A planned path is a rough placing of a few points, not a trace: more than this many points is a tracing. */
export const MAX_PATH_POINTS = 24;
/** How far from its planned path the pen may look for the subject's line, in mm on the sheet: the plan's own drawing
 *  accuracy. Under 1 mm is finer than the reading of the subject; over 10 mm reaches a neighbouring feature. */
const REACH_MM = Object.freeze([1, 10]);

const isText = v => typeof v === 'string' && v.trim().length > 0;
const isPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

/** Length of a polyline [[x, y], ...]. */
export function polyLength(P) {
  let l = 0;
  for (let j = 1; j < P.length; j++) l += Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]);
  return l;
}

/** The share of a polyline's length that lies within `d` of the rectangle [0, W] x [0, H]'s edge, sampled every
 *  tenth of `d`. */
export function edgeShare(P, W, H, d) {
  const step = Math.max(d / 10, 1e-6);
  let near = 0, all = 0;
  for (let j = 1; j < P.length; j++) {
    const [ax, ay] = P[j - 1], [bx, by] = P[j], L = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.ceil(L / step));
    for (let s = 0; s < k; s++) {
      const t = (s + 0.5) / k, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (Math.min(x, y, W - x, H - y) < d) near += L / k;
      all += L / k;
    }
  }
  return all > 0 ? near / all : 0;
}

/**
 * Validate a drawing plan for a sheet `sheetMm` wide holding a target `targetW` by `targetH` pixels whose SHA-256 is
 * `targetSHA256` (any of them may be omitted to skip that check, as a format check before the target is known).
 * Returns the plan with defaults filled in (`closed` false, `leftToWash` as given). Throws one error listing every fault.
 */
export function validateDrawPlan(plan, { sheetMm = null, targetW = null, targetH = null, targetSHA256 = null } = {}) {
  const bad = [];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('drawing plan: a JSON object');
  if (plan.version !== DRAW_PLAN_VERSION) bad.push(`version: ${DRAW_PLAN_VERSION}, not ${JSON.stringify(plan.version)}`);
  const t = plan.target;
  if (!t || !/^[0-9a-f]{64}$/.test(t.sha256 ?? '') || !(t.width > 0) || !(t.height > 0)) bad.push('target: { sha256, width, height } of the image the plan was drawn from');
  else {
    if (targetSHA256 && t.sha256 !== targetSHA256) bad.push(`target.sha256 ${t.sha256.slice(0, 8)} is not the image being painted (${targetSHA256.slice(0, 8)})`);
    if (targetW && targetH && (t.width !== targetW || t.height !== targetH)) bad.push(`target is ${t.width} x ${t.height}, the image ${targetW} x ${targetH}`);
  }
  const s = plan.sheet;
  if (!s || !(s.widthMm > 0) || !(s.heightMm > 0)) bad.push('sheet: { widthMm, heightMm }, the sheet the path millimetres are on');
  else {
    if (sheetMm != null && Math.abs(s.widthMm - sheetMm) > 1e-6) bad.push(`sheet.widthMm ${s.widthMm} is not the sheet being painted (${sheetMm} mm)`);
    if (t?.width > 0 && t?.height > 0 && Math.abs(s.heightMm - s.widthMm * t.height / t.width) > 0.5) bad.push(`sheet.heightMm ${s.heightMm}: the target's aspect on a ${s.widthMm} mm sheet makes it ${(s.widthMm * t.height / t.width).toFixed(1)}`);
  }
  if (plan.budgetMm != null && !(Number.isFinite(plan.budgetMm) && plan.budgetMm > 0)) bad.push('budgetMm: a positive stroke length in sheet mm');
  const byPath = Array.isArray(plan.lines) && plan.lines.some(g => g?.contours == null);
  if (Array.isArray(plan.lines) && plan.lines.some(g => g?.contours != null) && !/^[0-9a-f]{64}$/.test(plan.contourSet ?? '')) bad.push('contourSet: the SHA-256 of the numbered contours the lines name (the check prints it)');
  if (byPath && !(plan.reachMm >= REACH_MM[0] && plan.reachMm <= REACH_MM[1])) bad.push(`reachMm: how far from a planned path the pen looks for the subject's line, ${REACH_MM[0]} to ${REACH_MM[1]} mm, not ${JSON.stringify(plan.reachMm)}`);
  if (plan.medium !== 'ink') bad.push(`medium: "ink" (a drawing plan plans a pen drawing), not ${JSON.stringify(plan.medium)}`);
  if (!isText(plan.reason)) bad.push('reason: why this subject is drawn in pen, a sentence');
  if (!Array.isArray(plan.leftToWash)) bad.push('leftToWash: a list of { what, why } the pen leaves to the wash (it may be empty)');
  else plan.leftToWash.forEach((w, i) => {
    if (!isText(w?.what) || !isText(w?.why)) bad.push(`leftToWash[${i}]: { what, why }`);
    if (w?.contours != null && !(Array.isArray(w.contours) && w.contours.every(c => /^c[1-9][0-9]*$/.test(c)))) bad.push(`leftToWash[${i}].contours: ids of the proposed contours left to the wash ("c12")`);
  });
  if (!Array.isArray(plan.lines) || !plan.lines.length) bad.push('lines: the ordered list of planned lines, at least one');
  const ids = new Set(), W = s?.widthMm, H = s?.heightMm;
  for (const [i, g] of (Array.isArray(plan.lines) ? plan.lines : []).entries()) {
    const at = `lines[${i}]${isText(g?.id) ? ` (${g.id})` : ''}`;
    if (!isText(g?.id)) bad.push(`${at}.id: a name`);
    else if (ids.has(g.id)) bad.push(`${at}.id: used twice`);
    else ids.add(g.id);
    if (!isText(g?.what)) bad.push(`${at}.what: what the line is ("left eye upper lid", "arch of the gate")`);
    if (!LINE_ROLES.includes(g?.role)) bad.push(`${at}.role: one of ${LINE_ROLES.join(', ')}, not ${JSON.stringify(g?.role)}`);
    if (g?.feature != null && !LANDMARK_FEATURES.includes(g.feature)) bad.push(`${at}.feature: one of ${LANDMARK_FEATURES.join(', ')}`);
    if (!LINE_STAGES.includes(g?.stage)) bad.push(`${at}.stage: one of ${LINE_STAGES.join(', ')}, not ${JSON.stringify(g?.stage)}`);
    if (g?.follows != null && !LINE_FOLLOWS.includes(g.follows)) bad.push(`${at}.follows: what it follows in the subject, a drawn "line" or an "edge" where one shape meets another, not ${JSON.stringify(g?.follows)}`);
    if (!LINE_WEIGHTS.includes(g?.weight)) bad.push(`${at}.weight: one of ${LINE_WEIGHTS.join(', ')}, not ${JSON.stringify(g?.weight)}`);
    if (g?.closed != null && typeof g.closed !== 'boolean') bad.push(`${at}.closed: true or false`);
    if (g?.contours != null) {
      // named by the proposed contours (draw-plan-contours.mjs): the ids, in drawing order; a path, if given, is a note
      if (!Array.isArray(g.contours) || !g.contours.length || !g.contours.every(c => /^c[1-9][0-9]*$/.test(c))) bad.push(`${at}.contours: the ids of the contours the line is drawn from, in order ("c12"), at least one`);
      else if (new Set(g.contours).size < g.contours.length) bad.push(`${at}.contours: a contour named twice`);
      continue;
    }
    const P = g?.path;
    if (!Array.isArray(P) || P.length < (g?.closed ? 3 : 2) || !P.every(isPoint)) { bad.push(`${at}.path: ${g?.closed ? 3 : 2} or more [x, y] points in sheet mm`); continue; }
    if (P.length > MAX_PATH_POINTS) bad.push(`${at}.path: ${P.length} points; a planned path is a rough placing of at most ${MAX_PATH_POINTS}, not a trace`);
    if (W > 0 && H > 0) {
      if (!P.every(([x, y]) => x >= 0 && y >= 0 && x <= W && y <= H)) bad.push(`${at}.path: every point on the ${W} x ${H} mm sheet`);
      // the sheet's edge, a mount or a crop edge is never a subject line (pen.md 2.21)
      else if (plan.reachMm > 0 && edgeShare(g.closed ? [...P, P[0]] : P, W, H, plan.reachMm) > 0.5) bad.push(`${at}.path: more than half of it lies within reachMm of the sheet's edge; the sheet's edge is never a subject line`);
    }
    if (!(polyLength(P) > 0)) bad.push(`${at}.path: its points are all in one place`);
  }
  if (bad.length) throw new Error(`drawing plan: ${bad.length} fault${bad.length > 1 ? 's' : ''}:\n  - ${bad.join('\n  - ')}`);
  return { ...plan, lines: plan.lines.map(g => ({ ...g, closed: g.closed ?? false })) };
}
