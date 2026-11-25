// The source's pixels against the sheet's cells, checked before anything is prepared (tools/plate/setup.mjs).
//
// The painter does not paint from an enlarged source. A source pixel is one sample of the picture. A sheet with more
// cells across than the source has pixels across is painted from resampled pixels: edges that are soft because they
// were enlarged, detail that is absent because it was never there. What is judged on such a plate is the enlargement.
// So a run whose sheet is wider in cells than its source is in pixels stops, unless the run says how much enlargement
// it accepts.
//
// --sourcescale s: the most sheet cells across for each source pixel across. Default 1: one cell a pixel at most.
// The sheet's cells across are --width times --scale. The pens' fine sheet (--inkres) is not counted: it draws line
// paths finer, it does not read the source finer.
import fs from 'node:fs';

export const SOURCE_SCALE_DEFAULT = 1;
// a ratio that is the limit but for float rounding (1224 / 306 against 4) passes
const SLACK = 1e-9;
const trim = v => String(+Number(v).toFixed(3));

/**
 * The source's size against the sheet's.
 * @param {{ sourceWidth: number, sourceHeight?: number|null, width: number, scale?: number, allowed?: number }} input
 *   width is --width, scale is --scale, allowed is --sourcescale.
 * @returns {{ sourceWidth: number, sourceHeight: number|null, sheetWidth: number, sourceScale: number, allowed: number, ok: boolean }}
 *   sheetWidth: the sheet's cells across; sourceScale: sheet cells for each source pixel across.
 */
export function sourceScale({ sourceWidth, sourceHeight = null, width, scale = 1, allowed = SOURCE_SCALE_DEFAULT }) {
  if (!(Number.isFinite(allowed) && allowed >= 1)) throw new Error(`--sourcescale: the most sheet cells for each source pixel, a number of 1 or more, not ${allowed}`);
  if (!(Number.isFinite(sourceWidth) && sourceWidth > 0)) throw new Error(`source scale: the source's width in pixels is needed, not ${sourceWidth}`);
  if (!(Number.isFinite(width) && width > 0)) throw new Error(`--width: the sheet's width in cells, a number above 0, not ${width}`);
  if (!(Number.isFinite(scale) && scale > 0)) throw new Error(`--scale: a number above 0, not ${scale}`);
  const sheetWidth = width * scale, ratio = sheetWidth / sourceWidth;
  return { sourceWidth, sourceHeight, sheetWidth, sourceScale: ratio, allowed, ok: ratio <= allowed * (1 + SLACK) };
}

/**
 * Stops the run when the sheet is wider in cells than the source allows.
 * @param {{ image?: string, widthGiven?: boolean }} input as sourceScale, with the image's name for the message and
 *   whether --width was typed (the painter's default width is named as the default).
 * @returns the sourceScale record, for the run card.
 */
export function checkSourceScale({ image = 'the source', widthGiven = true, ...sizes }) {
  const r = sourceScale(sizes);
  if (r.ok) return r;
  const { width, scale = 1 } = sizes;
  const asked = `--width ${width}${widthGiven ? '' : ' (the default)'}${scale !== 1 ? ` at --scale ${scale}` : ''}`;
  const most = Math.floor(r.sourceWidth * r.allowed / scale * (1 + SLACK));
  throw new Error(`source scale: ${image} is ${r.sourceWidth} px wide and ${asked} asks for a sheet ${trim(r.sheetWidth)} cells wide, ${trim(r.sourceScale)} cells for each source pixel. `
    + `The painter does not paint from an enlarged source (--sourcescale ${trim(r.allowed)}: at most ${trim(r.allowed)} ${r.allowed === 1 ? 'cell' : 'cells'} a pixel). `
    + `Paint at --width ${most} or less, or from a larger original, or state the enlargement this run accepts with --sourcescale ${Math.ceil(r.sourceScale * 100 - SLACK) / 100}.`);
}

/** The run card's entry: what the source was, how wide the sheet was against it, and what the run allowed. */
export const sourceScaleRecord = r => ({
  sourceWidth: r.sourceWidth, sourceHeight: r.sourceHeight, sheetWidth: r.sheetWidth,
  sourceScale: +r.sourceScale.toFixed(4), sourceScaleAllowed: r.allowed,
});

/** True when the file is there to be measured; a missing source is the image load's error, not this check's. */
export const sourceReadable = file => { try { return fs.statSync(file).isFile(); } catch { return false; } };
