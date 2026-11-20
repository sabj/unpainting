// The pinned edge of a drying wash (Deegan et al., Nature 1997; Computer-Generated Watercolor, section 4.3, edge
// darkening). Where a wash meets dry paper its contact line is pinned by the sizing, and vapour escapes faster there
// than over the middle of the film: the evaporative flux grows towards the line as about one over the square root of
// the distance to it. The water lost there is replaced by liquid flowing out from behind, and that flow carries
// suspended pigment to the edge, where it is left when the film finally goes: the dark rim of a dried wash.
//
// The replacement flow is fast next to drying, so it is worked out as a steady flow over the step, whatever the step's
// length: the film keeps its shape as it thins, so every cell up to `feedMm` behind the line gives the same share of its
// water (at most half a step), and that water flows out along the distance to the line, carrying its suspended pigment;
// what a stretch of line is not sent does not evaporate this step, and what it is sent beyond its evaporation stays
// there for the levelling to spread. Water and pigment are conserved (what evaporates leaves its pigment where it was). A dry gap inside the wash that a wash
// holds round (a pit the brush skipped, a few cells across) is not a pinned edge: the air over it is as damp as over
// the film, so the faster drying is weighted by how much dry paper lies within `reachMm` of the line.
// DOM free.

const SHARE = 0.5;
const scratch = new WeakMap();
function bufs(sheet) {
  let b = scratch.get(sheet);
  if (!b || b.n !== sheet.n) {
    b = { n: sheet.n, lev: new Int32Array(sheet.n), order: new Int32Array(sheet.n), dem: new Float64Array(sheet.n), need: new Float64Array(sheet.n), inner: new Float64Array(sheet.n), sup: new Float64Array(sheet.n), rho: new Float64Array(sheet.n), ex: new Float64Array(sheet.n), geo: new Float32Array(sheet.n), cout: null, W0: new Float64Array(sheet.n) };
    scratch.set(sheet, b);
  }
  if (!b.cout || b.cout.length !== sheet.K) b.cout = Array.from({ length: sheet.K }, () => new Float64Array(sheet.n));
  return b;
}

// the mean of the edge flux profile over [a, b] mm from the line, for a band `E` mm deep: 1/sqrt(x/E + c) less its
// value at E, scaled so its mean over the band is 1 (so edgeEvap is the band's mean extra rate whatever the cell size)
const C = 0.02, TAIL = 1 / Math.sqrt(1 + C), NORM = 2 * (Math.sqrt(1 + C) - Math.sqrt(C)) - TAIL;
export function edgeProfile(a, b, E) {
  if (a >= E) return 0;
  // a cell that reaches past the band is averaged over its whole width: the profile is zero beyond E
  const c = Math.min(b, E), u = 2 * (Math.sqrt(c / E + C) - Math.sqrt(a / E + C)) * E - TAIL * (c - a);
  return Math.max(0, u / NORM / (b - a));
}

/**
 * The extra drying at the pinned edges in box [x0, y0, x1, y1] over one step of `o.dt`, with the flow that feeds it.
 * Returns the water evaporated. `o.edgeEvap` (rate, mean over the band), `o.edgeMm` (band depth), `o.feedMm` (how far
 * behind the line the feeding flow reaches), `o.carryDepth` (a film thinner than this carries less of its pigment).
 */
export function edgeFeed(sheet, o, box, mm) {
  const edgeEvap = o.edgeEvap ?? 0, E = o.edgeMm ?? 1, dt = o.dt ?? 0;
  if (!(edgeEvap > 0) || !(dt > 0)) return 0;
  const { w, h, W, M, G, K, ever, resist } = sheet, [x0, y0, x1, y1] = box;
  const L = Math.min(32000, Math.max(1, Math.ceil((o.feedMm ?? 4) / mm))), Lev = Math.ceil(E / mm), cd = o.carryDepth ?? 0.02;
  const b = bufs(sheet), { lev, order, dem, need: need_, inner, sup, rho, ex, geo, cout, W0 } = b;
  const reach = Math.max(1, Math.round((o.reachMm ?? 1.5) / mm));
  const dryAt = (x, y) => x < 0 || y < 0 || x >= w || y >= h || !M[y * w + x];
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
  const pinnedAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !M[y * w + x] && !ever[y * w + x] && !(hs > 0 && heldHole(x, y));
  // distance from the line through the wash, in thirds of a cell (chamfer 3 along a row, 4 across a diagonal), by a
  // bucket queue, so cells are listed nearest first and the bands behind a curved line are not diamonds; the line's own
  // cells (beside paper this wash has never wet) are at 3
  const inBox = (x, y) => x >= x0 && y >= y0 && x <= x1 && y <= y1;
  const buckets = b.buckets ?? (b.buckets = []); for (const q of buckets) if (q) q.length = 0;
  const push = (i, d) => { (buckets[d] ??= []).push(i); };
  let seeds = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x; if (!M[i] || (resist !== null && resist[i])) continue;
    if (pinnedAt(x + 1, y) || pinnedAt(x - 1, y) || pinnedAt(x, y + 1) || pinnedAt(x, y - 1)) { push(i, 3); seeds++; }
  }
  if (!seeds) return 0;
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
        const j = yy * w + xx; if (!M[j] || lev[j] || (resist !== null && resist[j])) continue;
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
  let Etot = 0, Wtot = 0;
  for (let q = 0; q < n; q++) {
    const i = order[q], l = lev[i]; W0[i] = W[i]; Wtot += W[i];
    let g = 0;
    if (l === 3) {
      const u = Math.min(1, Math.max(0, (dryShare(i % w, (i / w) | 0) - 0.1) / 0.2)); g = u * u * (3 - 2 * u);
    } else if (l <= 3 * Lev) for (let e = 0; e < 4; e++) { const j = nb(i, e); if (j >= 0 && lev[j] && lev[j] < l && geo[j] > g) g = geo[j]; }
    geo[i] = g;
    const e0 = l <= 3 * Lev && g > 0 ? dt * edgeEvap * g * edgeProfile((l / 3 - 1) * mm, (l / 3) * mm, E) : 0;
    ex[i] = e0; Etot += e0;
  }
  if (!(Etot > 0)) { for (let q = 0; q < n; q++) lev[order[q]] = 0; return 0; }
  // Liquid flows in a wash far faster than it dries, so the film keeps its shape as it thins: every cell up to feedMm
  // behind the line gives the same share of its water (at most `share` a step), and the flow carries it out to the line.
  // Forward, line inwards: what each cell must be sent from behind (its own extra drying, plus what it passes on to the
  // cells in front, less its share), split over the cells behind it by their water.
  // Where the line is long next to the water behind it (a corner, a narrow neck) the cells behind it run out before it is
  // fed and the rest of the wash has water to spare: the share is raised until the demand is met or the share reaches
  // its cap (three tries; what is still unmet does not evaporate this step).
  let draw = Math.min(SHARE, Etot / Wtot);
  for (let tries = 0; tries < 3; tries++) {
    let unmet = 0;
    for (let q = 0; q < n; q++) {
      const i = order[q], l = lev[i];
      let need = ex[i], S = 0;
      for (let e = 0; e < 8; e++) {
        const j = nb(i, e); if (j < 0 || !lev[j]) continue;
        if (lev[j] < l) { if (dem[j] > 0) need += (dem[j] * W0[i]) / inner[j]; }
        else if (lev[j] > l) S += W0[j];
      }
      const D = Math.max(0, need - draw * W0[i]);
      need_[i] = need; inner[i] = S; dem[i] = S > 0 ? D : 0; sup[i] = need - D;
      if (!(S > 0)) unmet += D;
    }
    if (!(unmet > 1e-3 * Etot) || draw >= SHARE) break;
    draw = Math.min(SHARE, draw * Etot / Math.max(1e-12, Etot - unmet));
  }
  // backward, from the back to the line: what actually arrives (a cell sends what it was asked, in proportion to what
  // it had), with the pigment it carries
  let evaporated = 0;
  for (let q = n - 1; q >= 0; q--) {
    const i = order[q], l = lev[i];
    let inflow = 0;
    if (dem[i] > 0) for (let e = 0; e < 8; e++) {
      const j = nb(i, e); if (j < 0 || !(lev[j] > l)) continue;
      const f = ((dem[i] * W0[j]) / inner[i]) * rho[j]; inflow += f;
      for (let k = 0; k < K; k++) if (cout[k][j]) G[k][i] += f * cout[k][j];
    }
    const r = need_[i] > 0 ? Math.min(1, (sup[i] + inflow) / need_[i]) : 1, out = r * (need_[i] - ex[i]), ev = r * ex[i];
    rho[i] = r; evaporated += ev;
    const wMix = W[i] + inflow, m = wMix / cd, carry = m >= 1 ? 1 : m * m;
    for (let k = 0; k < K; k++) {
      const c = wMix > 1e-12 ? (G[k][i] / wMix) * carry : 0;
      cout[k][i] = c; if (out > 0 && c > 0) G[k][i] = Math.max(0, G[k][i] - out * c);
    }
    W[i] = Math.max(0, wMix - out - ev);
  }
  for (let q = 0; q < n; q++) { const i = order[q]; lev[i] = 0; for (let k = 0; k < K; k++) cout[k][i] = 0; }
  return evaporated;
}
