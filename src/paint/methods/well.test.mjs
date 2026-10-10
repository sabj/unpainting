import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nnls, mixFor, densityOf, chargeOf } from './well.mjs';

// Three paints, roughly a yellow, a red and a blue, as absorption directions.
const K = [[0.05, 0.10, 0.60], [0.10, 0.55, 0.45], [0.60, 0.40, 0.05]];
const paints = K.map((k, j) => ({ name: ['yellow', 'red', 'blue'][j], K: k }));
const mix = c => [0, 1, 2].map(ch => K.reduce((s, k, j) => s + c[j] * k[ch], 0));

test('nnls recovers a known non-negative recipe exactly', () => {
  const c = [0.3, 0.5, 0.2], { c: got, err } = nnls(K, mix(c), 3);
  for (let j = 0; j < 3; j++) assert.ok(Math.abs(got[j] - c[j]) < 1e-6, `paint ${j}: ${got[j]} vs ${c[j]}`);
  assert.ok(err < 1e-6);
});

test('nnls never returns a negative weight, and drops the paint that would need one', () => {
  // a target that absorbs less red than any paint does: every paint adds red, so the fit is the yellow alone, short
  const r = [-0.1, 0.02, 0.6];
  const { c, err } = nnls(K, r, 3);
  for (let j = 0; j < 3; j++) assert.ok(c[j] >= 0);
  assert.equal(c[1], 0); assert.equal(c[2], 0);
  assert.ok(c[0] > 0.9 && err > 0.1, `yellow ${c[0]}, err ${err}`);
});

test('nnls with a single paint scales it', () => {
  const { c, err } = nnls(K, K[1].map(v => v * 0.7), 3);
  assert.ok(Math.abs(c[1] - 0.7) < 1e-6 && c[0] < 1e-9 && c[2] < 1e-9);
  assert.ok(err < 1e-9);
});

test('mixFor: recipe sums to one, strength is the total, names the paints over two per cent', () => {
  const want = mix([0.2, 0.1, 0]), have = [0, 0, 0];
  const { recipe, strength, names } = mixFor(paints, want, have, { cap: 10 });
  const sum = Array.from(recipe).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Math.abs(strength - 0.3) < 1e-6);
  assert.deepEqual(names, ['67% yellow', '33% red']);
});

test('mixFor: what is already on the sheet is not mixed again, and the cap holds a glaze back', () => {
  const want = mix([0.4, 0, 0.4]), have = mix([0.4, 0, 0]);
  const { recipe, strength } = mixFor(paints, want, have, { cap: 0.25 });
  assert.ok(recipe[2] > 0.99, 'only the blue is still owed');
  assert.equal(strength, 0.25);
});

test('mixFor: nothing owed is an empty recipe with zero strength', () => {
  const d = mix([0.1, 0.1, 0.1]);
  const { strength, names } = mixFor(paints, d, d);
  assert.equal(strength, 0);
  assert.deepEqual(names, []);
});

test('densityOf and chargeOf agree with the recipe', () => {
  const recipe = Float64Array.from([0.5, 0.5, 0]), d = densityOf(paints, recipe, 2);
  const expect = mix([1, 1, 0]);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(d[c] - expect[c]) < 1e-9);
  assert.deepEqual(chargeOf(recipe, 2), [1, 1, 0]);
});
