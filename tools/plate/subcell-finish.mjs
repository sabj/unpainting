// Fast bit-identical sub-cell layer compositing for finish.mjs.
// Restricts each layer's Kubelka-Munk composite to its active pigment planes and tight row band.
import { renderCells } from '../../src/media/km.mjs';

/**
 * Composite settled sheet layers over a fine N x N sub-cell grid using `spread`.
 * Bit-identical to calling renderCells over the full FN grid for every layer and pigment.
 */
export function renderSubgridLayers({ sheetLayers, spread, pigments, fbase, W2, H2, N, wantCoarse = true, zeroLayer = null }) {
  const FW = W2 * N, FH = H2 * N, FN = FW * FH, N2 = W2 * H2;
  const Kp = pigments.map(p => p.K), Sp = pigments.map(p => p.S);
  const under = new Float64Array(FN * 3), fineOut = new Uint8ClampedArray(FN * 3);
  for (let i = 0; i < FN * 3; i++) under[i] = fbase[i] / 255;
  if (!sheetLayers.length) {
    fineOut.set(fbase);
  } else {
    for (let q = 0; q < sheetLayers.length; q++) {
      const layer = sheetLayers[q];
      const activeIdx = [];
      let cy0 = H2, cy1 = -1;
      for (let k = 0; k < layer.length; k++) {
        const cells = layer[k];
        if (zeroLayer && cells === zeroLayer) continue;
        let p0 = -1, p1 = -1;
        for (let y = 0; y < H2; y++) {
          const row = y * W2;
          for (let x = 0; x < W2; x++) {
            if (cells[row + x] > 0) { p0 = y; break; }
          }
          if (p0 >= 0) break;
        }
        if (p0 < 0) continue;
        for (let y = H2 - 1; y >= p0; y--) {
          const row = y * W2;
          for (let x = 0; x < W2; x++) {
            if (cells[row + x] > 0) { p1 = y; break; }
          }
          if (p1 >= 0) break;
        }
        activeIdx.push(k);
        if (p0 < cy0) cy0 = p0;
        if (p1 > cy1) cy1 = p1;
      }
      if (!activeIdx.length) continue;
      const sp = spread(layer);
      const c0 = Math.max(0, cy0 - 1) * N * FW;
      const c1 = Math.min(H2, cy1 + 2) * N * FW;
      const aLayer = activeIdx.map(k => sp[k]);
      const aKp = activeIdx.map(k => Kp[k]);
      const aSp = activeIdx.map(k => Sp[k]);
      renderCells([aLayer], aKp, aSp, fbase, c0, c1, 1, null, null, under, under);
    }
    for (let i = 0; i < FN * 3; i++) {
      const v = Math.round(under[i] * 255);
      fineOut[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  const fine = Buffer.from(fineOut.buffer);
  let coarse = null;
  if (wantCoarse) {
    coarse = Buffer.alloc(N2 * 3);
    const n2 = N * N;
    for (let cy = 0; cy < H2; cy++) {
      const py0 = cy * N, cRow = cy * W2;
      for (let cx = 0; cx < W2; cx++) {
        let r = 0, g = 0, b = 0;
        for (let dy = 0; dy < N; dy++) {
          let p = ((py0 + dy) * FW + cx * N) * 3;
          for (let dx = 0; dx < N; dx++, p += 3) { r += fine[p]; g += fine[p + 1]; b += fine[p + 2]; }
        }
        const o = (cRow + cx) * 3;
        coarse[o] = Math.round(r / n2);
        coarse[o + 1] = Math.round(g / n2);
        coarse[o + 2] = Math.round(b / n2);
      }
    }
  }
  return { coarse, fine };
}
