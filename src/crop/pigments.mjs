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
  const maxPts = (n + 1) >> 1;
  const px = new Float64Array(maxPts), py = new Float64Array(maxPts), pz = new Float64Array(maxPts), pw = new Float64Array(maxPts);
  let np = 0;
  for (let i = 0; i < n; i += 2) {
    const o = i * 3;
    const a = D[o] > 0 ? D[o] : 0, b = D[o + 1] > 0 ? D[o + 1] : 0, c = D[o + 2] > 0 ? D[o + 2] : 0;
    const m = Math.hypot(a, b, c);
    if (m > minStrength) { px[np] = a / m; py[np] = b / m; pz[np] = c / m; pw[np] = m; np++; }
  }
  if (!np) return [];
  // seeds: the warmest (most blue absorbed), the coolest (most red absorbed) and the most neutral directions
  let b0 = 0, v0 = pz[0] - px[0];
  let b1 = 0, v1 = px[0] - pz[0];
  let b2 = 0, v2 = -Math.abs(px[0] - pz[0]) - Math.abs(py[0] - (px[0] + pz[0]) / 2) + pw[0] * 0.2;
  for (let i = 1; i < np; i++) {
    const x = px[i], y = py[i], z = pz[i], w = pw[i];
    const s0 = z - x; if (s0 > v0) { v0 = s0; b0 = i; }
    const s1 = x - z; if (s1 > v1) { v1 = s1; b1 = i; }
    const s2 = -Math.abs(x - z) - Math.abs(y - (x + z) / 2) + w * 0.2; if (s2 > v2) { v2 = s2; b2 = i; }
  }
  let centres = [[px[b0], py[b0], pz[b0]], [px[b1], py[b1], pz[b1]], [px[b2], py[b2], pz[b2]]].slice(0, k);
  // Past three, each further seed is the direction least like any seed so far, among the stronger half of the pixels.
  if (k > 3) {
    const strongIdx = [];
    const thresh = minStrength * 2;
    for (let i = 0; i < np; i++) if (pw[i] > thresh) strongIdx.push(i);
    const useStrong = strongIdx.length > 50;
    const poolLen = useStrong ? strongIdx.length : np;
    while (centres.length < k && poolLen) {
      let best = -1, bestSim = 2;
      const cl = centres.length;
      for (let i = 0; i < poolLen; i += 3) {
        const idx = useStrong ? strongIdx[i] : i;
        const x = px[idx], y = py[idx], z = pz[idx];
        let sim = -2;
        for (let j = 0; j < cl; j++) { const c = centres[j]; const d = c[0] * x + c[1] * y + c[2] * z; if (d > sim) sim = d; }
        if (sim < bestSim) { bestSim = sim; best = idx; }
      }
      if (best < 0 || bestSim > 0.995) break;
      centres.push([px[best], py[best], pz[best]]);
    }
  }
  // pinned centres keep their direction: a rescued pan is the colour the mass-weighted fit could not see, and letting
  // the fit move it puts it straight back into the mass it was rescued from
  const pinned = new Set();
  const fit = rounds => {
    const cl = centres.length;
    const cx = new Float64Array(cl), cy = new Float64Array(cl), cz = new Float64Array(cl);
    const ax = new Float64Array(cl), ay = new Float64Array(cl), az = new Float64Array(cl);
    for (let it = 0; it < rounds; it++) {
      for (let j = 0; j < cl; j++) { cx[j] = centres[j][0]; cy[j] = centres[j][1]; cz[j] = centres[j][2]; ax[j] = 0; ay[j] = 0; az[j] = 0; }
      for (let i = 0; i < np; i++) {
        const x = px[i], y = py[i], z = pz[i], w = pw[i];
        let bj = 0, bd = -2;
        for (let j = 0; j < cl; j++) { const d = cx[j] * x + cy[j] * y + cz[j] * z; if (d > bd) { bd = d; bj = j; } }
        ax[bj] += x * w; ay[bj] += y * w; az[bj] += z * w;
      }
      for (let j = 0; j < cl; j++) {
        if (pinned.has(j)) continue;
        const m = Math.hypot(ax[j], ay[j], az[j]);
        if (m > 0) centres[j] = [ax[j] / m, ay[j] / m, az[j] / m];
      }
    }
  };
  fit(iterations);
  // A pan for the colour the palette still misses. The fit is weighted by pigment mass, so a colour on a small part of
  // the picture is pulled into the mass beside it. Find the direction fitted worst, weighted by pigment, and give it a
  // pan if enough of the picture sits there.
  // rescueFit is a cosine on a tight scale, since every direction sits in the positive octant: 0.995 is about six
  // degrees. Missed directions are bucketed at 1/6, coarse enough that one missed colour reads as one bucket.
  for (let r = 0; r < rescue; r++) {
    const cl = centres.length;
    const load = new Float64Array(cl), miss = new Map();
    let total = 0;
    for (let i = 0; i < np; i++) {
      const x = px[i], y = py[i], z = pz[i], w = pw[i];
      let bj = 0, bd = -2;
      for (let j = 0; j < cl; j++) { const c = centres[j]; const d = c[0] * x + c[1] * y + c[2] * z; if (d > bd) { bd = d; bj = j; } }
      load[bj] += w; total += w;
      if (bd >= rescueFit) continue;
      const key = `${Math.round(x * rescueGrid)},${Math.round(y * rescueGrid)},${Math.round(z * rescueGrid)}`;
      let m = miss.get(key);
      if (!m) { m = [0, 0, 0, 0]; miss.set(key, m); }
      m[0] += x * w; m[1] += y * w; m[2] += z * w; m[3] += w;
    }
    let best = null;
    for (const m of miss.values()) if (!best || m[3] > best[3]) best = m;
    if (!best || best[3] < rescueShare * total) break;
    let j = -1, worst = dupBelow;
    for (let a = 0; a < centres.length; a++) {
      if (pinned.has(a)) continue;
      let near = -2;
      for (let b = 0; b < centres.length; b++) if (a !== b) near = Math.max(near, centres[a][0] * centres[b][0] + centres[a][1] * centres[b][1] + centres[a][2] * centres[b][2]);
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
