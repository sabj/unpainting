// The plan's pigment amounts with each local colour mixed from its own pans (pan-choice.mjs).
import { planningShapes } from "./shape-refit.mjs";
import { choosePans } from "./pan-choice.mjs";
import { unmix } from "../../crop/pigments.mjs";

export function localPans(D, w, h, pigments, paper, { families = 24, partition = null, ownPans = false } = {}) {
  const n = w * h, k = pigments.length;
  if (!(D?.length === n * 3)) throw new RangeError("local pans: the density must be n x 3");
  if (!k) throw new RangeError("local pans: the palette is empty");
  const Ks = pigments.map(p => p.K.map(v => v / 0.55));
  const A = new Float32Array(n * k), colours = [];
  for (const cells of partition ?? planningShapes(D, w, h, { families, minCells: Infinity })) {
    const rgb = [0, 0, 0];
    for (const i of cells) for (let c = 0; c < 3; c++) rgb[c] += paper[c] * Math.exp(-D[i * 3 + c]) / cells.length;
    const pick = choosePans(rgb.map(v => Math.max(0, Math.min(255, v))), pigments, paper);
    colours.push({ cells: cells.length, rgb, pans: pick.indices, shares: pick.shares, side: pick.side, dE: pick.dE, span: pick.span });
    if (!pick.indices.length) continue;
    const sub = new Float32Array(cells.length * 3);
    cells.forEach((i, q) => { for (let c = 0; c < 3; c++) sub[q * 3 + c] = D[i * 3 + c]; });
    const greying = pick.indices.filter(j => pick.far.includes(j) || (pick.angles[j] === null && pick.indices.some(q => pick.angles[q] !== null))), nearPans = pick.indices.filter(j => !greying.includes(j));
    const parts = greying.length && !ownPans ? [pick.indices.map((j, q) => [j, pick.shares[q]]), ...nearPans.map(j => [[j, 1]])] : pick.indices.map(j => [[j, 1]]);
    const dirs = parts.map(part => [0, 1, 2].map(c => part.reduce((t, [j, f]) => t + f * Ks[j][c], 0)));
    const m = parts.length, a = unmix(sub, cells.length, dirs);
    const rawMean = new Float64Array(k);
    cells.forEach((i, q) => { for (let p = 0; p < m; p++) for (const [j, f] of parts[p]) rawMean[j] += f * a[q * m + p] / cells.length; });
    if (greying.length && !ownPans) {
      let rawTot = 0; for (let j = 0; j < k; j++) rawTot += rawMean[j];
      const s = rawTot > 1e-6 && pick.mass > 0 ? pick.mass / rawTot : 1;
      cells.forEach((i, q) => { for (let p = 0; p < m; p++) for (const [j, f] of parts[p]) A[i * k + j] += s * f * a[q * m + p]; });
    } else {
      const scale = new Float64Array(k).fill(1);
      for (const j of pick.indices) if (rawMean[j] > 1e-6 && pick.mix[j] > 0) scale[j] = pick.mix[j] / rawMean[j];
      cells.forEach((i, q) => { for (let p = 0; p < m; p++) for (const [j, f] of parts[p]) A[i * k + j] += scale[j] * f * a[q * m + p]; });
    }
  }
  colours.sort((p, q) => q.cells - p.cells);
  return { A, colours };
}
