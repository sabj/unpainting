import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { subcellLayers, subcellSpread } from './subcell-grain.mjs';
import { renderLayers, renderCells } from './km.mjs';
import { gaussianField } from './grain-field.mjs';

const U = { gamma: 0.85 }, P = { gamma: 0 };
const paper = makePaper(20, 16, { seed: 3, mmPerCell: 0.25, coldPress: { mmPerCell: 0.25 } });
const cells = Float32Array.from({ length: 20 * 16 }, (_, i) => 0.2 + 0.1 * Math.sin(i * 0.37));

test('every cell keeps exactly its own pigment, for a granulating and a staining paint', () => {
  const N = 5, [[u, p]] = subcellLayers([[cells, cells]], [U, P], paper, N);
  for (let c = 0; c < cells.length; c++) {
    const cx = c % 20, cy = (c / 20) | 0; let su = 0, sp = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const q = (cy * N + y) * 100 + cx * N + x; su += u[q]; sp += p[q]; }
    assert.ok(Math.abs(su / (N * N) - cells[c]) < 1e-6 && Math.abs(sp / (N * N) - cells[c]) < 1e-6, `cell ${c}`);
  }
});

test('granulating paint gathers in the pits of the same paper, evaluated finer; staining paint only interpolates', () => {
  const N = 10, [[u, p]] = subcellLayers([[cells, cells]], [U, P], paper, N), again = subcellLayers([[cells, cells]], [U, P], paper, N)[0][0];
  assert.deepEqual(Array.from(u.slice(0, 500)), Array.from(again.slice(0, 500)), 'deterministic');
  const fine = makePaper(200, 160, { seed: 3, mmPerCell: 0.025, coldPress: { mmPerCell: 0.025 } });
  // ultramarine against phthalo laid from the same cells (which only interpolates): more where the paper's grain field
  // (the relief low-passed at 0.2 mm, grain-field.mjs, as the sheet's settling reads it) lies lower than it does a cell
  // about. -0.26 here; at rc7, raw against the full relief, under -0.3. And phthalo follows nothing.
  const g = fine.grainH, lo = gaussianField(g, 200, 160, N);
  let c = 0, a = 0, b = 0, cp = 0, ap = 0, bp = 0;
  for (let i = 0; i < u.length; i++) {
    const cell = cells[(((i / 200) | 0) / N | 0) * 20 + ((i % 200) / N | 0)], du = u[i] / p[i] - 1, dp = p[i] / cell - 1, dz = g[i] - lo[i], dh = fine.zUm[i];
    c += du * dz; a += du * du; b += dz * dz; cp += dp * dh; ap += dp * dp; bp += dh * dh;
  }
  assert.ok(c / Math.sqrt(a * b) < -0.2, `ultramarine follows the grain field's pits: ${c / Math.sqrt(a * b)}`);
  assert.ok(Math.abs(cp / Math.sqrt(ap * bp)) < 0.1, `phthalo does not: ${cp / Math.sqrt(ap * bp)}`);
});

test('a paper without a physical relief refuses', () => {
  assert.throws(() => subcellLayers([[cells]], [U], makePaper(20, 16, { seed: 3 }), 4), /no physical relief/);
});

test('layers spread and composited one at a time give the same picture as all at once, byte for byte', () => {
  // two paints with real optics, three layers that overlap in part and one that is empty
  const pigs = [{ gamma: 0.85, K: [0.9, 0.5, 0.1], S: [0.2, 0.3, 0.6] }, { gamma: 0, K: [0.1, 0.4, 0.9], S: [0.5, 0.2, 0.1] }];
  const n = 20 * 16, N = 4, FN = n * N * N, part = k => Float32Array.from({ length: n }, (_, i) => ((i % 20) > 3 * k && ((i / 20) | 0) < 14 - 2 * k ? 0.15 + 0.1 * Math.sin(i * (0.2 + k)) : 0));
  const layers = [[part(0), part(1)], [new Float32Array(n), new Float32Array(n)], [part(2), part(0)], [part(1), part(3)]];
  const base = Uint8Array.from({ length: FN * 3 }, (_, i) => 225 + (i * 7) % 30);
  const whole = renderLayers(subcellLayers(layers, pigs, paper, N), pigs, base, FN);
  const spread = subcellSpread(pigs, paper, N), under = Float64Array.from(base, v => v / 255), out = new Uint8ClampedArray(FN * 3);
  layers.forEach((layer, q) => renderCells([spread(layer)], pigs.map(p => p.K), pigs.map(p => p.S), base, 0, FN, 1, null, q === layers.length - 1 ? out : null, under, under));
  assert.deepEqual(Buffer.from(out.buffer), Buffer.from(whole.buffer));
  assert.ok(whole.some((v, i) => v !== base[i]), 'the layers show');
});
