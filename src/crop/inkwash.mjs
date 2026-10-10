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

/**
 * Separate a picture into ink, pigment, edge and reserve.
 *
 * @param rgb   raw RGB of the picture, length n*3
 * @param w,h   its size
 * @param paper the paper colour, as [r,g,b] 0..255
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
} = {}) {
  const n = w * h;
  const { D3, DL } = densities(rgb, n, paper);
  const ink = inkDirection(D3, DL, n);


  const Ds = gaussian(DL, w, h, 1.0);
  const R = hessianRidges(Ds, w, h, [0.8, 1.2, 1.8, 2.6]);
  const cand = ridgeMask(R.dark, R.nxD, R.nyD, w, h, ridgeHigh, ridgeLow);

  const isInk = new Uint8Array(n), isPigment = new Uint8Array(n), isEdge = new Uint8Array(n);
  const hue = new Float32Array(n), width = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    hue[i] = hueAwayFromInk(D3, i, ink);
    if (!cand[i]) continue;
    const d = Math.max(1.5, Math.min(4, R.scaleD[i] * 1.8));
    const p = profile(Ds, w, h, i, R.nxD[i], R.nyD[i], d);
    width[i] = crossWidth(Ds, w, h, i, R.nxD[i], R.nyD[i]);
    if (p.ridge < ridgeMin) { isEdge[i] = 1; continue; }                 // not a mark: no paper or paint on both sides
    if (p.step > stepOverRidge * p.ridge) { isEdge[i] = 1; continue; }   // a boundary between two tones
    if (hue[i] > hueIsPaint) { isPigment[i] = 1; continue; }             // it has hue: a brush put it there
    if (width[i] > maxWidth) { isPigment[i] = 1; continue; }             // too broad for a nib
    isInk[i] = 1;
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
