// The narrowest mark a brush lays on a sheet, and the shape tests that follow from it. A brush's point lays a line of
// point_width_mm at light pressure (src/paint/brushes.json), and a mark needs about four cells across its narrowest width to have
// a body and an edge (the watercolor-technique skill's resolution rule). So the narrowest mark is the larger of the two: at
// 0.258 mm a cell the four cells govern (about 1 mm); at 0.129 mm a cell the two meet (about 0.5 mm).
import { components } from '../../raster.js';

/** Cells across the narrowest mark that has a body and an edge. */
const MARK_CELLS = 4;

/** The narrowest mark in mm: the larger of the point's laid width and MARK_CELLS cells. */
export function narrowestMarkMm(pointMm, cellMm) {
  if (!(pointMm > 0) || !(cellMm > 0)) throw new Error('narrowest mark needs a positive point width and cell size');
  return Math.max(pointMm, MARK_CELLS * cellMm);
}

/** Width in cells of a shape from the second moments of its cells: the minor axis of the ellipse with the same moments (a disc gives its diameter). */
export function minorWidthOf(n, sx, sy, sxx, syy, sxy) {
  const cx = sx / n, cy = sy / n, a = sxx / n - cx * cx + 1 / 12, b = syy / n - cy * cy + 1 / 12, c = sxy / n - cx * cy;
  const t = (a + b) / 2, d = Math.sqrt(Math.max(0, (a - b) * (a - b) / 4 + c * c));
  return 4 * Math.sqrt(Math.max(0, t - d));
}

/** The narrowest width in cells of the shape that `list` (cell indices on a grid w wide) holds. */
export function minorWidth(list, w) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (const i of list) { const x = i % w, y = (i / w) | 0; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
  return minorWidthOf(list.length, sx, sy, sxx, syy, sxy);
}

/** The pieces of a mask that cover at least minArea cells and are at least minWidth cells across. */
export function keepWideShapes(mask, w, h, minArea, minWidth) {
  const c = components(mask, w, h), n = new Int32Array(c.count + 1), s = Array.from({ length: 5 }, () => new Float64Array(c.count + 1));
  for (let i = 0; i < mask.length; i++) {
    const l = c.labels[i]; if (!l) continue;
    const x = i % w, y = (i / w) | 0;
    n[l]++; s[0][l] += x; s[1][l] += y; s[2][l] += x * x; s[3][l] += y * y; s[4][l] += x * y;
  }
  const keep = new Uint8Array(c.count + 1);
  for (let l = 1; l <= c.count; l++) keep[l] = n[l] >= minArea && (!(minWidth > 0) || minorWidthOf(n[l], s[0][l], s[1][l], s[2][l], s[3][l], s[4][l]) >= minWidth) ? 1 : 0;
  return Uint8Array.from(mask, (v, i) => (v && keep[c.labels[i]] ? 1 : 0));
}
