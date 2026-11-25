// Sub-cell grain: a sheet's settled pigment spread over a finer output grid by the paper as granulating paint answers
// to it, the relief low-passed at GRAIN_MM (grain-field.mjs), evaluated at the output pixel's scale. The sheet's
// settling and slide read the same field, so the render adds the field's detail finer than a cell and no pepper the
// physics does not make.
//
// Each cell keeps exactly its own pigment. Inside it, the amount at each output pixel follows a smooth interpolation of
// the cell masses, times the granulating weight w = exp(gamma (zRef - z) / unit): deeper than the paper about it, more
// pigment; on a crest, less, but never none (a painter sees the fibre peaks about 40% lighter, not bare). zRef is the
// relief smoothed over about a cell, unit the field's RMS about its millimetre mean (grain-field.mjs grainUnit), and
// gamma the pigment's granulation times SUBCELL_GAIN. A staining pigment (gamma 0) only interpolates. Each cell's total
// is then put right by a factor interpolated between cells (no steps at the cells' edges), and exactly in the cell.
// DOM free.
import { paperRelief, HEIGHT_SPAN_UM } from './paper-relief.mjs';
import { gaussianField, grainField, grainUnit } from './grain-field.mjs';

// how strongly a granulating pigment follows the relief inside a cell, per unit of gamma: fitted so a 30 mm ultramarine
// puddle simulated at 0.25 and at 0.1 mm and rendered at 0.025 mm pixels has the 0.2 to 1 mm grain of the same puddle
// simulated at 0.05 mm (0.11 against 0.114; at gain 0.15 0.094 and 0.113, at 0.25 0.127 and 0.122)
export const SUBCELL_GAIN = 0.2;

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
export function subcellSpread(pigments, paper, N, { gain = SUBCELL_GAIN } = {}) {
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
  return layer => layer.map((cells, k) => {
    const out = new Float32Array(FW * FH);
    // only the cells that hold pigment and one cell about them (the farthest an interpolation reaches): every other
    // pixel is 0 and every other cell's factor 0 after the first pass, as on the whole sheet, so the result is the same
    let cx0 = w, cx1 = -1, cy0 = h, cy1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cells[y * w + x] > 0) { if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y; }
    if (cx1 < 0) return out;
    cx0 = Math.max(0, cx0 - 1); cy0 = Math.max(0, cy0 - 1); cx1 = Math.min(w - 1, cx1 + 1); cy1 = Math.min(h - 1, cy1 + 1);
    const px0 = cx0 * N, px1 = (cx1 + 1) * N, py0 = cy0 * N, py1 = (cy1 + 1) * N;
    const wt = weightOf(gg[k]);
    const rx0 = Math.max(0, cx0 - 1), rx1 = Math.min(w - 1, cx1 + 1);
    for (let cy = cy0; cy <= cy1; cy++) sum.fill(0, cy * w + cx0, cy * w + cx1 + 1);
    // the first pass, with every factor 1, is the base itself: its sums are taken as it is laid
    for (let y = py0; y < py1; y++) { rowOf(cells, y, rx0, rx1); const r = cyOf[y] * w; for (let x = px0, q = y * FW + px0; x < px1; x++, q++) { base[q] = wt ? along(x) * wt[q] : along(x); sum[r + cxOf[x]] += base[q]; } }
    // each cell's pigment, put right by a factor that is itself interpolated between cells, so it has no steps
    const pass = () => {
      for (let cy = cy0; cy <= cy1; cy++) sum.fill(0, cy * w + cx0, cy * w + cx1 + 1);
      for (let y = py0; y < py1; y++) { rowOf(f, y, rx0, rx1); const r = cyOf[y] * w; for (let x = px0, q = y * FW + px0; x < px1; x++, q++) { out[q] = base[q] * along(x); sum[r + cxOf[x]] += out[q]; } }
    };
    // each cell's factor is what its own pixels need, interpolated between cells; a cell with no pigment, 0
    for (let cy = 0; cy < h; cy++) { const r = cy * w; if (cy < cy0 || cy > cy1) f.fill(0, r, r + w); else { f.fill(0, r, r + cx0); f.fill(0, r + cx1 + 1, r + w); } }
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const c = cy * w + cx, want = cells[c] * N * N; f[c] = sum[c] > 0 ? want / sum[c] : want > 0 ? 2 : 0; }
    pass();
    // what is left of each cell's error is put right in the cell itself: each cell's pixels carry its own mass exactly
    for (let y = py0; y < py1; y++) for (let x = px0, q = y * FW + px0, r = cyOf[y] * w; x < px1; x++, q++) {
      const c = r + cxOf[x];
      out[q] = sum[c] > 0 ? (out[q] * cells[c] * N * N) / sum[c] : cells[c];
    }
    return out;
  });
}
function axis(F, n, N) {
  const i0 = new Int32Array(F), i1 = new Int32Array(F), t = new Float64Array(F);
  for (let x = 0; x < F; x++) { const u = Math.min(n - 1, Math.max(0, (x + 0.5) / N - 0.5)), a = Math.floor(u); i0[x] = a; i1[x] = Math.min(n - 1, a + 1); t[x] = u - a; }
  return { i0, i1, t };
}
