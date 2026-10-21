// --copylinesagree: keep only the parts of the traced pen lines that the ink separator (src/crop/inkwash.mjs, at its
// own defaults) also reads as pen line. copy-lines.py takes any narrow dark mark, so it also traces wash edges and the
// rims of dark brush masses; the separator asks for a nib-wide ridge of the ink's own hue. Planning only: it reads the
// target before the first mark.
import { separate } from '../../crop/inkwash.mjs';
import { dilate } from '../../raster.js';

const lum = (b, i) => 0.2126 * b[i * 3] + 0.7152 * b[i * 3 + 1] + 0.0722 * b[i * 3 + 2];

/** Paper colour: the mean of the lightest tenth of the picture. */
export function lightestTenth(rgb, n) {
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => lum(rgb, b) - lum(rgb, a)).slice(0, Math.max(1, (n / 10) | 0));
  return [0, 1, 2].map(c => idx.reduce((s, i) => s + rgb[i * 3 + c], 0) / idx.length);
}

/** The separator's pen cells for an RGB picture, grown by `near` cells, and the share of cells it reads as pen line. */
export function agreeMask(rgb, w, h, { near = 2, separator = {} } = {}) {
  const S = separate(rgb, w, h, lightestTenth(rgb, w * h), separator);
  return { mask: near > 0 ? dilate(S.ink, w, h, near) : S.ink, share: S.stats.ink / (w * h) };
}

/**
 * Cut each line to its runs on `mask` (w x h, in the lines' own pixels). A run may cross `gap` points off the mask;
 * runs shorter than `minRun` points are dropped. Per-point arrays (widths, weights) are cut with the points.
 * @returns { lines, kept, cut, dropped }
 */
export function agreeLines(lines, mask, w, h, { gap = 2, minRun = 3 } = {}) {
  const on = ([x, y]) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < w && yi < h && mask[yi * w + xi] === 1; };
  const out = [];
  let kept = 0, cut = 0, dropped = 0;
  for (const line of lines) {
    const flags = line.points.map(on), runs = [];
    let start = -1, last = -1;
    for (let i = 0; i < flags.length; i++) {
      if (!flags[i]) continue;
      if (start >= 0 && i - last - 1 > gap) { runs.push([start, last]); start = -1; }
      if (start < 0) start = i;
      last = i;
    }
    if (start >= 0) runs.push([start, last]);
    const good = runs.filter(([a, b]) => b - a + 1 >= minRun);
    if (!good.length) { dropped++; continue; }
    if (good.length === 1 && good[0][0] === 0 && good[0][1] === flags.length - 1) { kept++; out.push(line); continue; }
    cut++;
    for (const [a, b] of good) out.push(sliceLine(line, a, b + 1));
  }
  return { lines: out, kept, cut, dropped };
}

function sliceLine(line, a, b) {
  const points = line.points.slice(a, b);
  const piece = { ...line, points };
  for (const k of ['widths', 'weights']) if (Array.isArray(line[k])) piece[k] = line[k].slice(a, b);
  if (Array.isArray(piece.weights) && piece.weights.length) piece.weight = piece.weights.reduce((s, v) => s + v, 0) / piece.weights.length;
  if (typeof line.length === 'number') piece.length = points.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
  return piece;
}
