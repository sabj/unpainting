// Tell ink apart from paint before anything is drawn. Each candidate ridge is one of:
//   ink      narrow, darker than its flanks, and on the picture's own ink direction (low chroma)
//   pigment  broad, or with hue: a brush made it
//   edge     a step between two tones, not a ridge
//   reserve  a light ridge with paint on both sides: paper the painter went round
// All measurements are local. Nothing here knows what the picture is of.
import { gaussian } from '../keyframes/density.mjs';
import { hessianRidges, ridgeMask } from './layers.mjs';
import { dilate, components } from '../raster.js';

/** Per-channel optical density of an RGB buffer against a paper colour. Transparent layers multiply, so these add. */
export function densities(rgb, n, paper) {
  const D3 = new Float32Array(n * 3), DL = new Float32Array(n);
  const pl = 0.2126 * paper[0] + 0.7152 * paper[1] + 0.0722 * paper[2];
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) D3[i * 3 + c] = Math.max(0, -Math.log(Math.max(0.02, Math.min(1, rgb[i * 3 + c] / paper[c]))));
    const l = 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2];
    DL[i] = Math.max(0, -Math.log(Math.max(0.02, Math.min(1, l / pl))));
  }
  return { D3, DL };
}

/** The picture's own ink: the mean density direction of its darkest pixels, as a unit vector in (r,g,b) density.
 *  Taking a direction rather than a colour means a faint line and a solid black one are recognised as the same fluid. */
export function inkDirection(D3, DL, n, { share = 0.01 } = {}) {
  const k = Math.max(1, Math.round(n * share));
  const idx = [...Array(n).keys()].sort((a, b) => DL[b] - DL[a]).slice(0, k);
  const v = [0, 0, 0];
  for (const i of idx) for (let c = 0; c < 3; c++) v[c] += D3[i * 3 + c];
  const m = Math.hypot(v[0], v[1], v[2]);
  return m < 1e-6 ? [0.577, 0.577, 0.577] : v.map(x => x / m);
}

/** How far this pixel's colour points away from the ink, in radians: 0 is the ink's own hue, larger is paint. */
function hueAwayFromInk(D3, i, ink) {
  const r = D3[i * 3], g = D3[i * 3 + 1], b = D3[i * 3 + 2], m = Math.hypot(r, g, b);
  if (m < 1e-4) return 0;
  const dot = Math.min(1, Math.max(-1, (r * ink[0] + g * ink[1] + b * ink[2]) / m));
  return Math.acos(dot);
}

/** Across-feature profile at a pixel: how the density behaves on the two sides, `d` cells out along the normal.
 *  A ridge has both sides lighter than the middle. A step has one side lighter and the other about as dark. */
function profile(DL, w, h, i, nx, ny, d) {
  const x = i % w, y = (i / w) | 0;
  const at = (px, py) => DL[Math.min(h - 1, Math.max(0, Math.round(py))) * w + Math.min(w - 1, Math.max(0, Math.round(px)))];
  const mid = DL[i], a = at(x + d * nx, y + d * ny), b = at(x - d * nx, y - d * ny);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return { mid, lo, hi, ridge: mid - hi, step: hi - lo };
}

/** Width of the mark at i: walk out along the normal until density falls halfway to the mark's own flanks.
 *  Measured against the flanks, not a global threshold, so a pen line over a wash is not read as wash-wide. */
function crossWidth(DL, w, h, i, nx, ny, limit = 12) {
  const x = i % w, y = (i / w) | 0;
  const at = (px, py) => DL[Math.min(h - 1, Math.max(0, Math.round(py))) * w + Math.min(w - 1, Math.max(0, Math.round(px)))];
  const mid = DL[i];
  let flank = mid;
  for (let d = 1; d <= limit; d++) flank = Math.min(flank, Math.max(at(x + d * nx, y + d * ny), at(x - d * nx, y - d * ny)));
  const half = flank + (mid - flank) / 2;
  let out = 0;
  for (const sign of [1, -1]) {
    let d = 0;
    while (d < limit && at(x + sign * d * nx, y + sign * d * ny) > half) d += 0.5;
    out += d;
  }
  return out;
}

/** Width of the mark on the sheet at i: full width at half its height over its flanks, the crossing found between
 *  samples rather than at the next half cell, and the reading's own blur (sigma) taken out in quadrature. crossWidth
 *  above reads the blurred copy in half-cell steps, so it reads a line a cell or more wider than it is drawn. */
function sheetWidth(DL, w, h, i, nx, ny, sigma, limit = 12) {
  const x = i % w, y = (i / w) | 0;
  const at = (px, py) => {
    const X = Math.min(w - 1.001, Math.max(0, px)), Y = Math.min(h - 1.001, Math.max(0, py)), x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0, j = y0 * w + x0;
    return (DL[j] * (1 - fx) + DL[j + 1] * fx) * (1 - fy) + (DL[j + w] * (1 - fx) + DL[j + w + 1] * fx) * fy;
  };
  const mid = DL[i], step = 0.25;
  let flank = mid;
  for (let d = 1; d <= limit; d++) flank = Math.min(flank, Math.max(at(x + d * nx, y + d * ny), at(x - d * nx, y - d * ny)));
  const half = flank + (mid - flank) / 2;
  let out = 0;
  for (const sign of [1, -1]) {
    let d = 0, prev = mid;
    for (; d < limit; d += step) {
      const v = at(x + sign * (d + step) * nx, y + sign * (d + step) * ny);
      if (v <= half) { d += step * (prev - half) / Math.max(1e-9, prev - v); break; }
      prev = v;
    }
    out += d;
  }
  return Math.sqrt(Math.max(0, out * out - (2 * Math.sqrt(2 * Math.LN2) * sigma) ** 2));
}

/**
 * Separate a picture into ink, pigment, edge and reserve.
 *
 * @param rgb   raw RGB of the picture, length n*3
 * @param w,h   its size
 * @param paper the paper colour, as [r,g,b] 0..255
 * @param asDrawn read marks as a draughtsman's lines, for the medium measure (pen-share.mjs): a candidate is a mark
 *   whose own contrast over its two flanks clears ridgeHigh/ridgeLow (density), its width is its width on the sheet
 *   (sheetWidth), and a dark run shorter than reserveRun cells is tooth or a touch, left to the brush. The plain
 *   reading seeds candidates on the Hessian's magnitude, which falls as a line gets wider in cells and so misses pale,
 *   broad pen lines (a reed or quill line read at 1200 px); its callers' thresholds are set on that magnitude.
 * @returns masks (Uint8Array each) plus the per-pixel evidence the decision was made on.
 */
export function separate(rgb, w, h, paper, {
  // a mark must be this much darker than its two flanks to count as a ridge at all
  ridgeMin = 0.06,
  // and no wider across itself than this many cells, or a brush made it: a nib line at the picture's own scale
  maxWidth = 5.0,
  // a colour this far off the ink direction is paint, whatever its shape (radians; walnut vs blue sky is about 0.6)
  hueIsPaint = 0.35,
  // a step this much bigger than the ridge means the feature is a boundary between tones, not a mark
  stepOverRidge = 1.4,
  // light ridges this strong, with paint on both sides, are reserved paper
  reserveHigh = 0.030, reserveLow = 0.012, reserveSide = 0.02,
  // a pale run of at least this many cells was gone round on purpose; anything shorter is the tooth of a dry brush
  reserveRun = 14,
  // candidate ridges: hysteresis on the Hessian's dark-ridge response, seeds at ridgeHigh grown down to ridgeLow
  ridgeHigh = 0.10, ridgeLow = 0.045,
  asDrawn = false,
} = {}) {
  const n = w * h;
  const { D3, DL } = densities(rgb, n, paper);
  const ink = inkDirection(D3, DL, n);


  const Ds = gaussian(DL, w, h, 1.0);
  const R = hessianRidges(Ds, w, h, [0.8, 1.2, 1.8, 2.6]);
  const reach = i => Math.max(1.5, Math.min(4, R.scaleD[i] * 1.8));
  // read as drawn: hysteresis on how much darker the mark is than its darker flank, in the same density as ridgeMin.
  // A cell beside a dot or a line's end reads as a short ridge across the dot's own slope; it is on the flank of a mark,
  // not on one, when the cells along its ridge are darker than it by more than its contrast across.
  const markContrast = i => {
    const d = reach(i), p = profile(Ds, w, h, i, R.nxD[i], R.nyD[i], d);
    if (p.ridge <= 0) return 0;
    const along = profile(Ds, w, h, i, -R.nyD[i], R.nxD[i], d);
    return along.hi - along.mid > p.ridge ? 0 : p.ridge;
  };
  const contrast = asDrawn ? Float32Array.from(R.dark, (r, i) => (r > 0 ? markContrast(i) : 0)) : null;
  const cand = ridgeMask(contrast ?? R.dark, R.nxD, R.nyD, w, h, ridgeHigh, ridgeLow);

  const isInk = new Uint8Array(n), isPigment = new Uint8Array(n), isEdge = new Uint8Array(n);
  const hue = new Float32Array(n), width = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    hue[i] = hueAwayFromInk(D3, i, ink);
    if (!cand[i]) continue;
    const p = profile(Ds, w, h, i, R.nxD[i], R.nyD[i], reach(i));
    width[i] = asDrawn ? sheetWidth(Ds, w, h, i, R.nxD[i], R.nyD[i], 1.0) : crossWidth(Ds, w, h, i, R.nxD[i], R.nyD[i]);
    if (p.ridge < ridgeMin) { isEdge[i] = 1; continue; }                 // not a mark: no paper or paint on both sides
    if (p.step > stepOverRidge * p.ridge) { isEdge[i] = 1; continue; }   // a boundary between two tones
    if (hue[i] > hueIsPaint) { isPigment[i] = 1; continue; }             // it has hue: a brush put it there
    if (width[i] > maxWidth) { isPigment[i] = 1; continue; }             // too broad for a nib
    isInk[i] = 1;
  }

  // a drawn line runs: a mark whose span (its bounding box's diagonal) is under reserveRun cells is tooth, granulation
  // or a touch of the brush, as a pale run that short is tooth rather than a reserve
  if (asDrawn) {
    const { labels, areas } = components(isInk, w, h), box = new Float64Array(4 * areas.length).fill(NaN);
    for (let i = 0; i < n; i++) {
      const l = labels[i]; if (!l) continue;
      const x = i % w, y = (i / w) | 0, b = 4 * l;
      if (!(box[b] <= x)) box[b] = x; if (!(box[b + 1] >= x)) box[b + 1] = x; if (!(box[b + 2] <= y)) box[b + 2] = y; if (!(box[b + 3] >= y)) box[b + 3] = y;
    }
    for (let i = 0; i < n; i++) { const b = 4 * labels[i]; if (labels[i] && Math.hypot(box[b + 1] - box[b] + 1, box[b + 3] - box[b + 2] + 1) < reserveRun) isInk[i] = 0; }
  }
  // everything that carries density and is not ink is paint for the brush to do, so nothing falls between the two
  for (let i = 0; i < n; i++) if (!isInk[i] && DL[i] > 0.04) isPigment[i] = 1;

  // Paper that stayed light with paint on both sides; a halo beside a dark mark has paint on one side only.
  const light = ridgeMask(R.light, R.nxL, R.nyL, w, h, reserveHigh, reserveLow);
  const pale = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!light[i]) continue;
    const p = profile(Ds, w, h, i, R.nxL[i], R.nyL[i], 3);
    if (Math.min(p.lo, p.hi) >= p.mid + reserveSide) pale[i] = 1;
  }
  // A reserve is a deliberate run of paper (at least reserveRun cells); tooth is dry-brush specks, left to the brush.
  const isReserve = new Uint8Array(n), isTooth = new Uint8Array(n);
  const { labels, areas } = components(pale, w, h);
  for (let i = 0; i < n; i++) if (labels[i]) (areas[labels[i]] >= reserveRun ? isReserve : isTooth)[i] = 1;

  const count = m => { let c = 0; for (let i = 0; i < n; i++) c += m[i]; return c; };
  return {
    ink: isInk, pigment: isPigment, edge: isEdge, reserve: dilate(isReserve, w, h, 1), tooth: isTooth,
    inkDirection: ink, hue, width, candidates: cand, DL, D3,
    stats: {
      candidates: count(cand), ink: count(isInk), pigment: count(isPigment), edge: count(isEdge),
      reserve: count(isReserve), tooth: count(isTooth),
      inkShareOfCandidates: count(cand) ? count(isInk) / count(cand) : 0,
    },
  };
}
