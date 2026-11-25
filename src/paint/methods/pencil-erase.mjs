// Lift the preparatory pencil in the lights before the washes (--preperase, default 0.85, 0 off): as a watercolourist
// taps a kneaded eraser over the highlights and lit passages so graphite does not show through pale washes, while
// leaving the lines that dark washes will cover. At each sheet cell the graphite's strength is scaled by 1 - s x w, w
// from 1 in the picture's lightest fifth to 0 at its 40th percentile (by the target's lit-side luminance at plan time,
// dilated over `reach` cells and blurred over `blur` cells, since a pencil line sits on an edge and reads the lighter
// region it bounds, not the edge's own dark contour; quantiles are taken over toned cells when the sheet has a large
// unpainted paper margin), so each picture's lights are cleaned and its darker half keeps the pencil for the washes to
// cover. Only the graphite pigment changes, so ink drawn over the pencil stays. The weights are made at plan time,
// before the target guard seals the target, and planned as eraser dabs (eraserDabs): one strength per dab of a
// kneaded eraser, ERASER_MM across. Painting lays the dabs (dabWeights) and reads no map made from the target.

// a kneaded eraser pressed to the sheet under a fingertip lifts a patch about this wide
export const ERASER_MM = 8;
import { gaussian } from '../../keyframes/density.mjs';

/** Per plan cell, how fully the pencil is erased (0..1), from the target's RGB on the w x h plan grid (3 bytes a cell),
 *  its lit-side luminance dilated by `reach` cells and blurred by `blur` cells: 1 at or above the `full` quantile,
 *  falling to 0 at the `none` quantile. */
export function eraseWeights(rgb, w, h, { full = 0.8, none = 0.4, blur = 3, reach = blur } = {}) {
  const n = w * h, L0 = new Float32Array(n);
  for (let i = 0; i < n; i++) L0[i] = 0.2126 * rgb[3 * i] + 0.7152 * rgb[3 * i + 1] + 0.0722 * rgb[3 * i + 2];
  let L = L0;
  if (reach > 0) {
    const r = Math.round(reach), horiz = new Float32Array(n), dil = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dx = Math.max(0, x - r); dx <= Math.min(w - 1, x + r); dx++) if (L0[y * w + dx] > m) m = L0[y * w + dx];
      horiz[y * w + x] = m;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dy = Math.max(0, y - r); dy <= Math.min(h - 1, y + r); dy++) if (horiz[dy * w + x] > m) m = horiz[dy * w + x];
      dil[y * w + x] = m;
    }
    L = dil;
  }
  if (blur > 0) L = gaussian(L, w, h, blur);
  const s0 = Float32Array.from(L0).sort(), paper = s0[Math.min(n - 1, Math.floor(0.98 * n))];
  const toned = [];
  if (blur > 0) for (let i = 0; i < n; i++) if (L0[i] < paper - 6) toned.push(L[i]);
  const s = (toned.length >= 0.1 * n ? Float32Array.from(toned) : Float32Array.from(L)).sort();
  const q = t => s[Math.min(s.length - 1, Math.floor(t * s.length))];
  const lo = q(none), hi = Math.max(q(full), lo + 1);
  return Float32Array.from(L, v => Math.max(0, Math.min(1, (v - lo) / (hi - lo))));
}

/** The eraser plan from plan-time weights: dabs on a grid `tile` cells apart, each the mean weight under it. */
export function eraserDabs(weights, w, h, { tile }) {
  const t = Math.max(1, Math.round(tile)), cols = Math.ceil(w / t), rows = Math.ceil(h / t), dabs = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let s = 0, k = 0;
    for (let y = r * t; y < Math.min(h, (r + 1) * t); y++) for (let x = c * t; x < Math.min(w, (c + 1) * t); x++) { s += weights[y * w + x]; k++; }
    dabs[r * cols + c] = k ? s / k : 0;
  }
  return { w, h, tile: t, cols, rows, dabs };
}

/** What the dabs lift at each plan cell: each dab's strength, faded between neighbouring dab centres (bilinear). */
export function dabWeights({ w, h, tile, cols, rows, dabs }) {
  const out = new Float32Array(w * h), at = (c, r) => dabs[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = (x + 0.5) / tile - 0.5, fy = (y + 0.5) / tile - 0.5, c = Math.floor(fx), r = Math.floor(fy), ax = fx - c, ay = fy - r;
    out[y * w + x] = (1 - ay) * ((1 - ax) * at(c, r) + ax * at(c + 1, r)) + ay * ((1 - ax) * at(c, r + 1) + ax * at(c + 1, r + 1));
  }
  return out;
}

/** Scale every plane of the graphite pigment by 1 - strength x weight; returns the cells touched and the mean lift. */
export function erasePencil(planes, weights, { strength = 0.85, SC = 1, w, W2 }) {
  if (!(strength >= 0 && strength <= 1)) throw new Error(`--preperase: a share from 0 to 1, not ${strength}`);
  const n = planes[0]?.length ?? 0;
  let cells = 0, lift = 0;
  for (let i = 0; i < n; i++) {
    const e = strength * (SC === 1 ? weights[i] : weights[(((i / W2) | 0) / SC | 0) * w + ((i % W2) / SC | 0)]);
    if (!(e > 1e-4)) continue;
    let had = false;
    for (const a of planes) if (a[i] > 0) { a[i] *= 1 - e; had = true; }
    if (had) { cells++; lift += e; }
  }
  return { cells, meanLift: cells ? lift / cells : 0 };
}

/** The painter's call: lift graphite pigment `k` on `sheet` (its loose, deposited, pore and dried-layer planes). */
export function erasePrep({ sheet, k, dabs, strength, SC, w, W2, layersChanged, log = () => {} }) {
  sheet._gpu?.syncLower?.(sheet, Infinity);
  const r = erasePencil([sheet.G[k], sheet.D[k], sheet.P[k], ...sheet.layers.map(L => L[k])], dabWeights(dabs), { strength, SC, w, W2 });
  layersChanged(sheet);
  sheet._gpu?.cpuWroteAll?.();
  log(`prep erase: graphite lifted in the lights before the washes, ${dabs.dabs.length} eraser dabs over ${r.cells} cells, ${(100 * r.meanLift).toFixed(0)}% on average where lifted (strength ${strength})`);
  return r;
}
