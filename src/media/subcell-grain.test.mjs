import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('traced boundaries conserve each pigment, keep narrow marks, and leave distant bare paper empty', () => {
  const w = paper.w, h = paper.h, N = 8, FW = w * N;
  // A shallow diagonal, a one-cell-wide line, and an isolated dot. Each can lose all its mass if only a smoothed
  // occupancy is traced; every feature must still appear, and every pigment must balance independently.
  const band = Float32Array.from({ length: w * h }, (_, i) => {
    const x = i % w, y = (i / w) | 0;
    return x > 2 && x < 17 && Math.abs(y - (4 + x * 0.25)) < 1.5 ? 0.2 : 0;
  });
  band[12 * w + 3] = 0.4;
  for (let x = 8; x < 17; x++) band[13 * w + x] = 0.1;
  const staining = Float32Array.from(band, v => v * 0.3), [[u, p]] = subcellLayers([[band, staining]], [U, P], paper, N);
  const sum = a => a.reduce((s, v) => s + v, 0);
  for (const [fine, coarse] of [[u, band], [p, staining]]) {
    assert.ok(Math.abs(sum(fine) / (N * N) / sum(coarse) - 1) < 1e-6, 'total pigment conserved');
    assert.ok(fine.every(v => Number.isFinite(v) && v >= 0));
    const at = (x, y) => fine[(y * N + (N >> 1)) * FW + x * N + (N >> 1)];
    assert.ok(at(3, 12) > 0 && at(12, 13) > 0, 'dot and line survive');
    assert.equal(at(0, 0), 0, 'distant paper stays bare');
  }
});

test('isolated deposits retain each pigment at two-pixel exports, including paper corners', () => {
  const w = 67, h = 45, N = 2, p = makePaper(w, h, { seed: 9, mmPerCell: 0.26 });
  const positions = [0, w - 1, (h - 1) * w, h * w - 1, 20 * w + 33];
  const spread = subcellSpread([{ gamma: 0.4 }, { gamma: 0 }], p, N);
  for (const position of positions) {
    const cells = new Float32Array(w * h); cells[position] = 0.1;
    const nativeMass = cells.reduce((s, v) => s + v, 0);
    const staining = Float32Array.from(cells, v => v * 0.3);
    const fine = spread([cells, staining]);
    for (let k = 0; k < fine.length; k++) {
      const expected = k === 0 ? nativeMass : staining[position];
      assert.ok(fine[k].some(v => v > 0), `deposit ${position} survives`);
      assert.ok(fine[k].every(v => Number.isFinite(v) && v >= 0));
      const finalMass = fine[k].reduce((s, v) => s + v, 0) / (N * N);
      assert.ok(Math.abs(finalMass / expected - 1) < 1e-6, `deposit ${position}, pigment ${k}: ${expected} became ${finalMass}`);
    }
  }
});

test('a shallow deposited boundary is traced within cell rows rather than held as cell-sized stairs', () => {
  const w = 40, h = 32, N = 8, FW = w * N;
  const p = makePaper(w, h, { seed: 3, mmPerCell: 0.26 });
  const cells = Float32Array.from({ length: w * h }, (_, i) => i % w < 12 + 0.4 * ((i / w) | 0) ? 0.2 : 0);
  const [fine] = subcellSpread([P], p, N)([cells]);
  let changes = 0, rows = 0;
  for (let cy = 3; cy < h - 3; cy++) {
    let previous = -1;
    for (let sy = 0; sy < N; sy++) {
      const y = cy * N + sy;
      let x = 0; while (x < FW && fine[y * FW + x] > 0.05) x++;
      const a = fine[y * FW + x - 1], b = fine[y * FW + x];
      const edge = x - 1 + (a - 0.05) / (a - b);
      if (sy > 0 && Math.abs(edge - previous) > 0.01) changes++;
      if (sy > 0) rows++;
      previous = edge;
    }
  }
  assert.ok(changes / rows > 0.5, `${changes}/${rows} within-cell row boundaries move`);
});

// Recorded from the uncached raster before the same-physics optimization. This exercises opaque interiors,
// shallow edges, a thin line, a dot, disjoint small layers, paper edges, mixed pigments and an empty layer.
// N=2 was re-recorded after finite-pixel coverage restored previously missed cores.
// The large-to-small sequence also checks that the reused buffers never expose a previous layer's contents.
// Updated for 0.5 realism tuning (STRENGTH_SWING=0.35, SUBCELL_GAIN=0.26).
for (const [N, expected] of [
  [2, 'beed155e64624a0254c96404d71c6d5280683a62b03c32545781987eb0bad5d3'],
  [4, '97fa3076e92e38d53a7072184570c2dcb895a00c70f1b92a37d1bbf786f9f89d'],
  [10, 'adbe9b29d5a2fe10e306d440da8c681327e5e3c18daba41eb762aa0c234b4336'],
]) test(`cached edge raster preserves reconstructed pigment bytes at ${N} pixels per cell`, () => {
  const w = 80, h = 64, p = makePaper(w, h, { seed: 9, mmPerCell: 0.26 });
  const pigments = [{ gamma: 0.85 }, { gamma: 0 }, { gamma: 0.4 }], spread = subcellSpread(pigments, p, N);
  const hash = createHash('sha256');
  for (let j = 0; j < 9; j++) {
    const layer = pigments.map((_, k) => Float32Array.from({ length: w * h }, (_, i) => {
      const x = i % w, y = Math.floor(i / w);
      const inside = j === 0 ? true : j === 1 ? x < 12 + 0.4 * y : j === 2 ? Math.abs(y - 25) < 0.6 && x > 3
        : j === 3 ? i === 33 * w + 19 : j === 4 ? x > 60 && y > 50 : j === 5 ? x < 8 && y < 6
          : j === 6 ? x > 40 && x < 48 && y > 10 && y < 20 : j === 7 ? Math.sin(i * 4.37) > 0.5 : false;
      return inside && !(j === 7 && k === 1) ? 0.001 + Math.abs(Math.sin(i * 0.37 + j * 1.7 + k * 0.3)) * 0.3 : 0;
    }));
    const fine = spread(layer);
    for (let k = 0; k < fine.length; k++) {
      const nativeMass = layer[k].reduce((s, v) => s + v, 0), fineMass = fine[k].reduce((s, v) => s + v, 0) / (N * N);
      assert.ok(Math.abs(fineMass - nativeMass) <= 1e-6 * Math.max(1, nativeMass), `layer ${j}, pigment ${k} mass balance`);
      hash.update(new Uint8Array(fine[k].buffer));
    }
  }
  assert.equal(hash.digest('hex'), expected);
});

// Recorded at 01727038 before limiting each pigment to its own interpolation support. Far-apart colors keep the
// layer's rectangle broad while each individual pigment has a small rectangle, including a dot and paper edges.
// The corrected N=2 snapshot retains the formerly missing dot; other snapshots are unchanged.
// Updated for 0.5 realism tuning (STRENGTH_SWING=0.35, SUBCELL_GAIN=0.26).
for (const [N, edges, expected] of [
  [1, true, '609e567fdaf228feb84df41b9e78e690f11241e26bd112471022bf9b82df9deb'],
  [2, true, '2e5d39e3add60ab3318863441fabfd0766ff6b47fd1db3cb98d4f3f0a52f38f4'],
  [3, true, '31d3cf90ae8afb111636dc9cc14f6c1be7f14ee646930f8482aaff4e1439ab05'],
  [8, true, '2db08e5eec6aae2524912acaeb110482f788fd4e68a1387ecae6a22077188b2e'],
  [2, false, '6d39c8ddd8ff09af6e0c392997cfeff6b5d73eb593a6d89b40029f8eb4b86386'],
]) test(`separated pigment supports preserve full-layer reference bytes at N=${N}, edges=${edges}`, () => {
  const w = 67, h = 45, p = makePaper(w, h, { seed: 9, mmPerCell: 0.26 });
  const pigments = [{ gamma: 0.85 }, { gamma: 0 }, { gamma: 0.4 }], spread = subcellSpread(pigments, p, N, { edges }), hash = createHash('sha256');
  for (let j = 0; j < 5; j++) {
    const layer = pigments.map((_, k) => Float32Array.from({ length: w * h }, (_, i) => {
      const x = i % w, y = Math.floor(i / w), inside = j === 4 ? false : k === 0 ? x < 10 + j && y < 15 : k === 1 ? x > 48 && y > 24 - j
        : j % 2 ? x === 33 && y === 20 : x > 25 && x < 38 && y > 12 && y < 30;
      return inside ? 0.001 + Math.abs(Math.sin(i * 0.37 + j * 1.7 + k * 0.3)) * 0.3 : 0;
    }));
    const fine = spread(layer);
    for (let k = 0; k < fine.length; k++) {
      const nativeMass = layer[k].reduce((s, v) => s + v, 0), fineMass = fine[k].reduce((s, v) => s + v, 0) / (N * N);
      assert.ok(Math.abs(fineMass - nativeMass) <= 1e-6 * Math.max(1, nativeMass), `layer ${j}, pigment ${k} mass balance`);
      hash.update(new Uint8Array(fine[k].buffer));
    }
  }
  assert.equal(hash.digest('hex'), expected);
});
