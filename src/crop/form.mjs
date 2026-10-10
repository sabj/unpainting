// Turn ridges into drawn forms: pair ends by continuation, fit each as a curve, cut where the tool would change,
// and order by intent. The hand that draws them lives in motor.mjs.
import { polylineLength, resample, simplify } from '../util.js';
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), dot = (a, b) => a.x * b.x + a.y * b.y;
const unit = (a, b) => { const d = dist(a, b) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };
const describe = s => ({ ...s, length: polylineLength(s.points) });
const endOf = (P, end, reach) => {
  const Q = end ? P : [...P].reverse(), p = Q.at(-1); let j = Q.length - 2, d = 0;
  while (j > 0 && (d += dist(Q[j], Q[j + 1])) < reach) j--;
  const t = unit(Q[j], p), k = Math.max(0, j - (Q.length - 1 - j)), u = unit(Q[k], Q[j]);
  return { p, t, bend: Math.atan2(u.x * t.y - u.y * t.x, dot(u, t)) / Math.max(reach, d) };
};
export function assembleForms(strokes, { scale = 1, gap = 10 * scale, turn = 55, reach = 5 * scale } = {}) {
  const pool = strokes.filter(s => s.points?.length > 1 && s.points.every(p => Number.isFinite(p.x + p.y))).map((s, id) => describe({ ...s, sources: s.sources || [id], points: s.points.map(p => ({ ...p })) }));
  const ends = pool.map(s => [endOf(s.points, 0, reach), endOf(s.points, 1, reach)]), links = pool.map(() => [null, null]), candidates = [], cos = Math.cos(turn * Math.PI / 180);
  for (let i = 0; i < pool.length; i++) for (let j = i; j < pool.length; j++) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
    if (i === j && (a !== 0 || b !== 1 || pool[i].length < 12 * scale)) continue;
    const A = ends[i][a], B = ends[j][b], d = dist(A.p, B.p); if (d > gap) continue;
    const aligned = -dot(A.t, B.t), v = unit(A.p, B.p), c1 = dot(A.t, v), c2 = -dot(B.t, v);
    // Junctions choose the straightest pair first. Across a gap the chord must agree with both tangents;
    // a little turning is allowed when the two ends predict the same signed curvature.
    const bend = Math.abs(A.bend + B.bend) * Math.min(d, reach), near = d <= 1.6 * scale;
    if (aligned < cos || (!near && (c1 < cos || c2 < cos || bend > 0.8))) continue;
    candidates.push({ i, j, a, b, score: aligned * 3 + (near ? 2 : c1 + c2) - d / Math.max(1, gap) - bend });
  }
  candidates.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);
  for (const { i, j, a, b } of candidates) { if (links[i][a] || links[j][b]) continue; links[i][a] = [j, b]; links[j][b] = [i, a]; }
  const used = new Set(), out = [];
  const walk = (start, enter) => {
    const points = [], sources = []; let i = start, a = enter, closed = false;
    while (!used.has(i)) {
      used.add(i); sources.push(...pool[i].sources); const P = a ? [...pool[i].points].reverse() : pool[i].points; points.push(...P);
      const next = links[i][1 - a]; if (!next) break;
      if (next[0] === start) { closed = true; break; } [i, a] = next;
    }
    if (closed && dist(points[0], points.at(-1)) > 0) points.push({ ...points[0] });
    out.push(describe({ ...pool[start], points: resample(points, scale * 0.75), sources, closed }));
  };
  for (let i = 0; i < pool.length; i++) if (!used.has(i)) { if (!links[i][0]) walk(i, 0); else if (!links[i][1]) walk(i, 1); }
  for (let i = 0; i < pool.length; i++) if (!used.has(i)) walk(i, 0);
  return out;
}
// Cut where the evidence width crosses the instrument threshold and stays across it far enough to be drawn.
// Points must carry w, the measured width.
export function splitByWidth(stroke, { threshold = 5, minRun = 12, hysteresis = 0.2 } = {}) {
  const P = stroke.points; if (!P || P.length < 4) return [stroke];
  const broad = P.map(p => (p.w ?? 0) > threshold * (1 + hysteresis)), thin = P.map(p => (p.w ?? 0) < threshold * (1 - hysteresis));
  const state = new Array(P.length).fill(0); let last = 0;
  for (let j = 0; j < P.length; j++) { if (broad[j]) last = 1; else if (thin[j]) last = -1; state[j] = last; }
  for (let j = P.length - 1; j >= 0 && !state[j]; j--) state[j] = state[j + 1] ?? 0;
  // Runs too short to draw take their neighbour's instrument, so a wobble in the width cannot chip the form.
  const runsOf = () => { const runs = [[0, 0]]; for (let j = 1; j < P.length; j++) { if (state[j] !== state[runs.at(-1)[0]]) runs.push([j, j]); else runs.at(-1)[1] = j; } return runs; };
  let runs = runsOf();
  for (let pass = 0; pass < 8; pass++) {
    const m = runs.findIndex(([a, b]) => b - a < 2 || polylineLength(P.slice(a, b + 1)) < minRun);
    if (m < 0 || runs.length < 2) break;
    const into = m ? m - 1 : 1;
    for (let j = runs[m][0]; j <= runs[m][1]; j++) state[j] = state[runs[into][0]];
    runs = runsOf();
  }
  if (runs.length < 2) return [stroke];
  // the joint belongs to both pieces, so no gap opens between them
  return runs.map(([a, b]) => describe({ ...stroke, closed: false, points: P.slice(a, Math.min(P.length, b + 2)) })).filter(p => p.points.length > 1);
}
// Small least-squares solve for a circle or conic fit; points are centred and scaled first.
function solve(rows, values) {
  const n = rows[0].length, A = Array.from({ length: n }, (_, i) => Array.from({ length: n + 1 }, (_, j) => rows.reduce((v, r, k) => v + r[i] * (j === n ? values[k] : r[j]), 0)));
  for (let i = 0; i < n; i++) {
    let best = i; for (let j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[best][i])) best = j;
    if (Math.abs(A[best][i]) < 1e-10) return null; [A[i], A[best]] = [A[best], A[i]];
    const d = A[i][i]; for (let k = i; k <= n; k++) A[i][k] /= d;
    for (let j = 0; j < n; j++) if (j !== i) { const f = A[j][i]; for (let k = i; k <= n; k++) A[j][k] -= f * A[i][k]; }
  }
  return A.map(r => r[n]);
}
const segmentDistance = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy); };
const oneWay = (P, Q) => Math.max(...P.map(p => { let d = Infinity; for (let j = 1; j < Q.length; j++) d = Math.min(d, segmentDistance(p, Q[j - 1], Q[j])); return d; }));
const errorOf = (P, Q) => Math.max(oneWay(P, Q), oneWay(Q, P));
function ellipse(P, closed, spacing) {
  const cx = P.reduce((s, p) => s + p.x, 0) / P.length, cy = P.reduce((s, p) => s + p.y, 0) / P.length, size = Math.max(...P.map(p => Math.hypot(p.x - cx, p.y - cy))) || 1;
  const Q = P.map(p => ({ x: (p.x - cx) / size, y: (p.y - cy) / size })); let x, y, a, b, angle = 0;
  if (closed) {
    const c = solve(Q.map(p => [p.x * p.x, p.x * p.y, p.y * p.y, p.x, p.y]), Q.map(() => 1)); if (!c) return null;
    const [A, B, C, D, E] = c, det = 4 * A * C - B * B; if (det <= 1e-8) return null;
    x = (B * E - 2 * C * D) / det; y = (B * D - 2 * A * E) / det;
    const z = 1 - (A * x * x + B * x * y + C * y * y + D * x + E * y), root = Math.hypot(A - C, B), l1 = (A + C + root) / 2, l2 = (A + C - root) / 2;
    if (z / l1 <= 0 || z / l2 <= 0) return null;
    a = Math.sqrt(z / l1); b = Math.sqrt(z / l2); angle = 0.5 * Math.atan2(B, A - C);
  } else {
    const c = solve(Q.map(p => [p.x, p.y, 1]), Q.map(p => -(p.x * p.x + p.y * p.y))); if (!c) return null;
    x = -c[0] / 2; y = -c[1] / 2; a = b = Math.sqrt(x * x + y * y - c[2]);
  }
  if (!Number.isFinite(a + b) || Math.min(a, b) < 0.01 || Math.max(a, b) / Math.min(a, b) > 8) return null;
  const ca = Math.cos(angle), sa = Math.sin(angle), theta = p => Math.atan2((-(p.x - x) * sa + (p.y - y) * ca) / b, ((p.x - x) * ca + (p.y - y) * sa) / a);
  let prev = theta(Q[0]), start = prev, sweep = 0;
  for (let j = 1; j < Q.length; j++) { const t = theta(Q[j]), delta = Math.atan2(Math.sin(t - prev), Math.cos(t - prev)); sweep += delta; prev = t; }
  if (closed) { if (Math.abs(sweep) < 4.5) return null; sweep = Math.sign(sweep) * Math.PI * 2; }
  else if (Math.abs(sweep) < 0.12 || Math.abs(sweep) > Math.PI * 2) return null;
  const n = Math.max(8, Math.ceil(Math.abs(sweep) * Math.max(a, b) * size / spacing)), points = Array.from({ length: n + 1 }, (_, j) => { const t = start + sweep * j / n, u = a * Math.cos(t), v = b * Math.sin(t); return { x: cx + size * (x + ca * u - sa * v), y: cy + size * (y + sa * u + ca * v) }; });
  return { points, type: closed ? 'ellipse' : 'arc', controls: [cx + x * size, cy + y * size, a * size, b * size, angle] };
}
export function spline(C, spacing, closed) {
  const Q = [];
  for (let i = 0; i < C.length - 1; i++) {
    const a = C[i - 1] || (closed ? C.at(-2) : C[i]), b = C[i], c = C[i + 1], d = C[i + 2] || (closed ? C[1] : c), n = Math.max(2, Math.ceil(dist(b, c) / spacing));
    for (let j = 0; j < n; j++) { const t = j / n, t2 = t * t, t3 = t2 * t; const value = k => 0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3); Q.push({ x: value('x'), y: value('y') }); }
  }
  Q.push({ ...C.at(-1) }); return Q;
}
export function fitForm(stroke, { scale = 1, tolerance = 1.2 * scale, maxControls = 12, spacing = 0.75 * scale, reach = 90 * scale } = {}) {
  const P = stroke.points; if (P.length < 2) return { ...stroke, fit: { type: 'trace', error: 0, controls: P } };
  // A long sweep may sit further from the evidence than a short accent, so long arcs do not fall back to the ridge.
  const allowed = tolerance * Math.min(2.4, 1 + polylineLength(P) / reach);
  const accept = candidate => {
    if (!candidate) return null; const error = errorOf(P, candidate.points); if (error > allowed) return null;
    // carry the evidence's local width onto the curve
    const points = candidate.points.map(p => { let nearest = P[0], d = Infinity; for (const q of P) { const e = dist(p, q); if (e < d) { d = e; nearest = q; } } return { ...p, w: nearest.w ?? 1 }; });
    return describe({ ...stroke, points, fit: { type: candidate.type, error, controls: candidate.controls } });
  };
  const conic = accept(ellipse(P, stroke.closed, spacing)); if (conic) return conic;
  for (const factor of [2, 1, 0.5, 0.25]) {
    const controls = simplify(P, allowed * factor); if (controls.length > maxControls) continue;
    const fitted = accept({ type: 'spline', controls, points: spline(controls, spacing, stroke.closed) }); if (fitted) return fitted;
  }
  return describe({ ...stroke, fit: { type: 'trace', error: 0, controls: [] } });
}
// Net turning of a mark in whole turns, 0..1. Net, not absolute, so tremor cancels while a rim keeps turning.
// Roundness, not the closed flag, makes a mark an anchor.
const roundnessOf = P => { let turn = 0; for (let j = 2; j < P.length; j++) { let da = Math.atan2(P[j].y - P[j - 1].y, P[j].x - P[j - 1].x) - Math.atan2(P[j - 1].y - P[j - 2].y, P[j - 1].x - P[j - 2].x); while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; turn += da; } return Math.min(1, Math.abs(turn) / (Math.PI * 2)); };
export function orderForms(strokes, { width = 256, height = 256, scale = 1, round = 0.5 } = {}) {
  const pool = strokes.map((s, id) => {
    const P = s.points, centre = { x: P.reduce((v, p) => v + p.x, 0) / P.length, y: P.reduce((v, p) => v + p.y, 0) / P.length }, central = Math.max(0, 1 - Math.hypot((centre.x - width / 2) / width, (centre.y - height / 2) / height));
    const darkness = s.darkness ?? s.kind?.evidence?.contrast ?? s.strength ?? 0.2, length = polylineLength(P), texture = ['texture', 'dry'].includes(s.kind?.type) || s.kind === 'hatch' || s.kind === 'tick';
    const roundness = s.closed ? 1 : length > 20 * scale ? roundnessOf(P) : 0;
    return { ...s, length, centre, roundness, priority: (darkness + 0.1) * (0.5 + central) * (1 + 2 * roundness) * Math.sqrt(Math.min(80, length / scale)), intent: texture ? 'texture' : roundness >= round || (length < 35 * scale && darkness > 0.35 && central > 0.6) ? 'anchor' : length > 12 * scale ? 'contour' : 'texture', sourceOrder: id };
  }), ordered = [], rank = { anchor: 0, contour: 1, texture: 2 };
  // Connection to what is drawn is a running maximum, updated one mark at a time, and the pick is a linear scan:
  // same order as a full re-sort, without cubic cost on thousands of marks.
  const ends = pool.map(s => [s.points[0], s.points.at(-1)]), sampled = pool.map(s => s.points.filter((_, i) => i % 4 === 0));
  const connection = new Float64Array(pool.length);
  const near = (k, points) => { let best = Infinity; for (const p of ends[k]) for (const q of points) { const d = dist(p, q); if (d < best) best = d; } return best; };
  const better = (a, b) => rank[a.intent] - rank[b.intent] || b.connectedPriority - a.connectedPriority || a.sourceOrder - b.sourceOrder;
  const live = pool.map((_, j) => j);
  while (live.length) {
    for (const j of live) pool[j].connectedPriority = pool[j].priority * (1 + connection[j] * 2);
    let at = 0; for (let i = 1; i < live.length; i++) if (better(pool[live[i]], pool[live[at]]) < 0) at = i;
    const j = live[at]; live.splice(at, 1);
    ordered.push({ ...pool[j], order: ordered.length });
    if (pool[j].intent === 'texture') continue;
    for (const k of live) if (pool[k].intent === 'contour') connection[k] = Math.max(connection[k], Math.exp(-near(k, sampled[j]) / (8 * scale)));
  }
  return ordered;
}
export function planForms(strokes, options = {}) {
  const { budget = 160, evidence } = options;
  const forms = assembleForms(strokes, options).map(s => { const f = fitForm(s, options); return { ...f, ...(evidence ? evidence(s) : {}) }; });
  return orderForms(forms, options).slice(0, Math.max(0, budget));
}
