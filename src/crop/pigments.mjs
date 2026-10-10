// A watercolour's palette recovered from its keyframes: pigments as absorbance directions in per-channel
// optical density (D_c = -ln(I_c / paper_c)), and each pixel's colour unmixed into pigment amounts. Layers of
// transparent pigment multiply, so densities add: D = sum_k amount_k * absorbance_k. DOM free.
import { unmixRange } from './unmix-kernel.mjs';

export function channelDensity(rgb, n, paper) {
  const D = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) D[i * 3 + c] = -Math.log(Math.max(1, rgb[i * 3 + c]) / paper[c]);
  return D;
}

/** k pigments by clustering the direction of density vectors (spherical k-means), weighted by strength. */
export function estimatePigments(D, n, k = 3, { minStrength = 0.12, iterations = 25, rescue = 0, rescueFit = 0.995, rescueShare = 0.015, rescueGrid = 6, dupBelow = 0.999 } = {}) {
  const pts = [];
  for (let i = 0; i < n; i += 2) { const a = Math.max(0, D[i * 3]), b = Math.max(0, D[i * 3 + 1]), c = Math.max(0, D[i * 3 + 2]), m = Math.hypot(a, b, c); if (m > minStrength) pts.push([a / m, b / m, c / m, m]); }
  // seeds: the warmest (most blue absorbed), the coolest (most red absorbed) and the most neutral directions
  const by = f => pts.reduce((best, p) => (f(p) > f(best) ? p : best), pts[0]);
  let centres = [by(p => p[2] - p[0]), by(p => p[0] - p[2]), by(p => -Math.abs(p[0] - p[2]) - Math.abs(p[1] - (p[0] + p[2]) / 2) + p[3] * 0.2)].slice(0, k).map(p => p.slice(0, 3));
  // Past three, each further seed is the direction least like any seed so far, among the stronger half of the pixels.
  if (k > 3) {
    const strong = pts.filter(p => p[3] > minStrength * 2);
    const pool = strong.length > 50 ? strong : pts;
    while (centres.length < k && pool.length) {
      let best = null, bestSim = 2;
      for (let i = 0; i < pool.length; i += 3) { const p = pool[i]; const sim = Math.max(...centres.map(c => c[0] * p[0] + c[1] * p[1] + c[2] * p[2])); if (sim < bestSim) { bestSim = sim; best = p; } }
      if (!best || bestSim > 0.995) break;
      centres.push(best.slice(0, 3));
    }
  }
  // pinned centres keep their direction: a rescued pan is the colour the mass-weighted fit could not see, and letting
  // the fit move it puts it straight back into the mass it was rescued from
  const pinned = new Set();
  const fit = rounds => {
    for (let it = 0; it < rounds; it++) {
      const acc = centres.map(() => [0, 0, 0]);
      for (const p of pts) { let bj = 0, bd = -2; centres.forEach((c, j) => { const d = c[0] * p[0] + c[1] * p[1] + c[2] * p[2]; if (d > bd) { bd = d; bj = j; } }); for (let q = 0; q < 3; q++) acc[bj][q] += p[q] * p[3]; }
      centres = acc.map((a, j) => { if (pinned.has(j)) return centres[j]; const m = Math.hypot(...a); return m > 0 ? a.map(v => v / m) : centres[j]; });
    }
  };
  fit(iterations);
  // A pan for the colour the palette still misses. The fit is weighted by pigment mass, so a colour on a small part of
  // the picture is pulled into the mass beside it. Find the direction fitted worst, weighted by pigment, and give it a
  // pan if enough of the picture sits there.
  // rescueFit is a cosine on a tight scale, since every direction sits in the positive octant: 0.995 is about six
  // degrees. Missed directions are bucketed at 1/6, coarse enough that one missed colour reads as one bucket.
  for (let r = 0; r < rescue; r++) {
    const load = centres.map(() => 0), miss = new Map();
    let total = 0;
    for (const p of pts) {
      let bj = 0, bd = -2;
      centres.forEach((c, j) => { const d = c[0] * p[0] + c[1] * p[1] + c[2] * p[2]; if (d > bd) { bd = d; bj = j; } });
      load[bj] += p[3]; total += p[3];
      if (bd >= rescueFit) continue;
      // bucket by direction on a coarse grid, so one missed colour gathers rather than scattering
      const key = [0, 1, 2].map(q => Math.round(p[q] * rescueGrid)).join(',');
      const m = miss.get(key) ?? [0, 0, 0, 0];
      for (let q = 0; q < 3; q++) m[q] += p[q] * p[3];
      m[3] += p[3];
      miss.set(key, m);
    }
    let best = null;
    for (const m of miss.values()) if (!best || m[3] > best[3]) best = m;
    if (!best || best[3] < rescueShare * total) break;
    // Spend a pan that duplicates another; where none does, or only two pans remain, add one. Spending the least-loaded
    // pan can throw away a colour nothing else makes.
    let j = -1, worst = dupBelow;
    for (let a = 0; a < centres.length; a++) {
      if (pinned.has(a)) continue; // a pan already rescued is not the one to spend
      let near = -2;
      for (let b = 0; b < centres.length; b++) if (a !== b) near = Math.max(near, centres[a][0] * centres[b][0] + centres[a][1] * centres[b][1] + centres[a][2] * centres[b][2]);
      // among the near-duplicates, give up the one carrying less pigment
      const score = near - 0.02 * (load[a] / Math.max(1e-9, total));
      if (score > worst) { worst = score; j = a; }
    }
    const len = Math.hypot(best[0], best[1], best[2]);
    if (!(len > 0)) break;
    const dir = [best[0] / len, best[1] / len, best[2] / len];
    if (j < 0) { centres.push(dir); j = centres.length - 1; } else centres[j] = dir;
    pinned.add(j);
    fit(8);
  }
  return centres;
}

/** Non-negative amounts of each pigment per pixel (projected gradient, a few iterations; k is small). */
export function unmix(D, n, pigments, { iterations = 30 } = {}) {
  const k = pigments.length, A = new Float32Array(n * k);
  const G = pigments.map(a => pigments.map(b => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const L = Math.max(...G.map(r => r.reduce((s, v) => s + Math.abs(v), 0)));
  // No per-pixel allocation (flat Gram matrix, one x and one b reused). x stays a Float32Array so every update rounds
  // the same way. This runs once per candidate palette, over every pixel.
  const Gf = new Float64Array(k * k); for (let j = 0; j < k; j++) for (let q = 0; q < k; q++) Gf[j * k + q] = G[j][q];
  const P0 = pigments.map(p => p[0]), P1 = pigments.map(p => p[1]), P2 = pigments.map(p => p[2]);
  // the thread pool (sheet-par.mjs) takes shares of the pixels when it is running and the job is big enough
  if (UNMIX_THREADS) { const out = UNMIX_THREADS(D, n, k, Gf, P0, P1, P2, L, iterations); if (out) return out; }
  unmixRange(D, A, k, Gf, P0, P1, P2, L, iterations, 0, n);
  return A;
}
let UNMIX_THREADS = null;
export const useUnmixThreads = f => { UNMIX_THREADS = f; };
