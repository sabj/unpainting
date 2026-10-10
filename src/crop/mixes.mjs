// Watercolour is not painted in separations: a painter blends the pigments on the palette first, and only those blends
// meet on the page. This chooses a handful of mixes once for the plate and hands the block-in mix amounts instead of
// pan amounts, so a pass is one puddle at one strength over one region and a value step is the same colour with more
// or less water.

/** Cosine between a cell's proportions and a mix. Both are unit-sum, non-negative. */
function cosine(a, b, k) {
  let d = 0, na = 0, nb = 0;
  for (let j = 0; j < k; j++) { d += a[j] * b[j]; na += a[j] * a[j]; nb += b[j] * b[j]; }
  return d / Math.max(1e-9, Math.sqrt(na) * Math.sqrt(nb));
}

/** A puddle is two or three pigments, not a trace of everything. Drop the pans under `floor` and renormalise. */
function snap(mix, k, floor) {
  const out = new Float64Array(k);
  let s = 0;
  for (let j = 0; j < k; j++) if (mix[j] >= floor) { out[j] = mix[j]; s += mix[j]; }
  if (s <= 0) { // a mix with no pan over the floor is a near-even grey; keep its largest
    let best = 0;
    for (let j = 1; j < k; j++) if (mix[j] > mix[best]) best = j;
    out[best] = 1;
    return out;
  }
  for (let j = 0; j < k; j++) out[j] /= s;
  return out;
}

/** Choose palette mixes with weighted spherical k-means over per-cell pigment proportions.
 * Weight by pigment mass so large pale passages contribute without giving each dark speck a separate mix.
 * @param A Per-cell pigment amounts, n * k, from unmix().
 * @returns Unit-sum mixes as Float64Arrays of length k. */
export function choosePlateMixes(A, n, k, M, { iters = 25, floor = 0.1, seed = 12345 } = {}) {
  if (M <= 1 || k <= 1) return [snap(Float64Array.from({ length: k }, () => 1 / k), k, 0)];
  // proportions and weights, skipping cells with nothing in them
  const idx = [], prop = [], wt = [];
  for (let i = 0; i < n; i++) {
    let t = 0;
    for (let j = 0; j < k; j++) t += A[i * k + j];
    if (t <= 1e-4) continue;
    const p = new Float64Array(k);
    for (let j = 0; j < k; j++) p[j] = A[i * k + j] / t;
    idx.push(i); prop.push(p); wt.push(t);
  }
  if (!prop.length) return [snap(Float64Array.from({ length: k }, () => 1 / k), k, floor)];
  const m = Math.min(M, prop.length);

  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  // k-means++ on the weights: the first puddle is the heaviest direction, each next one is far from those chosen
  const centres = [];
  {
    let best = 0;
    for (let q = 1; q < prop.length; q++) if (wt[q] > wt[best]) best = q;
    centres.push(Float64Array.from(prop[best]));
    const far = new Float64Array(prop.length).fill(Infinity);
    while (centres.length < m) {
      let total = 0;
      for (let q = 0; q < prop.length; q++) {
        const d = 1 - cosine(prop[q], centres[centres.length - 1], k);
        far[q] = Math.min(far[q], d * d);
        total += far[q] * wt[q];
      }
      if (!(total > 0)) break;
      let r = rnd() * total, pick = prop.length - 1;
      for (let q = 0; q < prop.length; q++) { r -= far[q] * wt[q]; if (r <= 0) { pick = q; break; } }
      centres.push(Float64Array.from(prop[pick]));
    }
  }

  const label = new Int32Array(prop.length);
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    for (let q = 0; q < prop.length; q++) {
      let best = 0, bestC = -2;
      for (let c = 0; c < centres.length; c++) { const v = cosine(prop[q], centres[c], k); if (v > bestC) { bestC = v; best = c; } }
      if (label[q] !== best) { label[q] = best; moved++; }
    }
    const sum = centres.map(() => new Float64Array(k)), mass = new Float64Array(centres.length);
    for (let q = 0; q < prop.length; q++) {
      const c = label[q], p = prop[q], ww = wt[q];
      for (let j = 0; j < k; j++) sum[c][j] += p[j] * ww;
      mass[c] += ww;
    }
    for (let c = 0; c < centres.length; c++) {
      if (mass[c] <= 0) continue;
      let t = 0;
      for (let j = 0; j < k; j++) t += sum[c][j];
      if (t <= 0) continue;
      for (let j = 0; j < k; j++) centres[c][j] = sum[c][j] / t;
    }
    if (!moved) break;
  }

  // snap to real puddles, then drop any that collapsed onto another
  const out = [];
  for (const c of centres) {
    const sn = snap(c, k, floor);
    if (!out.some(o => cosine(o, sn, k) > 0.9995)) out.push(sn);
  }
  return out;
}

/**
 * Each cell's amounts as amounts of the plate's mixes: a base wash and, where one puddle cannot say it, a glaze or two
 * over it. Greedy, and never over-delivers a pigment: a mix is taken at the largest strength that stays under what the
 * cell wants in every pan it carries.
 *
 * @returns { AM, kept } AM is n * mixes.length; kept is the share of the plate's pigment mass the mixes account for
 */
export function toMixAmounts(A, n, k, mixes, { perCell = 3, stop = 0.03, over = 0.12 } = {}) {
  const M = mixes.length, AM = new Float32Array(n * M), rest = new Float64Array(k);
  let want = 0, got = 0;
  for (let i = 0; i < n; i++) {
    let t = 0;
    for (let j = 0; j < k; j++) { rest[j] = A[i * k + j]; t += rest[j]; }
    if (t <= 1e-4) continue;
    want += t;
    let left = t;
    for (let pass = 0; pass < perCell && left > stop * t; pass++) {
      // the puddle nearest what is still wanted here
      let best = -1, bestC = -2;
      for (let c = 0; c < M; c++) { const v = cosine(rest, mixes[c], k); if (v > bestC) { bestC = v; best = c; } }
      if (best < 0) break;
      const mix = mixes[best];
      // How much of it to lay. Held to what every pan still wants, the strength collapses to nothing whenever the
      // puddle carries a pigment the cell does not, and the painting comes out too pale. A painter lays the nearest mix
      // they have and accepts a little too much of one pigment, so take the least-squares strength and allow each pan
      // to run over by `over` of what the cell carries in total.
      let d = 0, nn = 0;
      for (let j = 0; j < k; j++) { d += rest[j] * mix[j]; nn += mix[j] * mix[j]; }
      let amt = d / Math.max(1e-9, nn);
      for (let j = 0; j < k; j++) if (mix[j] > 0) amt = Math.min(amt, (rest[j] + over * t) / mix[j]);
      if (!(amt > 1e-6)) break;
      AM[i * M + best] += amt;
      let laid = 0;
      for (let j = 0; j < k; j++) { const put = Math.min(rest[j], mix[j] * amt); laid += put; rest[j] -= put; }
      left = 0;
      for (let j = 0; j < k; j++) left += rest[j];
      got += laid;
    }
  }
  return { AM, kept: want > 0 ? got / want : 1 };
}

/** A mix as pan amounts at a given strength, which is what the brush is charged with. */
export function panMix(mix, k, amount) {
  const out = new Array(k).fill(0);
  for (let j = 0; j < k; j++) out[j] = mix[j] * amount;
  return out;
}
