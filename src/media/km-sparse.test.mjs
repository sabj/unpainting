import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCells} from './km.mjs';

test('sparse optical reductions preserve unrounded doubles, boundaries and microtexture', () => {
  const n = 8211, K = 17;
  let seed = 71;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const Kp = Array.from({length: K}, (_, k) => [k ? random() : 0, random(), random()]);
  const Sp = Array.from({length: K}, (_, k) => [random(), k ? random() : 0, random()]);
  const paper = Uint8Array.from({length: n * 3}, () => 190 + random() * 65);
  const init = Float64Array.from(paper, v => v / 255);
  const prior = process.env.KM_SPARSE_CHANNELS;
  try {
    for (const density of [0, 0.02, 0.2, 1]) {
      const layers = Array.from({length: 3}, () => Array.from({length: K}, () => Float32Array.from({length: n}, () => random() < density ? random() * 0.2 : -0)));
      for (const micro of [null, {t: Float32Array.from({length: n}, () => random() * 2 - 1), amp: Array.from({length: K}, () => random() * 0.7)}]) {
        const run = mode => {
          process.env.KM_SPARSE_CHANNELS = mode;
          const out = new Uint8ClampedArray(n * 3), keep = new Float64Array(init);
          renderCells(layers, Kp, Sp, paper, 3, n - 2, 1.37, (i, c) => 0.98 + ((i + c) % 3) * 0.01, out, keep, keep, micro);
          return {out, doubles: Buffer.from(keep.buffer)};
        };
        assert.deepEqual(run('1'), run('0'), `density=${density}, micro=${!!micro}`);
      }
    }
    // Invalid coefficients must retain the reference's zero-times-infinity/NaN behavior.
    Kp[0][0] = Infinity; Sp[0][1] = NaN;
    const layer = Array.from({length: K}, (_, k) => Float32Array.from({length: n}, () => k === 1 ? 0.02 : 0));
    const result = mode => { process.env.KM_SPARSE_CHANNELS = mode; const keep = new Float64Array(n * 3); renderCells([layer], Kp, Sp, paper, 0, n, 1, null, null, null, keep); return Buffer.from(keep.buffer); };
    assert.deepEqual(result('1'), result('0'));
  } finally {
    if (prior === undefined) delete process.env.KM_SPARSE_CHANNELS; else process.env.KM_SPARSE_CHANNELS = prior;
  }
});
