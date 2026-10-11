import test from 'node:test';
import assert from 'node:assert/strict';
import { cutInDarkWash } from './ink-dark-skip.mjs';

const w = 10, h = 1;
const values = Float32Array.from([0, 0, 0, 0.9, 0.9, 0, 0, 0, 0.9, 0]);
const line = { tier: 2, points: Array.from({ length: 10 }, (_, x) => ({ x, y: 0 })) };

test('cuts a line where the plan is darker than the threshold, keeps runs of two or more points', () => {
  const out = cutInDarkWash([line], values, w, h, 0.75);
  assert.deepEqual(out.map(g => g.points.map(q => q.x)), [[0, 1, 2], [5, 6, 7]]);
  assert.equal(out[0].tier, 2);
});

test('off when the threshold is not inside (0, 1)', () => {
  assert.equal(cutInDarkWash([line], values, w, h, 0)[0], line);
  assert.equal(cutInDarkWash([line], values, w, h, 1)[0], line);
});
