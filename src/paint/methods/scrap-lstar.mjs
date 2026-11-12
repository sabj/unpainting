// L* of one pigment laid at a thickness on the scrap's paper, so a scrap mark read in thickness can be judged by what a
// viewer sees: a difference under one L* (one just noticeable difference, SEAM_MARK in scrap-seam.mjs) is not a line.
import { renderLayers } from '../../media/km.mjs';
import { lightness } from '../../eval/plan-values.mjs';

export function lstarOf(t, pigment, paperRGB = [252, 251, 248]) {
  const rgb = renderLayers([[Float32Array.of(t)]], [pigment], Uint8ClampedArray.from(paperRGB), 1, 1);
  return lightness(rgb[0], rgb[1], rgb[2]);
}
/** How many L* darker `t` dries than `ref` (negative: lighter). */
export const darkerBy = (t, ref, pigment, paperRGB) => lstarOf(ref, pigment, paperRGB) - lstarOf(t, pigment, paperRGB);
