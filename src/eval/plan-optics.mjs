// The plan in the painted sheet's own units, for the execution marks (src/eval/composite.mjs execution and
// intermediates, tools/paint-plate.mjs mark() and the covered check).
//
// The painted side is optical density: the rendered sheet's luminance against bare paper, -ln(L / L_paper), averaged
// over the SC x SC sheet cells of each picture cell. The plan side used to be the ledger of planned pigment weighted by
// each pigment's mean K, which reads about half as dark as the same pigment rendered, and it left out what was on the
// sheet before the first wash (the drawing, the paper's tooth). So pass 1 on Mittens read 427% of the plan's forms
// with agreement 0.45, and other runs read up to 40355%.
//
// Now the planned layers go through the same Kubelka-Munk optics the sheet is rendered with (src/media/km.mjs), laid
// over the sheet as it stood before the first wash, and are read as density the same way. Both sides then hold the
// drawing, the paper and the glazes, and a pass that floods or falls short shows up as itself. Mittens, seed 0, fast:
// the run flagged pass 1 at 427% (agreement 0.45) and ended at 103%; it now flags no pass and ends at 62% at agreement
// 0.95. The painting is byte-identical: only the diagnostic changed.
import { renderLayers } from '../media/km.mjs';

const luminance = (rgb, i) => 0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2];

/** Optical density per cell of an RGB picture against bare paper: -ln(L / L_paper), clamped to [0, -ln 0.02]. */
export function densityOf(rgb, paperRGB, n) {
  const paper = luminance(paperRGB, 0), D = new Float32Array(n);
  for (let i = 0; i < n; i++) D[i] = Math.max(0, -Math.log(Math.max(0.02, Math.min(1, luminance(rgb, i * 3) / paper))));
  return D;
}

/** The sheet render (W2 wide, RGB, SC sheet cells a side per picture cell) averaged to w x h picture cells. */
export function cellRGB(big, { w, h, SC, W2 }) {
  const out = new Uint8ClampedArray(w * h * 3), k = SC * SC;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < SC; dy++) for (let dx = 0; dx < SC; dx++) {
      const q = ((y * SC + dy) * W2 + x * SC + dx) * 3;
      r += big[q]; g += big[q + 1]; b += big[q + 2];
    }
    const o = (y * w + x) * 3;
    out[o] = r / k; out[o + 1] = g / k; out[o + 2] = b / k;
  }
  return out;
}

/**
 * The planned pigment ledger (n cells x pigments.length, in sheet thickness per cell) laid over `under` (picture-cell
 * RGB, n x 3; bare paper when null) and read as optical density against bare paper.
 */
export function planDensityOver(expected, pigments, paperRGB, n, under = null) {
  const K = pigments.length, layer = pigments.map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j < K; j++) layer[j][i] = expected[i * K + j];
  let base = under;
  if (!base) { base = new Uint8ClampedArray(n * 3); for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) base[i * 3 + c] = paperRGB[c]; }
  return densityOf(renderLayers([layer], pigments, base, n, 1), paperRGB, n);
}
