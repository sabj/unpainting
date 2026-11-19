// The final lights, decided before the first wash. Rule, the same for every picture: where the source has a light
// thinner than the wash planner can go round (src/crop/thin-lights.mjs) over a dark surround, the painter lays it last
// as a rigger stroke of white gouache (src/media/gouache.mjs), tinted toward the light's own colour; where it has none,
// no gouache is laid and no pigment channel is added to the sheet. The decision is made here from the planning data and
// recorded in the run card, so it holds in both looking modes: nothing is read from the target at paint time.
import sharp from 'sharp';
import path from 'node:path';
import { thinLights, TOUCH_MM, RIGGER_MM } from '../../src/crop/thin-lights.mjs';
import { paperDensity } from '../../src/crop/lights.mjs';
import { gouacheTint, GOUACHE_PIGMENT } from '../../src/media/gouache.mjs';
import { strokeCeiling } from '../guard/cheat-risk.mjs';

// A handful of final lights, not a texture: a loaded rigger lays about this many strokes to a sheet of this size.
export const STROKES_PER_100_CM2 = 3;
export const GLINTS_PER_100_CM2 = 1;
// A coat laid from its direction field may use at most this share of the sheet's stroke ceiling (tools/guard/cheat-risk.mjs
// strokeCeiling); the strokes it takes follow the coat's density, and the ceiling is a limit, not a target.
export const FIELD_CEILING_SHARE = 0.1;
const FINE_MAX = 2400;

/**
 * @param image     path of the source image
 * @param w, h      the sheet's cells
 * @param sheetMm   the sheet's width in mm
 * @param pigments  the palette's pigments, for the tint
 * @param crop      [left, top, width, height] of the source the sheet shows, or null
 * @param coat      { status, mask } from the surface labels: a coat laid from a direction field only where the judge says coat.
 *                  Without labels (a judge that could not run, or none asked for) no coat is laid, and the record says why
 * @returns {{ strokes, record }} strokes in sheet cells (plan grid), each with its tint; record for the run card
 */
export async function planGouache({ image, w, h, sheetMm, paperRGB, pigments, crop = null, coat = null }) {
  let src = sharp(image).flatten({ background: '#ffffff' });
  if (crop) src = src.extract({ left: Math.round(crop[0]), top: Math.round(crop[1]), width: Math.round(crop[2]), height: Math.round(crop[3]) });
  const meta = crop ? { width: Math.round(crop[2]) } : await sharp(image).metadata();
  const { data, info } = await src.resize({ width: Math.min(FINE_MAX, 2 * w, meta.width), withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelMm = sheetMm / info.width, sheetCm2 = sheetMm * (sheetMm * info.height / info.width) / 100;
  const D = paperDensity(data, info.width * info.height, paperRGB);
  const strokesMax = Math.max(1, Math.round(STROKES_PER_100_CM2 * sheetCm2 / 100)), glintsMax = Math.max(1, Math.round(GLINTS_PER_100_CM2 * sheetCm2 / 100));
  const sheetHeightMm = sheetMm * info.height / info.width, ceiling = strokeCeiling(sheetMm, sheetHeightMm), fieldCeiling = Math.floor(FIELD_CEILING_SHARE * ceiling);
  const found = thinLights(D, info.width, info.height, { pixelMm, rgb: data, strokesMax, glintsMax, fieldCeiling });
  const sx = w / info.width, sy = h / info.height;
  // a passage of strands is a coat only where the region is labelled one: a wall of light mullions is not fur
  const inCoat = s => { if (!coat || coat.status !== 'ok') return false; const m = s.points[s.points.length >> 1]; return coat.mask[Math.min(h - 1, Math.floor(m[1] * h / info.height)) * w + Math.min(w - 1, Math.floor(m[0] * w / info.width))] === 1; };
  const droppedFields = found.strokes.filter(s => s.field != null && !inCoat(s)).length;
  found.strokes = found.strokes.filter(s => s.field == null || inCoat(s));
  const strokes = found.strokes.map(s => {
    const tint = s.kind === 'glint' ? { mix: [], residual: 0 } : gouacheTint(s.rgb ?? [255, 255, 255], paperRGB, pigments);
    return { kind: s.kind, field: s.field ?? null, curve: s.points.map(([x, y]) => [x * sx, y * sy]), widthMm: +s.widthMm.toFixed(3), lengthMm: +s.lengthMm.toFixed(2), lightOd: +s.lightOd.toFixed(3), surroundOd: s.surroundOd == null ? null : +s.surroundOd.toFixed(3), rgb: s.rgb, tint, fit: s.fit };
  });
  const lengthMm = strokes.reduce((a, s) => a + s.lengthMm, 0);
  const record = {
    decision: strokes.length ? 'gouache' : 'none',
    rule: `light thinner than ${TOUCH_MM} mm (the wash planner's reach), lighter than its surround by a clear step, over a dark surround, long for its width; glints only as true glints`,
    read: { fineWidth: info.width, pixelMm: +pixelMm.toFixed(4), stage: 'planning, before the first wash' },
    rigger: { minMm: RIGGER_MM.min, maxMm: RIGGER_MM.max, pigment: GOUACHE_PIGMENT.name },
    caps: { singlesMax: strokesMax, glintsMax, fieldCeiling, strokeCeiling: ceiling, per100Cm2: { singles: STROKES_PER_100_CM2, glints: GLINTS_PER_100_CM2 }, fieldShareOfCeiling: FIELD_CEILING_SHARE },
    found: found.stats, fields: found.fields, coat: { labels: coat?.status ?? 'not asked', fieldStrokesDropped: droppedFields, reason: droppedFields ? (coat?.status === 'ok' ? 'not in a region labelled a coat' : 'no surface labels: the judge could not run, so no coat is laid') : null },
    planned: { strokes: strokes.length, singles: strokes.filter(s => s.kind === 'strand' && s.field == null).length, fieldStrokes: strokes.filter(s => s.field != null).length, glints: strokes.filter(s => s.kind === 'glint').length, lengthMm: +lengthMm.toFixed(1), shareOfCeiling: +(strokes.length / ceiling).toFixed(4) },
  };
  return { strokes, record };
}
