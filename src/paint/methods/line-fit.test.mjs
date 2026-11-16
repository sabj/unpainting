import test from 'node:test';
import assert from 'node:assert/strict';
import { fitManMade, strokesAtCorners, lineFit } from './line-fit.mjs';

const jitter = (P, a) => P.map(([x, y], k) => [x, y + (k % 2 ? a : -a)]);
const run = (x0, y0, x1, y1, n) => Array.from({ length: n + 1 }, (_, k) => [x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);

test('a wobbly straight edge within the model resolution is one straight segment; beyond it, it is split', () => {
  const f = fitManMade(jitter(run(0, 0, 50, 0, 50), 0.4), 0.93);
  assert.equal(f.parts.length, 1); assert.equal(f.parts[0].kind, 'line');
  assert.ok(lineFit(f.points).dev < 1e-6, 'drawn straight');
  assert.ok(fitManMade(jitter(run(0, 0, 50, 0, 50), 3), 0.93).parts.length > 1);
});

test('an arch is a clean arc, no more than a right angle a part; a corner lifts the pen unless a leg is short', () => {
  const arc = Array.from({ length: 61 }, (_, k) => { const t = Math.PI - k * Math.PI / 60; return [30 + 30 * Math.cos(t), 30 - 30 * Math.sin(t)]; });
  const f = fitManMade(arc, 0.5);
  assert.ok(f.parts.every(p => p.kind === 'arc'), f.parts.map(p => p.kind).join());
  assert.ok(f.parts.length >= 2, 'a half circle is two arcs at least');
  const L = fitManMade([...run(0, 0, 20, 0, 20), ...run(20, 1, 20, 20, 19)], 0.5);
  assert.equal(strokesAtCorners(L.parts).length, 2, 'a right-angle corner is a pen lift');
  const short = fitManMade([...run(0, 0, 20, 0, 20), ...run(20, 1, 20, 3, 2)], 0.5);
  assert.equal(strokesAtCorners(short.parts, 0.8, 3.7).length, 1, 'a short leg goes on round the corner');
});

test('curve residual measures wobble against a frozen curve, not length/chord', async () => {
  const { curveResidual } = await import('./line-fit.mjs');
  const arch = Array.from({ length: 101 }, (_, i) => [20 * Math.cos(i * Math.PI / 100), 20 * Math.sin(i * Math.PI / 100)]);
  assert.equal(curveResidual(arch, arch).p90Mm < 1e-10, true);
  const wobble = arch.map(([x, y], i) => [x * (1 + 0.1 * Math.sin(i)), y * (1 + 0.1 * Math.sin(i))]);
  assert.ok(curveResidual(wobble, arch).p90Mm > 1);
  const line = [[0, 0], [50, 0]];
  assert.equal(curveResidual([[0, 1], [50, 1]], line).medianMm, 1);
  assert.ok(curveResidual([[0, 0], [25, 0], [50, 0]], line).p90Mm < 1e-10);
});
