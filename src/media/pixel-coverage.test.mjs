import test from 'node:test';
import assert from 'node:assert/strict';
import { pixelCoverage } from './pixel-coverage.mjs';

test('finite pixels integrate bilinear fields, clipped ramps and crossing branches', () => {
  for (const [sample, expected] of [
    [(x, y) => [x * y, -1], 0.25],
    [x => [2 * x - 0.5, -1], 0.5],
    [(x, y) => [x, y], 2 / 3],
    [() => [-1, -2], 0],
    [() => [2, -1], 1],
  ]) assert.ok(Math.abs(pixelCoverage(sample, 0, 0, 1, 1) - expected) <= 5e-4);
});

test('a core between sample centres matches the analytic area integral of its clipped bilinear core', () => {
  // A bilinear hill, with all four surrounding pixel centres outside its core.
  const sample = (x, y) => [-1, ((1 - x) * (1 - y) - 0.675) / 0.25];
  const rough = pixelCoverage(sample, 0, 0, 0.5, 0.5), fine = pixelCoverage(sample, 0, 0, 0.5, 0.5, 1e-9);
  // Integral of max(0, u*v-t) on the unit square. At these thresholds
  // its support lies wholly inside this pixel's u,v >= 0.5 quadrant.
  const excess = t => 0.25 - t + 0.75 * t * t - 0.5 * t * t * Math.log(t);
  const analytic = 4 * (excess(0.675) - excess(0.925)) / 0.25;
  assert.ok(Math.abs(rough - analytic) <= 1e-6);
  assert.ok(rough > 0);
  assert.ok(Math.abs(rough - fine) <= 1e-6);
});
