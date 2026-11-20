import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterizeRings, inkForDarkness, layVectors, isFill } from './ink-vectors.mjs';

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

test('fills: a blot is a fill, a line is not; under paint a fill is one pale shape, no rim, and a line through it stays full', () => {
  const blot = { seq: 0, dark: 1, outline: [square(1, 1, 3)], path: [[2.5, 2.5], [2.6, 2.6]] }, line = { seq: 1, dark: 1, outline: [[[1, 6], [9, 6], [9, 6.3], [1, 6.3]]] };
  assert.ok(isFill(blot) && !isFill(line));
  const f = new Float32Array(400), r = layVectors({ strokes: [blot, line] }, f, 20, 20, 0.5, d => d, { fill: 0.25 });
  assert.equal(r.fills, 1);
  const at = (x, y) => f[Math.floor(y / 0.5) * 20 + Math.floor(x / 0.5)];
  assert.ok(at(1.1, 2.5) <= 0.25 && at(1.1, 2.5) > 0, 'no dark rim: the edge no darker than the inside');
  assert.ok(Math.abs(at(2.6, 2.6) - 0.25) < 1e-6, 'its inside at a quarter');
  assert.ok(at(5, 6.1) >= 0.45, 'the line at its full darkness, not lightened');
  // a swelling on a branch: a fill whose path runs well past its width keeps the line through it at full strength
  const branch = { seq: 0, dark: 1, outline: [[[1, 1], [9, 1], [9, 2.2], [1, 2.2]]], path: [[1, 1.6], [9, 1.6]] }, g = new Float32Array(400);
  layVectors({ strokes: [branch] }, g, 20, 20, 0.5, d => d, { fill: 0.25 });
  assert.ok(g[3 * 20 + 8] >= 0.99 && g[2 * 20 + 8] <= 0.26, 'the line through the swelling full, the rest of it pale');
});
