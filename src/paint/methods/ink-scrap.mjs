// A test line on a scrap of the painting's paper, as an artist tries a loaded pen before the drawing: one straight
// stroke with the painting's ink, nib and load on a small blank sheet, rendered, and its darkness read as absorbance
// (-ln of the line's luminance over the paper's). --inkdarkcap uses it to set the ink load so the pen's line is no
// darker than the target's own lines (ink-lines.mjs inkCapFactor).
//
// Pure apart from the simulation it runs: no files, no target. CPU only, so the result does not depend on the GPU.
import { makePaper } from '../../media/paper.mjs';
import { createSheet, layersOf } from '../../media/sheet.mjs';
import { renderLayers } from '../../media/km.mjs';
import { drawGestures } from '../../media/draw.mjs';
import { inkCapFactor } from './ink-lines.mjs';

const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (rgb, i) => 0.2126 * lin(rgb[3 * i]) + 0.7152 * lin(rgb[3 * i + 1]) + 0.0722 * lin(rgb[3 * i + 2]);

/**
 * Absorbance of a pen line on blank paper: the median over the line's middle half of -ln(darkest cell across the
 * line / paper). `pigment` { K, S, ... }; `conc` the ink load; `widthMm` the contact width; `pen` extra pen options
 * (reservoir, damp, ...).
 */
export function scrapAbsorbance({ pigment, conc, mmPerCell, widthMm, pen = {}, paperOpts = {}, lengthMm = 12, seed = 5 }) {
  if (!(conc > 0) || !(mmPerCell > 0) || !(widthMm > 0)) throw new Error('scrapAbsorbance: conc, mmPerCell and widthMm must be positive');
  const nw = widthMm / mmPerCell, len = Math.max(24, Math.round(lengthMm / mmPerCell)), pad = Math.ceil(nw + 8);
  const w = len + 2 * pad, h = 2 * pad + 1, y = pad;
  const paper = makePaper(w, h, { ...paperOpts, seed });
  const sheet = createSheet(paper, [pigment]);
  const points = Array.from({ length: 9 }, (_, k) => ({ x: pad + (len - 1) * k / 8, y, nw, s: 0.6 }));
  drawGestures(sheet, [{ points }], new Float32Array(w * h).fill(0.6), w, h, { ink: [conc], peak: 1, pen: { nib: nw, flex: 0, drop: 0.1, ...pen } });
  const rgb = renderLayers(layersOf(sheet), [pigment], new Uint8ClampedArray(w * h * 3).fill(255), w * h, 1);
  const vals = [];
  for (let x = pad + Math.round(len / 4); x < pad + Math.round(3 * len / 4); x++) {
    let lo = 1; for (let yy = y - Math.ceil(nw) - 1; yy <= y + Math.ceil(nw) + 1; yy++) lo = Math.min(lo, lum(rgb, yy * w + x));
    vals.push(-Math.log(Math.max(1e-4, lo)));
  }
  vals.sort((a, b) => a - b);
  return vals[vals.length >> 1];
}

/**
 * The share of the ink load that brings the scrap line's absorbance to `cap` times `targetAbsorbance`, never above 1.
 * Two secant steps on the scrap, since absorbance is close to, not exactly, linear in the load.
 * @returns { factor, before, after } absorbances before and after
 */
export function inkCapOnScrap({ targetAbsorbance, cap = 1, conc, ...scrap }) {
  const before = scrapAbsorbance({ ...scrap, conc }), want = cap * targetAbsorbance;
  let factor = inkCapFactor(before, targetAbsorbance, cap), after = before;
  for (let i = 0; i < 2 && factor < 1; i++) {
    after = scrapAbsorbance({ ...scrap, conc: conc * factor });
    if (!(after > 0) || Math.abs(after - want) < 0.02 * want) break;
    factor = Math.min(1, factor * want / after);
    after = scrapAbsorbance({ ...scrap, conc: conc * factor });
  }
  return { factor, before, after };
}
