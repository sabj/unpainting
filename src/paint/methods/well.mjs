// The palette well: a recipe of real paints, premixed for the gap between the wanted colour and the sheet's colour.
// Densities add (a paint of absorption K at thickness x adds K*x), so the mix is a non-negative least squares over
// three channels.

/** Solve min ||M c - r||^2 over c >= 0, M being 3 x k of paint absorptions. Exhaustive active sets; k is small. */
export function nnls(K, r, k) {
  // Every subset of at most three paints can be solved exactly, and three channels cannot need more than three paints.
  let best = null, bestErr = Infinity;
  const try_ = sub => {
    const m = sub.length;
    // normal equations, m x m, built from the three channels
    const AtA = Array.from({ length: m }, () => new Float64Array(m)), Atb = new Float64Array(m);
    for (let a = 0; a < m; a++) {
      for (let b = 0; b < m; b++) { let s = 0; for (let c = 0; c < 3; c++) s += K[sub[a]][c] * K[sub[b]][c]; AtA[a][b] = s; }
      let s = 0; for (let c = 0; c < 3; c++) s += K[sub[a]][c] * r[c]; Atb[a] = s;
    }
    const x = solve(AtA, Atb, m);
    if (!x) return;
    for (let a = 0; a < m; a++) if (x[a] < -1e-9) return;   // an active set with a negative weight is not the answer
    let err = 0;
    for (let c = 0; c < 3; c++) {
      let v = 0;
      for (let a = 0; a < m; a++) v += x[a] * K[sub[a]][c];
      err += (v - r[c]) ** 2;
    }
    if (err < bestErr - 1e-12) {
      bestErr = err;
      best = new Float64Array(k);
      for (let a = 0; a < m; a++) best[sub[a]] = Math.max(0, x[a]);
    }
  };
  for (let a = 0; a < k; a++) {
    try_([a]);
    for (let b = a + 1; b < k; b++) {
      try_([a, b]);
      for (let c = b + 1; c < k; c++) try_([a, b, c]);
    }
  }
  return { c: best ?? new Float64Array(k), err: best ? Math.sqrt(bestErr) : Math.hypot(...r) };
}

/** Gaussian elimination with partial pivoting. Returns null when the system is singular, which an active set can be. */
function solve(A, b, m) {
  const M = A.map((row, i) => Float64Array.from([...row, b[i]]));
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let row = col + 1; row < m; row++) if (Math.abs(M[row][col]) > Math.abs(M[piv][col])) piv = row;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let row = 0; row < m; row++) {
      if (row === col) continue;
      const f = M[row][col] / M[col][col];
      for (let j = col; j <= m; j++) M[row][j] -= f * M[col][j];
    }
  }
  return Float64Array.from({ length: m }, (_, i) => M[i][m] / M[i][i]);
}

/**
 * The puddle to mix for one passage: how much of each paint turns what the sheet carries into what the picture wants.
 *
 * @param paints  the paints on the palette, each { name, K: [3] }
 * @param want    the density the picture wants, 3 channels
 * @param have    the density the sheet already carries there, 3 channels
 * @param cap     the most pigment one wash may lay, so the painter glazes instead of hitting it in one go
 * @returns { recipe, strength, err, names } recipe sums to one; strength is how much of it to lay
 */
export function mixFor(paints, want, have, { cap = 0.45, glaze = 1 } = {}) {
  const k = paints.length, K = paints.map(p => p.K);
  const r = [0, 1, 2].map(c => Math.max(0, (want[c] ?? 0) - (have[c] ?? 0)) * glaze);
  const { c, err } = nnls(K, r, k);
  let total = 0;
  for (let j = 0; j < k; j++) total += c[j];
  if (!(total > 1e-6)) return { recipe: new Float64Array(k), strength: 0, err, names: [] };
  const strength = Math.min(total, cap);
  const recipe = Float64Array.from(c, v => v / total);
  const names = [];
  for (let j = 0; j < k; j++) if (recipe[j] > 0.02) names.push(`${(100 * recipe[j]).toFixed(0)}% ${paints[j].name ?? j}`);
  return { recipe, strength, err, names };
}

/** The charge to load the brush with: the puddle's recipe at its strength, as per-pigment concentrations. */
export const chargeOf = (recipe, strength) => Array.from(recipe, v => v * strength);

/** What a puddle laid at `strength` adds to the sheet's density, so the painter can tell what it did without looking. */
export function densityOf(paints, recipe, strength) {
  const d = [0, 0, 0];
  for (let j = 0; j < paints.length; j++) for (let c = 0; c < 3; c++) d[c] += paints[j].K[c] * recipe[j] * strength;
  return d;
}
