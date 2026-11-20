// Sub-cell grain: a sheet's settled pigment spread over a finer output grid by the paper's own relief, evaluated at the
// output pixel's scale. The paper is one field in micrometres (paper-relief.mjs), so an image N times finer than the
// sheet reads the same paper finer, not enlarged cells: a 0.25 mm sheet shows grain in 0.2 to 0.5 mm pits, and a zoomed
// view evaluates them again at its own pixels.
//
// Each cell keeps exactly its own pigment. Inside it, the amount at each output pixel follows a smooth interpolation of
// the cell masses (so cell edges do not show), times the granulating weight w = exp(gamma (zCell - z) / unit): deeper
// than the cell's mean, more pigment; on a crest, less, but never none (a painter sees the fibre peaks about 40%
// lighter, not bare). zCell is the cell's mean relief over its own pixels, unit
// the relief's RMS about its millimetre mean (the hollow unit of settling), and gamma the pigment's granulation times
// SUBCELL_GAIN. A staining pigment (gamma 0) only interpolates. Then each cell's pixels are scaled to its total.
// DOM free.
import { paperRelief } from './paper-relief.mjs';

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
  const FW = w * N, FH = h * N, R = paperRelief(FW, FH, mmPerCell / N, { seed, relief }), z = R.zUm, unit = R.hollowRmsUm;
  // the cell's mean relief over its own pixels
  const zc = new Float64Array(w * h);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) zc[((y / N) | 0) * w + ((x / N) | 0)] += z[y * FW + x];
  for (let i = 0; i < w * h; i++) zc[i] /= N * N;
  const gg = pigments.map(p => Math.max(0, (p.gamma ?? 0) * gain));
  const sum = new Float64Array(w * h);
  return layers.map(layer => layer.map((cells, k) => {
    const out = new Float32Array(FW * FH);
    sum.fill(0);
    for (let y = 0; y < FH; y++) {
      // bilinear between cell centres, clamped at the sheet's edge
      const v = (y + 0.5) / N - 0.5, y0 = Math.max(0, Math.min(h - 1, Math.floor(v))), y1 = Math.min(h - 1, y0 + 1), fy = Math.max(0, Math.min(1, v - y0));
      for (let x = 0; x < FW; x++) {
        const u = (x + 0.5) / N - 0.5, x0 = Math.max(0, Math.min(w - 1, Math.floor(u))), x1 = Math.min(w - 1, x0 + 1), fx = Math.max(0, Math.min(1, u - x0));
        const m = (cells[y0 * w + x0] * (1 - fx) + cells[y0 * w + x1] * fx) * (1 - fy) + (cells[y1 * w + x0] * (1 - fx) + cells[y1 * w + x1] * fx) * fy;
        const c = ((y / N) | 0) * w + ((x / N) | 0), q = y * FW + x;
        const wgt = gg[k] > 0 ? Math.exp((gg[k] * (zc[c] - z[q])) / unit) : 1;
        out[q] = m * wgt; sum[c] += out[q];
      }
    }
    // each cell's pixels carry its own mass exactly (N^2 pixels of its areal density)
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const c = ((y / N) | 0) * w + ((x / N) | 0), q = y * FW + x;
      out[q] = sum[c] > 0 ? (out[q] * cells[c] * N * N) / sum[c] : cells[c];
    }
    return out;
  }));
}
