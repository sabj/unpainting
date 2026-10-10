// Bench image I/O, per-image paper colour, and optical density against that paper.
// Each image gets its own paper so a warmer sheet is measured only for what was painted on it.
import sharp from 'sharp';

const lumOf = (rgb, i) => (0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2]) / 255;

/** This image's paper: the mean colour of its lightest tenth. */
export function paperWhite(rgb, n, share = 0.1) {
  const idx = [...Array(n).keys()].sort((a, b) => lumOf(rgb, b) - lumOf(rgb, a)).slice(0, Math.max(1, Math.round(n * share)));
  return [0, 1, 2].map(c => idx.reduce((s, i) => s + rgb[i * 3 + c], 0) / idx.length);
}

/** Optical density against a paper colour: D = -ln(L / paperL), floored at 0 and capped where the log blows up. */
export function densityOf(rgb, n, paperRGB) {
  const paperL = (0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2]) / 255, D = new Float32Array(n);
  for (let i = 0; i < n; i++) D[i] = Math.max(0, -Math.log(Math.max(0.02, Math.min(1, lumOf(rgb, i) / paperL))));
  return D;
}
