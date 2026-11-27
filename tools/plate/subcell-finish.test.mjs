import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSubgridLayers } from './subcell-finish.mjs';
import { subcellSpread, SUBCELL_GAIN } from '../../src/media/subcell-grain.mjs';
import { renderCells } from '../../src/media/km.mjs';
import { boxPigment, BOX } from '../../src/crop/box.mjs';

test('renderSubgridLayers is byte-identical to full-sheet per-layer renderCells across sparse, empty and multi-pigment layers', () => {
  const W2 = 32, H2 = 24, N = 2, FW = W2 * N, FH = H2 * N, FN = FW * FH, N2 = W2 * H2;
  const pigments = ['rose', 'ultramarine', 'cadyellow'].map(k => ({ ...boxPigment(BOX.find(p => p.key === k)), gamma: k === 'ultramarine' ? 0.85 : 0.2 }));
  const paper = { w: W2, h: H2, mmPerCell: 0.25, reliefOf: { seed: 9, relief: 'cold' } };
  const fbase = new Uint8Array(FN * 3);
  for (let i = 0; i < FN * 3; i++) fbase[i] = 245 + (i % 7);
  const zero = new Float32Array(N2);

  const l0 = pigments.map(() => new Float32Array(N2));
  for (let y = 2; y < 8; y++) for (let x = 4; x < 14; x++) l0[0][y * W2 + x] = 0.35;
  const l1 = [zero, zero, zero]; // completely empty layer
  const l2 = [new Float32Array(N2), new Float32Array(N2), zero];
  for (let y = 14; y < 23; y++) for (let x = 10; x < 28; x++) { l2[0][y * W2 + x] = 0.15; l2[1][y * W2 + x] = 0.4; }
  const l3 = [zero, zero, new Float32Array(N2)];
  l3[2][0] = 0.5; l3[2][N2 - 1] = 0.25; // sheet corners
  const sheetLayers = [l0, l1, l2, l3];

  // Reference: original finish.mjs loop
  const spreadRef = subcellSpread(pigments, paper, N, { gain: SUBCELL_GAIN });
  const Kp = pigments.map(p => p.K), Sp = pigments.map(p => p.S);
  const under = new Float64Array(FN * 3), fineOut = new Uint8ClampedArray(FN * 3);
  for (let i = 0; i < FN * 3; i++) under[i] = fbase[i] / 255;
  sheetLayers.forEach((layer, q) => renderCells([spreadRef(layer)], Kp, Sp, fbase, 0, FN, 1, null, q === sheetLayers.length - 1 ? fineOut : null, under, under));
  const refFine = Buffer.from(fineOut.buffer), refAvg = Buffer.alloc(N2 * 3), acc = new Float64Array(N2 * 3);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const c = ((y / N) | 0) * W2 + ((x / N) | 0); for (let ch = 0; ch < 3; ch++) acc[c * 3 + ch] += refFine[(y * FW + x) * 3 + ch]; }
  for (let i = 0; i < N2 * 3; i++) refAvg[i] = Math.round(acc[i] / (N * N));

  // Optimized: row-ranged active-pigment composite
  const spreadFast = subcellSpread(pigments, paper, N, { gain: SUBCELL_GAIN });
  const got = renderSubgridLayers({ sheetLayers, spread: spreadFast, pigments, fbase, W2, H2, N, wantCoarse: true, zeroLayer: zero });
  assert.deepEqual(got.fine, refFine);
  assert.deepEqual(got.coarse, refAvg);

  const noCoarse = renderSubgridLayers({ sheetLayers, spread: subcellSpread(pigments, paper, N, { gain: SUBCELL_GAIN }), pigments, fbase, W2, H2, N, wantCoarse: false, zeroLayer: zero });
  assert.equal(noCoarse.coarse, null);
  assert.deepEqual(noCoarse.fine, refFine);
});
