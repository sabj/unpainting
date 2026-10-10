// gaussian on the thread pool is the serial gaussian, bit for bit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gaussian } from './density.mjs';
import { setThreads } from '../media/sheet.mjs';

test('threaded gaussian equals serial gaussian', async () => {
  let s = 17; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const w = 300, h = 260, src = Float32Array.from({ length: w * h }, () => rnd() * 2);
  const serial = [1.5, 6, 20].map(sigma => gaussian(src, w, h, sigma));
  try {
    assert.ok(await setThreads(3) > 1);
    [1.5, 6, 20].forEach((sigma, q) => {
      const par = gaussian(src, w, h, sigma);
      for (let i = 0; i < par.length; i++) assert.ok(Object.is(par[i], serial[q][i]), `sigma ${sigma} cell ${i}`);
    });
  } finally { await setThreads(1); }
});
