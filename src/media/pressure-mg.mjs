// A multigrid preconditioner for the drying-pressure solve (drying-pressure.mjs): aggregation by 2 x 2 blocks of the
// sheet's grid on every level, never joining two puddles; Galerkin coarse operators (a 9-point stencil from level 1 on);
// a W-cycle with one Gauss-Seidel sweep forward before and backward after the coarse corrections; a dense Cholesky solve
// per puddle on the coarsest level. The cycle is a fixed, symmetric, positive definite operator, so conjugate gradients keep their guarantees: the solve
// stops by the same residual rule as with IC(0), in tens of iterations rather than thousands on a large wash.
//
// The system is the one dryingPressure solves: for each cell that is not a gauge, degree * x - sum of its wet
// neighbours' x = r, the gauge cells held at zero. Cells are given by their local index q (0..count-1, in sorted sheet
// order), `cell[q]` their sheet index, `edges[4q..4q+3]` the local index of the west, east, north and south neighbour
// or -1, `anchor[q]` 1 for a gauge.

// nodes per puddle solved directly; coarse correction weight (unsmoothed aggregation wants more than 1); Gauss-Seidel
// sweeps each side; corrections per level (2: a W-cycle, which ragged masks need: 47 iterations against 130 for a V-cycle)
const COARSEST = 16, OMEGA = 1.4, SWEEPS = 1, GAMMA = 2; // nodes solved directly; coarse correction weight (unsmoothed aggregation needs > 1)

function cholesky(n, A) { // A: n x n row-major, overwritten by L (lower)
  for (let j = 0; j < n; j++) {
    let d = A[j * n + j];
    for (let k = 0; k < j; k++) d -= A[j * n + k] * A[j * n + k];
    d = Math.sqrt(Math.max(d, 1e-300)); A[j * n + j] = d;
    for (let i = j + 1; i < n; i++) { let s = A[i * n + j]; for (let k = 0; k < j; k++) s -= A[i * n + k] * A[j * n + k]; A[i * n + j] = s / d; }
  }
  return A;
}

/** Build the hierarchy once for a footprint; returns precondition(r, z) writing z = M^-1 r over the count cells. */
export function pressureMultigrid({ count, cell, edges, anchor, degree, width, component }) {
  // level 0: the cells themselves; node k of a level sits at (X[k], Y[k]) on that level's grid
  let x0 = Infinity, y0 = Infinity;
  for (let q = 0; q < count; q++) { const i = cell[q], x = i % width, y = (i / width) | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; }
  const levels = [];
  { // fine level, 5-point: off-diagonals to wet neighbours that are not gauges; a gauge row is the identity
    const X = new Int32Array(count), Y = new Int32Array(count), diag = new Float64Array(count), nb = new Int32Array(4 * count).fill(-1);
    for (let q = 0; q < count; q++) {
      const i = cell[q]; X[q] = i % width - x0; Y[q] = ((i / width) | 0) - y0;
      if (anchor[q]) { diag[q] = 1; continue; }
      diag[q] = degree[q];
      for (let a = 0; a < 4; a++) { const j = edges[4 * q + a]; if (j >= 0 && !anchor[j]) nb[4 * q + a] = j; }
    }
    levels.push({ n: count, X, Y, diag, nb, five: true, skip: anchor, comp: component });
  }
  // coarser levels: node = a 2 x 2 block of the finer level's nodes (gauges left out); 9-point stencil
  for (;;) {
    const F = levels[levels.length - 1];
    // coarsen until every puddle is down to a few nodes (the coarsest solve is a dense Cholesky per puddle)
    { const per = new Map(); let most = 0; for (let k = 0; k < F.n; k++) { if (F.skip && F.skip[k]) continue; const c = (per.get(F.comp[k]) ?? 0) + 1; per.set(F.comp[k], c); if (c > most) most = c; }
      if (most <= COARSEST || levels.length > 24) break; }
    let W = 0, H = 0; for (let k = 0; k < F.n; k++) { if (F.X[k] > W) W = F.X[k]; if (F.Y[k] > H) H = F.Y[k]; }
    // a node never joins cells of two puddles (a 2 x 2 block can hold two that touch only at a corner)
    let K = 1; for (let k = 0; k < F.n; k++) if (F.comp[k] >= K) K = F.comp[k] + 1; // keys stay below 2^53: slots x puddles
    const CW = (W >> 1) + 1, key = new Map(), agg = new Int32Array(F.n).fill(-1);
    let n = 0; const Xs = [], Ys = [], Cs = [];
    for (let k = 0; k < F.n; k++) {
      if (F.skip && F.skip[k]) continue;
      const kk = ((F.Y[k] >> 1) * CW + (F.X[k] >> 1)) * K + F.comp[k];
      let I = key.get(kk); if (I === undefined) { I = n++; key.set(kk, I); Xs.push(F.X[k] >> 1); Ys.push(F.Y[k] >> 1); Cs.push(F.comp[k]); }
      agg[k] = I;
    }
    if (n >= F.n) break;
    const X = Int32Array.from(Xs), Y = Int32Array.from(Ys), comp = Int32Array.from(Cs), st = new Float64Array(9 * n);
    // Galerkin: Ac[I][J] = sum of A[i][j] over i in I, j in J; J is one of I's 3 x 3 neighbours (of its own puddle)
    const add = (I, J, v) => { st[9 * I + (Y[J] - Y[I] + 1) * 3 + (X[J] - X[I] + 1)] += v; };
    for (let k = 0; k < F.n; k++) {
      const I = agg[k]; if (I < 0) continue;
      add(I, I, F.diag[k]);
      if (F.five) { for (let a = 0; a < 4; a++) { const j = F.nb[4 * k + a]; if (j >= 0 && agg[j] >= 0) add(I, agg[j], -1); } }
      else for (let s = 0; s < 9; s++) { if (s === 4) continue; const j = F.nb[9 * k + s]; if (j >= 0 && agg[j] >= 0) add(I, agg[j], F.off[9 * k + s]); }
    }
    const diag = new Float64Array(n), nb = new Int32Array(9 * n).fill(-1), off = new Float64Array(9 * n);
    for (let I = 0; I < n; I++) {
      diag[I] = st[9 * I + 4];
      for (let s = 0; s < 9; s++) {
        if (s === 4 || st[9 * I + s] === 0) continue;
        const dx = s % 3 - 1, dy = ((s / 3) | 0) - 1, J = key.get(((Y[I] + dy) * CW + (X[I] + dx)) * K + comp[I]);
        nb[9 * I + s] = J; off[9 * I + s] = st[9 * I + s];
      }
    }
    F.agg = agg;
    levels.push({ n, X, Y, diag, nb, off, five: false, skip: null, comp });
  }
  const C = levels[levels.length - 1];
  { // the coarsest level, factored once puddle by puddle (its matrix is block diagonal by puddle)
    const n = C.n, groups = new Map();
    for (let k = 0; k < n; k++) { const c = C.comp[k]; let g = groups.get(c); if (!g) groups.set(c, g = []); g.push(k); }
    C.blocks = [];
    for (const nodes of groups.values()) {
      const m = nodes.length, at = new Map(nodes.map((k, t) => [k, t])), A = new Float64Array(m * m);
      for (let t = 0; t < m; t++) {
        const k = nodes[t]; A[t * m + t] = C.diag[k];
        if (C.five) { for (let a = 0; a < 4; a++) { const j = C.nb[4 * k + a]; if (j >= 0) A[t * m + at.get(j)] = -1; } }
        else for (let u = 0; u < 9; u++) { const j = C.nb[9 * k + u]; if (j >= 0) A[t * m + at.get(j)] = C.off[9 * k + u]; }
      }
      C.blocks.push({ nodes: Int32Array.from(nodes), m, L: cholesky(m, A), y: new Float64Array(m) });
    }
  }
  for (const L of levels) { L.b = new Float64Array(L.n); L.x = new Float64Array(L.n); L.r = new Float64Array(L.n); }
  // y = b - (A - D) x at node k, written out for the 5-point and the 9-point stencils
  const sweep = (L, b, x, forward) => {
    const n = L.n, nb = L.nb, d = L.diag;
    if (L.five) {
      for (let t = 0; t < n; t++) {
        const k = forward ? t : n - 1 - t, e = 4 * k; let s = b[k], j;
        if ((j = nb[e]) >= 0) s += x[j]; if ((j = nb[e + 1]) >= 0) s += x[j]; if ((j = nb[e + 2]) >= 0) s += x[j]; if ((j = nb[e + 3]) >= 0) s += x[j];
        x[k] = s / d[k];
      }
    } else {
      const off = L.off;
      for (let t = 0; t < n; t++) {
        const k = forward ? t : n - 1 - t, e = 9 * k; let s = b[k];
        for (let u = e; u < e + 9; u++) { const j = nb[u]; if (j >= 0) s -= off[u] * x[j]; }
        x[k] = s / d[k];
      }
    }
  };
  const residual = (L, b, x, r) => {
    const n = L.n, nb = L.nb, d = L.diag;
    if (L.five) {
      for (let k = 0; k < n; k++) { const e = 4 * k; let s = b[k] - d[k] * x[k], j;
        if ((j = nb[e]) >= 0) s += x[j]; if ((j = nb[e + 1]) >= 0) s += x[j]; if ((j = nb[e + 2]) >= 0) s += x[j]; if ((j = nb[e + 3]) >= 0) s += x[j]; r[k] = s; }
    } else {
      const off = L.off;
      for (let k = 0; k < n; k++) { const e = 9 * k; let s = b[k] - d[k] * x[k]; for (let u = e; u < e + 9; u++) { const j = nb[u]; if (j >= 0) s -= off[u] * x[j]; } r[k] = s; }
    }
  };
  const solveCoarsest = (L, b, x) => {
    for (const { nodes, m, L: A, y } of L.blocks) {
      for (let i = 0; i < m; i++) { let s = b[nodes[i]]; for (let k = 0; k < i; k++) s -= A[i * m + k] * y[k]; y[i] = s / A[i * m + i]; }
      for (let i = m - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < m; k++) s -= A[k * m + i] * y[k]; y[i] = s / A[i * m + i]; }
      for (let i = 0; i < m; i++) x[nodes[i]] = y[i];
    }
  };
  const cycle = l => {
    const L = levels[l], { b, x, r } = L;
    if (l === levels.length - 1) { solveCoarsest(L, b, x); return; }
    x.fill(0); for (let s = 0; s < SWEEPS; s++) sweep(L, b, x, true);
    residual(L, b, x, r);
    const N = levels[l + 1];
    for (let g = 0; g < GAMMA; g++) { // a W-cycle (GAMMA 2) corrects twice, the second time from the new residual
      if (g) residual(L, b, x, r);
      N.b.fill(0);
      for (let k = 0; k < L.n; k++) if (L.agg[k] >= 0) N.b[L.agg[k]] += r[k];
      cycle(l + 1);
      for (let k = 0; k < L.n; k++) if (L.agg[k] >= 0) x[k] += OMEGA * N.x[L.agg[k]];
    }
    for (let s = 0; s < SWEEPS; s++) sweep(L, b, x, false);
  };
  const top = levels[0];
  return {
    levels: levels.length,
    precondition(r, z) {
      for (let q = 0; q < count; q++) top.b[q] = anchor[q] ? 0 : r[q];
      cycle(0);
      for (let q = 0; q < count; q++) z[q] = anchor[q] ? 0 : top.x[q];
    },
  };
}
