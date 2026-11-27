// Generated from src/media/edge-feed.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// The pinned edge of a drying wash (Deegan et al., Nature 1997; Computer-Generated Watercolor, section 4.3, edge
// darkening). Where a wash meets dry paper its contact line is pinned by the sizing, and vapour escapes faster there
// than over the middle of the film: the evaporative flux grows towards the line as about one over the square root of
// the distance to it. The water lost there is replaced by liquid flowing out from behind, and that flow carries
// suspended pigment to the edge, where it is left when the film finally goes: the dark rim of a dried wash.
//
// A finite-volume pressure field supplies the prescribed sink from the whole
// connected film. Its divergence is uniform, so no arbitrary donor annulus can
// be printed into the wash. Advective transport is upwind and simultaneous;
// substeps obey a shared 50% donor budget and evaporation removes only water.
import { dryingPressure } from './drying-pressure.js';
import { contactDistance, applyEdgeFlux } from './contact-distance.js';

const scratch = new WeakMap();
// A fixed wash no longer has a contact-line evaporation demand.
export function resetEdgeFeed(sheet) { scratch.delete(sheet); sheet.edgeDemandPending = 0; if (sheet.edgePending) sheet.edgePending.fill(0); }
function bufs(sheet) {
  let b = scratch.get(sheet);
  if (!b || b.n !== sheet.n) {
    b = { n: sheet.n, lev: new Int32Array(sheet.n), order: new Int32Array(sheet.n), dem: new Float64Array(sheet.n), inner: new Float64Array(sheet.n), rho: new Float64Array(sheet.n), fx: new Float64Array(sheet.n), fy: new Float64Array(sheet.n), pressure: new Float64Array(sheet.n), cachedSink: new Float64Array(sheet.n), cachedMask: new Int32Array(sheet.n), ex: new Float64Array(sheet.n), geo: new Float32Array(sheet.n), footprint: new Uint8Array(sheet.n), cachedFootprint: new Uint8Array(sheet.n), cachedResist: new Uint8Array(sheet.n), cout: null, W0: new Float64Array(sheet.n) };
    scratch.set(sheet, b);
  }
  if (!b.cout || b.cout.length !== sheet.K) {
    b.cout = Array.from({ length: sheet.K }, () => new Float64Array(sheet.n));
  }
  return b;
}

export { edgeProfile } from './edge-profile.js';

/**
 * The extra drying at the pinned edges in box [x0, y0, x1, y1] over one step of `o.dt`, with the flow that feeds it.
 * Returns evaporated water. edgeEvap is the mean extra rate in the edgeMm band.
 * The feeding distance is the entire connected footprint, with no pigment carry cutoff.
 */
export function edgeFeed(sheet, o, box, mm) {
  const edgeEvap = o.edgeEvap ?? 0, E = o.edgeMm ?? 1, dt = o.dt ?? 0;
  if (!(edgeEvap > 0) || !(dt > 0)) return 0;
  const { w, h, W, M, G, K, ever, resist } = sheet, [x0, y0, x1, y1] = box;
  const L = Math.min(32000, Math.max(1, Math.ceil(Math.hypot(w, h))));
  const b = bufs(sheet), { lev, order, dem, inner, rho, ex, geo, cout, W0 } = b;
  const reach = Math.max(1, Math.round((o.reachMm ?? 1.5) / mm));
  const mask = b.footprint;
  // the footprint is only ever set inside a box, so clearing the last box clears it (the first version cleared the
  // whole sheet every call)
  if (b.maskBox) { const [a0, b0, a1, b1] = b.maskBox; for (let y = b0; y <= b1; y++) mask.fill(0, y * w + a0, y * w + a1 + 1); }
  b.maskBox = box;
  let surfaceWater = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * w + x; mask[i] = M[i] || ever[i]; surfaceWater += W[i]; }
  if (!(surfaceWater > 0)) return 0;
  const { fx, fy, pressure, cachedSink, cachedMask, cachedFootprint, cachedResist } = b;
  // the unmet demand is the sheet's own state, not scratch: a painting saved and taken over by a fresh process
  // (tools/aware) carries it with the sheet, so it dries exactly as one painted without a break
  if (!sheet.edgePending || sheet.edgePending.length !== sheet.n) sheet.edgePending = new Float64Array(sheet.n);
  const pending = sheet.edgePending;
  // Damp pores can enlarge the work box without changing the liquid
  // footprint. That must not invalidate an identical pressure problem.
  const key = `${mm}:${E}:${edgeEvap}:${reach}:${o.holeSpan ?? 0}`;
  let reuse = b.key === key;
  // the footprint and the cached one are zero outside their own boxes, so without masking fluid (either now or when
  // cached) comparing the two boxes compares the whole sheet
  if (reuse && (resist || b.cacheResist)) { for (let i = 0; i < mask.length; i++) if (mask[i] !== cachedFootprint[i] || (resist?.[i] ?? 0) !== cachedResist[i]) { reuse = false; break; } }
  else if (reuse) for (const [a0, b0, a1, b1] of [box, b.cacheBox]) { for (let y = b0; y <= b1 && reuse; y++) for (let i = y * w + a0, e = y * w + a1; i <= e; i++) if (mask[i] !== cachedFootprint[i]) { reuse = false; break; } if (!reuse) break; }
  let n = b.count;
  if (reuse) { lev.set(cachedMask); ex.set(cachedSink); }
  else {
    ex.fill(0);
    const dryAt = (x, y) => x < 0 || y < 0 || x >= w || y >= h || !mask[y * w + x];
    // holeSpan (--holerim): a dry hole the wash holds on all four sides within that many cells is not a pinned line
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
    // distance from the line through the wash, in thirds of a cell (chamfer 3 along a row, 4 across a diagonal), by a
    // bucket queue, so cells are listed nearest first and the bands behind a curved line are not diamonds; the line's own
    // cells (beside paper this wash has never wet) are at 3
    const inBox = (x, y) => x >= x0 && y >= y0 && x <= x1 && y <= y1;
    const buckets = b.buckets ?? (b.buckets = []); for (const q of buckets) if (q) q.length = 0;
    const push = (i, d) => { (buckets[d] ??= []).push(i); };
    let seeds = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x; if (!mask[i] || (resist !== null && resist[i])) continue;
      if (pinnedAt(x + 1, y) || pinnedAt(x - 1, y) || pinnedAt(x, y + 1) || pinnedAt(x, y - 1)) { push(i, 3); seeds++; }
    }
    if (!seeds) return 0;
    const DMAX = 3 * L;
    n = 0;
    for (let d = 3; d <= DMAX && d < buckets.length; d++) {
      const list = buckets[d]; if (!list) continue;
      for (let t = 0; t < list.length; t++) {
        const i = list[t]; if (lev[i]) continue;
        lev[i] = d; order[n++] = i;
        const x = i % w, y = (i / w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx, yy = y + dy; if (!inBox(xx, yy)) continue;
          const j = yy * w + xx; if (!mask[j] || lev[j] || (resist !== null && resist[j])) continue;
          const dj = d + (dx && dy ? 4 : 3); if (dj <= DMAX) push(j, dj);
        }
      }
    }
    // the eight neighbours (a cell on the diagonal of a corner has its only cell behind it across the diagonal)
    const NX = [1, -1, 0, 0, 1, 1, -1, -1], NY = [0, 0, 1, -1, 1, -1, 1, -1];
    const nb = (i, d) => { const xx = (i % w) + NX[d], yy = ((i / w) | 0) + NY[d]; return xx < x0 || yy < y0 || xx > x1 || yy > y1 ? -1 : yy * w + xx; };
    // the extra evaporation of each cell in the band at the line, weighted by the dry paper near the line it belongs to
    // dry paper round the line, counted from a summed-area table of the box widened by the reach (outside the sheet is dry)
    const ax0 = x0 - reach, ay0 = y0 - reach, aw = x1 - x0 + 2 * reach + 2, ah = y1 - y0 + 2 * reach + 2;
    if (!b.sat || b.sat.length < aw * ah) b.sat = new Float64Array(aw * ah);
    const sat = b.sat;
    for (let yy = 0; yy < ah; yy++) for (let xx = 0; xx < aw; xx++) {
      const k = yy * aw + xx; if (!xx || !yy) { sat[k] = 0; continue; }
      sat[k] = (dryAt(ax0 + xx - 1, ay0 + yy - 1) ? 1 : 0) + sat[k - 1] + sat[k - aw] - sat[k - aw - 1];
    }
    const dryShare = (x, y) => { const xa = x - reach - ax0, ya = y - reach - ay0, xb = xa + 2 * reach + 1, yb = ya + 2 * reach + 1; return (sat[yb * aw + xb] - sat[ya * aw + xb] - sat[yb * aw + xa] + sat[ya * aw + xa]) / ((2 * reach + 1) ** 2); };
    const distance = contactDistance(mask, w, h, pinnedAt, box);
    for (let q = 0; q < n; q++) {
      const i = order[q], l = lev[i];
      let g = 0;
      if (l === 3) {
        const u = Math.min(1, Math.max(0, (dryShare(i % w, (i / w) | 0) - 0.1) / 0.2)); g = u * u * (3 - 2 * u);
      } else for (let e = 0; e < 4; e++) { const j = nb(i, e); if (j >= 0 && lev[j] && lev[j] < l && geo[j] > g) g = geo[j]; }
      geo[i] = g;
      ex[i] = g > 0 ? edgeEvap * g : 0;
    }
    const Etot = applyEdgeFlux(distance, order, n, w, mm, E, ex);
    if (!(Etot > 0)) { for (let q = 0; q < n; q++) lev[order[q]] = 0; return 0; }
    cachedMask.set(lev); cachedSink.set(ex); cachedFootprint.set(mask);
    if (resist) cachedResist.set(resist); else if (b.cacheResist) cachedResist.fill(0);
    b.cacheBox = box; b.cacheResist = !!resist;
    // a cold start: a solve warm-started from the last one converges to a different last bit, so a painting taken over
    // by a fresh process (whose scratch starts at zero) would not end as the one painted without a break
    for (let q = 0; q < n; q++) pressure[order[q]] = 0;
    b.solve = dryingPressure(order, n, lev, w, ex, fx, fy, pressure);
    if (b.solve.relativeResidual > 1e-6) { b.key = null; lev.fill(0); throw new Error(`drying pressure did not converge: ${b.solve.relativeResidual}`); }
    b.count = n; b.key = key;
  }
  const active = [];
  for (let k = 0; k < K; k++) { for (let q = 0; q < n; q++) if (G[k][order[q]] !== 0) { active.push(k); break; } }
  let outward = sheet.outwardPigmentFlux ?? 0;
  // (the faces are walked inline, in the order the cells are listed, x face then y face, as the first version's
  // per-face callback walked them: the same sums in the same order)
  // The outgoing rate is independent of dt. A donor cannot be spent twice by
  // two faces; both faces use the same pre-substep concentration and budget.
  for (let q = 0; q < n; q++) dem[order[q]] = 0;
  for (let q = 0; q < n; q++) {
    const i = order[q], a = fx[i], c = fy[i];
    if (a) dem[a > 0 ? i : i + 1] += Math.abs(a);
    if (c) dem[c > 0 ? i : i + w] += Math.abs(c);
  }
  const nAct = active.length, wetFloor = 2 * (o.wetEps ?? 0.004);
  let remaining = dt, evaporated = 0;
  // the water each face carried, for a pigment grid finer than this one (two-grids/flux-ledger.mjs); null when there is none
  const FL = sheet._flux ?? null;
  while (remaining > 1e-12) {
    FL?.film?.begin(box);
    let sub = remaining;
    for (let q = 0; q < n; q++) { const i = order[q], rate = dem[i] + ex[i]; if (rate > 0 && W[i] > wetFloor) sub = Math.min(sub, 0.5 * W[i] / rate); }
    // The last microlayer is no longer a source; faces are limited together
    // rather than letting a vanishing cell force infinitely many substeps.
    for (let q = 0; q < n; q++) {
      const i = order[q]; W0[i] = W[i]; inner[i] = 0;
      rho[i] = dem[i] > 0 ? Math.min(1, 0.5 * W[i] / (sub * dem[i])) : 1;
      for (let a = 0; a < nAct; a++) cout[active[a]][i] = 0;
    }
    for (let q = 0; q < n; q++) {
      const i = order[q];
      for (let dir = 0; dir < 2; dir++) {
        const f = dir ? fy[i] : fx[i]; if (!f) continue;
        const j = dir ? i + w : i + 1, donor = f > 0 ? i : j, receiver = f > 0 ? j : i, v = sub * Math.abs(f) * rho[donor];
        if (!(v > 0)) continue;
        inner[donor] -= v; inner[receiver] += v;
        if (FL) { (dir ? FL.fy : FL.fx)[i] += f > 0 ? v : -v; FL.film?.face(i, dir, f > 0 ? v : -v); }
        const w0 = W0[donor], dl = lev[donor] - lev[receiver];
        for (let a = 0; a < nAct; a++) {
          const k = active[a], ck = cout[k], g = w0 > 1e-12 ? v * G[k][donor] / w0 : 0;
          ck[donor] -= g; ck[receiver] += g;
          outward += g * dl * mm / 3;
        }
      }
    }
    for (let q = 0; q < n; q++) {
      const i = order[q], water = Math.max(0, W0[i] + inner[i]);
      const demand = sub * ex[i]; pending[i] += demand;
      sheet.edgeDemandRequested = (sheet.edgeDemandRequested ?? 0) + demand;
      const ev = Math.min(water, pending[i]); pending[i] -= ev;
      W[i] = water - ev;
      // Count the stored loss, including the float32 rounding of this sink.
      // Otherwise a spatially uniform sub-ULP bias accumulates over a dry.
      evaporated += water - W[i];
      if (W[i] > 0) M[i] = 1;
      for (let a = 0; a < nAct; a++) { const k = active[a]; G[k][i] = Math.max(0, G[k][i] + cout[k][i]); }
    }
    FL?.film?.end();
    remaining -= sub;
  }
  for (let q = 0; q < n; q++) lev[order[q]] = 0;
  sheet.outwardPigmentFlux = outward;
  let pend = 0; for (let i = 0; i < pending.length; i++) pend += pending[i];   // as reduce summed it, from 0 in index order
  sheet.edgeDemandPending = pend;
  return evaporated;
}
