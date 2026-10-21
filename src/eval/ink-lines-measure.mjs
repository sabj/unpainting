// How a picture's pen lines look, measured the same way on a source and on a painting of it: where the lines are,
// how dark they are against what is beside them, how wide, how even, what colour, and how broken. Line cells come
// from separate() in crop/inkwash.mjs, so this agrees with the painter on what ink is. Post-render only.
import { separate, densities } from '../crop/inkwash.mjs';
import { matchMasks } from '../crop/layers.mjs';
import { components } from '../raster.js';
import { quantile } from './image.mjs';

const lum = (b, i) => 0.2126 * b[i * 3] + 0.7152 * b[i * 3 + 1] + 0.0722 * b[i * 3 + 2];

/** Paper colour: the mean of the lightest tenth of the picture. */
function paperOf(rgb, n) {
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => lum(rgb, b) - lum(rgb, a)).slice(0, Math.max(1, (n / 10) | 0));
  return [0, 1, 2].map(c => idx.reduce((s, i) => s + rgb[i * 3 + c], 0) / idx.length);
}

/** The lightest luminance within `r` cells of each cell: what a line is seen against. */
export function localLight(rgb, w, h, r = 3) {
  const n = w * h, L = new Float32Array(n), row = new Float32Array(n), out = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = lum(rgb, i);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0; for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < w) m = Math.max(m, L[y * w + xx]); }
    row[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0; for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < h) m = Math.max(m, row[yy * w + x]); }
    out[y * w + x] = m;
  }
  return { L, light: out };
}

const q3 = v => (v.length ? { p10: quantile(v, 0.1), p50: quantile(v, 0.5), p90: quantile(v, 0.9) } : { p10: NaN, p50: NaN, p90: NaN });

/**
 * Line measures over the cells of `mask` in an RGB picture.
 * darkness: 1 - L / (lightest L within 3 cells), so 0.44 is a line 44% darker than what is beside it.
 * evenness: (p90 - p10) / p50 of that darkness; a low number is a line of one even tone.
 * width: the separator's cross width, in cells. hue: blue over red optical density, above 1 for brown ink.
 * pieces: the 8-connected pieces of the mask, as a count per 1000 line cells and their median size in cells.
 */
export function lineMeasures(rgb, w, h, mask, paper, widthMap = null) {
  const n = w * h, { L, light } = localLight(rgb, w, h, 3), { D3 } = densities(rgb, n, paper);
  const dark = [], width = [];
  let dr = 0, db = 0, count = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    count++;
    dark.push(Math.max(0, 1 - L[i] / Math.max(1, light[i])));
    if (widthMap && widthMap[i] > 0) width.push(widthMap[i]);
    dr += D3[i * 3]; db += D3[i * 3 + 2];
  }
  const { areas } = components(mask, w, h);
  const sizes = areas.slice(1).filter(a => a > 0);
  const d = q3(dark);
  return {
    share: count / n,
    darkness: d,
    evenness: d.p50 > 0 ? (d.p90 - d.p10) / d.p50 : NaN,
    width: q3(width),
    hue: dr > 0 ? db / dr : NaN,
    pieces: { per1000: count ? (1000 * sizes.length) / count : 0, median: sizes.length ? quantile(sizes, 0.5) : 0 },
  };
}

/** Pen marks on a pen-only layer: cells at least `min` darker than the lightest cell within 3, with the separator's widths. */
function penMarks(rgb, w, h, paper, separator = {}, min = 0.1) {
  const { L, light } = localLight(rgb, w, h, 3), ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = 1 - L[i] / Math.max(1, light[i]) >= min ? 1 : 0;
  return { ink, width: separate(rgb, w, h, paper, separator).width };
}

/** Mean darkness of a picture over the cells of `mask`, each the darkest within one cell, so a line drawn a cell off
 *  still counts: for a painting, how dark it is where the source has a line. */
function darknessAt(rgb, w, h, mask) {
  const { L, light } = localLight(rgb, w, h, 3), dark = i => Math.max(0, 1 - L[i] / Math.max(1, light[i]));
  let s = 0, c = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const x = i % w, y = (i - x) / w;
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) m = Math.max(m, dark(yy * w + xx)); }
    s += m; c++;
  }
  return c ? s / c : NaN;
}

/**
 * Source against painting. `pen`, when given, is the pen layer alone (the painter's ink.jpg); placement is judged on
 * it, so a wash edge is not counted as a drawn line. Everything is at one size w x h.
 */
export function compareLines(srcRGB, paintedRGB, w, h, { pen = null, tol = 2, separator = {} } = {}) {
  const n = w * h;
  const paperS = paperOf(srcRGB, n), paperP = paperOf(paintedRGB, n);
  const S = separate(srcRGB, w, h, paperS, separator), P = separate(paintedRGB, w, h, paperP, separator);
  // the pen layer is pen alone on paper, so any cell clearly darker than the paper beside it is a pen mark
  const placed = pen ? penMarks(pen, w, h, paperOf(pen, n), separator) : P;
  const m = matchMasks(placed.ink, S.ink, w, h, tol);
  const shown = matchMasks(P.ink, S.ink, w, h, tol);
  return {
    size: [w, h],
    source: lineMeasures(srcRGB, w, h, S.ink, paperS, S.width),
    painted: lineMeasures(paintedRGB, w, h, P.ink, paperP, P.width),
    ...(pen ? { pen: lineMeasures(pen, w, h, placed.ink, paperOf(pen, n), placed.width) } : {}),
    placement: { recall: m.recall, precision: m.precision, from: pen ? 'pen layer' : 'painting' },
    visible: { recall: shown.recall, precision: shown.precision },
    darknessAtSourceLines: { source: darknessAt(srcRGB, w, h, S.ink), painted: darknessAt(paintedRGB, w, h, S.ink), ...(pen ? { pen: darknessAt(pen, w, h, S.ink) } : {}) },
    sourceMask: S.ink,
  };
}
