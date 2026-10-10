// unmix on the thread pool is the serial unmix, bit for bit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { unmix } from './pigments.mjs';
import { setThreads } from '../media/sheet.mjs';

test('threaded unmix equals serial unmix', async () => {
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const n = 30000, D = Float32Array.from({ length: n * 3 }, () => rnd() * 1.5);
  const pig = [[0.9, 0.5, 0.2], [0.2, 0.7, 0.9], [0.5, 0.5, 0.5], [0.1, 0.3, 0.8], [0.7, 0.2, 0.3], [0.4, 0.6, 0.2]];
  const serial = unmix(D, n, pig);
  try {
    assert.ok(await setThreads(3) > 1);
    const par = unmix(D, n, pig);
    assert.equal(par.length, serial.length);
    for (let i = 0; i < par.length; i++) assert.ok(Object.is(par[i], serial[i]), `value ${i}`);
  } finally { await setThreads(1); }
});
