// The last stage's final lights: the planned thin lights, laid as rigger strokes of white gouache on the dry painting.
// The plan was made before the first wash (tools/plate/gouache-plan.mjs); nothing is read from the target here. A stroke
// is laid only where the painting lost its light: the washes read at least MARGIN_OD denser along it than the light was.
// The white goes down by the dry-deposit route a pencil uses (src/media/graphite.mjs) into the sheet's top layer, as one
// more pigment, so the Kubelka-Munk render that draws every glaze draws it, hiding what it lies on by its thickness.
import fs from 'node:fs';
import path from 'node:path';
import { pencilDraw } from '../../src/media/graphite.mjs';
import { layersChanged } from '../../src/media/sheet.mjs';
import { GOUACHE_FILM, riggerPoints } from '../../src/media/gouache.mjs';
import { DEFAULT_SHEET_MM } from '../../src/media/sheet-size.mjs';

export const MARGIN_OD = 0.15;
const PRESSURE_WANDER = 0.25, TOOTH = 0.35;

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

/** The strokes a painting still needs: those whose light the washes covered. Pure; `painted` is density per plan cell. */
export function strokesToLay(strokes, painted, w, h) {
  const lay = [], kept = [];
  for (const s of strokes) {
    const along = median(s.curve.map(([x, y]) => painted[Math.min(h - 1, Math.max(0, Math.floor(y))) * w + Math.min(w - 1, Math.max(0, Math.floor(x)))]));
    (along - s.lightOd >= MARGIN_OD ? lay : kept).push({ ...s, paintedOd: +along.toFixed(3) });
  }
  return { lay, kept };
}

/** A strand's root end first: the hair grows from the body of its group (one coat, or the single lights together) and the
 *  stroke lifts to its tip. */
export function rootFirst(strokes) {
  const groups = new Map();
  for (const s of strokes) if (s.kind === 'strand') { const k = s.field ?? 'single', g = groups.get(k) ?? { x: 0, y: 0, n: 0 }, m = s.curve[s.curve.length >> 1]; g.x += m[0]; g.y += m[1]; g.n++; groups.set(k, g); }
  return strokes.map(s => {
    if (s.kind !== 'strand') return s;
    const g = groups.get(s.field ?? 'single'), cx = g.x / g.n, cy = g.y / g.n, d = p => Math.hypot(p[0] - cx, p[1] - cy);
    return d(s.curve[0]) <= d(s.curve.at(-1)) ? s : { ...s, curve: [...s.curve].reverse() };
  });
}

export async function layGouache(ctx) {
  const { GOUACHE_PLAN: plan, GOUACHE_AT: at, SC, W2, N2, w, h, out, num, render, sheetDensity, shoot, FILM_BY_PAINT, SEED } = ctx;
  const sheet = ctx.sheet, sheetMm = num('sheetmm', DEFAULT_SHEET_MM), mmPerCell = sheetMm / W2;
  const { lay, kept } = strokesToLay(plan.strokes, sheetDensity(render()), w, h);
  const items = rootFirst(lay).map(s => ({ ...s, points: riggerPoints(s.curve, { widthCells: s.widthMm / mmPerCell, scale: SC }).map(p => ({ ...p, x: p.x - 0.5, y: p.y - 0.5 })) }));
  const seed = SEED + 4100;
  let drawn = 0;
  if (items.length) {
    // the white, one stroke after another, then the tint of each warm light over the same stroke (same seed and
    // ordinal, so the same pressure and the same cells)
    // every stroke written to the tape (a 'g' mark) is filmed, or the native recording is incomplete and the run fails
    const filmed = ctx.NATIVE_CAPTURE ? { afterStroke: () => ctx.NATIVE_CAPTURE('graphite') } : {};
    const r = pencilDraw(sheet, items.map(s => ({ points: s.points })), at, { amount: GOUACHE_FILM, width: 1, vary: PRESSURE_WANDER, tooth: TOOTH, seed, usePointWidths: true, ...filmed });
    drawn = r.drawn;
    items.forEach((s, gi) => { for (const m of s.tint.mix) pencilDraw(sheet, [{ points: s.points }], m.pigment, { amount: m.amount, width: 1, vary: PRESSURE_WANDER, tooth: TOOTH, seed, ordinal: gi, usePointWidths: true, ...filmed }); });
    layersChanged(sheet);
  }
  const film = sheet.D[at]; let touched = 0;
  if (items.length) for (let i = 0; i < N2; i++) if (film[i] > 0.05 * GOUACHE_FILM) touched++;
  const laid = {
    strokes: items.length, singles: items.filter(s => s.kind === 'strand' && s.field == null).length, fieldStrokes: items.filter(s => s.field != null).length, glints: items.filter(s => s.kind === 'glint').length,
    lengthMm: +items.reduce((a, s) => a + s.lengthMm, 0).toFixed(1), cellsTouched: touched, shareOfSheet: +(touched / N2).toFixed(5), tinted: items.filter(s => s.tint.mix.length).length,
    skippedWashKeptLight: kept.length, marginOd: MARGIN_OD, drawn,
  };
  ctx.GOUACHE_RECORD = { ...plan.record, laid };
  fs.writeFileSync(path.join(out, 'gouache.json'), JSON.stringify({ ...ctx.GOUACHE_RECORD, strokes: items.map(({ points, curve, ...s }) => ({ ...s, points: curve.length })) }, null, 1));
  console.log(`gouache: ${laid.strokes} rigger strokes (${laid.singles} single lights, ${laid.fieldStrokes} in coats, ${laid.glints} glints, ${laid.tinted} tinted), ${laid.lengthMm} mm, ${(100 * laid.shareOfSheet).toFixed(3)}% of the sheet; ${kept.length} lights the washes kept`);
  ctx.STAGE = { stage: 'gouache' }; ctx.NATIVE_CAPTURE?.('gouache-strokes');
  if (items.length && !FILM_BY_PAINT) await shoot();
  return laid;
}
