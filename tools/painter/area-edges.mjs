// Edges decided one by one (painting-rules.md 8): an area plan's `edges` names every boundary two areas share as
// hard, soft or lost, with a reason.
//   hard: wet on dry. The painter dries the sheet before a pass whose area meets a still-wet neighbour along a hard edge.
//   soft: right after a wet pass of either area, while it is wet, a clean damp brush the size of the pass brush runs
//         along that boundary (soften-lift-run.mjs softenEdge, the same move as pass.soften), so the edge goes soft.
//   lost: the two areas are laid in one wet session (pass.session), so the washes meet wet and merge.
// Which areas share a boundary is read from the plan's own raster ownership, never from the target.
const fail = m => { throw Error(`semantic areas: ${m}`); };
const KINDS = ['hard', 'soft', 'lost'];
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const AREA_EDGES_CONTRACT = 'Optional edges:[{areas:[areaId,areaId],kind:hard|soft|lost,reason}], one entry per boundary two areas share in the raster (parent and child included); when given, every shared boundary must be named and every named pair must touch. hard: wet on dry, the sheet is dried before a pass meets a wet neighbour there; soft: a clean damp brush the size of the pass brush runs along it right after each wet pass of either area; lost: the two areas have passes in one wet session (pass.session).';

/** Checks the edges list against the areas and wet sessions (document level). Returns Map pairKey -> edge. */
export function validateAreaEdges(doc, areas, schedule) {
  if (doc.edges === undefined) return null;
  if (!Array.isArray(doc.edges)) fail('edges must be a list');
  const sessionsOf = id => new Set(schedule.filter(s => s.area.id === id && s.pass.session).map(s => s.pass.session.id));
  const out = new Map();
  for (const e of doc.edges) {
    if (typeof e !== 'object' || e === null) fail('edge entry');
    for (const k of Object.keys(e)) if (!['areas', 'kind', 'reason'].includes(k)) fail(`edge: unknown field ${k}`);
    if (!Array.isArray(e.areas) || e.areas.length !== 2 || e.areas[0] === e.areas[1] || !e.areas.every(id => areas.has(id))) fail(`edge areas ${JSON.stringify(e.areas)}`);
    const key = pairKey(...e.areas);
    if (out.has(key)) fail(`edge ${key} named twice`);
    if (!KINDS.includes(e.kind)) fail(`edge ${key}: kind ${e.kind}`);
    if (typeof e.reason !== 'string' || !e.reason.trim()) fail(`edge ${key}: reason required`);
    const a = sessionsOf(e.areas[0]), b = sessionsOf(e.areas[1]), shared = [...a].some(id => b.has(id));
    if (e.kind === 'lost' && !shared) fail(`lost edge ${key}: its two areas need passes in one wet session (pass.session)`);
    if (e.kind !== 'lost' && shared) fail(`${e.kind} edge ${key}: its areas share a wet session, which loses the edge`);
    if (e.kind === 'soft' && !schedule.some(s => e.areas.includes(s.area.id) && s.pass.source !== 'authored' && ['wet on wet', 'wet on dry'].includes(s.pass.move))) fail(`soft edge ${key}: neither area has a wet pass to soften`);
    out.set(key, { ...e, key });
  }
  return out;
}

/** Pairs of area indices whose owned cells touch (4-neighbours) on the plan grid: Map pairKey(index) -> cell count. */
export function areaAdjacency(owner, w, h) {
  const out = new Map();
  const add = (a, b) => { if (a < 0 || b < 0 || a === b) return; const k = pairKey(a, b); out.set(k, (out.get(k) ?? 0) + 1); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (x + 1 < w) add(owner[i], owner[i + 1]); if (y + 1 < h) add(owner[i], owner[i + w]); }
  return out;
}

/** With an edges list, every shared boundary is named and every named pair touches; returns Map areaId -> [edge]. */
export function bindAreaEdges(plan) {
  const ids = plan.doc.areas.map(a => a.id), touching = new Set([...areaAdjacency(plan.owner, plan.w, plan.h).keys()].map(k => pairKey(...k.split('|').map(j => ids[+j]))));
  // every edge is decided (painting-rules 8): a plan whose areas touch must name each shared boundary; a silent plan
  // used to get whatever its moves gave, which is a hard edge almost everywhere (pair judge 14:42, eye #10)
  if (!plan.edges) { if (touching.size) fail(`edges: the plan names no edges, but these areas share boundaries: ${[...touching].join(', ')}; name each hard, soft or lost with a reason`); return null; }
  const edges = plan.edges;
  const missing = [...touching].filter(k => !edges.has(k)), apart = [...edges.keys()].filter(k => !touching.has(k));
  if (missing.length) fail(`edges: shared boundaries with no edge named: ${missing.join(', ')}`);
  // a cropped view can hide where two areas meet, so only a full view proves a named pair apart
  if (apart.length && !plan.doc.view) fail(`edges: named pairs that share no boundary: ${apart.join(', ')}`);
  const byArea = new Map(ids.map(id => [id, []]));
  for (const e of edges.values()) for (const [me, other] of [e.areas, [...e.areas].reverse()]) byArea.get(me).push({ ...e, other, otherIndex: ids.indexOf(other) });
  return byArea;
}

/** A hard edge must be dry before the next pass meets it: true when `areaId` has a hard edge to an area in `wet`. */
export function hardEdgeDue(plan, areaId, wet) {
  return Boolean(plan?.edgesByArea?.get(areaId)?.some(e => e.kind === 'hard' && wet.has(e.other)));
}

/** The soft edges of an area's pass, as plan-grid cells within `reach` cells of the boundary with each soft neighbour. */
export function softEdgeCells(plan, areaId, reach) {
  const soft = plan?.edgesByArea?.get(areaId)?.filter(e => e.kind === 'soft') ?? [];
  if (!soft.length) return null;
  const { w, h, owner } = plan, me = plan.doc.areas.findIndex(a => a.id === areaId), others = new Set(soft.map(e => e.otherIndex));
  const near = new Uint8Array(w * h), R = Math.max(1, Math.ceil(reach));
  let any = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (owner[i] !== me) continue;
    const seed = (x > 0 && others.has(owner[i - 1])) || (x + 1 < w && others.has(owner[i + 1])) || (y > 0 && others.has(owner[i - w])) || (y + 1 < h && others.has(owner[i + w]));
    if (!seed) continue;
    any = true;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) near[yy * w + xx] = 1; }
  }
  return any ? { where: near, reasons: soft.map(e => `${e.other}: ${e.reason}`) } : null;
}
