// The pen-line share of the source, read at one width, for every pen or pencil choice in the plan.
import { paperOf } from '../../crop/palettepick.mjs';
import { separate } from '../../crop/inkwash.mjs';

/** The width the picture is read at: the separator's line share depends on it, and this is the width of the benchmark runs. */
export const AUTO_INK_WIDTH = 1200;

/** The share of the picture (0 to 1) that the ink separator, reading marks as drawn lines, reads as pen line: a pale
 *  or broad pen line counts by its contrast and its width on the sheet, a speck or a short touch does not count.
 *  px is RGB bytes, w by h. */
export function penShare(px, w, h) {
  const paper = paperOf(px, w, h, { margin: 0.03, mode: 'auto' }).paperRGB;
  return separate(px, w, h, paper, { asDrawn: true }).stats.ink / (w * h);
}

/**
 * The pen-line share of an image file (a path or its bytes) read at AUTO_INK_WIDTH, whatever size the file or the run is.
 * The separator measures marks in pixels, so one picture reads 0.2% to 0.9% at different widths; every pen or pencil
 * choice (the recipe, the outline medium, the drawing stages, the line source) takes this one reading.
 * `sharp` is passed in so this file stays free of the image library.
 */
export async function sourcePenShare({ image, sharp, width = AUTO_INK_WIDTH }) {
  const meta = await sharp(image).metadata();
  const w = meta.width ? Math.min(width, Math.round(meta.width * 2.4)) : width;
  const { data, info } = await sharp(image).flatten({ background: '#ffffff' }).resize({ width: w }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return penShare(data, info.width, info.height);
}
