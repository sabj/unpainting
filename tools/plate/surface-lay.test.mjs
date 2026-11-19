// A surface mark is the region's own paint, deeper by a fixed step, and goes only on paint.
import test from 'node:test';
import assert from 'node:assert/strict';
import { regionMix, deepenAmounts, DEEPEN_OD } from './surface-lay.mjs';

const K = [[0.5, 0.9, 2.2], [1.4, 1.3, 1.1], [0.2, 0.7, 1.9]];

test('the mix is the pigments in the fractions the sheet holds them under the darkest cells', () => {
  const n = 10, a = new Float32Array(n), b = new Float32Array(n), c = new Float32Array(n);
  for (let i = 0; i < n; i++) { a[i] = i < 5 ? 0.1 : 0.0; b[i] = i < 5 ? 3 : 1; c[i] = 0; }  // the darkest cells hold b
  const f = regionMix([a, b, c], Array.from({ length: n }, (_, i) => i), K);
  assert.ok(f[1] > 0.9, `mostly the dark paint: ${f}`);
  assert.ok(Math.abs(f.reduce((x, y) => x + y, 0) - 1) < 1e-9);
  assert.deepEqual(regionMix([a, b, c].map(() => new Float32Array(3)), [0, 1, 2], K), [0, 0, 0], 'no paint, no mix');
});

test('the amounts add the step in density at full pressure, whatever the mix', () => {
  for (const f of [[1, 0, 0], [0.5, 0.5, 0], [0.2, 0.3, 0.5]]) {
    const amounts = deepenAmounts(f, K);
    const added = amounts.reduce((s, x, j) => s + x * (K[j][0] + K[j][1] + K[j][2]) / 3, 0);
    assert.ok(Math.abs(added - DEEPEN_OD) < 1e-9, `${added}`);
  }
});
