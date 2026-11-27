// Sub-cell grain: a sheet's settled pigment spread over a finer output grid by the paper as granulating paint answers
// to it, the relief low-passed at GRAIN_MM (grain-field.mjs), evaluated at the output pixel's scale. The sheet's
// settling and slide read the same field, so the render adds the field's detail finer than a cell and no pepper the
// physics does not make.
//
// Interior cells keep exactly their own pigment. Boundary cells share theirs locally along the traced deposited edge;
// each layer's pigment total stays exact. Inside the wash, the amount at each output pixel follows a smooth interpolation of
// the cell masses, times the granulating weight w = exp(gamma (zRef - z) / unit): deeper than the paper about it, more
// pigment; on a crest, less, but never none (a painter sees the fibre peaks about 40% lighter, not bare). zRef is the
// relief smoothed over about a cell, unit the field's RMS about its millimetre mean (grain-field.mjs grainUnit), and
// gamma the pigment's granulation times SUBCELL_GAIN. A staining pigment (gamma 0) only interpolates. Each cell's allotted total
// is then put right by a factor interpolated between cells (no steps at the cells' edges), and exactly in the cell.
// DOM free.
import { paperRelief, HEIGHT_SPAN_UM } from './paper-relief.mjs';
import { gaussianField, grainField, grainUnit } from './grain-field.mjs';
import { edgeRaster } from './subcell-edge.mjs';

// how strongly a granulating pigment follows the relief inside a cell, per unit of gamma: calibrated so a 40 mm ultramarine
// wash simulated at 0.25–0.26 mm and rendered at 2x sub-grid reaches ~95.8% of native 0.10 mm fine grain contrast (0.2–0.5 mm band)
export const SUBCELL_GAIN = 0.26;

/**
 * Spread each layer's per-cell pigment over an N x N finer grid. `layers` are arrays (per pigment) of Float32Array
 * cell masses, as layersOf gives them; `paper` the sheet's paper (its mmPerCell and reliefOf); returns layers of
 * w*N x h*N pixel masses, each pixel holding mass per pixel scaled so a cell's N^2 pixels sum to N^2 times its mass
 * (the same areal density on average, so renderLayers composites them as it would the cells).
 */
export function subcellLayers(layers, pigments, paper, N, opts = {}) {
  return layers.map(subcellSpread(pigments, paper, N, opts));
}
/**
 * The same, a layer at a time: spread(layer) gives that layer's planes at N x N pixels a cell. A caller that
 * composites each layer as it is made (finish.mjs) holds one layer's planes, not every layer's: a sheet of 165
 * layers at 2172 x 2896 held 25 GB of them at once.
 */
export function subcellSpread(pigments, paper, N, { gain = SUBCELL_GAIN, edges = true } = {}) {
  const { w, h, mmPerCell } = paper;
  if (!(mmPerCell > 0) || !paper.reliefOf) throw new Error('subcell-grain: the paper has no physical relief (make it with makePaper and mmPerCell or coldPress)');
  const { seed, relief } = paper.reliefOf;
  if (!(N >= 1 && Number.isInteger(N))) throw new Error('subcell-grain: N must be a whole number of pixels a cell');
  // the paper as granulating paint answers to it (grain-field.mjs): the relief low-passed at GRAIN_MM, in its own unit, as
  // the sheet's settling and slide read it; the full relief here added a pepper finer than the sheet's own physics
  const FW = w * N, FH = h * N, R = paperRelief(FW, FH, mmPerCell / N, { seed, relief });
  const z = grainField(R.zUm, FW, FH, mmPerCell / N), unit = grainUnit({ seed, relief }) * HEIGHT_SPAN_UM;
  // the level a pit is measured against: the relief smoothed over about a cell, not each cell's own mean (a mean per
  // cell stepped at every cell's edge, and the steps showed as squares at zoom)
  const zref = gaussianField(z, FW, FH, N);
  const gg = pigments.map(p => Math.max(0, (p.gamma ?? 0) * gain));
  // bilinear weights between cell centres, clamped at the sheet's edge, applied a pixel row at a time (rowOf, along)
  const ax = axis(FW, w, N), ay = axis(FH, h, N);
  const cxOf = Int32Array.from({ length: FW }, (_, x) => (x / N) | 0), cyOf = Int32Array.from({ length: FH }, (_, y) => (y / N) | 0);
  const row = new Float64Array(w);
  // a[] interpolated along pixel row y between its two cell rows, for cells cx0..cx1 (into row): the bilinear in two steps
  const rowOf = (a, y, cx0, cx1) => { const Y0 = ay.i0[y] * w, Y1 = ay.i1[y] * w, fy = ay.t[y]; for (let c = cx0; c <= cx1; c++) row[c] = a[Y0 + c] * (1 - fy) + a[Y1 + c] * fy; };
  const along = x => row[ax.i0[x]] * (1 - ax.t[x]) + row[ax.i1[x]] * ax.t[x];
  const sum = new Float64Array(w * h), f = new Float64Array(w * h), base = new Float32Array(FW * FH);
  // the granulating weight exp(g (zRef - z) / unit) over the whole picture, once for each granulation the paints have
  const weights = new Map();
  const weightOf = g => {
    if (!(g > 0)) return null;
    if (!weights.has(g)) { const a = new Float32Array(FW * FH); for (let q = 0; q < a.length; q++) a[q] = Math.exp((g * (zref[q] - z[q])) / unit); weights.set(g, a); }
    return weights.get(g);
  };
  const T = new Float64Array(w * h), tmp = new Float32Array(w * h);
  const raster = edgeRaster(w, h, N, ax, ay);
  const want = new Float64Array(w * h), edge = new Uint8Array(w * h);
  return layer => {
    // the cells that hold any of the layer's pigment, and one cell about them (the farthest an edge or an interpolation
    // reaches): every other pixel is 0
    let cx0 = w, cx1 = -1, cy0 = h, cy1 = -1;
    T.fill(0);
    // Walk contiguous planes, rather than iterating the layer's array at every cell. Each cell receives pigments in
    // exactly the same order; skipped additions are zero. Collect each pigment's support in this same read.
    const bounds = layer.map(cells => {
      let x0 = w, x1 = -1, y0 = h, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, v = cells[i];
        if (v > 0) { T[i] += v; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 >= 0) { cx0 = Math.min(cx0, x0); cx1 = Math.max(cx1, x1); cy0 = Math.min(cy0, y0); cy1 = Math.max(cy1, y1); }
      return { x0, x1, y0, y1 };
    });
    if (cx1 < 0) return layer.map(() => new Float32Array(FW * FH));
    cx0 = Math.max(0, cx0 - 1); cy0 = Math.max(0, cy0 - 1); cx1 = Math.min(w - 1, cx1 + 1); cy1 = Math.min(h - 1, cy1 + 1);
    const { mask: M, minimum: minM, maximum: maxM, denominator } = raster(T, cx0, cx1, cy0, cy1, edges);
    const lx0 = cx0, lx1 = cx1, ly0 = cy0, ly1 = cy1;
    // The traced boundary belongs to the layer and is identical for every pigment.
    for (let cy = ly0; cy <= ly1; cy++) for (let cx = lx0; cx <= lx1; cx++) { const c = cy * w + cx; edge[c] = (T[c] > 0 ? minM[c] < 1 : maxM[c] > 0) ? 1 : 0; }
    return layer.map((cells, k) => {
      const out = new Float32Array(FW * FH);
      let { x0: cx0, x1: cx1, y0: cy0, y1: cy1 } = bounds[k];
      if (cx1 < 0) return out;
      // A pigment's bilinear base is zero beyond its own one-cell ring, even when other pigments span the sheet.
      // Sharing edge mass multiplies that base; it cannot create a deposit outside this support. Neighbour sums
      // outside the ring are exactly zero, so omitting them preserves their original nonzero addition order.
      cx0 = Math.max(lx0, cx0 - 1); cy0 = Math.max(ly0, cy0 - 1); cx1 = Math.min(lx1, cx1 + 1); cy1 = Math.min(ly1, cy1 + 1);
      const px0 = cx0 * N, px1 = (cx1 + 1) * N, py0 = cy0 * N, py1 = (cy1 + 1) * N;
      const rx0 = Math.max(0, cx0 - 1), rx1 = Math.min(w - 1, cx1 + 1), ry0 = Math.max(0, cy0 - 1), ry1 = Math.min(h - 1, cy1 + 1);
      const wt = weightOf(gg[k]);
      for (let cy = cy0; cy <= cy1; cy++) sum.fill(0, cy * w + cx0, cy * w + cx1 + 1);
      // the pigment's density inside the wash: its cells interpolated over the cells that hold the layer (so it does not
      // fade towards the empty cells beside an edge), under the mask; the sums are taken as it is laid
      for (let y = py0; y < py1; y++) { rowOf(cells, y, rx0, rx1); const r = cyOf[y] * w; for (let x = px0, q = y * FW + px0; x < px1; x++, q++) {
        let v = 0; const m = M[q];
        if (m > 0) {
          const d = denominator[q];
          // The opaque interior has unit occupancy. Its divide and mask multiply are exact identities.
          v = m === 1 && d === 1 ? along(x) : d > 1e-9 ? (along(x) / d) * m : 0;
          if (wt) v *= wt[q];
        }
        base[q] = v; sum[r + cxOf[x]] += v; } }
      // what each cell must hold: exactly its own pigment where the edge does not cross it; where it does, the pigment of
      // the edge cells about it shared in proportion to what the mask left each, so the edge moves no pigment far
      let edgeWant = 0, edgeGot = 0;
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const c = cy * w + cx; want[c] = cells[c] * N * N; }
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const c = cy * w + cx; if (!edge[c]) continue;
        // A zero base sum makes the result exactly zero, whatever its neighbours hold.
        if (sum[c] === 0) { want[c] = 0; edgeWant += cells[c] * N * N; continue; }
        let a = 0, b = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = cx + dx, Y = cy + dy; if (X < cx0 || X > cx1 || Y < cy0 || Y > cy1) continue; const e = Y * w + X; if (edge[e]) { a += cells[e]; b += sum[e]; } }
        want[c] = b > 0 ? sum[c] * a * N * N / b : 0; edgeWant += cells[c] * N * N; edgeGot += want[c];
      }
      if (edgeGot > 0) { const s = edgeWant / edgeGot; for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (edge[cy * w + cx]) want[cy * w + cx] *= s; }
      // each cell's pigment, put right by a factor that is itself interpolated between cells, so it has no steps
      // Only this one-cell ring is read by the following interpolation. Clearing the rest of the sheet for
      // every pigment in a small layer did no work on its reconstruction.
      for (let cy = ry0; cy <= ry1; cy++) {
        const r = cy * w;
        if (cy < cy0 || cy > cy1) f.fill(0, r + rx0, r + rx1 + 1);
        else { if (rx0 < cx0) f[r + rx0] = 0; if (rx1 > cx1) f[r + rx1] = 0; }
      }
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const c = cy * w + cx; f[c] = sum[c] > 0 ? want[c] / sum[c] : -1; }
      // a cell the mask leaves empty takes its neighbours' factor, so the interpolation does not pull theirs to 0
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const c = cy * w + cx; if (f[c] >= 0) continue; let a = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = cx + dx, Y = cy + dy; if (X < cx0 || X > cx1 || Y < cy0 || Y > cy1) continue; const v = f[Y * w + X]; if (v > 0) { a += v; n++; } } tmp[c] = n ? a / n : 0; }
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const c = cy * w + cx; if (f[c] < 0) f[c] = tmp[c]; }
      for (let cy = cy0; cy <= cy1; cy++) sum.fill(0, cy * w + cx0, cy * w + cx1 + 1);
      for (let y = py0; y < py1; y++) { rowOf(f, y, rx0, rx1); const r = cyOf[y] * w; for (let x = px0, q = y * FW + px0; x < px1; x++, q++) { out[q] = base[q] * along(x); sum[r + cxOf[x]] += out[q]; } }
      // what is left of each cell's error is put right in the cell itself
      for (let y = py0; y < py1; y++) for (let x = px0, q = y * FW + px0, r = cyOf[y] * w; x < px1; x++, q++) {
        const c = r + cxOf[x];
        out[q] = sum[c] > 0 ? (out[q] * want[c]) / sum[c] : 0;
      }
      return out;
    });
  };
}
function axis(F, n, N) {
  const i0 = new Int32Array(F), i1 = new Int32Array(F), t = new Float64Array(F);
  for (let x = 0; x < F; x++) { const u = Math.min(n - 1, Math.max(0, (x + 0.5) / N - 0.5)), a = Math.floor(u); i0[x] = a; i1[x] = Math.min(n - 1, a + 1); t[x] = u - a; }
  return { i0, i1, t };
}
