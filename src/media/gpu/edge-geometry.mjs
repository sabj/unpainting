// The geometry of the pinned-edge feed (edge-feed.mjs) for the GPU sheet, computed on the host from the sheet's wet
// mask: the boxes a CPU step works in (sheet.mjs wetBoxes), and in each box the cells the feed reaches, their extra
// evaporation at the line (contact distance, edge profile, the dry paper round the line) and the face fluxes of the
// pressure solve. It depends on the footprint alone (water ever laid, within the box), so it is recomputed only when
// that changes; the GPU then runs the subcycled upwind transport every step (stepfull edge-feed kernels).
//
// The functions below repeat sheet.mjs wetBoxes and the geometry half of edge-feed.mjs edgeFeed line for line (both are
// private there), as of edge-feed.mjs clearing its footprint by box and contactDistance working on the box's lattice; the shared parts (dryingPressure, contactDistance, cellEdgeFlux) are imported, not copied. The GPU
// edge parity tests (gpu-edge-feed.test.mjs) fail if the copies drift.
import { dryingPressure } from '../drying-pressure.mjs';
import { contactDistance, applyEdgeFlux } from '../contact-distance.mjs';

const TILE = 32;
/** sheet.mjs wetBoxes, scanning the whole sheet: boxes [x0, y0, x1, y1] round the wet or damp cells, grown by `margin`. */
export function wetBoxes({ w, h, M, s, capacity }, margin = 2, bounds = null) {
  const tw = Math.ceil(w / TILE), th = Math.ceil(h / TILE), on = new Uint8Array(tw * th), seen = new Uint8Array(tw * th), stack = new Int32Array(tw * th);
  const wetAt = i => M[i] || s[i] > 0.02 * capacity[i];
  const sy0 = bounds ? Math.max(0, bounds[1]) : 0, sy1 = bounds ? Math.min(h - 1, bounds[3]) : h - 1;
  const sx0 = bounds ? Math.max(0, bounds[0]) : 0, sx1 = bounds ? Math.min(w - 1, bounds[2]) : w - 1;
  for (let y = sy0; y <= sy1; y++) {
    const r = y * w, tr = ((y / TILE) | 0) * tw;
    for (let x = sx0; x <= sx1;) {
      const tx = (x / TILE) | 0, xe = Math.min(sx1, tx * TILE + TILE - 1);
      if (!on[tr + tx]) for (let xx = x; xx <= xe; xx++) if (wetAt(r + xx)) { on[tr + tx] = 1; break; }
      x = xe + 1;
    }
  }
  const boxes = [];
  for (let t = 0; t < on.length; t++) {
    if (!on[t] || seen[t]) continue;
    let top = 0; stack[top++] = t; seen[t] = 1; let a = tw, b = th, c = -1, d = -1;
    while (top) {
      const q = stack[--top], qx = q % tw, qy = (q / tw) | 0;
      if (qx < a) a = qx; if (qx > c) c = qx; if (qy < b) b = qy; if (qy > d) d = qy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = qx + dx, yy = qy + dy; if (xx < 0 || yy < 0 || xx >= tw || yy >= th) continue;
        const u = yy * tw + xx; if (on[u] && !seen[u]) { seen[u] = 1; stack[top++] = u; }
      }
    }
    const tx0 = a * TILE, ty0 = b * TILE, tx1 = Math.min(w - 1, (c + 1) * TILE - 1), ty1 = Math.min(h - 1, (d + 1) * TILE - 1);
    let ax = w, ay = h, bx = -1, by = -1;
    for (let y = ty0; y <= ty1; y++) {
      const r = y * w; let first = -1;
      for (let x = tx0; x <= tx1; x++) if (wetAt(r + x)) { first = x; break; }
      if (first < 0) continue;
      if (first < ax) ax = first; if (y < ay) ay = y; if (y > by) by = y; if (first > bx) bx = first;
      for (let x = tx1; x > bx; x--) if (wetAt(r + x)) { bx = x; break; }
    }
    if (bx < 0) continue;
    boxes.push([Math.max(0, ax - margin), Math.max(0, ay - margin), Math.min(w - 1, bx + margin), Math.min(h - 1, by + margin)]);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j];
    if (A[0] <= B[2] && B[0] <= A[2] && A[1] <= B[3] && B[1] <= A[3]) {
      boxes[i] = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])];
      boxes.splice(j, 1); i--; break;
    }
  }
  return boxes;
}

/**
 * edge-feed.mjs edgeFeed up to its transport, for one box: null where the box has no pinned line or no extra drying;
 * otherwise the cells the feed works on (`order`, `n` of them) and, at those cells, the extra evaporation rate `ex` and
 * the face fluxes towards +x (`fx`) and +y (`fy`) of the pressure solve. `S` is scratch reused between calls.
 */
export function edgeGeometry(sheet, o, box, mm, scratch) {
  return finishEdgeGeometry(prepareEdgeGeometry(sheet, o, box, mm, scratch));
}

// Independent of contact distance: these weights can be built while the GPU finds the pinned line.
export function prepareEdgeGeometry({ w, h, M, ever, resist }, o, box, mm, S) {
  const edgeEvap = o.edgeEvap ?? 0, E = o.edgeMm ?? 1;
  const n0 = w * h;
  if (!S.lev || S.lev.length !== n0) Object.assign(S, { maskBox: null, lev: new Int32Array(n0), order: new Int32Array(n0), ex: new Float64Array(n0), geo: new Float32Array(n0), mask: new Uint8Array(n0), fx: new Float64Array(n0), fy: new Float64Array(n0), pressure: new Float64Array(n0), distance: new Int32Array(n0), next: new Int32Array(n0), previous: new Int32Array(n0) });
  const [x0, y0, x1, y1] = box, L = Math.min(32000, Math.max(1, Math.ceil(Math.hypot(w, h))));
  const { lev, order, ex, geo, mask, fx, fy, pressure, distance, next, previous } = S;
  const reach = Math.max(1, Math.round((o.reachMm ?? 1.5) / mm));
  // the footprint is only ever set inside a box, so clearing the last box clears it (edge-feed.mjs)
  if (S.maskBox) { const [a0, b0, a1, b1] = S.maskBox; for (let y = b0; y <= b1; y++) mask.fill(0, y * w + a0, y * w + a1 + 1); }
  S.maskBox = box;
  for (let y = y0; y <= y1; y++) { const end = y * w + x1; for (let i = y * w + x0; i <= end; i++) mask[i] = M[i] || ever[i]; }
  // the last call's cells, cleared (the whole sheet was cleared every call)
  for (let q = 0; q < (S.used ?? 0); q++) { lev[order[q]] = 0; ex[order[q]] = 0; distance[order[q]] = 0; }
  S.used = 0;
  const dryAt = (x, y) => x < 0 || y < 0 || x >= w || y >= h || !mask[y * w + x];
  const hs = o.holeSpan ?? 0;
  const heldHole = (x, y) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let held = false;
      for (let k = 1; k <= hs; k++) { const xx = x + dx * k, yy = y + dy * k; if (xx < 0 || yy < 0 || xx >= w || yy >= h) break; const j = yy * w + xx; if (M[j] || ever[j]) { held = true; break; } }
      if (!held) return false;
    }
    return true;
  };
  const pinnedAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !mask[y * w + x] && !(hs > 0 && heldHole(x, y));
  // Dial's queue keeps one live entry per cell, rather than allocating JS lists and up to eight duplicate entries.
  // Keep the original 3/4 chamfer costs, neighbour order and equal-distance insertion order.
  const DMAX = 3 * L;
  if (S.head?.length !== DMAX + 1) { S.head = new Int32Array(DMAX + 1); S.tail = new Int32Array(DMAX + 1); }
  const head = S.head, tail = S.tail; head.fill(-1); tail.fill(-1);
  const push = (i, d) => {
    const old = distance[i];
    if (old && old <= d) return;
    if (old) {
      const a = previous[i], b = next[i];
      if (a >= 0) next[a] = b; else head[old] = b;
      if (b >= 0) previous[b] = a; else tail[old] = a;
    }
    distance[i] = d; previous[i] = tail[d]; next[i] = -1;
    if (tail[d] >= 0) next[tail[d]] = i; else head[d] = i;
    tail[d] = i;
  };
  let seeds = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x; if (!mask[i] || (resist && resist[i])) continue;
    if (pinnedAt(x + 1, y) || pinnedAt(x - 1, y) || pinnedAt(x, y + 1) || pinnedAt(x, y - 1)) { push(i, 3); seeds++; }
  }
  if (!seeds) return null;
  const visit = (j, d) => {
    if (d <= DMAX && mask[j] && !lev[j] && !(resist && resist[j])) push(j, d);
  };
  let n = 0;
  for (let d = 3; d <= DMAX; d++) {
    while (head[d] >= 0) {
      const i = head[d]; head[d] = next[i];
      if (head[d] >= 0) previous[head[d]] = -1; else tail[d] = -1;
      lev[i] = d; order[n++] = i;
      const x = i % w, y = (i / w) | 0;
      // Preserve the original eight-neighbour insertion order without
      // recomputing coordinates and box bounds for every neighbour.
      if (y > y0) {
        if (x > x0) visit(i - w - 1, d + 4);
        visit(i - w, d + 3);
        if (x < x1) visit(i - w + 1, d + 4);
      }
      if (x > x0) visit(i - 1, d + 3);
      if (x < x1) visit(i + 1, d + 3);
      if (y < y1) {
        if (x > x0) visit(i + w - 1, d + 4);
        visit(i + w, d + 3);
        if (x < x1) visit(i + w + 1, d + 4);
      }
    }
  }
  S.used = n;
  const ax0 = x0 - reach, ay0 = y0 - reach, aw = x1 - x0 + 2 * reach + 2, ah = y1 - y0 + 2 * reach + 2;
  if (!S.sat || S.sat.length < aw * ah) S.sat = new Float64Array(aw * ah);
  const sat = S.sat;
  for (let yy = 0; yy < ah; yy++) for (let xx = 0; xx < aw; xx++) {
    const k = yy * aw + xx; if (!xx || !yy) { sat[k] = 0; continue; }
    sat[k] = (dryAt(ax0 + xx - 1, ay0 + yy - 1) ? 1 : 0) + sat[k - 1] + sat[k - aw] - sat[k - aw - 1];
  }
  const dryShare = (x, y) => { const xa = x - reach - ax0, ya = y - reach - ay0, xb = xa + 2 * reach + 1, yb = ya + 2 * reach + 1; return (sat[yb * aw + xb] - sat[ya * aw + xb] - sat[yb * aw + xa] + sat[ya * aw + xa]) / ((2 * reach + 1) ** 2); };

  for (let q = 0; q < n; q++) {
    const i = order[q], l = lev[i], x = i % w, y = (i / w) | 0;
    let g = 0;
    if (l === 3) {
      const u = Math.min(1, Math.max(0, (dryShare(x, y) - 0.1) / 0.2)); g = u * u * (3 - 2 * u);
    } else {
      if (x < x1 && lev[i + 1] && lev[i + 1] < l) g = Math.max(g, geo[i + 1]);
      if (x > x0 && lev[i - 1] && lev[i - 1] < l) g = Math.max(g, geo[i - 1]);
      if (y < y1 && lev[i + w] && lev[i + w] < l) g = Math.max(g, geo[i + w]);
      if (y > y0 && lev[i - w] && lev[i - w] < l) g = Math.max(g, geo[i - w]);
    }
    geo[i] = g;
    ex[i] = g > 0 ? edgeEvap * g : 0;
  }
  return { w, h, mask, pinnedAt, box, order, n, lev, ex, fx, fy, pressure, mm, E };
}

export function finishEdgeGeometry(prepared, field) {
  if (!prepared) return null;
  const { w, h, mask, pinnedAt, box, order, n, lev, ex, fx, fy, pressure, mm, E } = prepared;
  const distance = field ?? contactDistance(mask, w, h, pinnedAt, box);
  if (!(applyEdgeFlux(distance, order, n, w, mm, E, ex) > 0)) return null;
  for (let q = 0; q < n; q++) pressure[order[q]] = 0;
  const solve = dryingPressure(order, n, lev, w, ex, fx, fy, pressure);
  if (solve.relativeResidual > 1e-6) throw new Error(`drying pressure did not converge: ${solve.relativeResidual}`);
  return { order: order.slice(0, n), n, ex, fx, fy };
}

/** GPU cell quadrature and mixed-precision pressure, with the same footprint and Neumann equations. */
export async function solveEdgeBoxGpu(sheet, o, box, mm, scratch, { contact, pressure: solver, packed, grid }) {
  const pending = grid ? contact.edgeFlux(packed, sheet.w, sheet.h, grid, o.holeSpan ?? 0, mm, o.edgeMm ?? 1) : null;
  const prepared = prepareEdgeGeometry(sheet, o, box, mm, scratch);
  const flux = pending ? await pending : null;
  if (!prepared) return null;
  const { w, h, mask, pinnedAt, order, n, lev, ex, fx, fy, pressure, E } = prepared;
  let total = 0;
  if (flux) {
    for (let q = 0; q < n; q++) {
      const i = order[q]; ex[i] *= flux[(((i / w) | 0) - grid.y0) * grid.cols + i % w - grid.x0]; total += ex[i];
    }
  } else total = applyEdgeFlux(contactDistance(mask, w, h, pinnedAt, box), order, n, w, mm, E, ex);
  if (!(total > 0)) return null;
  for (let q = 0; q < n; q++) pressure[order[q]] = 0;
  const solve = await solver.solve(order, n, lev, w, ex, fx, fy, pressure);
  if (!(solve.relativeResidual <= 1e-6)) throw new Error(`drying pressure did not converge: ${solve.relativeResidual}`);
  return { order: order.slice(0, n), n, ex, fx, fy, solve };
}
