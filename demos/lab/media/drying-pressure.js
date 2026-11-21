// Generated from src/media/drying-pressure.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Finite-volume Neumann pressure solve. Each connected puddle supplies its
// own prescribed evaporation uniformly per unit area, without a donor band.
// Pin one pressure gauge per component; this does not pin or remove liquid.
// IC(0)-preconditioned conjugate gradients handles long, narrow brush marks
// without the thousands of iterations a diagonal preconditioner requires.
//
// Speed: the work arrays are kept between calls (sized to the sheet) and only the entries of the cells solved are
// set back afterwards, and every loop walks the sorted cells by index. The arithmetic and its order are those of the
// first version, so the result is the same to the bit (drying-pressure.test.mjs keeps that version and compares).
import { pressureMultigrid } from './pressure-mg.js';
// the preconditioner: 'mg' (default; pressure-mg.mjs) or 'ic' (IC(0), the solver of 20 Nov; UNPAINT_PRESSURE_SOLVER=ic)
export const PRESSURE_SOLVER = (typeof process !== 'undefined' && process.env?.UNPAINT_PRESSURE_SOLVER) === 'ic' ? 'ic' : 'mg';
let POOL = null;
function pool(n) {
  if (POOL && POOL.n === n) return POOL;
  POOL = { n, r: new Float64Array(n), z: new Float64Array(n), p: new Float64Array(n), ap: new Float64Array(n), degree: new Uint8Array(n), edges: new Int32Array(4 * n).fill(-1), component: new Int32Array(n), anchor: new Uint8Array(n), diagonal: new Float64Array(n), west: new Float64Array(n), north: new Float64Array(n), temporary: new Float64Array(n), queue: new Int32Array(n), means: [0], gauges: [0] };
  return POOL;
}
export function dryingPressure(order, count, index, width, sink, fluxX, fluxY, pressure, solver = PRESSURE_SOLVER) {
  const n = pressure.length, B = pool(n), { r, z, p, ap, degree, edges, component, anchor, diagonal, west, north, temporary, queue } = B;
  const sorted = order.slice(0, count).sort();
  for (let q = 0; q < count; q++) {
    const i = sorted[q], e = 4 * i;
    if (i % width && index[i - 1]) edges[e] = i - 1;
    if ((i + 1) % width && index[i + 1]) edges[e + 1] = i + 1;
    if (i >= width && index[i - width]) edges[e + 2] = i - width;
    if (i + width < n && index[i + width]) edges[e + 3] = i + width;
    for (let a = e; a < e + 4; a++) if (edges[a] >= 0) degree[i]++;
  }
  const means = B.means, gauges = B.gauges; means.length = 1; gauges.length = 1;
  let components = 0;
  for (let s = 0; s < count; s++) {
    const seed = sorted[s];
    if (component[seed]) continue;
    const label = ++components; let head = 0, tail = 1, total = 0;
    queue[0] = seed; component[seed] = label; let centreX = 0, centreY = 0;
    while (head < tail) {
      const i = queue[head++]; total += sink[i]; centreX += i % width; centreY += (i / width) | 0;
      for (let a = 4 * i; a < 4 * i + 4; a++) { const j = edges[a]; if (j >= 0 && !component[j]) { component[j] = label; queue[tail++] = j; } }
    }
    means[label] = total / tail; centreX /= tail; centreY /= tail;
    let gauge = seed, best = Infinity;
    for (let q = 0; q < tail; q++) {
      const i = queue[q], distance = (i % width - centreX) ** 2 + (((i / width) | 0) - centreY) ** 2;
      if (distance < best) { best = distance; gauge = i; }
    }
    // A central gauge avoids conditioning the whole puddle through a hair-
    // thin fringe at the first raster cell. Only pressure differences matter.
    anchor[gauge] = 1; gauges[label] = pressure[gauge];
  }
  for (let q = 0; q < count; q++) { const i = sorted[q]; pressure[i] -= gauges[component[i]]; }
  // Incomplete Cholesky on the symmetric five-point stencil. Natural grid
  // order has only west/north entries below the diagonal, and no fill terms
  // between these neighbours. Anchor columns are excluded from the solve.
  for (let q = 0; q < count; q++) {
    const i = sorted[q];
    if (anchor[i]) { diagonal[i] = 1; continue; }
    const l = edges[4 * i], u = edges[4 * i + 2];
    if (l >= 0 && !anchor[l]) west[i] = -1 / diagonal[l];
    if (u >= 0 && !anchor[u]) north[i] = -1 / diagonal[u];
    diagonal[i] = Math.sqrt(Math.max(1e-14, degree[i] - west[i] ** 2 - north[i] ** 2));
  }
  const precondition = solver === 'mg' ? multigridPreconditioner(sorted, count, edges, anchor, degree, width, r, z, component) : () => {
    for (let q = 0; q < count; q++) {
      const i = sorted[q];
      if (anchor[i]) { temporary[i] = 0; continue; }
      const l = edges[4 * i], u = edges[4 * i + 2];
      temporary[i] = (r[i] - (l >= 0 ? west[i] * temporary[l] : 0) - (u >= 0 ? north[i] * temporary[u] : 0)) / diagonal[i];
    }
    for (let q = count - 1; q >= 0; q--) {
      const i = sorted[q]; if (anchor[i]) { z[i] = 0; continue; }
      const e = edges[4 * i + 1], d = edges[4 * i + 3];
      z[i] = (temporary[i] - (e >= 0 ? west[e] * z[e] : 0) - (d >= 0 ? north[d] * z[d] : 0)) / diagonal[i];
    }
  };
  let norm = 0, residual = 0, centred = 0;
  for (let q = 0; q < count; q++) {
    const i = sorted[q];
    const rhs = means[component[i]] - sink[i]; norm += sink[i] * sink[i];
    if (anchor[i]) continue;
    centred += rhs * rhs;
    let lap = degree[i] * pressure[i];
    for (let a = 4 * i; a < 4 * i + 4; a++) if (edges[a] >= 0) lap -= pressure[edges[a]];
    r[i] = rhs - lap; residual += r[i] * r[i];
  }
  const tolerance = Math.max(Math.max(norm, residual) * 1e-22, 1e-30);
  // multigrid stops by a tighter rule: relative to the smallest of the sink, the first residual and the equations' own
  // right-hand side (the sink less its puddle's mean, which can be far smaller than the sink), with no absolute floor;
  // it stops early only once it is inside the IC rule and has stalled (no halving in 20 iterations: roundoff)
  const tight = solver === 'mg' ? Math.max(Math.min(norm, residual, centred) * 1e-22, 1e-300) : tolerance;
  let best = residual, since = 0;
  precondition(); let rz = 0;
  for (let q = 0; q < count; q++) { const i = sorted[q]; p[i] = z[i]; rz += r[i] * z[i]; }
  let iterations = 0;
  for (; residual > tight && !(residual <= tolerance && since >= 20) && iterations < 16 * Math.sqrt(count) + 500; iterations++) {
    let pap = 0;
    for (let q = 0; q < count; q++) {
      const i = sorted[q];
      if (anchor[i]) continue;
      let v = degree[i] * p[i];
      for (let a = 4 * i; a < 4 * i + 4; a++) if (edges[a] >= 0) v -= p[edges[a]];
      ap[i] = v; pap += p[i] * v;
    }
    if (!(pap > 0)) break;
    const alpha = rz / pap; residual = 0;
    for (let q = 0; q < count; q++) { const i = sorted[q]; pressure[i] += alpha * p[i]; r[i] -= alpha * ap[i]; residual += r[i] * r[i]; }
    if (residual < 0.5 * best) { best = residual; since = 0; } else since++;
    precondition(); let next = 0;
    for (let q = 0; q < count; q++) { const i = sorted[q]; next += r[i] * z[i]; }
    const beta = next / rz; rz = next;
    for (let q = 0; q < count; q++) { const i = sorted[q]; p[i] = z[i] + beta * p[i]; }
  }
  // Verify the original Neumann equations, including the excluded gauge row.
  residual = 0;
  for (let q = 0; q < count; q++) {
    const i = sorted[q];
    let lap = degree[i] * pressure[i];
    for (let a = 4 * i; a < 4 * i + 4; a++) if (edges[a] >= 0) lap -= pressure[edges[a]];
    residual += (lap - means[component[i]] + sink[i]) ** 2;
    fluxX[i] = (i + 1) % width && index[i + 1] ? pressure[i] - pressure[i + 1] : 0;
    fluxY[i] = i + width < n && index[i + width] ? pressure[i] - pressure[i + width] : 0;
  }
  // set back what this call wrote, so the next starts from the zeros (and -1 edges) a fresh array has
  for (let q = 0; q < count; q++) {
    const i = sorted[q], e = 4 * i;
    r[i] = 0; z[i] = 0; p[i] = 0; ap[i] = 0; degree[i] = 0; component[i] = 0; anchor[i] = 0; diagonal[i] = 0; west[i] = 0; north[i] = 0; temporary[i] = 0;
    edges[e] = -1; edges[e + 1] = -1; edges[e + 2] = -1; edges[e + 3] = -1;
  }
  return { components, iterations, relativeResidual: norm ? Math.sqrt(residual / norm) : Math.sqrt(residual) };
}

// the multigrid preconditioner on the solve's cells, numbered by their place in sorted order (pressure-mg.mjs)
let LOC = null;
function multigridPreconditioner(sorted, count, edges, anchor, degree, width, r, z, component) {
  const n = edges.length / 4;
  if (!LOC || LOC.length !== n) LOC = new Int32Array(n).fill(-1);
  for (let q = 0; q < count; q++) LOC[sorted[q]] = q;
  const cell = sorted, ledges = new Int32Array(4 * count), lanchor = new Uint8Array(count), ldegree = new Uint8Array(count), lcomp = new Int32Array(count);
  for (let q = 0; q < count; q++) {
    const i = sorted[q]; lanchor[q] = anchor[i]; ldegree[q] = degree[i]; lcomp[q] = component[i];
    for (let a = 0; a < 4; a++) { const j = edges[4 * i + a]; ledges[4 * q + a] = j >= 0 ? LOC[j] : -1; }
  }
  for (let q = 0; q < count; q++) LOC[sorted[q]] = -1;
  const mg = pressureMultigrid({ count, cell, edges: ledges, anchor: lanchor, degree: ldegree, width, component: lcomp });
  const lr = new Float64Array(count), lz = new Float64Array(count);
  return () => {
    for (let q = 0; q < count; q++) lr[q] = r[sorted[q]];
    mg.precondition(lr, lz);
    for (let q = 0; q < count; q++) z[sorted[q]] = lz[q];
  };
}
