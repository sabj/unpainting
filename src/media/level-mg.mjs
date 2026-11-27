// Weighted 2x2 Galerkin aggregation multigrid preconditioner for implicit thin-film levelling (film-level.mjs).
// Solves (I + L) d = r where L is the symmetric weighted 5-point graph Laplacian on wet cells.
// Strictly diagonally dominant (+1 on every diagonal), so a symmetric V-cycle with 1 forward + 1 backward
// Gauss-Seidel sweep and dense Cholesky on the coarsest level is SPD and converges CG in ~8-12 iterations.
// DOM free (copied into Paint Lab via tools/lab/sync-site-media.mjs).

const COARSEST = 24, OMEGA = 1.4;

function cholesky(n, A) {
  for (let j = 0; j < n; j++) {
    let d = A[j * n + j];
    for (let k = 0; k < j; k++) d -= A[j * n + k] * A[j * n + k];
    d = Math.sqrt(Math.max(d, 1e-300));
    A[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= A[i * n + k] * A[j * n + k];
      A[i * n + j] = s / d;
    }
  }
  return A;
}

/**
 * Build a weighted Galerkin multigrid hierarchy for (I + L) on `n` wet cells.
 * `cells[k]` is the sheet index (y * w + x); `west, north, east, south` are local indices (-1 if none);
 * `cw[k]` is the conductance on face (k, west[k]), `cn[k]` on face (k, north[k]), `diag[k] = 1 + sum(c)`.
 * Returns `precondition(r, z)` computing z = M^-1 r.
 */
export function levelMultigrid({ n, w, cells, west, north, east, south, cw, cn, diag }) {
  let x0 = Infinity, y0 = Infinity;
  for (let k = 0; k < n; k++) {
    const i = cells[k], x = i % w, y = (i - x) / w;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
  }
  const X0 = new Int32Array(n), Y0 = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    const i = cells[k], x = i % w;
    X0[k] = x - x0;
    Y0[k] = (i - x) / w - y0;
  }
  // Level 0 reuses film-level's own arrays directly (zero extra copy of the fine matrix).
  const levels = [{
    n, X: X0, Y: Y0, five: true, diag, west, north, east, south, cw, cn,
    b: new Float64Array(n), x: new Float64Array(n),
  }];

  for (;;) {
    const F = levels[levels.length - 1];
    if (F.n <= COARSEST || levels.length >= 16) break;
    let maxX = 0, maxY = 0;
    for (let k = 0; k < F.n; k++) {
      if (F.X[k] > maxX) maxX = F.X[k];
      if (F.Y[k] > maxY) maxY = F.Y[k];
    }
    const CW = (maxX >> 1) + 1, CH = (maxY >> 1) + 1;
    const flat = new Int32Array(CW * CH).fill(-1);
    const agg = new Int32Array(F.n);
    const Xs = [], Ys = [];
    let nc = 0;
    for (let k = 0; k < F.n; k++) {
      const gx = F.X[k] >> 1, gy = F.Y[k] >> 1, slot = gy * CW + gx;
      let I = flat[slot];
      if (I < 0) { I = nc++; flat[slot] = I; Xs.push(gx); Ys.push(gy); }
      agg[k] = I;
    }
    if (nc >= F.n) break;

    const X = Int32Array.from(Xs), Y = Int32Array.from(Ys);
    const st = new Float64Array(9 * nc);
    const add = (I, J, v) => {
      st[9 * I + (Y[J] - Y[I] + 1) * 3 + (X[J] - X[I] + 1)] += v;
    };
    if (F.five) {
      const { diag: fd, west: fw, north: fn, east: fe, south: fs, cw: fcw, cn: fcn } = F;
      for (let k = 0; k < F.n; k++) {
        const I = agg[k];
        add(I, I, fd[k]);
        const kw = fw[k]; if (kw >= 0) add(I, agg[kw], -fcw[k]);
        const kn = fn[k]; if (kn >= 0) add(I, agg[kn], -fcn[k]);
        const ke = fe[k]; if (ke >= 0) add(I, agg[ke], -fcw[ke]);
        const ks = fs[k]; if (ks >= 0) add(I, agg[ks], -fcn[ks]);
      }
    } else {
      const { diag: fd, nb: fnb, off: foff } = F;
      for (let k = 0; k < F.n; k++) {
        const I = agg[k];
        add(I, I, fd[k]);
        const base = 9 * k;
        for (let s = 0; s < 9; s++) {
          if (s === 4) continue;
          const j = fnb[base + s];
          if (j >= 0) add(I, agg[j], foff[base + s]);
        }
      }
    }

    const cdiag = new Float64Array(nc), nb = new Int32Array(9 * nc).fill(-1), off = new Float64Array(9 * nc);
    for (let I = 0; I < nc; I++) {
      cdiag[I] = st[9 * I + 4];
      for (let s = 0; s < 9; s++) {
        if (s === 4) continue;
        const v = st[9 * I + s];
        if (v === 0) continue;
        const dx = (s % 3) - 1, dy = ((s / 3) | 0) - 1;
        const J = flat[(Y[I] + dy) * CW + (X[I] + dx)];
        if (J >= 0) { nb[9 * I + s] = J; off[9 * I + s] = v; }
      }
    }
    F.agg = agg;
    levels.push({
      n: nc, X, Y, five: false, diag: cdiag, nb, off,
      b: new Float64Array(nc), x: new Float64Array(nc),
    });
  }

  // Factor the coarsest level directly with Cholesky (I + L is strictly SPD).
  const C = levels[levels.length - 1], m = C.n;
  const A = new Float64Array(m * m);
  for (let i = 0; i < m; i++) {
    A[i * m + i] = C.diag[i];
    if (C.five) {
      if (C.west[i] >= 0) A[i * m + C.west[i]] = -C.cw[i];
      if (C.north[i] >= 0) A[i * m + C.north[i]] = -C.cn[i];
      if (C.east[i] >= 0) A[i * m + C.east[i]] = -C.cw[C.east[i]];
      if (C.south[i] >= 0) A[i * m + C.south[i]] = -C.cn[C.south[i]];
    } else {
      for (let s = 0; s < 9; s++) {
        const j = C.nb[9 * i + s];
        if (j >= 0) A[i * m + j] = C.off[9 * i + s];
      }
    }
  }
  const Lc = cholesky(m, A), yc = new Float64Array(m);

  const sweep = (L, b, x, forward) => {
    const ln = L.n, d = L.diag;
    if (L.five) {
      const { west: lw, north: ln_, east: le, south: ls, cw: lcw, cn: lcn } = L;
      if (forward) {
        for (let k = 0; k < ln; k++) {
          let s = b[k];
          const kw = lw[k], kn = ln_[k], ke = le[k], ks = ls[k];
          if (kw >= 0) s += lcw[k] * x[kw];
          if (kn >= 0) s += lcn[k] * x[kn];
          if (ke >= 0) s += lcw[ke] * x[ke];
          if (ks >= 0) s += lcn[ks] * x[ks];
          x[k] = s / d[k];
        }
      } else {
        for (let k = ln - 1; k >= 0; k--) {
          let s = b[k];
          const kw = lw[k], kn = ln_[k], ke = le[k], ks = ls[k];
          if (kw >= 0) s += lcw[k] * x[kw];
          if (kn >= 0) s += lcn[k] * x[kn];
          if (ke >= 0) s += lcw[ke] * x[ke];
          if (ks >= 0) s += lcn[ks] * x[ks];
          x[k] = s / d[k];
        }
      }
    } else {
      const { nb, off } = L;
      if (forward) {
        for (let k = 0; k < ln; k++) {
          let s = b[k]; const e = 9 * k;
          for (let u = e; u < e + 9; u++) { const j = nb[u]; if (j >= 0) s -= off[u] * x[j]; }
          x[k] = s / d[k];
        }
      } else {
        for (let k = ln - 1; k >= 0; k--) {
          let s = b[k]; const e = 9 * k;
          for (let u = e; u < e + 9; u++) { const j = nb[u]; if (j >= 0) s -= off[u] * x[j]; }
          x[k] = s / d[k];
        }
      }
    }
  };

  const restrict = (L, b, x, out) => {
    const ln = L.n, d = L.diag, agg = L.agg;
    out.fill(0);
    if (L.five) {
      const { west: lw, north: ln_, east: le, south: ls, cw: lcw, cn: lcn } = L;
      for (let k = 0; k < ln; k++) {
        let s = b[k] - d[k] * x[k];
        const kw = lw[k], kn = ln_[k], ke = le[k], ks = ls[k];
        if (kw >= 0) s += lcw[k] * x[kw];
        if (kn >= 0) s += lcn[k] * x[kn];
        if (ke >= 0) s += lcw[ke] * x[ke];
        if (ks >= 0) s += lcn[ks] * x[ks];
        out[agg[k]] += s;
      }
    } else {
      const { nb, off } = L;
      for (let k = 0; k < ln; k++) {
        let s = b[k] - d[k] * x[k]; const e = 9 * k;
        for (let u = e; u < e + 9; u++) { const j = nb[u]; if (j >= 0) s -= off[u] * x[j]; }
        out[agg[k]] += s;
      }
    }
  };

  const cycle = l => {
    const L = levels[l], { b, x } = L;
    if (l === levels.length - 1) {
      for (let i = 0; i < m; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= Lc[i * m + k] * yc[k]; yc[i] = s / Lc[i * m + i]; }
      for (let i = m - 1; i >= 0; i--) { let s = yc[i]; for (let k = i + 1; k < m; k++) s -= Lc[k * m + i] * yc[k]; yc[i] = s / Lc[i * m + i]; }
      x.set(yc);
      return;
    }
    x.fill(0);
    sweep(L, b, x, true);
    const next = levels[l + 1];
    restrict(L, b, x, next.b);
    cycle(l + 1);
    const agg = L.agg, nx = next.x;
    for (let k = 0; k < L.n; k++) x[k] += OMEGA * nx[agg[k]];
    sweep(L, b, x, false);
  };

  const top = levels[0];
  return (r, z) => {
    for (let k = 0; k < n; k++) top.b[k] = r[k];
    cycle(0);
    for (let k = 0; k < n; k++) z[k] = top.x[k];
  };
}
