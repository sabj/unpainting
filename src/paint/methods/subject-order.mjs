// --subjectorder s: soft subject-by-subject order for the light-to-dark value plan (light-to-dark.mjs).
//
// The value plan lays each band across the whole sheet at once: every light wash, then every middle layer, then the
// shadow glazes. A person works passage by passage instead, so some areas are well along while others are still blank
// or only first-washed. The plan's `subjectOrder` names the subjects in the order to bring them on, for example
// background first and the focal subject last:
//
//   "subjectOrder": [{"id": "wall", "families": ["h36a.stoneLit"], "reason": "..."},
//                    {"id": "gate", "families": ["h36a.gate"]}, {"id": "rest"}]
//
// Each entry names plan families (their bounds) or its own `bounds` list ([[x0,y0,x1,y1], ...], fractions). A cell
// belongs to the smallest entry box that holds it; the entry `{"id": "rest"}` places every other cell (without it they
// go last). Subjects are snapped to the painter's own colour segmentation (snapToSegments), so a subject edge settles
// on an edge in the target near the box edge rather than on a ruled line.
//
// Light and middle passages are cut at subject edges when each part is big enough. Shadow glazes stay whole unless a
// large part of them lies in another subject, so a continuous shadow is still one glaze. Each pass keeps its plan; a
// subject keeps light to dark within itself. The strength s (0..1) sets how far each later subject is held back:
// a pass at step t of the ladder (0 first, 1 last) in subject rank r is laid at t + 0.85 s r. At 0 the order is today's
// whole-sheet bands; at 1 a subject is mostly done before the next starts, with a little overlap.
//
// Pure: no sheet, no files.
import { passage } from '../../crop/blockin.mjs';

export const OVERLAP = 0.85;
const MIN_SHARE = { light: 0.1, mid: 0.1, shadow: 0.3 };
const MIN_CELLS = 64;

const boxArea = b => (b[2] - b[0]) * (b[3] - b[1]);
const validBox = b => Array.isArray(b) && b.length === 4 && b.every(v => Number.isFinite(v) && v >= 0 && v <= 1) && b[0] < b[2] && b[1] < b[3];

/** The plan's subjectOrder checked and resolved to boxes: [{id, rank, boxes}] and the rank of "rest". Throws on errors. */
export function readSubjectOrder(subjectOrder, families = []) {
  if (subjectOrder == null) return null;
  if (!Array.isArray(subjectOrder) || !subjectOrder.length) throw Error('subjectOrder must be a non-empty list of subjects');
  const byId = new Map(families.filter(f => f?.id).map(f => [f.id, f]));
  const ids = new Set();
  let rest = -1;
  const subjects = subjectOrder.map((e, rank) => {
    if (!e || typeof e.id !== 'string' || !e.id) throw Error(`subjectOrder[${rank}] needs an id`);
    if (ids.has(e.id)) throw Error(`subjectOrder: subject ${e.id} is named twice`);
    ids.add(e.id);
    if (e.id === 'rest') { rest = rank; return { id: 'rest', rank, boxes: [] }; }
    const boxes = [];
    for (const fid of e.families ?? []) {
      const f = byId.get(fid);
      if (!f) throw Error(`subjectOrder ${e.id}: no family ${fid} in the plan`);
      if (!validBox(f.bounds)) throw Error(`subjectOrder ${e.id}: family ${fid} has no bounds`);
      boxes.push(f.bounds);
    }
    for (const b of e.bounds ?? []) { if (!validBox(b)) throw Error(`subjectOrder ${e.id}: bounds must be [x0,y0,x1,y1] fractions with x0<x1, y0<y1`); boxes.push(b); }
    if (!boxes.length) throw Error(`subjectOrder ${e.id}: name families or bounds`);
    return { id: e.id, rank, boxes };
  });
  return { subjects, restRank: rest >= 0 ? rest : subjects.length };
}

/** Each cell's subject rank from the boxes alone: the smallest box holding the cell, else the rest. */
export function boxRanks({ subjects, restRank }, w, h) {
  const boxes = subjects.flatMap(s => s.boxes.map(b => ({ b, rank: s.rank, area: boxArea(b) }))).sort((a, c) => a.area - c.area);
  const rank = new Uint8Array(w * h).fill(restRank);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = (x + 0.5) / w, fy = (y + 0.5) / h;
    const hit = boxes.find(({ b }) => fx >= b[0] && fx < b[2] && fy >= b[1] && fy < b[3]);
    if (hit) rank[y * w + x] = hit.rank;
  }
  return rank;
}

/**
 * Snap box ranks to the painter's colour segmentation. Cells deep inside one subject's boxes (at least `margin` cells
 * from another subject's) seed it; every other cell goes to the subject nearest along the sheet, where a step costs 1
 * inside one colour label and 1 + `edge` across a label change. So a subject edge settles on a colour edge near the box
 * edge instead of a ruled line, and a box narrower than 2 x margin keeps its middle as seeds.
 */
export function snapToSegments(rank, labels, w, h, ranks, { margin = Math.max(4, Math.round(0.04 * Math.min(w, h))), edge = 24 } = {}) {
  const n = w * h, nb = (i, f) => { const x = i % w; if (x > 0) f(i - 1); if (x < w - 1) f(i + 1); if (i >= w) f(i - w); if (i + w < n) f(i + w); };
  // distance (cells, 4-connected) from the nearest cell of another box subject
  const dEdge = new Int32Array(n).fill(-1); let q = [];
  for (let i = 0; i < n; i++) { let b = false; nb(i, j => { if (rank[j] !== rank[i]) b = true; }); if (b) { dEdge[i] = 0; q.push(i); } }
  for (let d = 0; q.length; d++) { const nx = []; for (const i of q) nb(i, j => { if (dEdge[j] < 0) { dEdge[j] = d + 1; nx.push(j); } }); q = nx; }
  const deepest = new Int32Array(ranks); for (let i = 0; i < n; i++) { const d = dEdge[i] < 0 ? 1e9 : dEdge[i]; if (d > deepest[rank[i]]) deepest[rank[i]] = d; }
  // Dial's queue: steps cost 1 or 1 + edge
  const out = new Uint8Array(n).fill(255), dist = new Int32Array(n).fill(2147483647), B = edge + 2, buckets = Array.from({ length: B }, () => []);
  let pending = 0;
  for (let i = 0; i < n; i++) { const d = dEdge[i] < 0 ? 1e9 : dEdge[i]; if (d >= Math.min(margin, deepest[rank[i]])) { dist[i] = 0; out[i] = rank[i]; buckets[0].push(i); pending++; } }
  for (let d = 0; pending; d++) {
    const bucket = buckets[d % B]; buckets[d % B] = [];
    for (const i of bucket) {
      pending--;
      if (dist[i] !== d) continue;
      nb(i, j => { const c = d + (labels[j] === labels[i] ? 1 : 1 + edge); if (c < dist[j]) { dist[j] = c; out[j] = out[i]; buckets[c % B].push(j); pending++; } });
    }
  }
  return out;
}

/** The subject field for a plan: per-cell rank (Uint8Array) and the subjects with their cell counts. */
export function subjectField({ subjectOrder, families, labels, w, h }) {
  const order = readSubjectOrder(subjectOrder, families);
  if (!order) return null;
  const ranks = Math.max(order.subjects.length, order.restRank + 1);
  const boxed = boxRanks(order, w, h);
  const rank = labels ? snapToSegments(boxed, labels, w, h, ranks) : boxed;
  const cells = new Array(ranks).fill(0); for (const r of rank) cells[r]++;
  const names = Array.from({ length: ranks }, (_, r) => order.subjects.find(s => s.rank === r)?.id ?? 'rest');
  return { rank, ranks, names, cells };
}

const phaseOf = layer => (layer._valuePhase === 'shadow' ? 'shadow' : layer._valuePhase === 'light' ? 'light' : 'mid');
// the ladder step of a layer: the band and tag of its passages' plan ids (light/b1/..., mid/b2L1/..., shadow/b4/...)
const stepOf = layer => layer.shapes[0]?._valuePlan?.id?.split('/')[1] ?? `v${layer.value}`;

// A passage cut to the cells listed, keeping its plan; the edges it carries are cut too.
function partOf(sh, cells, field, id, w) {
  const box = { x0: w, y0: Infinity, x1: -1, y1: -1 };
  let total = 0;
  for (const i of cells) {
    field[i] = id; const x = i % w, y = (i / w) | 0;
    if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
    total += sh.graded ? sh.graded[i] : sh.amount;
  }
  const p = passage(field, id, box, total / cells.length, cells.length, w);
  for (const k of Object.keys(sh)) if (!['ids', 'id', 'box', '_mask', 'mask', 'area', 'amount', 'w', '_strokePlan'].includes(k)) p[k] = sh[k];
  if (sh._valuePlan) {
    const mine = new Set(cells), e = sh._valuePlan.edges;
    p._valuePlan = { ...sh._valuePlan, edges: e ? { ...e, hardCells: e.hardCells.filter(i => mine.has(i)), softCells: e.softCells.filter(i => mine.has(i)) } : e, subjectPart: true };
  }
  return p;
}

/**
 * A passage's parts by subject: [{sh, rank}]. A part under the phase's minimum share (or MIN_CELLS) joins the largest
 * part; a passage with a stroke plan stays whole (its lanes were planned for the whole shape).
 */
export function cutBySubject(sh, field, nextId, { rank, ranks, w, phase }) {
  const cellsBy = Array.from({ length: ranks }, () => []);
  // read the label field inside the box when there is one, so no full-sheet mask is built per passage
  const f = sh.ids, q = sh.id, m = f ? null : sh.mask, h = rank.length / w;
  const b = sh.box ?? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) { const i = y * w + x; if (f ? f[i] === q : m[i]) cellsBy[rank[i]].push(i); }
  const area = cellsBy.reduce((a, c) => a + c.length, 0);
  let major = 0; for (let r = 1; r < ranks; r++) if (cellsBy[r].length > cellsBy[major].length) major = r;
  const min = Math.max(MIN_CELLS, MIN_SHARE[phase] * area);
  const kept = cellsBy.map((c, r) => (c.length >= min ? r : -1)).filter(r => r >= 0);
  if (sh._strokePlan || kept.length <= 1) return [{ sh, rank: major }];
  for (let r = 0; r < ranks; r++) if (!kept.includes(r) && cellsBy[r].length) { cellsBy[major].push(...cellsBy[r]); cellsBy[r] = []; }
  return kept.map(r => ({ sh: partOf(sh, cellsBy[r], field, nextId(), w), rank: r }));
}

/**
 * The value plan's layers reordered subject by subject. field: subjectField(...). Returns {layers, summary, order}.
 * Strength 0 (or no field) returns the layers as they are.
 */
export function orderBySubject(layers, { field, strength = 0, w, n }) {
  if (!field || !(strength > 0) || field.ranks < 2) return { layers, summary: null, order: null };
  const k = Math.min(1, strength);
  const steps = [...new Set(layers.map(stepOf))];
  const S = Math.max(1, steps.length - 1);
  const pieces = [];
  layers.forEach((layer, li) => {
    const phase = phaseOf(layer), byRank = new Map();
    const ids = new Int32Array(n); let id = 0; const nextId = () => ++id;
    for (const sh of layer.shapes) for (const p of cutBySubject(sh, ids, nextId, { ...field, w, phase })) {
      if (!byRank.has(p.rank)) byRank.set(p.rank, []);
      byRank.get(p.rank).push(p.sh);
    }
    const t = steps.indexOf(stepOf(layer)) / S;
    for (const [rank, shapes] of byRank) pieces.push({ layer, li, rank, shapes, t, key: t + OVERLAP * k * rank });
  });
  pieces.sort((a, b) => a.key - b.key || a.rank - b.rank || a.li - b.li);
  const out = pieces.map(p => {
    const area = p.shapes.reduce((s, q) => s + q.area, 0);
    return { ...p.layer, shapes: p.shapes, area, amount: p.shapes.reduce((s, q) => s + q.amount * q.area, 0) / Math.max(1, area), _subject: { rank: p.rank, name: field.names[p.rank], step: stepOf(p.layer), t: +p.t.toFixed(3) } };
  });
  const summary = field.names.map((name, r) => {
    const at = out.map((L, i) => (L._subject.rank === r ? i : -1)).filter(i => i >= 0);
    return { subject: name, cells: field.cells[r], share: +(field.cells[r] / n).toFixed(3), passes: at.length, first: at.length ? at[0] + 1 : null, last: at.length ? at.at(-1) + 1 : null };
  });
  return { layers: out, summary, order: out.map(L => `${L._subject.name}:${L._subject.step}`) };
}
