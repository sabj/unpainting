import test from 'node:test';
import assert from 'node:assert/strict';
import { roundMask, kmeans } from './study-shapes.mjs';

// moved from the layered wash plan's tests (removed in 0.4): the two helpers the study wash plan keeps
test('a brush-rounded mask loses its speck and keeps its body; k-means finds two groups', () => {
  const w = 40, h = 30, m = new Uint8Array(w * h);
  for (let y = 5; y < 25; y++) for (let x = 5; x < 25; x++) m[y * w + x] = 1;
  m[2 * w + 35] = 1;
  const r = roundMask(m, w, h, 2); assert.equal(r[2 * w + 35], 0); assert.equal(r[15 * w + 15], 1);
  const rows = Float32Array.from([0, 0, 0, 1, 1, 1, 10, 10, 10, 11, 11, 11]), c = kmeans(rows, 3, 2);
  assert.equal(c.length, 2); assert.ok(Math.abs(c[0][0] - c[1][0]) > 8);
});
