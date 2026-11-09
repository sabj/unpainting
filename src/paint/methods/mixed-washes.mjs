// One mixed charge per passage (--mixedwash). A painter mixes a wash on the palette and lays it once on dry paper; the
// planner used to list each band step pigment by pigment, so a first wash went on as a run of single-pigment tints over
// the whole sheet. Here a passage is one connected shape of one colour domain, charged with the mean of what its cells
// ask of every pigment. Planning only: it reads the plan's demand, never the sheet.

/**
 * The charge of one passage. `scale[i]` is the share of cell i's demand this step carries (weights and gains).
 * Pigments under `minShare` of the charge are left out and their mass goes to the rest: a palette mix holds a few
 * paints, and a trace of a fourth one only greys it.
 * @returns {{mix: Float64Array, amount: number}} mix[j] is pigment j's amount; the mix sums to `amount`.
 */
export function mixedCharge(list, demand, k, scale, { minShare = 0.03 } = {}) {
  const mix = new Float64Array(k);
  for (const i of list) for (let j = 0; j < k; j++) mix[j] += demand[i * k + j] * scale[i];
  let total = 0;
  for (let j = 0; j < k; j++) { mix[j] /= Math.max(1, list.length); total += mix[j]; }
  if (!(total > 0)) return { mix: new Float64Array(k), amount: 0 };
  let kept = 0;
  for (let j = 0; j < k; j++) { if (mix[j] < minShare * total) mix[j] = 0; kept += mix[j]; }
  if (kept > 0) for (let j = 0; j < k; j++) mix[j] *= total / kept;
  return { mix, amount: total };
}

export function leadPigment(mix) {
  let best = 0;
  for (let j = 1; j < mix.length; j++) if (mix[j] > mix[best]) best = j;
  return best;
}

/**
 * Colour domains for mixed washes: colour regions (labels 1..count), with touching regions of nearly the same pigment
 * shares joined, so one colour is not split along a cluster line nobody can see. `maxShareDiff` is the planner's colour
 * edge (the L1 distance between pigment shares it already calls a colour boundary). `mayJoin(a, b)` can keep two regions
 * apart, for example when their styles differ.
 * @returns {{labels: Int32Array, ids: number[]}} ids are the domain labels in use, each a region label.
 */
export function washDomains(labels, count, demand, k, w, h, { maxShareDiff = 0.45, mayJoin = null } = {}) {
  const n = w * h, sum = new Float64Array((count + 1) * k), mass = new Float64Array(count + 1);
  for (let i = 0; i < n; i++) {
    const L = labels[i];
    for (let j = 0; j < k; j++) { sum[L * k + j] += demand[i * k + j]; mass[L] += demand[i * k + j]; }
  }
  const parent = Int32Array.from({ length: count + 1 }, (_, i) => i);
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const sameColour = (a, b) => {
    if (!(mass[a] > 0) || !(mass[b] > 0)) return true;
    let d = 0;
    for (let j = 0; j < k; j++) d += Math.abs(sum[a * k + j] / mass[a] - sum[b * k + j] / mass[b]);
    return d < maxShareDiff;
  };
  const tried = new Set();
  const consider = (a, b) => {
    if (a === b || !a || !b) return;
    const key = a < b ? a * (count + 1) + b : b * (count + 1) + a;
    if (tried.has(key)) return;
    tried.add(key);
    if (sameColour(a, b) && (!mayJoin || mayJoin(a, b))) {
      // Shares are pooled as regions join, so a chain of small steps cannot walk one domain across the colour wheel.
      const ra = find(a), rb = find(b);
      if (ra === rb || !sameColour(ra, rb)) return;
      parent[rb] = ra;
      for (let j = 0; j < k; j++) sum[ra * k + j] += sum[rb * k + j];
      mass[ra] += mass[rb];
    }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x < w - 1) consider(labels[i], labels[i + 1]);
    if (y < h - 1) consider(labels[i], labels[i + w]);
  }
  const out = new Int32Array(n), ids = new Set();
  for (let i = 0; i < n; i++) { const d = labels[i] ? find(labels[i]) : 0; out[i] = d; if (d) ids.add(d); }
  return { labels: out, ids: [...ids].sort((a, b) => a - b) };
}
