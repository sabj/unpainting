// Trace pans (--pigshare s). The plan's per-cell unmix (src/crop/pigments.mjs) fits k pans to three channel
// densities. With more than three pans that fit is not unique, and the projected-gradient solver returns a spread
// one: a few percent of nearly every pan in nearly every cell. The light-to-dark planner lays one wet passage per pan
// and band, so each trace becomes its own wash over the same cells: more rewetting of the layers below and
// complementary traces mixing to mud. A painter mixes a colour from the two or three pans that carry it.
//
// Three channel densities never need more than three pans (Caratheodory: a non-negative fit to three numbers has an
// optimum with at most three pans in it). So a cell's traces are dropped and its colour refitted from the pans it
// keeps, in each channel, not by one scale on the kept pans (that keeps the summed absorption but moves light between
// channels and so moves hue and value):
//
// 1. A pan is a trace when it carries under share s of the cell's absorption (amount times the pan's summed K, so a
//    strong blue at 8% of the mass need not be a trace while a weak yellow at 10% may be). The others are kept.
// 2. The kept pans are refitted (non-negative least squares, Lawson-Hanson) to the cell's whole per-channel
//    absorption sum_j a_j K_jc. In a thin transparent film the colour follows that absorption.
// 3. While the fit misses that absorption by more than REFIT_TOLERANCE of its size, the cell's own trace that best
//    closes the gap comes back and the fit is repeated. A trace that is real colour (the blue that greys an orange)
//    stays; a trace the kept pans can stand in for goes.
// With a smoothing radius, steps 1 to 3 run on the squinted demand to choose the area's pans, so neighbours share
// pans and a pan's wash is one shape; then each cell is fitted from those pans, and step 3 runs again on the cell's
// own colour, so a small accent the area does not share keeps its pan.
//
// Only the cell's own pans are used; no pan is added to a cell the unmix left it out of. Where the pans carry no K
// (unit tests of the planner), mass stands in for absorption and the kept pans are scaled by one factor to the cell's
// mass. Plan time only, before cellLight, which then brings each cell's kept mix to the exact light of its target.

/** A refit within this share of the cell's absorption (Euclidean over the three channels) is close enough. */
export const REFIT_TOLERANCE = 0.02;

/**
 * @param {Float32Array} demand n*k amounts
 * @param {number} k pans
 * @param {number} share 0 <= share < 1; 0 keeps every pan
 * @returns {{demand: Float32Array, pruned: Uint8Array, cells: number, traces: number, restored: number, maxScale: number}}
 *   pruned[i*k+j] = 1 where pan j was dropped from cell i; cells = cells that lost a pan; traces = pans dropped;
 *   restored = traces brought back because the colour needed them; maxScale = largest kept/original mass in a cell.
 */
export function pruneTracePans(demand, k, share, { pigments = null, protect = null, tolerance = REFIT_TOLERANCE, w = 0, h = 0, radius = 0 } = {}) {
  if (!Number.isFinite(share) || share < 0 || share >= 1) throw Error(`--pigshare: a share in [0, 1), not ${share}`);
  if (!Number.isInteger(k) || k < 1 || demand.length % k) throw Error('trace pans: demand is not n cells of k pans');
  const n = demand.length / k, out = Float32Array.from(demand), pruned = new Uint8Array(n * k);
  const report = { demand: out, pruned, cells: 0, traces: 0, restored: 0, maxScale: 1 };
  if (!(share > 0) || k < 2) return report;
  const optics = Array.isArray(pigments) && pigments.length === k && pigments.every(p => p?.K?.length === 3);
  const s = Array.from({ length: k }, (_, j) => optics ? pigments[j].K[0] + pigments[j].K[1] + pigments[j].K[2] : 1);
  if (s.some(v => !(v > 0))) throw Error('trace pans: every pan needs a positive summed K');
  const K = optics ? pigments.map(p => p.K) : null, fit = optics ? createFit(K, k, tolerance) : null;
  if (radius > 0 && !(Number.isInteger(w) && Number.isInteger(h) && w * h === n)) throw Error('trace pans: a smoothing radius needs the grid w x h');
  // The choice of pans is made on the squinted demand (a box mean over `radius` cells, the scale the washes are cut at),
  // so neighbouring cells keep the same pans and a pan's wash is one shape, not salt and pepper; each cell's amounts are
  // then refitted to its own colour with the pans its neighbourhood chose.
  const area = radius > 0 ? boxMeanPans(demand, k, w, h, radius) : demand;
  const keep = new Uint8Array(k), own = new Uint8Array(k), mine = new Uint8Array(k), cell = new Uint8Array(k);
  for (let i = 0; i < n; i++) {
    if (protect?.[i]) continue;
    const o = i * k;
    let total = 0, top = -1, topA = 0, cellOwn = 0;
    for (let j = 0; j < k; j++) { if (demand[o + j] > 0) cellOwn++; const a = area[o + j] * s[j]; if (a > 0) { total += a; if (a > topA) { topA = a; top = j; } } }
    if (!(total > 0) || cellOwn < 2) continue;
    let dropped = 0, keptA = 0;
    for (let j = 0; j < k; j++) {
      const a = area[o + j] * s[j];
      own[j] = a > 0 ? 1 : 0;
      keep[j] = a > 0 && (j === top || a >= share * total) ? 1 : 0;
      if (own[j] && !keep[j]) dropped++; else if (keep[j]) keptA += a;
    }
    if (!dropped) continue;
    if (fit) {
      // The neighbourhood's pans: kept ones, plus traces its colour needs back.
      report.restored += fit(area, o, keep, own, null);
      let any = 0; for (let j = 0; j < k; j++) { mine[j] = fit.chosen[j] && demand[o + j] > 0 ? 1 : 0; cell[j] = demand[o + j] > 0 ? 1 : 0; any += mine[j]; }
      if (!any) continue;
      // The cell's own fit from those pans; a pan the area left out comes back here when this cell's colour needs it
      // (a small red accent inside a blue area is not a trace of the blue area's mix).
      report.restored += fit(demand, o, mine, cell, out);
    } else {
      let cellKept = 0, cellTotal = 0;
      for (let j = 0; j < k; j++) { cellTotal += demand[o + j]; if (keep[j]) cellKept += demand[o + j]; }
      if (!(cellKept > 0)) continue;
      for (let j = 0; j < k; j++) out[o + j] = keep[j] ? demand[o + j] * cellTotal / cellKept : 0;
    }
    void keptA;
    let before = 0, after = 0, lost = 0;
    for (let j = 0; j < k; j++) { before += demand[o + j]; after += out[o + j]; if (own[j] && !(out[o + j] > 0)) { pruned[o + j] = 1; lost++; } }
    if (!lost) continue;
    report.cells++; report.traces += lost; if (after / before > report.maxScale) report.maxScale = after / before;
  }
  return report;
}

// The per-cell refit: Lawson-Hanson NNLS on the 3 x k absorption matrix, started from the kept pans and allowed to
// take back the cell's own traces while the miss is over the tolerance. Writes the cell's amounts into out[o..o+k).
// Returns how many traces came back.
function createFit(K, k, tolerance) {
  const b = [0, 0, 0], r = [0, 0, 0], x = new Float64Array(k), z = new Float64Array(k), inP = new Uint8Array(k);
  const P = [];
  // Least squares on the columns in P (at most 3 have full rank; more are handled by the tiny ridge), into z.
  const solve = () => {
    const m = P.length; z.fill(0);
    if (!m) return;
    const G = new Float64Array(m * m), g = new Float64Array(m);
    for (let p = 0; p < m; p++) {
      const a = K[P[p]];
      g[p] = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      for (let q = 0; q < m; q++) { const c = K[P[q]]; G[p * m + q] = a[0] * c[0] + a[1] * c[1] + a[2] * c[2]; }
    }
    let tr = 0; for (let p = 0; p < m; p++) tr += G[p * m + p];
    for (let p = 0; p < m; p++) G[p * m + p] += 1e-9 * tr;
    for (let c = 0; c < m; c++) {
      let piv = c; for (let rr = c + 1; rr < m; rr++) if (Math.abs(G[rr * m + c]) > Math.abs(G[piv * m + c])) piv = rr;
      if (piv !== c) { for (let q = 0; q < m; q++) { const t = G[c * m + q]; G[c * m + q] = G[piv * m + q]; G[piv * m + q] = t; } const t = g[c]; g[c] = g[piv]; g[piv] = t; }
      for (let rr = c + 1; rr < m; rr++) { const f = G[rr * m + c] / G[c * m + c]; for (let q = c; q < m; q++) G[rr * m + q] -= f * G[c * m + q]; g[rr] -= f * g[c]; }
    }
    for (let c = m - 1; c >= 0; c--) { let t = g[c]; for (let q = c + 1; q < m; q++) t -= G[c * m + q] * z[P[q]]; z[P[c]] = t / G[c * m + c]; }
  };
  // Lawson-Hanson inner loop: from a feasible x on P, move toward the least-squares z and drop columns that hit zero.
  const inner = () => {
    for (let guard = 0; guard < 3 * k; guard++) {
      solve();
      let alpha = 1;
      for (const j of P) if (z[j] <= 0) alpha = Math.min(alpha, x[j] / Math.max(1e-30, x[j] - z[j]));
      if (alpha >= 1) { for (const j of P) x[j] = z[j]; return; }
      for (const j of P) x[j] += alpha * (z[j] - x[j]);
      for (let q = P.length - 1; q >= 0; q--) if (x[P[q]] <= 1e-12) { x[P[q]] = 0; inP[P[q]] = 0; P.splice(q, 1); }
    }
  };
  const residual = () => { for (let c = 0; c < 3; c++) { r[c] = b[c]; for (const j of P) r[c] -= x[j] * K[j][c]; } return Math.hypot(r[0], r[1], r[2]); };
  const run = (demand, o, keep, own, out) => {
    b[0] = b[1] = b[2] = 0;
    for (let j = 0; j < k; j++) { const a = demand[o + j]; if (a > 0) for (let c = 0; c < 3; c++) b[c] += a * K[j][c]; }
    const size = Math.hypot(b[0], b[1], b[2]);
    x.fill(0); inP.fill(0); P.length = 0;
    for (let j = 0; j < k; j++) if (keep[j]) { P.push(j); inP[j] = 1; }
    inner();
    let back = 0;
    for (let guard = 0; guard < k && residual() > tolerance * size; guard++) {
      let best = -1, bestG = 0;
      for (let j = 0; j < k; j++) {
        if (!own[j] || inP[j]) continue;
        const a = K[j], gj = (a[0] * r[0] + a[1] * r[1] + a[2] * r[2]) / Math.hypot(a[0], a[1], a[2]);
        if (gj > bestG) { bestG = gj; best = j; }
      }
      if (best < 0) break;
      P.push(best); inP[best] = 1; if (!keep[best]) back++;
      inner();
    }
    let left = 0; for (const j of P) left += x[j];
    for (let j = 0; j < k; j++) run.chosen[j] = left > 0 && inP[j] ? 1 : 0;
    if (!out) return back;
    if (!(left > 0)) { for (let j = 0; j < k; j++) out[o + j] = demand[o + j]; return 0; }
    for (let j = 0; j < k; j++) out[o + j] = inP[j] ? x[j] : 0;
    return back;
  };
  run.chosen = new Uint8Array(k);
  return run;
}

/** Box mean of each pan's amounts over a (2r+1) square, edges clamped. */
function boxMeanPans(demand, k, w, h, r) {
  const n = w * h, out = new Float32Array(n * k), row = new Float64Array(w), col = new Float32Array(n);
  for (let j = 0; j < k; j++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += demand[(y * w + Math.min(w - 1, Math.max(0, x))) * k + j];
      for (let x = 0; x < w; x++) { row[x] = acc / (2 * r + 1); acc += demand[(y * w + Math.min(w - 1, x + r + 1)) * k + j] - demand[(y * w + Math.max(0, x - r)) * k + j]; }
      for (let x = 0; x < w; x++) col[y * w + x] = row[x];
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += col[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { out[(y * w + x) * k + j] = acc / (2 * r + 1); acc += col[Math.min(h - 1, y + r + 1) * w + x] - col[Math.max(0, y - r) * w + x]; }
    }
  }
  return out;
}
