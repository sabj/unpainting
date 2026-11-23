// An eraser passage of a painting script or an edited plan (`kind: "erase"`): the pencil rubbed out where it passes,
// at any point in the order. Its physics is the level 1 kit's eraser (src/media/kit-graphite.mjs rubOut), shared, not
// copied: a firm rub lifts most of the graphite from bare paper, far less of graphite under a dried wash, a trace of
// paint and soluble ink, no waterproof ink, and it refuses a sheet wet where it passes. Nothing here reads the subject.
//
//   checkErase(p, at)                    the passage's fields, said plainly when wrong
//   eraseStrokes(p, seed)                its strokes (mm): written point by point, or rubbed in lanes over a region
//   eraseLayer(p, strokes, {...})        the plan's layer and instruction for it (the paint step lays it with layErase)
//   eraseSaid(instructions)              what each erase will do, for the plan's answer
//   layErase(sheet, erase, {...})        the rub on the sheet, stroke by stroke, with a record of each
import { sweeps, handOf, written } from './script-marks.mjs';
import { rubOut, graphiteKeep, paintKeep } from '../../media/kit-graphite.mjs';

/** An eraser's width (mm) may be from this to that. */
const ERASER_MM = Object.freeze([0.5, 10]);
/** The width when the passage names none (mm): a kneaded eraser pinched to an edge. */
const DEFAULT_MM = 3;
/** Paint laid over the graphite (the sheet's amount per cell): a pale dried wash (kit TIPS 25: 19% came off under it) and a
 *  medium one (an umber and ochre wash at dilution medium in the session painter, mittens-closeup look, 22 Nov: 4 to 5%). */
const PALE_FILM = 0.17, MEDIUM_FILM = 1.0;
const WAITS = new Set(['dry', 'damp', 'none']);

const pressureOf = p => { const v = p.handling?.pressure ?? 1; return typeof v === 'number' ? v : Array.isArray(v) ? Math.max(...v.map(Number)) : NaN; };

/** Throws, saying what is wrong, for an erase passage that cannot be laid. */
export function checkErase(p, at) {
  const mm = p.widthMm ?? DEFAULT_MM;
  if (!(mm >= ERASER_MM[0] && mm <= ERASER_MM[1])) throw Error(`${at}: an erase passage's "widthMm" is the eraser's width, ${ERASER_MM[0]} to ${ERASER_MM[1]} mm, not ${p.widthMm}`);
  if (p.paint || p.charges?.length || p.brush != null || p.paper != null && p.paper !== 'dry') throw Error(`${at}: an erase passage lays no paint: it takes no paint, charges, brush or wet paper (the eraser needs dry paper)`);
  if (p.wait != null && !WAITS.has(p.wait)) throw Error(`${at}: wait ${p.wait} is not dry, damp or none`);
  const given = Array.isArray(p.strokes) && p.strokes.length, region = (p.region?.length >= 3) || p.regions?.some(P => P?.length >= 3);
  if (!given && !region) throw Error(`${at}: an erase passage needs its strokes (each "points": [[x, y, pressure], ...]) or a region to rub over`);
  if (given) for (const s of p.strokes) {
    if (!Array.isArray(s?.points) || s.points.length < 2) throw Error(`${at}: every eraser stroke is "points": [[x, y, pressure], ...], at least two points`);
    for (const q of s.points) if (!Number.isFinite(q?.[0]) || !Number.isFinite(q?.[1]) || (q[2] != null && !(q[2] >= 0 && q[2] <= 1))) throw Error(`${at}: an eraser point is [x, y, pressure] in mm, pressure 0 to 1`);
  }
  const pr = pressureOf(p); if (!(pr > 0 && pr <= 1)) throw Error(`${at}: an erase passage's "handling.pressure" is one number above 0 and up to 1 (1 a firm rub)`);
}

/** The strokes of an erase passage (mm, points [x, y, pressure]): its own, or lanes over its region at its pressure. */
export function eraseStrokes(p, seed = 0) {
  const widthMm = p.widthMm ?? DEFAULT_MM, rng = handOf(`${seed}/${p.id}/erase`);
  if (Array.isArray(p.strokes) && p.strokes.length) return p.strokes.map(s => ({ ...written(s.points.map(([x, y, q]) => [x, y, q ?? 1]), { widthMm, rng }), kind: 'rub' }));
  const polys = (p.regions?.length ? p.regions : [p.region]).filter(P => P?.length >= 3);
  return sweeps(polys, { widthMm, deg: Number(p.handling?.direction ?? 0) || 0, pressure: pressureOf(p), lights: [], rng, hand: 0 }).map(s => ({ ...s, kind: 'rub', points: s.points.map(q => [q[0], q[1], pressureOf(p)]) }));
}

/** What one pass at pressure p takes: shares of the graphite from bare paper, from under a pale and a medium dried wash, and of the paint. */
export function eraserTakes(p) {
  const r = v => +(1 - v).toFixed(2);
  return { bare: r(graphiteKeep(p, 0)), underPale: r(graphiteKeep(p, PALE_FILM)), underMedium: r(graphiteKeep(p, MEDIUM_FILM)), paint: r(paintKeep(p)) };
}

/**
 * The plan's layer for an erase passage, and its instruction (value-plan.json's pass: arrows, rows, counts). `overPaint`:
 * the share of the eraser's cells that already hold paint planned before it; `afterWet`: the passage before it is laid
 * wet and this one does not wait for the sheet to dry.
 */
export function eraseLayer(p, strokes, { stage, overPaint = 0, afterWet = false, areaMm2 = 0 }) {
  const widthMm = p.widthMm ?? DEFAULT_MM, wait = p.wait ?? 'dry', pressure = pressureOf(p);
  const warning = afterWet && wait !== 'dry' ? `WARNING, erase ${p.id}: it follows a passage laid wet with wait "${wait}", so the sheet may still be wet where it passes; the painter will stop there rather than rub wet paper. Give it "wait": "dry"` : null;
  const instruction = { id: `erase/s${stage}/${p.id}`, phase: 'erase', stage, valueBand: stage, layer: stage, kind: 'erase', thing: `${p.id}: ${p.what ?? 'rubbed out'}`, move: 'erase on dry', strokes,
    widestBrushMm: widthMm, areaMm2: +areaMm2.toFixed(1), script: { passage: p.id, kind: 'erase', paper: 'dry', wait }, erase: { widthMm, pressure, overPaintShare: +overPaint.toFixed(2), takes: eraserTakes(pressure), warning } };
  const layer = { value: stage, pigment: -1, shapes: [], _valuePhase: 'erase', _order: { phase: 'erase', region: 0, shoot: true }, _script: [p.id], _erase: { id: p.id, what: p.what ?? '', widthMm, wait, strokes, instruction } };
  return { layer, instruction };
}

/** What each erase of a plan will do, for its author: one line each, '' for a plan without one. */
export function eraseSaid(instructions) {
  const list = (instructions ?? []).filter(q => q.kind === 'erase');
  if (!list.length) return '';
  return ` ${list.length} erase${list.length > 1 ? 's' : ''}: ${list.map(q => { const e = q.erase, t = e.takes;
    return `${q.script.passage} (${q.strokes.length} stroke${q.strokes.length > 1 ? 's' : ''}, ${e.widthMm} mm eraser, pressure ${e.pressure}) takes off about ${Math.round(100 * t.bare)}% of the pencil where it passes bare paper, about ${Math.round(100 * t.underPale)}% under a pale dried wash, ${Math.round(100 * t.underMedium)}% under a medium one and less under a dark one, and ${Math.round(100 * t.paint)}% of the paint; ${Math.round(100 * e.overPaintShare)}% of its path lies on paint planned before it${e.warning ? `. ${e.warning}` : ''}`; }).join('; ')}. A second pass takes as much again of what is left.`;
}

/**
 * The erase laid on the sheet. `erase`: the layer's _erase; `cellMm`: sheet mm per cell; `graphite`: the sheet's
 * graphite pigments. Each stroke is rubbed with the kit's eraser, refusing a sheet wet where it passes: the throw says
 * which passage, and nothing of that stroke is rubbed. `onStroke(record, stroke)` after each. Returns a record per stroke.
 */
export function layErase(sheet, erase, { cellMm, graphite, onStroke = null }) {
  if (!graphite.length) throw Error(`erase ${erase.id}: this painting has no pencil on the sheet (its drawing is not graphite), so there is nothing for an eraser to take off. Leave the erase out, or draw in pencil`);
  const width = erase.widthMm / cellMm;
  return erase.strokes.map((st, k) => {
    const pts = st.points.map(q => ({ x: q[0] / cellMm, y: q[1] / cellMm, p: Math.max(0, Math.min(1, q[2] ?? 1)) }));
    let r; try { r = rubOut(sheet, pts, { width, graphite, where: 'path' }); } catch (e) { throw Error(`erase ${erase.id}, stroke ${k + 1}: ${e.message}. The painting stops here: give the erase "wait": "dry", or move it after the sheet has dried`); }
    const rec = { stroke: k + 1, cells: r.cells, graphiteShare: +r.graphiteShare.toFixed(4), graphiteBefore: +r.graphiteBefore.toFixed(5), graphiteLifted: +r.graphiteLifted.toFixed(5), paintLifted: +r.paintLifted.toFixed(5) };
    onStroke?.(rec, st);
    return rec;
  });
}
