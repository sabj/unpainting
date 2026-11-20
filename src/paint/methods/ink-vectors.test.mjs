import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterizeRings, inkForDarkness, layVectors } from './ink-vectors.mjs';

const square = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];

test('rasterise: a square covers its cells, its edge cells in part, a hole is left open', () => {
  const r = rasterizeRings([square(1, 1, 2)], 10, 10, 0.5);
  const sum = r.cov.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 16) < 0.01, `area ${sum}`);
  const half = rasterizeRings([square(1.25, 1, 2)], 10, 10, 0.5);
  assert.ok(Math.max(...half.cov) === 1 && half.cov.some(v => v > 0.4 && v < 0.6), 'an edge through a cell covers it in part');
  const ring = rasterizeRings([square(0, 0, 4), square(1, 1, 2)], 10, 10, 0.5);
  assert.ok(Math.abs(ring.cov.reduce((a, b) => a + b, 0) - 48) < 0.01, 'even-odd: the inner square is a hole');
});

test('ink for darkness: the inverse of the ink\'s own darkness curve', () => {
  const darkOf = t => 1 - Math.exp(-t / 3), inkOf = inkForDarkness(darkOf);
  for (const d of [0.1, 0.5, 0.9]) assert.ok(Math.abs(darkOf(inkOf(d)) - d) < 0.01);
  assert.equal(inkOf(0), 0);
});

test('lay: strokes in order, the darker holds where two meet, nothing outside the outlines', () => {
  const doc = { strokes: [{ seq: 1, dark: 0.4, outline: [square(0, 0, 2)] }, { seq: 0, dark: 0.9, outline: [square(1, 0, 2)] }] };
  const f = new Float32Array(100), order = [];
  layVectors(doc, f, 10, 10, 0.5, d => d, { each: s => order.push(s.seq) });
  assert.deepEqual(order, [0, 1]);
  assert.ok(Math.abs(f[0] - 0.4) < 1e-6 && Math.abs(f[3] - 0.9) < 1e-6 && f[7] === 0 && f[50] === 0);
});

test('lay over ink already there: the darker holds, nothing is taken away', () => {
  const f = new Float32Array(100).fill(0.5), doc = { strokes: [{ seq: 0, dark: 0.3, outline: [square(0, 0, 2)] }, { seq: 1, dark: 0.9, outline: [square(2, 0, 2)] }] };
  layVectors(doc, f, 10, 10, 0.5, d => d);
  assert.ok(Math.abs(f[0] - 0.5) < 1e-6 && Math.abs(f[5] - 0.9) < 1e-6 && f[50] === 0.5);
});
