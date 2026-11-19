// The final lights, decided before the first wash. Rule, the same for every picture: where the source has a light thinner
// than the wash planner can go round (src/crop/thin-lights.mjs) over a dark surround, the painter lays it last as a rigger
// stroke of white gouache (src/media/gouache.mjs), tinted toward the light's own colour; where it has none, no gouache is
// laid and no pigment channel is added to the sheet. Lights inside a region the surface labels call a coat are that
// coat's texture, planned by src/crop/coat-texture.mjs and dry-brushed, so they are left out here. The decision is made
// here from the planning data and recorded in the run card, so it holds in both looking modes: nothing is read from the
// target at paint time.
import sharp from 'sharp';
import { thinLights, TOUCH_MM, RIGGER_MM } from '../../src/crop/thin-lights.mjs';
import { paperDensity } from '../../src/crop/lights.mjs';
import { gouacheTint, GOUACHE_PIGMENT } from '../../src/media/gouache.mjs';
import { strokeCeiling } from '../guard/cheat-risk.mjs';

// A handful of final lights, not a texture: a loaded rigger lays about this many strokes to a sheet of this size.
export const STROKES_PER_100_CM2 = 3;
export const GLINTS_PER_100_CM2 = 1;
const FINE_MAX = 2400;
const SCALE_LIMIT = 1.5;   // the same rule as the coat texture: a mark laid wider than this many strands is not laid

/** The rigger's laid line is its stroke width, and never thinner than one cell. A stroke the strand would not fill is not laid. */
export function scaleOk(measuredMm, widthMm, cellMm) { return Math.max(widthMm, cellMm) <= SCALE_LIMIT * measuredMm; }

/**
 * @param image     path of the source image
 * @param w, h      the sheet's cells
 * @param sheetMm   the sheet's width in mm
 * @param pigments  the palette's pigments, for the tint
 * @param crop      [left, top, width, height] of the source the sheet shows, or null
 * @param coat      { mask } over the plan grid, 1 in the regions the surface labels call a coat: their strands are texture, not single lights
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
  const ceiling = strokeCeiling(sheetMm, sheetMm * info.height / info.width);
  const inCoat = coat?.mask ? (x, y) => coat.mask[Math.min(h - 1, Math.floor(y * h / info.height)) * w + Math.min(w - 1, Math.floor(x * w / info.width))] === 1 : null;
  const found = thinLights(D, info.width, info.height, { pixelMm, rgb: data, strokesMax, glintsMax, skip: inCoat });
  const sx = w / info.width, sy = h / info.height, cellMm = sheetMm / w;
  const tooFine = found.strokes.filter(s => s.kind === 'strand' && !scaleOk(s.measuredMm, s.widthMm, cellMm)).length;
  found.strokes = found.strokes.filter(s => s.kind !== 'strand' || scaleOk(s.measuredMm, s.widthMm, cellMm));
  const strokes = found.strokes.map(s => {
    const tint = s.kind === 'glint' ? { mix: [], residual: 0 } : gouacheTint(s.rgb ?? [255, 255, 255], paperRGB, pigments);
    return { kind: s.kind, curve: s.points.map(([x, y]) => [x * sx, y * sy]), widthMm: +s.widthMm.toFixed(3), lengthMm: +s.lengthMm.toFixed(2), lightOd: +s.lightOd.toFixed(3), surroundOd: s.surroundOd == null ? null : +s.surroundOd.toFixed(3), rgb: s.rgb, tint, fit: s.fit };
  });
  const lengthMm = strokes.reduce((a, s) => a + s.lengthMm, 0);
  const record = {
    decision: strokes.length ? 'gouache' : 'none',
    rule: `light thinner than ${TOUCH_MM} mm (the wash planner's reach), clearly lighter than its dark ring in L*, long for its width; glints only as true glints; strands inside a labelled coat are the coat's texture`,
    read: { fineWidth: info.width, pixelMm: +pixelMm.toFixed(4), stage: 'planning, before the first wash' },
    rigger: { minMm: RIGGER_MM.min, maxMm: RIGGER_MM.max, pigment: GOUACHE_PIGMENT.name },
    caps: { singlesMax: strokesMax, glintsMax, strokeCeiling: ceiling, per100Cm2: { singles: STROKES_PER_100_CM2, glints: GLINTS_PER_100_CM2 } },
    found: found.stats, scaleRule: { limit: SCALE_LIMIT, riggerLineMm: +cellMm.toFixed(3), droppedTooFine: tooFine },
    planned: { strokes: strokes.length, singles: strokes.filter(s => s.kind === 'strand').length, glints: strokes.filter(s => s.kind === 'glint').length, lengthMm: +lengthMm.toFixed(1), shareOfCeiling: +(strokes.length / ceiling).toFixed(4) },
  };
  return { strokes, record };
}
