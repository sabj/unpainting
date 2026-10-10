// Does a drawing, seen alone, state the subject? Scores the floor, each part against random line of the same amount:
//   on contour      share of the line within reach of the source's main contours, above chance
//   contours drawn  share of the strongest contours with line within reach
//   along           whether the line runs along its contour (1) or as random (0)
//   silhouette      share of the main shapes' outlines (source blurred to hand scale, split between ground and
//                   figure) with line within two cells
//   form edges      share of the source's long form edges (src/crop/contours.mjs) with line within two cells
// The score is the geometric mean of silhouette and form edges, since either alone can be gamed.
// A drawing made first fails under 0.45. Callers pass the blur.

import { edgeChains } from '../crop/contours.mjs';

const dilate = (M, w, h, r) => {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (M[y * w + x]) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && xx >= 0 && yy < h && xx < w && dx * dx + dy * dy <= r * r) o[yy * w + xx] = 1; }
  }
  return o;
};

/**
 * @param ink     Uint8Array 0/1, the drawing's line cells
 * @param source  Float32Array, the source's density
 * @param blur    (F, w, h, sigma) => Float32Array
 * @param opts.scale   the blur, in cells, at which the main contours are read (a figure's silhouette, not its folds)
 * @param opts.band    the share of the sheet's cells counted as main contour
 * @param opts.reach   how far, in cells, a line may sit from the contour it draws
 */
export function legibility(ink, source, w, h, blur, { scale = 2.5, band = 0.08, strongest = 0.03, reach = 3, silhouetteScale = 4 } = {}) {
  const n = w * h;
  let inkCount = 0; for (let i = 0; i < n; i++) inkCount += ink[i] ? 1 : 0;
  if (!inkCount) return { onContour: 0, contoursDrawn: 0, along: 0, silhouette: 0, score: 0, inkCells: 0 };
  const B = blur(source, w, h, scale), gx = new Float32Array(n), gy = new Float32Array(n), mag = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; gx[i] = (B[i + 1] - B[i - 1]) / 2; gy[i] = (B[i + w] - B[i - w]) / 2; mag[i] = Math.hypot(gx[i], gy[i]); }
  const sorted = Float32Array.from(mag).sort(), cut = sorted[Math.floor(n * (1 - band))], cutStrong = sorted[Math.floor(n * (1 - strongest))];
  const contour = Uint8Array.from(mag, v => (v >= cut && v > 1e-6 ? 1 : 0)), strong = Uint8Array.from(mag, v => (v >= cutStrong && v > 1e-6 ? 1 : 0));
  const near = dilate(contour, w, h, reach), nearInk = dilate(ink, w, h, reach);

  // on contour, above what line laid anywhere would get: chance is the share of the sheet near a contour
  let on = 0, nearCells = 0; for (let i = 0; i < n; i++) { nearCells += near[i]; if (ink[i] && near[i]) on++; }
  const chance = nearCells / n, onRaw = on / inkCount, onContour = Math.max(0, (onRaw - chance) / Math.max(1e-6, 1 - chance));

  // the strongest contours with line near them
  let s = 0, sd = 0; for (let i = 0; i < n; i++) if (strong[i]) { s++; if (nearInk[i]) sd++; }
  const contoursDrawn = s ? sd / s : 0;

  // along: line direction (its own structure tensor) against the contour tangent; random gives |cos| 2/pi on average
  const F = Float32Array.from(ink, v => v), L = blur(F, w, h, 1);
  const lx = new Float32Array(n), ly = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; lx[i] = (L[i + 1] - L[i - 1]) / 2; ly[i] = (L[i + w] - L[i - w]) / 2; }
  const Jxx = blur(lx.map(v => v * v), w, h, 1.5), Jyy = blur(ly.map(v => v * v), w, h, 1.5), Jxy = blur(lx.map((v, i) => v * ly[i]), w, h, 1.5);
  const Sxx = blur(gx.map(v => v * v), w, h, 2), Syy = blur(gy.map(v => v * v), w, h, 2), Sxy = blur(gx.map((v, i) => v * gy[i]), w, h, 2);
  let cosSum = 0, k = 0;
  for (let i = 0; i < n; i++) if (ink[i] && near[i]) {
    // both as the direction of greatest change; a line along a contour changes across it, as the contour does
    const a = 0.5 * Math.atan2(2 * Jxy[i], Jxx[i] - Jyy[i]), b = 0.5 * Math.atan2(2 * Sxy[i], Sxx[i] - Syy[i]);
    cosSum += Math.abs(Math.cos(a - b)); k++;
  }
  const rand = 2 / Math.PI, along = k ? Math.max(0, (cosSum / k - rand) / (1 - rand)) : 0;

  // main shape outlines: hand-scale blur split halfway between ground (p10) and figure (p90) tones
  const BH = blur(source, w, h, silhouetteScale), sortedH = Float32Array.from(BH).sort();
  const split = (sortedH[Math.floor(n * 0.1)] + sortedH[Math.floor(n * 0.9)]) / 2;
  const fig = Uint8Array.from(BH, v => (v > split ? 1 : 0)), bound = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (fig[i] && (!fig[i - 1] || !fig[i + 1] || !fig[i - w] || !fig[i + w])) bound[i] = 1; }
  const inkNear2 = dilate(ink, w, h, 2); let bc = 0, bd = 0;
  for (let i = 0; i < n; i++) if (bound[i]) { bc++; if (inkNear2[i]) bd++; }
  const silhouette = bc ? bd / bc : 0;
  // the source's long form edges, and how many of their points have line within two cells
  const chains = edgeChains(source, w, h, blur, { sigma: 1.5, minLength: Math.max(12, Math.round(0.05 * Math.min(w, h))), margin: 0.04 });
  let ec = 0, ed = 0; for (const c of chains) for (const p of c.points) { const i = Math.round(p.y) * w + Math.round(p.x); ec++; if (inkNear2[i]) ed++; }
  const formEdges = ec ? ed / ec : 0;
  // share of the line on form edges or outline, above chance: a scribble is near many edges but on few
  const struct = new Uint8Array(n); for (let i = 0; i < n; i++) if (bound[i]) struct[i] = 1;
  for (const c of chains) for (const p of c.points) struct[Math.round(p.y) * w + Math.round(p.x)] = 1;
  const nearStruct = dilate(struct, w, h, 2); let sOn = 0, sArea = 0;
  for (let i = 0; i < n; i++) { sArea += nearStruct[i]; if (ink[i] && nearStruct[i]) sOn++; }
  const sChance = sArea / n, onStructure = Math.max(0, (sOn / inkCount - sChance) / Math.max(1e-6, 1 - sChance));
  return { onContour, contoursDrawn, along, silhouette, formEdges, onStructure, score: Math.sqrt(silhouette * formEdges), inkCells: inkCount, chance };
}
