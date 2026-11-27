// Generated from src/media/subcell-edge.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Rasterise only the deposited layer's traced edge. Uniform blocks need no interpolation:
// a bilinear value stays between its corner values, so bounds over the neighbouring
// cell centres prove exactly when every sub-pixel is full or empty. The traced mask stays unchanged.
import { pixelCoverage } from './pixel-coverage.js';

export function edgeRaster(w, h, N, ax, ay) {
  const FW = w * N, FH = h * N, n = w * h;
  const pres = new Float32Array(n), phi = new Float32Array(n), tmp = new Float32Array(n), ind = new Float32Array(n);
  const mask = new Float32Array(FW * FH), denominator = new Float64Array(FW * FH);
  const minimum = new Float32Array(n), maximum = new Float32Array(n);
  const state = new Uint8Array(w), density = new Uint8Array(w);
  const lowPhi = new Float32Array(w), highPhi = new Float32Array(w), lowPres = new Float32Array(w), highPres = new Float32Array(w), dense = new Uint8Array(w);
  const bil = (a, x, y) => {
    const Y0 = ay.i0[y] * w, Y1 = ay.i1[y] * w, fy = ay.t[y], X0 = ax.i0[x], X1 = ax.i1[x], fx = ax.t[x];
    return (a[Y0 + X0] * (1 - fx) + a[Y0 + X1] * fx) * (1 - fy) + (a[Y1 + X0] * (1 - fx) + a[Y1 + X1] * fx) * fy;
  };
  const at = (a, x, y) => {
    const u = Math.max(0, Math.min(w - 1, x)), v = Math.max(0, Math.min(h - 1, y));
    const X = Math.floor(u), Y = Math.floor(v), fx = u - X, fy = v - Y, X1 = Math.min(w - 1, X + 1), Y1 = Math.min(h - 1, Y + 1);
    return (a[Y * w + X] * (1 - fx) + a[Y * w + X1] * fx) * (1 - fy) + (a[Y1 * w + X] * (1 - fx) + a[Y1 * w + X1] * fx) * fy;
  };
  const coverage = (x, y) => {
    const x0 = x / N - 0.5, x1 = (x + 1) / N - 0.5, y0 = y / N - 0.5, y1 = (y + 1) / N - 0.5;
    const xs = [x0, ...(Math.floor(x0) + 1 < x1 ? [Math.floor(x0) + 1] : []), x1];
    const ys = [y0, ...(Math.floor(y0) + 1 < y1 ? [Math.floor(y0) + 1] : []), y1];
    const sample = (u, v) => [(at(phi, u, v) - 0.5) / AA + 0.5, (at(pres, u, v) - CORE) / AA + 0.5];
    let total = 0;
    for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++)
      total += pixelCoverage(sample, xs[i], ys[j], xs[i + 1], ys[j + 1]) * (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    return total * N * N;
  };
  return (T, cx0, cx1, cy0, cy1, edges = true) => {
    const rx0 = Math.max(0, cx0 - 1), rx1 = Math.min(w - 1, cx1 + 1), ry0 = Math.max(0, cy0 - 1), ry1 = Math.min(h - 1, cy1 + 1);
    if (edges) edgeMask(T, w, h, rx0, rx1, ry0, ry1, pres, phi, tmp, ind);
    else for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) ind[y * w + x] = T[y * w + x] > 0 ? 1 : 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      // Summarise the vertical columns once, then combine three columns. Min/max and conjunction are exact,
      // so the same nine field values give the same bounds without rereading them for every adjacent cell.
      for (let x = Math.max(0, cx0 - 1); x <= Math.min(w - 1, cx1 + 1); x++) {
        let a = 1, b = 0, c = 1, d = 0, full = true;
        for (let y = Math.max(0, cy - 1); y <= Math.min(h - 1, cy + 1); y++) {
          const i = y * w + x;
          a = Math.min(a, phi[i]); b = Math.max(b, phi[i]); c = Math.min(c, pres[i]); d = Math.max(d, pres[i]); full &&= ind[i] === 1;
        }
        lowPhi[x] = a; highPhi[x] = b; lowPres[x] = c; highPres[x] = d; dense[x] = full ? 1 : 0;
      }
      for (let cx = cx0; cx <= cx1; cx++) {
      const c = cy * w + cx;
      let loPhi = 1, hiPhi = 0, loPres = 1, hiPres = 0, fullDensity = true;
      for (let x = Math.max(0, cx - 1); x <= Math.min(w - 1, cx + 1); x++) {
        loPhi = Math.min(loPhi, lowPhi[x]); hiPhi = Math.max(hiPhi, highPhi[x]);
        loPres = Math.min(loPres, lowPres[x]); hiPres = Math.max(hiPres, highPres[x]);
        fullDensity &&= dense[x] === 1;
      }
      const full = edges ? loPhi >= 0.5 + AA / 2 || loPres >= CORE + AA / 2 : ind[c] === 1;
      const empty = edges ? hiPhi <= 0.5 - AA / 2 && hiPres <= CORE - AA / 2 : ind[c] === 0;
      state[cx] = empty ? 0 : full && fullDensity ? 1 : full ? 2 : 3;
      density[cx] = fullDensity ? 1 : 0;
      }
      for (let cx = cx0; cx <= cx1; cx++) {
      const c = cy * w + cx, kind = state[cx];
      // Full-density interiors and empty runs are exact constants. Fill their
      // contiguous pixel spans, avoiding a per-pixel branch and repeated bounds.
      if (kind < 2) {
        let end = cx + 1;
        while (end <= cx1 && state[end] === kind) end++;
        minimum.fill(kind, c, cy * w + end); maximum.fill(kind, c, cy * w + end);
        for (let y = cy * N; y < (cy + 1) * N; y++) {
          mask.fill(kind, y * FW + cx * N, y * FW + end * N);
          denominator.fill(kind, y * FW + cx * N, y * FW + end * N);
        }
        cx = end - 1;
        continue;
      }
      const full = kind === 2, fullDensity = density[cx] === 1;
      let min = 1, max = 0;
      for (let y = cy * N; y < (cy + 1) * N; y++) for (let x = cx * N, q = y * FW + x; x < (cx + 1) * N; x++, q++) {
        const m = full ? 1 : Math.min(1, Math.max(0, (bil(phi, x, y) - 0.5) / AA + 0.5, (bil(pres, x, y) - CORE) / AA + 0.5));
        mask[q] = m;
        denominator[q] = m > 0 ? fullDensity ? 1 : bil(ind, x, y) : 0;
        if (m < min) min = m; if (m > max) max = m;
      }
      // A tiny deposited core can sit between every pixel centre (notably N=2).
      // Integrate its existing contour over the finite pixels instead of losing
      // the entire component. Ordinary sampled blocks keep their exact bytes.
      if (max === 0 && T[c] > 0 && (phi[c] > 0.5 - AA / 2 || pres[c] > CORE - AA / 2)) {
        min = 1;
        for (let y = cy * N; y < (cy + 1) * N; y++) for (let x = cx * N, q = y * FW + x; x < (cx + 1) * N; x++, q++) {
          const m = coverage(x, y);
          mask[q] = m; denominator[q] = m > 0 ? bil(ind, x, y) : 0;
          if (m < min) min = m; if (m > max) max = m;
        }
      }
      minimum[c] = min; maximum[c] = max;
      }
    }
    return { mask, minimum, maximum, denominator };
  };
}

// the share of the local wash a cell must hold to count wholly inside it (rims up to 1/EDGE_KAPPA its interior, and
// granulation's cell-to-cell spread, stay inside); the mask's antialiasing, in units of the traced field; the level of the
// untraced presence that keeps a feature a cell or two across from vanishing under the smoothing
const EDGE_KAPPA = 0.25, AA = 0.25, CORE = 0.8;
/**
 * The wash's edge through the cells, from the pigment the sheet laid there: each cell's presence (its pigment over a
 * quarter of the most within a cell of it, capped at 1: a cell the brush or the flow only partly reached is partly in),
 * smoothed over a cell (1-2-1) and traced at one half between cell centres. The 0.26 mm steps of the cells' own edge
 * become the curve they sample; a straight edge stays where it was, a staircase is cut through its steps. `ind` gets
 * which cells hold the layer, `pres` the presence, `phi` the smoothed presence.
 */
function edgeMask(T, w, h, rx0, rx1, ry0, ry1, pres, phi, tmp, ind) {
  for (let cy = ry0; cy <= ry1; cy++) for (let cx = rx0; cx <= rx1; cx++) {
    const c = cy * w + cx; ind[c] = T[c] > 0 ? 1 : 0;
    if (!(T[c] > 0)) { pres[c] = 0; continue; }
    let m = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = cx + dx, Y = cy + dy; if (X >= 0 && X < w && Y >= 0 && Y < h && T[Y * w + X] > m) m = T[Y * w + X]; }
    pres[c] = Math.min(1, T[c] / (EDGE_KAPPA * m));
  }
  // cells outside the box hold nothing (the box is the layer's cells and two about them)
  // past the sheet's own edge the cell at the edge repeats (the sheet's edge is not the wash's)
  for (let cy = ry0; cy <= ry1; cy++) for (let cx = rx0; cx <= rx1; cx++) {
    const c = cy * w + cx, left = cx === 0 ? pres[c] : cx > rx0 ? pres[c - 1] : 0, right = cx === w - 1 ? pres[c] : cx < rx1 ? pres[c + 1] : 0;
    tmp[c] = 0.25 * left + 0.5 * pres[c] + 0.25 * right;
  }
  for (let cy = ry0; cy <= ry1; cy++) for (let cx = rx0; cx <= rx1; cx++) {
    const c = cy * w + cx, above = cy === 0 ? tmp[c] : cy > ry0 ? tmp[c - w] : 0, below = cy === h - 1 ? tmp[c] : cy < ry1 ? tmp[c + w] : 0;
    phi[c] = 0.25 * above + 0.5 * tmp[c] + 0.25 * below;
  }
}
