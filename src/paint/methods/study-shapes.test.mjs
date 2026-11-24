import test from 'node:test';
import assert from 'node:assert/strict';
import { roundMask, kmeans, dilate } from './study-shapes.mjs';

// moved from the layered wash plan's tests (removed in 0.4): the two helpers the study wash plan keeps
test('a brush-rounded mask loses its speck and keeps its body; k-means finds two groups', () => {
  const w = 40, h = 30, m = new Uint8Array(w * h);
  for (let y = 5; y < 25; y++) for (let x = 5; x < 25; x++) m[y * w + x] = 1;
  m[2 * w + 35] = 1;
  const r = roundMask(m, w, h, 2); assert.equal(r[2 * w + 35], 0); assert.equal(r[15 * w + 15], 1);
  const rows = Float32Array.from([0, 0, 0, 1, 1, 1, 10, 10, 10, 11, 11, 11]), c = kmeans(rows, 3, 2);
  assert.equal(c.length, 2); assert.ok(Math.abs(c[0][0] - c[1][0]) > 8);
});

test('a rounded mask is the same bytes as with the mask inverted through Uint8Array.from, as it was', () => {
  const w = 97, h = 61, was = m => Uint8Array.from(m, v => 1 - v), erode = (m, r) => was(dilate(was(m), w, h, r));
  let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
  for (const r of [1, 2, 4]) {
    const m = Uint8Array.from({ length: w * h }, (_, i) => (rnd() < 0.004 || (Math.hypot(i % w - 40, ((i / w) | 0) - 30) < 18 && rnd() < 0.9) ? 1 : 0));
    const ref = dilate(erode(erode(dilate(m, w, h, r), r), r), w, h, r);
    assert.deepEqual(Buffer.from(roundMask(m, w, h, r)), Buffer.from(ref));
    assert.ok(ref.some(v => v) && ref.some(v => !v));
  }
});
