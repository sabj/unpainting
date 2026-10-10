// The chooser's sample is worked once per different colour: the errors are the ones worked cell by cell, bit for bit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX, boxPigment } from './box.mjs';
import { sampleSource, sampleError, darkError, darkWarmth, renderedLab } from './boxpick.mjs';
import { unmix } from './pigments.mjs';
import { renderLayers } from '../media/km.mjs';
import { labPlanes, deltaE2000 } from '../eval/colour.mjs';

function cellByCell(sample, paints) {
  const { m, lab, D, flat, paperRGB } = sample, k = paints.length, pigments = paints.map(p => boxPigment(p));
  const A = unmix(D, m, pigments.map(q => q.K.map(v => v / 0.55)));
  const layer = pigments.map((_, j) => Float32Array.from({ length: m }, (_, s) => A[s * k + j]));
  const L2 = labPlanes(renderLayers([layer], pigments, flat, m, 1), m, paperRGB);
  let e = 0;
  for (let s = 0; s < m; s++) e += deltaE2000([lab.L[s], lab.a[s], lab.b[s]], [L2.L[s], L2.a[s], L2.b[s]]);
  return { e: e / m, L2 };
}

test('sampleError and the rendered Lab equal the cell by cell work', () => {
  let s = 9; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const w = 90, h = 70, px = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < w * h; i++) { const v = Math.floor(rnd() * 5) * 40 + 30; px[i * 3] = v; px[i * 3 + 1] = Math.min(255, v + (i % 7) * 6); px[i * 3 + 2] = 200 - (i % 3) * 20; }
  const paperRGB = [250, 249, 245], sample = sampleSource(px, w, h, paperRGB, { stride: 3 });
  assert.ok(sample.m > 1000);
  for (const keys of [[0, 1], [2, 3, 4], [1, 5, 6, 7]]) {
    const paints = keys.map(i => BOX[i % BOX.length]), ref = cellByCell(sample, paints);
    assert.ok(Object.is(sampleError(sample, paints), ref.e), `error for ${keys}`);
    const got = renderedLab(sample, paints);
    for (let q = 0; q < sample.m; q++) assert.ok(Object.is(got.a[q], ref.L2.a[q]) && Object.is(got.L[q], ref.L2.L[q]) && Object.is(got.b[q], ref.L2.b[q]), `cell ${q}`);
  }
  assert.ok(Number.isFinite(darkError(sample, [BOX[0], BOX[1]])) && Number.isFinite(darkWarmth(sample, [BOX[0], BOX[1]])));
});
