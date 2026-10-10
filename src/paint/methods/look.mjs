// Looking at the sheet: render what is on the paper, read it in the subject's units, and let the difference choose the
// next act. No ledger: the sheet is the only account of what has been laid, so a passage laid short or heavy is seen.
// The residual is clipped at zero since paint cannot be taken off: an overshoot is reported, not paid back.
import { gaussian } from '../../keyframes/density.mjs';
import { components, open as openMask, close as closeMask } from '../../raster.js';

/** Density of a render against the paper it was rendered on, three channels per cell. */
export function sheetDensity(rgb, base, n) {
  const D = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) D[i] = Math.max(0, -Math.log(Math.max(1, rgb[i]) / Math.max(1, base[i])));
  return D;
}

/** What is still wanted: want less have, clipped at zero; its tone; and the share of cells overshot by more than `slack`. */
export function residualOf(want, have, n, { slack = 0.05 } = {}) {
  const R = new Float32Array(n * 3), mag = new Float32Array(n);
  let over = 0;
  for (let i = 0; i < n; i++) {
    let m = 0, o = 0;
    for (let c = 0; c < 3; c++) { const d = want[i * 3 + c] - have[i * 3 + c]; if (d > 0) { R[i * 3 + c] = d; m += d; } else if (-d > o) o = -d; }
    mag[i] = m / 3;
    if (o > slack) over++;
  }
  return { R, mag, over: over / n };
}

/** A quantile of a field over the cells above `floor` (and inside `mask` if given). */
export function quantileOver(F, q, { floor = 1e-4, mask = null } = {}) {
  const v = [];
  for (let i = 0; i < F.length; i++) if (F[i] > floor && (!mask || mask[i])) v.push(F[i]);
  if (!v.length) return 0;
  v.sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(v.length * q))];
}

/**
 * The regions of `mag` at or above `level`, blurred by `sigma` first so the paper's tooth does not cut a shape into
 * specks, opened and closed by a cell, components under `minArea` dropped, `exclude` cells removed. Largest first.
 */
export function proposeShapes(mag, w, h, { level, minArea = 12, sigma = 1, exclude = null, radius = 1 } = {}) {
  const n = w * h, B = sigma > 0 ? gaussian(mag, w, h, sigma) : mag;
  let m = new Uint8Array(n);
  for (let i = 0; i < n; i++) m[i] = B[i] >= level && (!exclude || !exclude[i]) ? 1 : 0;
  if (radius > 0) m = closeMask(openMask(m, w, h, radius), w, h, radius);
  if (exclude) for (let i = 0; i < n; i++) if (exclude[i]) m[i] = 0;
  const { labels, areas, count } = components(m, w, h), shapes = [];
  for (let id = 1; id <= count; id++) {
    if (areas[id] < minArea) continue;
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (labels[i] === id) mask[i] = 1;
    shapes.push({ mask, area: areas[id] });
  }
  return shapes.sort((a, b) => b.area - a.area);
}

/** The median number of acts over the cells that were painted at all. */
export function passesMedian(passes) {
  const v = [];
  for (let i = 0; i < passes.length; i++) if (passes[i]) v.push(passes[i]);
  if (!v.length) return 0;
  v.sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}
