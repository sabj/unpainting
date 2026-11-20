// The geometry of the pinned-edge feed (edge-feed.mjs) for the GPU sheet, computed on the host from the sheet's wet
// mask: the boxes a CPU step works in (sheet.mjs wetBoxes), and in each box the cells the feed reaches, their extra
// evaporation at the line (contact distance, edge profile, the dry paper round the line) and the face fluxes of the
// pressure solve. It depends on the footprint alone (water ever laid, within the box), so it is recomputed only when
// that changes; the GPU then runs the subcycled upwind transport every step (stepfull edge-feed kernels).
//
// The functions below repeat sheet.mjs wetBoxes and the geometry half of edge-feed.mjs edgeFeed line for line (both are
// private there); the shared parts (dryingPressure, contactDistance, cellEdgeFlux) are imported, not copied. The GPU
// edge parity tests (gpu-edge-feed.test.mjs) fail if the copies drift.
import { dryingPressure } from '../drying-pressure.mjs';
import { contactDistance, cellEdgeFlux } from '../contact-distance.mjs';

const TILE = 32;
/** sheet.mjs wetBoxes, scanning the whole sheet: boxes [x0, y0, x1, y1] round the wet or damp cells, grown by `margin`. */
export function wetBoxes({ w, h, M, s, capacity }, margin = 2) {
  const tw = Math.ceil(w / TILE), th = Math.ceil(h / TILE), on = new Uint8Array(tw * th), seen = new Uint8Array(tw * th), stack = new Int32Array(tw * th);
  const wetAt = i => M[i] || s[i] > 0.02 * capacity[i];
  for (let y = 0; y < h; y++) {
    const r = y * w, tr = ((y / TILE) | 0) * tw;
    for (let x = 0; x < w;) {
      const tx = (x / TILE) | 0, xe = Math.min(w - 1, tx * TILE + TILE - 1);
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
export function edgeGeometry({ w, h, M, ever, resist }, o, box, mm, S) {
  const edgeEvap = o.edgeEvap ?? 0, E = o.edgeMm ?? 1;
  const n0 = w * h;
  if (!S.lev || S.lev.length !== n0) Object.assign(S, { lev: new Int32Array(n0), order: new Int32Array(n0), ex: new Float64Array(n0), geo: new Float32Array(n0), mask: new Uint8Array(n0), fx: new Float64Array(n0), fy: new Float64Array(n0), pressure: new Float64Array(n0), buckets: [] });
  const [x0, y0, x1, y1] = box, L = Math.min(32000, Math.max(1, Math.ceil(Math.hypot(w, h))));
  const { lev, order, ex, geo, mask, fx, fy, pressure, buckets } = S;
  const reach = Math.max(1, Math.round((o.reachMm ?? 1.5) / mm));
  mask.fill(0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * w + x; mask[i] = M[i] || ever[i]; }
  ex.fill(0); lev.fill(0);
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
  const inBox = (x, y) => x >= x0 && y >= y0 && x <= x1 && y <= y1;
  for (const q of buckets) if (q) q.length = 0;
  const push = (i, d) => { (buckets[d] ??= []).push(i); };
  let seeds = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x; if (!mask[i] || (resist && resist[i])) continue;
    if (pinnedAt(x + 1, y) || pinnedAt(x - 1, y) || pinnedAt(x, y + 1) || pinnedAt(x, y - 1)) { push(i, 3); seeds++; }
  }
  if (!seeds) return null;
  const DMAX = 3 * L;
  let n = 0;
  for (let d = 3; d <= DMAX && d < buckets.length; d++) {
    const list = buckets[d]; if (!list) continue;
    for (let t = 0; t < list.length; t++) {
      const i = list[t]; if (lev[i]) continue;
      lev[i] = d; order[n++] = i;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy; if (!inBox(xx, yy)) continue;
        const j = yy * w + xx; if (!mask[j] || lev[j] || (resist && resist[j])) continue;
        const dj = d + (dx && dy ? 4 : 3); if (dj <= DMAX) push(j, dj);
      }
    }
  }
  const NX = [1, -1, 0, 0, 1, 1, -1, -1], NY = [0, 0, 1, -1, 1, -1, 1, -1];
  const nb = (i, d) => { const xx = (i % w) + NX[d], yy = ((i / w) | 0) + NY[d]; return xx < x0 || yy < y0 || xx > x1 || yy > y1 ? -1 : yy * w + xx; };
  const ax0 = x0 - reach, ay0 = y0 - reach, aw = x1 - x0 + 2 * reach + 2, ah = y1 - y0 + 2 * reach + 2;
  if (!S.sat || S.sat.length < aw * ah) S.sat = new Float64Array(aw * ah);
  const sat = S.sat;
  for (let yy = 0; yy < ah; yy++) for (let xx = 0; xx < aw; xx++) {
    const k = yy * aw + xx; if (!xx || !yy) { sat[k] = 0; continue; }
    sat[k] = (dryAt(ax0 + xx - 1, ay0 + yy - 1) ? 1 : 0) + sat[k - 1] + sat[k - aw] - sat[k - aw - 1];
  }
  const dryShare = (x, y) => { const xa = x - reach - ax0, ya = y - reach - ay0, xb = xa + 2 * reach + 1, yb = ya + 2 * reach + 1; return (sat[yb * aw + xb] - sat[ya * aw + xb] - sat[yb * aw + xa] + sat[ya * aw + xa]) / ((2 * reach + 1) ** 2); };
  const distance = contactDistance(mask, w, h, pinnedAt);
  let Etot = 0;
  for (let q = 0; q < n; q++) {
    const i = order[q], l = lev[i];
    let g = 0;
    if (l === 3) {
      const u = Math.min(1, Math.max(0, (dryShare(i % w, (i / w) | 0) - 0.1) / 0.2)); g = u * u * (3 - 2 * u);
    } else for (let e = 0; e < 4; e++) { const j = nb(i, e); if (j >= 0 && lev[j] && lev[j] < l && geo[j] > g) g = geo[j]; }
    geo[i] = g;
    const e0 = g > 0 ? edgeEvap * g * cellEdgeFlux(distance, i % w, (i / w) | 0, mm, E) : 0;
    ex[i] = e0; Etot += e0;
  }
  if (!(Etot > 0)) return null;
  for (let q = 0; q < n; q++) pressure[order[q]] = 0;
  const solve = dryingPressure(order, n, lev, w, ex, fx, fy, pressure);
  if (solve.relativeResidual > 1e-6) throw new Error(`drying pressure did not converge: ${solve.relativeResidual}`);
  return { order: order.slice(0, n), n, ex, fx, fy };
}
