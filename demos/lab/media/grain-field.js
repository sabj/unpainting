// Generated from src/media/grain-field.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// The surface granulating pigment answers to: the paper's relief seen at a fixed length in millimetres, not at the
// cell. Settling pigment is pulled towards a hollow (settling.mjs, B = 1 + gamma hollow) and settled grains roll to
// the lowest neighbour (sheet.mjs slide); both read this field instead of each cell's own mean height.
//
// Why. Read cell by cell, the relief's finest octaves (0.12 to 0.5 mm, paper-relief.mjs) made the hollow nearly
// independent from one cell to the next (correlation 0.37 at one cell, 0.06 at two on 0.26 mm cells), so granulation
// dried as a pepper two cells across, the finest the grid can hold, and grew with every glaze. Low-passed at
// GRAIN_MM, the same paper gives a mottle a few tenths of a millimetre to a millimetre across, the size of the soft
// mottle granulating paint makes on cold-press paper, at any cell size the grid can hold it.
//
// The hollow is measured in the low-passed relief's own RMS about its millimetre mean, worked out once on a fine patch
// of the same paper, so a granulating pigment settles about as strongly as before, into broader hollows, on any
// grid. The flow (valley), the brush's contact (height, proud) and the paper's look are not changed. DOM free.

import { paperRelief, HEIGHT_SPAN_UM } from './paper-relief.js';

// the Gaussian sigma of the low-pass in millimetres: its autocorrelation falls to half at about 1.7 sigma
export const GRAIN_MM = 0.2;

/** A separable Gaussian blur of a w x h field, sigma in cells, edges clamped; mean kept. */
export function gaussianField(a, w, h, sigma) {
  if (!(sigma > 0)) return Float32Array.from(a);
  const r = Math.max(1, Math.ceil(3 * sigma)), k = new Float64Array(2 * r + 1);
  let t = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); t += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= t;
  const tmp = new Float64Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0; for (let i = -r; i <= r; i++) v += k[i + r] * a[y * w + Math.min(w - 1, Math.max(0, x + i))];
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0; for (let i = -r; i <= r; i++) v += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
    out[y * w + x] = v;
  }
  return out;
}

// the grid the unit is measured on: fine enough to hold the relief's finest octave, wide enough for many millimetres
const UNIT_MM = 0.04, UNIT_SIDE_MM = 20, HOLLOW_MM = 1;
const UNITS = new Map();
/**
 * The unit a hollow of the low-passed relief is measured in, in the height's own units: the RMS of the relief
 * low-passed at `grainMm` about its millimetre mean, on a fine patch of the same paper. Fixed for a paper and
 * grainMm, so every grid measures the same hollows in the same micrometres.
 */
export function grainUnit({ seed, relief }, grainMm = GRAIN_MM) {
  const key = JSON.stringify([seed, relief, grainMm]);
  if (!UNITS.has(key)) {
    const n = Math.round(UNIT_SIDE_MM / UNIT_MM), R = paperRelief(n, n, UNIT_MM, { seed, relief });
    const z = Float32Array.from(R.zUm, v => v / HEIGHT_SPAN_UM), f = gaussianField(z, n, n, grainMm / UNIT_MM);
    const level = boxField(f, n, n, Math.round(HOLLOW_MM / 2 / UNIT_MM));
    // away from the patch's edges, where the clamped blur is not the paper's
    const m = Math.round(HOLLOW_MM / UNIT_MM); let v = 0, c = 0;
    for (let y = m; y < n - m; y++) for (let x = m; x < n - m; x++) { const d = level[y * n + x] - f[y * n + x]; v += d * d; c++; }
    UNITS.set(key, Math.sqrt(v / c));
  }
  return UNITS.get(key);
}
function boxField(a, w, h, r) {
  const t = new Float64Array(w * h), o = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let i = -r; i <= r; i++) { const xx = x + i; if (xx >= 0 && xx < w) { s += a[y * w + xx]; c++; } } t[y * w + x] = s / c; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let i = -r; i <= r; i++) { const yy = y + i; if (yy >= 0 && yy < h) { s += t[yy * w + x]; c++; } } o[y * w + x] = s / c; }
  return o;
}

/**
 * The granulation surface of a physical sheet: `height` (each cell's mean relief, in HEIGHT_SPAN_UM units) low-passed
 * at `grainMm`, and the unit its hollows are measured in (grainUnit). `reliefOf` is the paper's {seed, relief}.
 */
export function grainSurface(height, w, h, mmPerCell, reliefOf, { grainMm = GRAIN_MM } = {}) {
  if (!(mmPerCell > 0)) throw new Error('grain-field: mmPerCell must be positive (a physical sheet)');
  if (!reliefOf) throw new Error('grain-field: the paper has no relief seed and preset (paper-relief.mjs)');
  return { grainH: grainField(height, w, h, mmPerCell, grainMm), unit: grainUnit(reliefOf, grainMm) };
}
/** A field of cell means on cells of `mmPerCell` low-passed at `grainMm`: what grainH is, on any grid. */
export const grainField = (height, w, h, mmPerCell, grainMm = GRAIN_MM) => gaussianField(height, w, h, grainMm / mmPerCell);

// the cell the slide's rate was fitted on: the painter's own sheets, 0.26 mm a cell (1086 cells on 282 mm)
export const SLIDE_REF_MM = 0.26;
/**
 * The slide's rate on a sheet of `mmPerCell`. On the grain field the slope between neighbours is the field's gradient
 * times the cell, and a grain that moves goes a cell: the rate a grain leaves a cell is slope over distance, so the
 * fitted rate is scaled by (SLIDE_REF_MM / mmPerCell)^2 and grains roll the same millimetres on any grid (a puddle on
 * 0.13 mm cells granulated 30% more than on 0.26 mm without it). A sheet without units keeps the rate it is given.
 */
export const slideRate = (slide, mmPerCell) => (mmPerCell > 0 ? slide * (SLIDE_REF_MM / mmPerCell) ** 2 : slide);
/** The height step between neighbours a grain rests on (repose, a slope) on a sheet of `mmPerCell`: it grows with the cell. */
export const reposeStep = (repose, mmPerCell) => (mmPerCell > 0 ? repose * (mmPerCell / SLIDE_REF_MM) : repose);
