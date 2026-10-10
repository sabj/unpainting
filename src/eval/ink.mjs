// Is the source's drawing present in the painted sheet, and did the sheet add drawing the source lacks?
// Density alone cannot tell a pen line from a brush edge. Reuses separate() from crop/inkwash.mjs so both agree
// on what ink is; it needs RGB plus paper colour because the pen/brush split turns on hue.
import { separate } from '../crop/inkwash.mjs';
import { matchMasks } from '../crop/layers.mjs';
import { quantile } from './image.mjs';

/** Median crossWidth over a separator's own ink cells, or undefined when it found none to measure. */
function medianInkWidth(sep) {
  const widths = [];
  for (let i = 0; i < sep.ink.length; i++) if (sep.ink[i]) widths.push(sep.width[i]);
  return widths.length ? quantile(widths, 0.5) : undefined;
}

/**
 * Does the painted sheet's drawing agree with the source's, cell for cell.
 *
 * @param srcRGB      raw RGB of the source picture, length w*h*3, 0..255
 * @param paintedRGB  raw RGB of the painted sheet, same size
 * @param w, h        picture size
 * @param paper       paper colour [r,g,b] 0..255, exactly as separate() takes it
 * @param opts.tol    positional slack in cells before a mark counts as missing or extra (default 2)
 * @param opts.*      passed to separate() unchanged, for both sides alike
 */
export function inkAgreement(srcRGB, paintedRGB, w, h, paper, {
  tol = 2,
  recallLow = 0.3,
  precisionLow = 0.3,
  shareMin = 0.01,
  widthLow = 0.6,
  widthHigh = 1.6,
  ...separatorOpts
} = {}) {
  const src = separate(srcRGB, w, h, paper, separatorOpts);
  const painted = separate(paintedRGB, w, h, paper, separatorOpts);
  const n = w * h;
  const srcInkShare = src.stats.ink / n, paintedInkShare = painted.stats.ink / n;

  // matchMasks(a, b): precision of a, recall of b. Painted first, source second.
  const { precision, recall } = matchMasks(painted.ink, src.ink, w, h, tol);

  const srcWidth = medianInkWidth(src), paintedWidth = medianInkWidth(painted);
  const widthRatio = srcWidth > 0 && paintedWidth !== undefined ? paintedWidth / srcWidth : undefined;

  const flags = [];
  // below this share the source barely draws, and recall is noise
  if (srcInkShare > shareMin && recall < recallLow) {
    flags.push(`no drawing where the source has it: recall ${recall.toFixed(2)} against a source ink share of ${(100 * srcInkShare).toFixed(1)}%`);
  }
  if (precision < precisionLow && paintedInkShare > shareMin) {
    flags.push(`drawing the source does not have: precision ${precision.toFixed(2)} on a painted ink share of ${(100 * paintedInkShare).toFixed(1)}%`);
  }
  if (widthRatio !== undefined) {
    if (widthRatio > widthHigh) flags.push(`lines too heavy: painted width is ${widthRatio.toFixed(2)}x the source's (${paintedWidth.toFixed(1)} vs ${srcWidth.toFixed(1)} cells)`);
    if (widthRatio < widthLow) flags.push(`lines too light: painted width is ${widthRatio.toFixed(2)}x the source's (${paintedWidth.toFixed(1)} vs ${srcWidth.toFixed(1)} cells)`);
  }

  return { recall, precision, srcInkShare, paintedInkShare, widthRatio, flags };
}
