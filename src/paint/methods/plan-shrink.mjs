// A wash plan made on the final sheet's grid, brought onto a look's coarser grid of the same sheet. A look is painted
// on fewer cells so that it takes minutes (tools/paint/look.mjs), but the code planner reads its shapes on the cell
// grid: planned again for the small sheet it is another plan (154 washes where the final has 121), and an author's edit
// of the final's plan matches nothing in it. So the plan is the final's, wash for wash: its strokes, outlines and
// brushes are in millimetres and are kept as they are; only what is told cell by cell (each wash's cells, the value and
// region maps, the kept paper) is brought down, and each wash's area and planned paint with it.
// Nothing here reads the sheet or the target.
import { passage } from '../../crop/blockin.mjs';

/** What a wash holds of its grid (blockin.mjs passage): rebuilt here, never copied. */
const SHAPE_OWN = new Set(['ids', 'id', 'box', 'amount', 'area', 'w', '_mask', 'mask', 'graded', '_valuePlan']);
const fail = what => { throw new Error(`plan shrink: ${what}`); };

/** The plan's cell fields this module brings down; a grid-sized array anywhere else in a plan is refused, not skipped. */
const KNOWN = new Set(['ids', 'mask', '_mask', 'graded', 'values', 'bands', 'labels', 'protectedCells']);

/**
 * The block of final cells each look cell covers, along one axis: [first, past-the-last) per look cell, every final
 * cell in exactly one block, no block empty.
 */
export function blocks(from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || to < 1 || from < to) throw new RangeError(`plan shrink: a grid of ${from} cells cannot be brought onto ${to}`);
  return Array.from({ length: to }, (_, q) => [Math.floor(q * from / to), Math.floor((q + 1) * from / to)]);
}

/**
 * @param {object} plan a wash plan on a grid of `from.w` x `from.h` cells (study-washes.mjs, script-washes.mjs, with or
 *   without an author's edit applied)
 * @param {{ w: number, h: number }} from the plan's grid
 * @param {{ w: number, h: number, sheetWidthMm: number }} to the look's grid and the sheet's width
 * @returns {object} a new plan on the look's grid: the same layers, washes, mixes, strokes and order
 */
export function shrinkPlan(plan, from, to) {
  const bx = blocks(from.w, to.w), by = blocks(from.h, to.h), N = from.w * from.h, n = to.w * to.h, cellMm = to.sheetWidthMm / to.w;
  if (!(to.sheetWidthMm > 0)) throw new RangeError('plan shrink: the sheet has no width in millimetres');
  refuseUnknown(plan, N);
  const sized = (a, what) => { if (a.length !== N) throw new RangeError(`plan shrink: ${what} has ${a.length} cells, the plan's grid has ${N}`); return a; };
  // a look cell is a wash's when at least half of the final cells under it are; a wash too thin for that keeps every
  // look cell it touches, so no wash of the final's plan is missing from the look
  const mark = (a, isSet, box, least) => {
    const out = new Uint8Array(n); let count = 0;
    const y0 = box ? rowOf(by, box.y0) : 0, y1 = box ? rowOf(by, box.y1) : to.h - 1, x0 = box ? rowOf(bx, box.x0) : 0, x1 = box ? rowOf(bx, box.x1) : to.w - 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let set = 0, all = 0;
      for (let v = by[y][0]; v < by[y][1]; v++) for (let u = bx[x][0]; u < bx[x][1]; u++) { all++; if (isSet(a[v * from.w + u])) set++; }
      if (least === 'any' ? set > 0 : 2 * set >= all && set > 0) { out[y * to.w + x] = 1; count++; }
    }
    return { out, count };
  };
  const mean = a => { const out = new Float32Array(n); for (let y = 0; y < to.h; y++) for (let x = 0; x < to.w; x++) { let s = 0, c = 0; for (let v = by[y][0]; v < by[y][1]; v++) for (let u = bx[x][0]; u < bx[x][1]; u++) { s += a[v * from.w + u]; c++; } out[y * to.w + x] = s / c; } return out; };
  // the commonest label under a look cell (the first met on a tie)
  const mode = a => { const out = new a.constructor(n); for (let y = 0; y < to.h; y++) for (let x = 0; x < to.w; x++) { const seen = new Map(); let best = 0, top = 0, first = true; for (let v = by[y][0]; v < by[y][1]; v++) for (let u = bx[x][0]; u < bx[x][1]; u++) { const l = a[v * from.w + u], c = (seen.get(l) ?? 0) + 1; seen.set(l, c); if (first || c > top) { best = l; top = c; first = false; } } out[y * to.w + x] = best; } return out; };
  const areaOf = new Map();
  const intentOf = v => (v ? { ...v, resolution: v.resolution ? { ...v.resolution, mmPerCell: cellMm } : v.resolution, edges: v.edges ? { ...v.edges, hardCells: cellList(v.edges.hardCells), softCells: cellList(v.edges.softCells) } : v.edges } : v);
  const lookOf = i => { const y = (i / from.w) | 0, x = i - y * from.w; return rowOf(by, y) * to.w + rowOf(bx, x); };
  const cellList = list => (Array.isArray(list) && list.length && list.every(Number.isInteger) ? [...new Set(list.map(lookOf))] : list);
  const shape = sh => {
    // a wash is a label in its own cell field (blockin.mjs passage), or, once its mask was replaced, the mask alone
    const field = sized(sh.ids ?? sh._mask ?? fail('a wash with neither cells nor a mask'), 'a wash\'s cells'), own = sh.ids ? v => v === sh.id : v => v > 0;
    let m = mark(field, own, sh.box, 'half'); if (!m.count && sh.area > 0) m = mark(field, own, sh.box, 'any');
    const box = { x0: to.w, y0: to.h, x1: -1, y1: -1 };
    for (let i = 0; i < n; i++) if (m.out[i]) { const x = i % to.w, y = (i / to.w) | 0; if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
    let out;
    if (sh.ids) { const ids = new sh.ids.constructor(n); for (let i = 0; i < n; i++) if (m.out[i]) ids[i] = sh.id; out = passage(ids, sh.id, box, sh.amount, m.count, to.w); }
    else { out = passage(null, sh.id, null, sh.amount, m.count, to.w); out._mask = m.out; }
    for (const k of Object.keys(sh)) if (!SHAPE_OWN.has(k)) out[k] = sh[k];
    out._valuePlan = intentOf(sh._valuePlan);
    if (sh.graded) out.graded = mean(sized(sh.graded, 'a graded wash'));
    if (sh._valuePlan?.id != null) areaOf.set(sh._valuePlan.id, { was: sh.area, now: m.count });
    return out;
  };
  const layers = plan.layers.map(l => { const shapes = l.shapes.map(shape); return { ...l, shapes, area: shapes.reduce((a, s) => a + s.area, 0) }; });
  const instructions = plan.instructions.map(q => {
    const a = areaOf.get(q.id); if (!a) throw new Error(`plan shrink: wash ${q.id} is in the plan's list but in none of its layers`);
    return { ...intentOf(q), area: a.now, plannedPigmentMass: a.was > 0 ? q.plannedPigmentMass * a.now / a.was : 0 };
  });
  const out = { ...plan, layers, instructions };
  if (plan.value) out.value = { ...plan.value, ...(plan.value.values ? { values: mean(sized(plan.value.values, 'the value map')) } : {}), ...(plan.value.bands ? { bands: mode(sized(plan.value.bands, 'the band map')) } : {}) };
  if (plan.regions?.labels) out.regions = { ...plan.regions, labels: mode(sized(plan.regions.labels, 'the region map')) };
  if (plan.protectedCells) {
    if (!ArrayBuffer.isView(plan.protectedCells)) throw new Error('plan shrink: the plan\'s kept paper is not a cell field');
    const m = mark(sized(plan.protectedCells, 'the kept paper'), v => v > 0, null, 'half').out, kept = new plan.protectedCells.constructor(n);
    for (let i = 0; i < n; i++) kept[i] = m[i];
    out.protectedCells = kept;
  }
  if (Array.isArray(plan.lightShapes)) out.lightShapes = plan.lightShapes.map(s => (Number.isFinite(s.cells) ? { ...s, cells: Math.round(s.cells * n / N) } : s));
  return out;
}

/** The look row (or column) a final row (or column) falls in. */
function rowOf(b, v) { let lo = 0, hi = b.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (v >= b[mid][1]) lo = mid + 1; else hi = mid; } return lo; }

/** A grid-sized array under a name this module does not bring down is an error: it would be left on the final's grid. */
function refuseUnknown(plan, N) {
  const walk = (v, name, depth) => {
    if (v == null || typeof v !== 'object' || depth > 8) return;
    if (ArrayBuffer.isView(v)) { if (v.length === N && !KNOWN.has(name)) throw new Error(`plan shrink: the plan carries a cell field this look cannot bring down (${name})`); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, name, depth + 1); return; }
    for (const [k, x] of Object.entries(v)) walk(x, k, depth + 1);
  };
  walk(plan, 'plan', 0);
}
