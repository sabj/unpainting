import test from 'node:test';
import assert from 'node:assert/strict';
import { washStats } from './wash-stats.mjs';

test('washStats counts passes and distinct pans per painted cell, ignoring bare paper', () => {
  const n = 4, m = a => Uint8Array.from(a);
  const layers = [
    { pigment: 0, shapes: [{ mask: m([1, 1, 0, 0]) }] },
    { pigment: 0, shapes: [{ mask: m([1, 0, 0, 0]) }] },
    { pigment: 2, shapes: [{ mask: m([1, 1, 1, 0]) }, { mask: m([0, 0, 1, 0]) }] },
  ];
  const s = washStats(layers, n);
  assert.equal(s.cells, 3);
  assert.deepEqual(s.passes, { mean: 2.33, p95: 2, max: 3 });
  assert.deepEqual(s.pans, { mean: 1.67, p95: 2, max: 2 });
  assert.deepEqual(washStats([], n), { cells: 0, passes: { mean: 0, p95: 0, max: 0 }, pans: { mean: 0, p95: 0, max: 0 } });
});
