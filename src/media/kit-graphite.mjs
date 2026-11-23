// The level 1 kit's pencil and eraser (bench/v2/kit/kit.mjs). The pencil is the main painter's graphite: the drawing
// profiles graphite-HB and graphite-2B (drawing-materials.mjs) laid dry into the sheet's deposit by pencilDraw
// (graphite.mjs), so pressure, the paper's tooth and the line's width are the physics the session painter uses. Graphite
// stains like waterproof ink (omega 60): water barely moves it, and paint laid over it covers it optically.
// The eraser rubs graphite off dry paper. Graphite with paint laid over it after it is held by the dried gum and comes
// off far less; paint and soluble ink give up only a trace; waterproof ink and wet paper are left alone (a wet sheet is
// refused). What lies over the graphite is known because each cell remembers how much paint was there when its graphite
// was laid. The simulator has no dent, scuff or crushed fibre: neither a heavy line nor the eraser marks the paper. DOM free.
import { pencilDraw } from './graphite.mjs';
import { MATERIAL_PROFILES } from './drawing-materials.mjs';
import { coherent, layersChanged } from './sheet.mjs';

const GRADES = Object.freeze({ HB: 'graphite-HB', '2B': 'graphite-2B' });
/** The sheet pigment of a grade (the drawing profile's). */
export const gradePigment = grade => ({ ...profileOf(grade).pigment });
function profileOf(grade) {
  const p = MATERIAL_PROFILES[GRADES[grade]];
  if (!p) throw new Error(`pencil grade must be one of ${Object.keys(GRADES).join(', ')} (the simulator's two graphite profiles), not ${grade}`);
  return p;
}

/** A pencil of a grade; `width` is the line's width in sheet cells at full pressure (default the profile's widest). */
export function makePencil({ grade = 'HB', width } = {}, mmPerCell) {
  const p = profileOf(grade), full = width ?? p.widthMm[1] / mmPerCell;
  if (!(full >= 0.5 && full <= 12)) throw new Error(`pencil width must be 0.5 to 12 cells (0.13 to 3.1 mm), not ${width}`);
  return Object.freeze({ grade, width: +full.toFixed(4), least: p.widthMm[0] / p.widthMm[1], exponent: p.pressureExponent, amount: p.concentration });
}
/** The line's width at pressure p: narrower when pressed lightly, as the profile's width range says. */
export const widthAt = (pencil, p) => pencil.width * (pencil.least + (1 - pencil.least) * Math.pow(p, pencil.exponent));

export function checkPath(pts, what) {
  if (!Array.isArray(pts) || pts.length < 2) throw new Error(`${what} needs a path of at least 2 points`);
  for (const q of pts) {
    if (!Number.isFinite(q?.x) || !Number.isFinite(q?.y)) throw new Error(`${what}: every point needs a finite x and y`);
    if (!(q.p >= 0 && q.p <= 1)) throw new Error(`${what}: pressure p must be 0 to 1 at every point`);
  }
}

const isWet = (sheet, i) => sheet.M[i] || sheet.W[i] > 0 || sheet.s[i] > 0.02 * sheet.paper.capacity[i];
/** Cells of the sheet holding water (on the surface or in the pores), as the sheet's own drying check counts them. */
export function wetCells(sheet, cells = null) {
  coherent(sheet); let n = 0;
  if (cells) { for (const i of cells) if (isWet(sheet, i)) n++; } else for (let i = 0; i < sheet.n; i++) if (isWet(sheet, i)) n++;
  return n;
}

// per sheet: graphite the kit laid in each cell, and that graphite times the paint the cell held when it was laid
const TRACK = new WeakMap();
function trackOf(sheet) { let t = TRACK.get(sheet); if (!t) TRACK.set(sheet, (t = { g: new Float32Array(sheet.n), under: new Float32Array(sheet.n) })); return t; }
/** Paint (every pigment but graphite) in a cell: wet, deposited and in every dried layer. */
function paintAt(sheet, i, graphite) {
  let s = 0;
  for (let k = 0; k < sheet.K; k++) { if (graphite.includes(k)) continue; s += sheet.G[k][i] + sheet.D[k][i] + sheet.P[k][i]; for (const L of sheet.layers) s += L[k][i]; }
  return s;
}

/** Lay a pencil line [{x, y, p}] in graphite pigment k. `graphite` lists the sheet's graphite pigments. Returns the cells
 *  it touched and how many of them were wet (graphite on wet paper is laid exactly as on dry: see the kit's notes). */
export function layPencil(sheet, pencil, k, pts, { graphite, seed = 1 }) {
  checkPath(pts, 'a pencil line');
  coherent(sheet);
  const D = sheet.D[k], before = new Map();
  const points = pts.map(q => ({ x: q.x, y: q.y, s: q.p, nw: widthAt(pencil, q.p) }));
  pencilDraw(sheet, [{ points }], k, { amount: pencil.amount, width: pencil.width, pressureReference: 1, usePointWidths: true, seed, beforeStroke: ({ cells }) => { for (const i of cells) before.set(i, D[i]); } });
  const t = trackOf(sheet); let wet = 0;
  for (const [i, d0] of before) { const dg = D[i] - d0; if (dg > 0) { t.g[i] += dg; t.under[i] += dg * paintAt(sheet, i, graphite); } if (isWet(sheet, i)) wet++; }
  return { cells: before.size, wet };
}

// How the eraser takes, per pass: graphite on bare paper at full pressure (the session painter's --pencilbare share);
// graphite under paint keeps hold / (hold + paint laid over it) of that (a pale wash about a quarter, a dark one under a
// tenth); paint and soluble ink lose at most `trace` of what the cell holds.
const ERASE = Object.freeze({ bare: 0.85, hold: 0.05, trace: 0.02 });

/** The share of a cell's graphite one pass keeps, at rub strength v (pressure times the eraser's cover of the cell) under
 *  `over` paint laid after the graphite. */
export const graphiteKeep = (v, over) => 1 - ERASE.bare * v * ERASE.hold / (ERASE.hold + over);
/** The share of a cell's paint or soluble ink one pass keeps, at rub strength v. */
export const paintKeep = v => 1 - ERASE.trace * v;

/** Throws, saying why, if this eraser cannot be used here: a width out of range, or water on the sheet (anywhere, or
 *  with `cells` only in those cells: where the eraser passes). */
export function checkEraser(sheet, width, cells = null) {
  if (!(width >= 1 && width <= 120)) throw new Error(`eraser width must be 1 to 120 cells, not ${width}`);
  const wet = wetCells(sheet, cells);
  if (wet && cells) throw new Error(`the sheet is wet where the eraser passes (${wet} cells hold water): an eraser on wet paper pills and tears it. Nothing was rubbed. Let the sheet dry first`);
  if (wet) throw new Error(`the sheet is wet (${wet} cells hold water): an eraser on wet paper pills and tears it. Nothing was rubbed. Dry the sheet first (kit.dryAll)`);
}

/** The cells an eraser `width` cells across touches along pts, each with its rub strength (pressure times cover). */
function rubbed(sheet, pts, width) {
  const { w, h } = sheet, r = width / 2, R = Math.ceil(r + 1), best = new Map();
  for (let j = 1; j < pts.length; j++) {
    const a = pts[j - 1], b = pts[j], m = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5));
    for (let q = 0; q <= m; q++) {
      const u = q / m, x = a.x + (b.x - a.x) * u + 0.5, y = a.y + (b.y - a.y) * u + 0.5, p = a.p + (b.p - a.p) * u;
      for (let yy = Math.floor(y - R); yy <= Math.ceil(y + R); yy++) for (let xx = Math.floor(x - R); xx <= Math.ceil(x + R); xx++) {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const cover = Math.min(1, r + 0.5 - Math.hypot(xx + 0.5 - x, yy + 0.5 - y)); if (cover <= 0) continue;
        const i = yy * w + xx, v = cover * p; if (!(best.get(i) >= v)) best.set(i, v);
      }
    }
  }
  return best;
}

/** Rub [{x, y, p}] with an eraser `width` cells across. Refuses a wet sheet (`where: 'path'`: wet where it passes).
 *  `graphite` lists the graphite pigments; pigments of staining power 60 or more that are not graphite (waterproof ink)
 *  are left alone. Graphite this module did not lay (the session painter's drawing) is taken as under all the paint in
 *  its cell. */
export function rubOut(sheet, pts, { width, graphite, where = 'sheet' }) {
  checkPath(pts, 'an eraser stroke');
  if (where !== 'sheet' && where !== 'path') throw new Error(`rubOut: where is 'sheet' or 'path', not ${where}`);
  const best = where === 'path' ? rubbed(sheet, pts, width) : null;
  checkEraser(sheet, width, best ? [...best.keys()] : null);
  sheet._gpu?.syncLower?.(sheet, Infinity);
  const cells = best ?? rubbed(sheet, pts, width);
  const t = trackOf(sheet), planes = k => [sheet.G[k], sheet.D[k], sheet.P[k], ...sheet.layers.map(L => L[k])];
  const soft = []; for (let k = 0; k < sheet.K; k++) if (!graphite.includes(k) && sheet.pigments[k].omega < 60) soft.push(k);
  let gBefore = 0, gLifted = 0, paintLifted = 0;
  for (const [i, v] of cells) {
    const paint = paintAt(sheet, i, graphite), over = t.g[i] > 0 ? Math.max(0, paint - t.under[i] / t.g[i]) : paint;
    const keep = graphiteKeep(v, over);
    for (const k of graphite) for (const a of planes(k)) { gBefore += a[i]; gLifted += a[i] * (1 - keep); a[i] *= keep; }
    t.g[i] *= keep; t.under[i] *= keep;
    const tr = paintKeep(v);
    for (const k of soft) for (const a of planes(k)) if (a[i] > 0) { paintLifted += a[i] * (1 - tr); a[i] *= tr; }
  }
  layersChanged(sheet);
  sheet._gpu?.cpuWroteAll?.();
  return { cells: cells.size, graphiteBefore: gBefore, graphiteLifted: gLifted, graphiteShare: gBefore > 0 ? gLifted / gBefore : 0, paintLifted };
}
