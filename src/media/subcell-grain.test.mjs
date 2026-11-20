import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { subcellLayers } from './subcell-grain.mjs';

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
  // within each cell, more ultramarine where the fine relief lies lower: a negative correlation with the height
  let c = 0, a = 0, b = 0, cp = 0, ap = 0;
  for (let i = 0; i < u.length; i++) { const cell = cells[(((i / 200) | 0) / N | 0) * 20 + ((i % 200) / N | 0)], du = u[i] / cell - 1, dp = p[i] / cell - 1, dz = fine.zUm[i]; c += du * dz; a += du * du; b += dz * dz; cp += dp * dz; ap += dp * dp; }
  assert.ok(c / Math.sqrt(a * b) < -0.3, `ultramarine follows the pits: ${c / Math.sqrt(a * b)}`);
  assert.ok(Math.abs(cp / Math.sqrt(ap * b)) < 0.1, `phthalo does not: ${cp / Math.sqrt(ap * b)}`);
});

test('a paper without a physical relief refuses', () => {
  assert.throws(() => subcellLayers([[cells]], [U], makePaper(20, 16, { seed: 3 }), 4), /no physical relief/);
});
