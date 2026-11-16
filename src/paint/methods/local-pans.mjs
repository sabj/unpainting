// The plan's pigment amounts with each local colour mixed from its own pans (pan-choice.mjs). The palette keeps every
// pan; what changes is which pans each puddle takes. A local colour is one of the plan's colour families (the same
// density families shape-refit.mjs cuts its planning shapes from), wherever it lies on the sheet. Its pans are chosen
// once from its mean colour, then each of its cells is unmixed over those pans only, so the value and the small changes
// of colour inside it stay the plan's, and a pan from the far side of the wheel never enters a puddle it was not chosen
// for. A greying pan goes in with its puddle, never on its own. Planning only: it reads the plan's density, never the sheet.
import { planningShapes } from './shape-refit.mjs';
import { choosePans } from './pan-choice.mjs';
import { unmix } from '../../crop/pigments.mjs';

/**
 * @param D        the plan's channel density, n x 3 (what the unmix was fitted to)
 * @param pigments the palette as sheet pigments ({ K, S, name? })
 * @param paper    the paper colour, 8-bit sRGB
 * @param families how many colour families the plan is cut into (shape-refit.mjs; --refitfamilies)
 * @param partition cell lists to mix one puddle each, in place of the colour families (a mass plan's masses)
 * @param ownPans each cell of a puddle, greyed or not, is fitted over the puddle's own pans one by one (a mass plan)
 * @returns {{ A: Float32Array, colours: { cells: number, rgb: number[], pans: number[], shares: number[], side: string, dE: number, span: number }[] }}
 *   `A` is n x pigments.length amounts, zero for every pan a cell's local colour did not choose.
 */
export function localPans(D, w, h, pigments, paper, { families = 24, partition = null, ownPans = false } = {}) {
  const n = w * h, k = pigments.length;
  if (!(D?.length === n * 3)) throw new RangeError('local pans: the density must be n x 3');
  if (!k) throw new RangeError('local pans: the palette is empty');
  const Ks = pigments.map(p => p.K.map(v => v / 0.55));
  const A = new Float32Array(n * k), colours = [];
  // the local colours: the given partition (a mass plan's masses), or the plan's colour families
  for (const cells of partition ?? planningShapes(D, w, h, { families, minCells: Infinity })) {
    const rgb = [0, 0, 0];
    for (const i of cells) for (let c = 0; c < 3; c++) rgb[c] += paper[c] * Math.exp(-D[i * 3 + c]) / cells.length;
    const pick = choosePans(rgb.map(v => Math.max(0, Math.min(255, v))), pigments, paper);
    colours.push({ cells: cells.length, rgb, pans: pick.indices, shares: pick.shares, side: pick.side, dE: pick.dE, span: pick.span });
    if (!pick.indices.length) continue;
    const sub = new Float32Array(cells.length * 3);
    cells.forEach((i, q) => { for (let c = 0; c < 3; c++) sub[q * 3 + c] = D[i * 3 + c]; });
    // A puddle greyed across the wheel is greyed once, in the well: its cells are unmixed over the greyed puddle as
    // one paint and its near pans, so no cell takes more of the greying pan, for its paint, than the puddle holds.
    const greying = pick.indices.filter(j => pick.far.includes(j)), nearPans = pick.indices.filter(j => !greying.includes(j));
    if (!greying.length && !ownPans && nearPans.length > 0 && nearPans.length < 3) {
      const extra = pick.angles.map((a, j) => ({ a, j })).filter(x => x.a !== null && x.a < 38 && !nearPans.includes(x.j)).sort((p, q) => p.a - q.a);
      while (nearPans.length < 3 && extra.length) nearPans.push(extra.shift().j);
    }
    // ownPans (a mass plan): a mass is one puddle, and its colour varies wet inside it: each cell takes its own share of
    // every pan in the puddle, the greying one included, so a warm face and a grey coat in one mass keep their colours
    const darkShadow = Math.max(...rgb) < 110;
    const parts = greying.length && !ownPans && !darkShadow ? [pick.indices.map((j, q) => [j, pick.shares[q]]), ...nearPans.map(j => [[j, 1]])] : (greying.length ? pick.indices : nearPans).map(j => [[j, 1]]);
    const dirs = parts.map(part => [0, 1, 2].map(c => part.reduce((t, [j, f]) => t + f * Ks[j][c], 0)));
    const m = parts.length, a = unmix(sub, cells.length, dirs);
    cells.forEach((i, q) => { for (let p = 0; p < m; p++) for (const [j, f] of parts[p]) A[i * k + j] += f * a[q * m + p]; });
  }
  colours.sort((p, q) => q.cells - p.cells);
  return { A, colours };
}
