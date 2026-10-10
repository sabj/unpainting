import test from 'node:test';
import assert from 'node:assert/strict';
import { clipRuns } from './sheet.mjs';

const plain = mask => { const r = []; for (let i = 0; i < mask.length; i++) if (mask[i]) { const s = i; while (i < mask.length && mask[i]) i++; r.push(s, i - s); } return r; };

test('clipRuns matches the plain run walk', () => {
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 500; t++) {
    const n = Math.floor(rnd() * 300), off = t % 4, buf = new Uint8Array(n + 8), M = buf.subarray(off, off + n);
    const p = [0, 0.02, 0.5, 0.97, 1][t % 5];
    let on = rnd() < p;
    for (let i = 0; i < n; i++) { if (rnd() < 0.1) on = rnd() < p; M[i] = on ? 1 + Math.floor(rnd() * 3) : 0; }
    assert.deepEqual(clipRuns(M), plain(M));
    assert.deepEqual(clipRuns(Array.from(M)), plain(Array.from(M)));
  }
});
