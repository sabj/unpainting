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

test('dip: true is retained on the first surviving fragment even when stroke starts in dark wash', () => {
  const g = { dip: true, points: Array.from({ length: 10 }, (_, x) => ({ x, y: 0 })) };
  // Points 0, 1 are in dark wash; points 2..5 are light; points 6..7 dark; 8..9 light
  const vals = Float32Array.from([0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.1, 0.1]);
  const out = cutInDarkWash([g], vals, 10, 1, 0.5);
  assert.equal(out.length, 2);
  assert.equal(out[0].dip, true, 'first surviving fragment receives dip');
  assert.equal(out[1].dip, false, 'subsequent fragments do not get extra dip');
});

test('widths and weights arrays are sliced to match points length on split fragments', () => {
  const g = {
    points: Array.from({ length: 10 }, (_, x) => ({ x, y: 0 })),
    widths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    weights: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  };
  const out = cutInDarkWash([g], values, w, h, 0.75);
  for (const frag of out) {
    assert.equal(frag.widths.length, frag.points.length, 'widths length matches points');
    assert.equal(frag.weights.length, frag.points.length, 'weights length matches points');
  }
});

test('low threshold guard allows exiting dark cuts even when thr <= 0.04', () => {
  const lowVals = Float32Array.from([0.05, 0.05, 0.01, 0.01, 0.05, 0.05, 0.01, 0.01, 0.05, 0.05]);
  const g = { points: Array.from({ length: 10 }, (_, x) => ({ x, y: 0 })) };
  const out = cutInDarkWash([g], lowVals, 10, 1, 0.03);
  assert.ok(out.length >= 2, 'surviving runs outside low threshold were produced');
});
