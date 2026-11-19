// Test lines on a scrap of the painting's paper, as a draughtsman tries a pencil before the drawing: straight strokes at
// a ladder of pressures with the drawing's own pencil (material-profiles.mjs), rendered, and each read as the subject's
// lines are read (line-weight.mjs lineDarkness). The table turns a line's darkness into the pressure that draws it.
//
// Pure apart from the strokes it lays: no files, no target. CPU only, so the table does not depend on the GPU.
import { makePaper } from '../../media/paper.mjs';
import { createSheet, layersOf } from '../../media/sheet.mjs';
import { renderLayers } from '../../media/km.mjs';
import { drawMaterial, materialProfile } from './material-profiles.mjs';
import { lPlane } from './ink-match.mjs';
import { lineDarkness } from './line-weight.mjs';

/** The pressures tried, lightest first. */
export const SCRAP_PRESSURES = Object.freeze([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);

/**
 * The pencil's line at each pressure on blank paper: [{ pressure, drop, widthMm }], `drop` the L* its line reads darker
 * than the paper and `widthMm` the contact width at that pressure, rising in pressure and, made so, in drop. `medium` is a graphite profile's name; each pressure is drawn as five strokes
 * `lengthMm` long at different slopes, since a line a cell wide reads differently along and across the grid.
 */
export function pencilScrap(options) {
  return pencilScrapOver(options)(WHITE);
}

const WHITE = Object.freeze([255, 255, 255]);

/**
 * The same scrap read over paint: the strokes are drawn once, and the function returned gives the table for a ground of
 * any colour `groundRGB`, the pencil's line as the render draws it over a dried wash of that colour. Graphite lies on
 * top of the paint and takes the same share of the light whatever is under it, so a line that reads 16 L* darker than
 * white paper reads about 9 darker than a wash of L* 50. A pencil restating a line over a dry wash presses by this
 * table, not the bare paper's (tools/plate/thin-darks-lay.mjs).
 */
export function pencilScrapOver({ medium, mmPerCell, paperOpts = {}, pressures = SCRAP_PRESSURES, lengthMm = 30 }) {
  const profile = materialProfile(medium);
  if (profile.kind !== 'graphite') throw new Error(`pencil scrap: ${medium} is not a pencil`);
  if (!(mmPerCell > 0)) throw new Error('pencil scrap: mmPerCell must be positive');
  const len = Math.max(40, Math.round(lengthMm / mmPerCell)), pad = Math.ceil(3 / mmPerCell), gap = Math.max(12, Math.ceil(4 / mmPerCell));
  const slopes = [0, 0.18, -0.31, 0.47, -0.62], rise = Math.ceil(0.62 * len), w = len + 2 * pad, h = slopes.length * gap + rise + 2 * pad;
  const lines = slopes.map((m, i) => { const y0 = pad + i * gap + (m < 0 ? rise : 0); return Array.from({ length: 13 }, (_, k) => [pad + len * k / 12, y0 + m * len * k / 12]); });
  const drawn = pressures.map(pressure => {
    const sheet = createSheet(makePaper(w, h, paperOpts), [profile.pigment]);
    drawMaterial(sheet, lines.map(P => ({ points: P.map(([x, y]) => ({ x, y, s: pressure })) })), null, w, h,
      { medium, stage: 'opening', mmPerCell, edgeCut: false, state: { used: 0 }, caps: { lines: lines.length, pressure: 1, minLengthMm: 0 }, audit: [], O: {} });
    return { pressure, layers: layersOf(sheet).map(layer => layer.map(a => Float32Array.from(a))) };
  });
  return groundRGB => {
    const base = new Uint8ClampedArray(w * h * 3); for (let i = 0; i < w * h; i++) { base[i * 3] = groundRGB[0]; base[i * 3 + 1] = groundRGB[1]; base[i * 3 + 2] = groundRGB[2]; }
    let last = 0;
    return drawn.map(({ pressure, layers }) => {
      const L = lPlane(renderLayers(layers, [profile.pigment], base, w * h, 1), w * h);
      const read = lines.map(P => lineDarkness(P.slice(2, -2), L, w, h, mmPerCell)), mean = k => read.reduce((s, r) => s + r[k], 0) / read.length;
      // a firmer pressure never reads lighter: the paper's grain may make one rung dip a hair below the last
      const drop = Math.max(last, mean('drop')); last = drop;
      return { pressure, drop: +drop.toFixed(2), widthMm: +(profile.widthMm[0] + (profile.widthMm[1] - profile.widthMm[0]) * pressure ** profile.pressureExponent).toFixed(3) };
    });
  };
}
