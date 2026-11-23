import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness } from '../../media/sheet.mjs';
import { setPencil } from './pencil-set.mjs';

const pig = { K: [0.2, 0.2, 0.2], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 60, gamma: 0 };

test('the pencil is set into a dried layer of its own; the ink beside it is left as it was', () => {
  const s = createSheet(makePaper(20, 10, { seed: 1 }), [pig, pig]);
  s.D[0][5] = 0.3; s.P[0][6] = 0.1; s.D[1][5] = 0.7;
  const before = thickness(s).map(a => Float32Array.from(a));
  const calls = []; s._gpu = { syncAll: () => calls.push('sync'), cpuWroteAll: () => calls.push('wrote') };
  assert.ok(Math.abs(setPencil(s, 0) - 0.4) < 1e-6);
  assert.deepEqual(calls, ['sync', 'wrote']);
  delete s._gpu;
  assert.equal(s.layers.length, 1); assert.equal(s.D[0][5], 0); assert.equal(s.P[0][6], 0);
  assert.equal(s.D[1][5], Math.fround(0.7), 'the ink is not set'); assert.ok(s.layers[0][1].every(v => v === 0));
  assert.deepEqual(thickness(s), before, 'nothing moved or lost');
  assert.equal(setPencil(s, 0), 0, 'nothing more to set'); assert.equal(s.layers.length, 1);
});
