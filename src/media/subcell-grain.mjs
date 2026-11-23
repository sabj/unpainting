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
export function subcellLayers(layers, pigments, paper, N, { gain = SUBCELL_GAIN } = {}) {
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
  // bilinear weights between cell centres, clamped at the sheet's edge
  const ax = axis(FW, w, N), ay = axis(FH, h, N);
  const bil = (a, x, y) => { const X0 = ax.i0[x], X1 = ax.i1[x], Y0 = ay.i0[y] * w, Y1 = ay.i1[y] * w, fx = ax.t[x], fy = ay.t[y]; return (a[Y0 + X0] * (1 - fx) + a[Y0 + X1] * fx) * (1 - fy) + (a[Y1 + X0] * (1 - fx) + a[Y1 + X1] * fx) * fy; };
  const cellOf = (x, y) => ((y / N) | 0) * w + ((x / N) | 0);
  const sum = new Float64Array(w * h), f = new Float64Array(w * h), base = new Float64Array(FW * FH);
  return layers.map(layer => layer.map((cells, k) => {
    const out = new Float32Array(FW * FH);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const q = y * FW + x; base[q] = bil(cells, x, y) * (gg[k] > 0 ? Math.exp((gg[k] * (zref[q] - z[q])) / unit) : 1); }
    // each cell's pigment, put right by a factor that is itself interpolated between cells, so it has no steps
    const pass = () => { sum.fill(0); for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const q = y * FW + x; out[q] = base[q] * bil(f, x, y); sum[cellOf(x, y)] += out[q]; } };
    f.fill(1);
    for (let it = 0; it < SMOOTH_PASSES; it++) { pass(); for (let c = 0; c < w * h; c++) { const want = cells[c] * N * N; f[c] = sum[c] > 0 ? f[c] * Math.sqrt(want / sum[c]) : want > 0 ? f[c] * 2 : 0; } }
    pass();
    // what is left of each cell's error is put right in the cell itself: each cell's pixels carry its own mass exactly
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const c = cellOf(x, y), q = y * FW + x;
      out[q] = sum[c] > 0 ? (out[q] * cells[c] * N * N) / sum[c] : cells[c];
    }
    return out;
  }));
}
// how many times the interpolated factor is put right before the last exact pass (8 leaves under 1% to the last)
const SMOOTH_PASSES = 8;
function axis(F, n, N) {
  const i0 = new Int32Array(F), i1 = new Int32Array(F), t = new Float64Array(F);
  for (let x = 0; x < F; x++) { const u = Math.min(n - 1, Math.max(0, (x + 0.5) / N - 0.5)), a = Math.floor(u); i0[x] = a; i1[x] = Math.min(n - 1, a + 1); t[x] = u - a; }
  return { i0, i1, t };
}
