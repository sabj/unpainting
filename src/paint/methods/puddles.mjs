// Pipeline: planning, stage 3 (shapes and value plan). One puddle per local colour.
// A painter mixes one puddle for each local colour in the well, from the two or three tubes that make it, and makes it
// lighter or darker with water: a value step is the same colour with more or less paint, and a pan from the far side of
// the wheel goes in only as part of a puddle that needs it to grey. The value plan used to lay one pan per passage over
// every connected cell that asked for any of it, so each pan's mean spread across forms of other colours (the hair's
// blue over the orange fur, an ochre under-wash under everything) and the strong colours went grey.
// Here a local colour is a direction in the pigments' own mixing space: the plan's channel density over the paper with
// its strength divided out, so more of one mixture is the same direction, further out. Cells are grouped by direction
// (spherical k-means weighted by strength, so a near-paper cell, whose direction is noise, does not steer a puddle). Each
// group's pans are chosen once by pan-choice.mjs through local-pans.mjs, and each cell is unmixed over those pans only.
// A puddle greyed across the wheel (it holds a far pan) is one paint once it is mixed: each of its cells takes that
// mixture at its own strength, never one of its pans alone, so a dark mixed from sienna and cerulean cannot come apart
// into rust and teal specks. A puddle of near pans only keeps local-pans' per-cell shares, which cannot leave the
// colour's side of the wheel.
// The value plan (light-to-dark.mjs `puddles`) then lays each passage as one of these puddles at the strength its cells
// ask for. How many local colours: as many as the palette was chosen to reach (palettewide.mjs localColours: K chromatic
// colours plus the greys); no number here is read from a plate. Planning only: it reads the plan's density, never the
// sheet.
import { localPans } from './local-pans.mjs';
import { unmix } from '../../crop/pigments.mjs';

/**
 * Local colours as directions of density. Deterministic: the first centre is the strongest cell's direction, each next
 * the direction farthest (by strength-weighted angle) from those chosen.
 * @param D channel density, n x 3
 * @param count how many local colours at most
 * @returns {{ labels: Int32Array, count: number }} labels[i] is the cell's colour, -1 for a cell with no density
 */
export function densityDirections(D, n, count, { iters = 20 } = {}) {
  if (!(count >= 1)) throw new RangeError('puddles: at least one local colour');
  if (!(D?.length === n * 3)) throw new RangeError('puddles: the density must be n x 3');
  const U = new Float32Array(n * 3), wt = new Float32Array(n), labels = new Int32Array(n).fill(-1), live = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, D[i * 3]), b = Math.max(0, D[i * 3 + 1]), c = Math.max(0, D[i * 3 + 2]), m = Math.hypot(a, b, c);
    if (!(m > 1e-6)) continue;
    U[i * 3] = a / m; U[i * 3 + 1] = b / m; U[i * 3 + 2] = c / m; wt[i] = m; live.push(i);
  }
  if (!live.length) return { labels, count: 0 };
  const cos = (i, ctr) => U[i * 3] * ctr[0] + U[i * 3 + 1] * ctr[1] + U[i * 3 + 2] * ctr[2];
  let first = live[0]; for (const i of live) if (wt[i] > wt[first]) first = i;
  const centres = [[U[first * 3], U[first * 3 + 1], U[first * 3 + 2]]], far = new Float64Array(n).fill(Infinity);
  while (centres.length < count) {
    let best = -1, bd = 1e-9;
    for (const i of live) { far[i] = Math.min(far[i], (1 - cos(i, centres[centres.length - 1])) * wt[i]); if (far[i] > bd) { bd = far[i]; best = i; } }
    if (best < 0) break;
    centres.push([U[best * 3], U[best * 3 + 1], U[best * 3 + 2]]);
  }
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    for (const i of live) {
      let b = 0, bc = -2; for (let q = 0; q < centres.length; q++) { const v = cos(i, centres[q]); if (v > bc) { bc = v; b = q; } }
      if (labels[i] !== b) { labels[i] = b; moved++; }
    }
    const sum = centres.map(() => [0, 0, 0]);
    for (const i of live) { const s = sum[labels[i]]; for (let c = 0; c < 3; c++) s[c] += U[i * 3 + c] * wt[i]; }
    sum.forEach((s, q) => { const m = Math.hypot(...s); if (m > 0) centres[q] = s.map(v => v / m); });
    if (!moved) break;
  }
  // number the colours that kept cells 0..m-1
  const used = new Int32Array(centres.length).fill(-1); let m = 0;
  for (const i of live) if (used[labels[i]] < 0) used[labels[i]] = m++;
  for (const i of live) labels[i] = used[labels[i]];
  return { labels, count: m };
}

/**
 * The plan's pigment amounts mixed puddle by puddle.
 * @param D the plan's channel density, n x 3 (what the pigment fit was fitted to)
 * @param pigments the palette as sheet pigments ({ K, S, name? })
 * @param paper the paper colour, 8-bit sRGB
 * @param count how many local colours (the palette's own count)
 * @returns {{ A: Float32Array, labels: Int32Array, count: number, colours: object[] }} A is n x pigments.length; a cell's
 *   amounts are only in the pans of its own puddle; colours[q] names puddle q's pans and shares.
 */
export function planPuddles(D, w, h, pigments, paper, { count }) {
  const n = w * h, { labels, count: m } = densityDirections(D, n, count);
  const partition = Array.from({ length: m }, () => []);
  for (let i = 0; i < n; i++) if (labels[i] >= 0) partition[labels[i]].push(i);
  // localPans sorts its colour list by size; keep the puddle order by passing one colour at a time
  const A = new Float32Array(n * pigments.length), colours = [];
  for (let q = 0; q < m; q++) {
    const one = localPans(D, w, h, pigments, paper, { partition: [partition[q]] }), c = one.colours[0], k = pigments.length;
    if (c.side === 'across' && c.pans.length) {
      // the greyed puddle as one paint: its density direction is its pans in their shares (the sheet's K over 0.55,
      // as the plan's own unmix uses)
      const dir = [0, 1, 2].map(ch => c.pans.reduce((t, j, z) => t + c.shares[z] * pigments[j].K[ch] / 0.55, 0));
      const cells = partition[q], sub = new Float32Array(cells.length * 3);
      cells.forEach((i, z) => { for (let ch = 0; ch < 3; ch++) sub[z * 3 + ch] = D[i * 3 + ch]; });
      const a = unmix(sub, cells.length, [dir]);
      cells.forEach((i, z) => c.pans.forEach((j, y) => { A[i * k + j] = c.shares[y] * a[z]; }));
    } else for (const i of partition[q]) for (let j = 0; j < k; j++) A[i * k + j] = one.A[i * k + j];
    colours.push({ puddle: q, ...c });
  }
  return { A, labels, count: m, colours };
}
