// The palette: a few wells mixed once from the subject's colours and reused at different dilutions. A new well is
// mixed only past a tolerance, washing out the least-used one past the cap; mixes and washouts are counted.
// A well's recipe sums to 1 and lays density 2 K mass along one direction (light crosses the layer twice, km.mjs).
import { nnls } from './well.mjs';

const unit = v => { const m = Math.hypot(v[0], v[1], v[2]); return m > 1e-12 ? [v[0] / m, v[1] / m, v[2] / m] : [0.577, 0.577, 0.577]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The absorption a well lays per unit mass: the recipe-weighted K of its paints. */
export function wellK(paints, recipe) {
  const K = [0, 0, 0];
  for (let j = 0; j < paints.length; j++) for (let c = 0; c < 3; c++) K[c] += recipe[j] * paints[j].K[c];
  return K;
}

/** "60% hansa yellow + 40% quinacridone rose": the recipe as a painter would write it, paints under 3% left out. */
export function wellName(paints, recipe) {
  const parts = [];
  for (let j = 0; j < paints.length; j++) if (recipe[j] >= 0.03) parts.push({ j, share: recipe[j] });
  parts.sort((a, b) => b.share - a.share);
  if (parts.length === 1) return paints[parts[0].j].name ?? `paint ${parts[0].j}`;
  return parts.map(p => `${Math.round(100 * p.share)}% ${paints[p.j].name ?? `paint ${p.j}`}`).join(' + ');
}

function makeWell(paints, recipe) {
  const k = paints.length, r = Float64Array.from(recipe);
  let s = 0; for (let j = 0; j < k; j++) s += r[j];
  if (s > 0) for (let j = 0; j < k; j++) r[j] /= s;
  const K = wellK(paints, r);
  return { recipe: r, K, dir: unit(K), name: wellName(paints, r), uses: 0 };
}

/** The recipe that lays density in direction `dir`: nnls over the paints, as a unit-sum recipe. */
function recipeFor(paints, dir) {
  const { c } = nnls(paints.map(p => p.K), dir, paints.length);
  let s = 0; for (let j = 0; j < c.length; j++) s += c[j];
  if (!(s > 1e-9)) { // nothing reaches it at all: the paint whose direction is nearest
    let best = 0, bd = -2;
    paints.forEach((p, j) => { const d = dot(unit(p.K), unit(dir)); if (d > bd) { bd = d; best = j; } });
    const one = new Float64Array(paints.length); one[best] = 1; return one;
  }
  return Float64Array.from(c, v => v / s);
}

/**
 * Mix the wells from the subject's density `D` (three channels per cell): mass-weighted spherical k-means, seeded
 * farthest-first so a small saturated passage survives. Recipes within `merge` cosine of each other are one well.
 *
 * @param opts.wells  how many to mix at the start (about 8 to 12)
 * @param opts.cap    the most the palette may hold; past it a well is washed out to mix a new one
 * @param opts.tol    the cosine below which no existing well is close enough and a new one is mixed (0.985 is 10 degrees)
 */
export function mixPalette(paints, D, { wells = 10, cap = 12, tol = 0.975, merge = 0.998, stride = 1, floor = 0.04, iterations = 20, seed = 1 } = {}) {
  const n = Math.floor(D.length / 3), pts = [];
  for (let i = 0; i < n; i += stride) {
    const a = Math.max(0, D[i * 3]), b = Math.max(0, D[i * 3 + 1]), c = Math.max(0, D[i * 3 + 2]), m = Math.hypot(a, b, c);
    if (m > floor) pts.push([a / m, b / m, c / m, m]);
  }
  const palette = { paints, wells: [], cap, tol, mixed: 0, washouts: 0, events: [] };
  if (!pts.length) return palette;
  // farthest-first seeds: the heaviest point, then whichever point is least like any seed so far, weighted by mass
  let s = seed * 7919 + 13; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let centres = [pts.reduce((a, p) => (p[3] > a[3] ? p : a), pts[0]).slice(0, 3)];
  while (centres.length < Math.min(wells, pts.length)) {
    let best = null, bestScore = -1;
    for (let q = 0; q < pts.length; q += Math.max(1, Math.floor(pts.length / 4000))) {
      const p = pts[q];
      let near = -2; for (const c of centres) near = Math.max(near, c[0] * p[0] + c[1] * p[1] + c[2] * p[2]);
      const score = (1 - near) * (0.5 + p[3]) * (0.9 + 0.2 * rnd());
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (!best || bestScore < 1e-4) break;
    centres.push(best.slice(0, 3));
  }
  for (let it = 0; it < iterations; it++) {
    const acc = centres.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let bj = 0, bd = -2;
      for (let j = 0; j < centres.length; j++) { const d = centres[j][0] * p[0] + centres[j][1] * p[1] + centres[j][2] * p[2]; if (d > bd) { bd = d; bj = j; } }
      acc[bj][0] += p[0] * p[3]; acc[bj][1] += p[1] * p[3]; acc[bj][2] += p[2] * p[3]; acc[bj][3] += p[3];
    }
    centres = acc.filter(a => a[3] > 0).map(a => unit(a));
  }
  // each centre becomes a recipe, and recipes that lay the same direction are one well
  const weight = centres.map(() => 0);
  for (const p of pts) { let bj = 0, bd = -2; for (let j = 0; j < centres.length; j++) { const d = dot(centres[j], p); if (d > bd) { bd = d; bj = j; } } weight[bj] += p[3]; }
  const order = centres.map((_, j) => j).sort((a, b) => weight[b] - weight[a]);
  for (const j of order) {
    const w = makeWell(paints, recipeFor(paints, centres[j]));
    if (palette.wells.some(v => dot(v.dir, w.dir) > merge)) continue;
    palette.wells.push(w); palette.mixed++;
  }
  return palette;
}

/**
 * The best existing well for a wanted density `r`: the one laying the nearest direction, and the mass along it that
 * best fits r (least squares on 2 K mass = r). `fit` is the cosine.
 */
export function pickWell(palette, r) {
  let index = -1, fit = -2;
  const rd = unit(r);
  palette.wells.forEach((w, j) => { const d = dot(w.dir, rd); if (d > fit) { fit = d; index = j; } });
  if (index < 0) return { index, fit: 0, mass: 0, err: Math.hypot(...r) };
  const K = palette.wells[index].K, mass = Math.max(0, dot(K, r) / (2 * dot(K, K)));
  const err = Math.hypot(...[0, 1, 2].map(c => 2 * K[c] * mass - r[c]));
  return { index, fit, mass, err };
}

/**
 * The well to paint `r` with. The best existing one when it is within tolerance; otherwise a new well is mixed, into a
 * free slot while the palette has one and over the least-used well when it does not (a washout). Marks the well used.
 * `allowNew` false takes the nearest well whatever its fit: a small touch is not worth a washout.
 */
export function wellFor(palette, r, { tol = palette.tol, allowNew = true } = {}) {
  let pick = pickWell(palette, r), fresh = false, washed = false;
  if (pick.index < 0 || (pick.fit < tol && allowNew)) {
    const w = makeWell(palette.paints, recipeFor(palette.paints, unit(r)));
    // the recipe the paints allow may itself be no closer than what is on the palette: then keep what is there
    if (pick.index < 0 || dot(w.dir, unit(r)) > pick.fit + 1e-6) {
      if (palette.wells.length < palette.cap) { palette.wells.push(w); palette.events.push({ mixed: w.name }); }
      else {
        let idle = 0;
        palette.wells.forEach((v, j) => { if (v.uses < palette.wells[idle].uses) idle = j; });
        palette.events.push({ washed: palette.wells[idle].name, mixed: w.name });
        palette.wells[idle] = w; washed = true; palette.washouts++;
      }
      palette.mixed++; fresh = true;
      pick = pickWell(palette, r);
    }
  }
  const well = palette.wells[pick.index];
  well.uses++;
  return { ...pick, well, fresh, washed };
}

/** Format one palette well per line. */
export function describePalette(palette) {
  return palette.wells.map((w, j) => `well ${j + 1}: ${w.name}${w.uses ? ` (${w.uses} uses)` : ''}`).join('\n') + '\n';
}
