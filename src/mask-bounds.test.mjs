import test from 'node:test';
import assert from 'node:assert/strict';
import { boundsOf } from './mask-bounds.mjs';

const plain = (M, w, h) => {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) { const r = y * w; for (let x = 0; x < w; x++) if (M[r + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  return x1 < 0 ? { x0: 0, y0: 0, x1: -1, y1: -1 } : { x0, y0, x1, y1 };
};

test('boundsOf matches the plain walk on random, sparse, empty and offset masks', () => {
  let s = 99; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 400; t++) {
    const w = 1 + Math.floor(rnd() * 70), h = 1 + Math.floor(rnd() * 50), n = w * h;
    const off = t % 3 === 0 ? 1 : 0, buf = new Uint8Array(n + 8), M = buf.subarray(off, off + n);
    const density = [0, 0.001, 0.02, 0.3][t % 4];
    for (let i = 0; i < n; i++) M[i] = rnd() < density ? 1 : 0;
    if (t % 5 === 0 && n) M[Math.floor(rnd() * n)] = 1;
    assert.deepEqual(boundsOf(M, w, h), plain(M, w, h));
    const A = Array.from(M);
    assert.deepEqual(boundsOf(A, w, h), plain(A, w, h));
  }
});
