import test from 'node:test';
import assert from 'node:assert/strict';
import { liftResist } from './sheet.mjs';

function fixture(seed, strength) {
  let state = seed;
  const rnd = () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296);
  const n = 119, K = 3, plane = () => Float32Array.from({ length: n }, () => rnd() < .2 ? -0 : rnd() * 2);
  const sheet = { n, K, W: plane(), s: plane(), M: Uint8Array.from({ length: n }, () => rnd() < .5 ? 1 : 0), G: Array.from({ length: K }, plane), D: Array.from({ length: K }, plane), P: Array.from({ length: K }, plane),
    layers: Array.from({ length: 7 }, () => Array.from({ length: K }, plane)), resist: Uint8Array.from({ length: n }, () => rnd() < .7 ? 1 : 0), resistFrom: seed % 8,
    resistStrength: strength ? Float32Array.from({ length: n }, (_, i) => i % 19 === 0 ? NaN : i % 17 === 0 ? -Infinity : i % 13 === 0 ? Infinity : rnd() * 1.5 - .1) : null };
  // Empty layer planes are shared, and repeated plane references must still
  // receive the same number of partial-strength multiplications.
  sheet.layers[1][0] = sheet.layers[4][2];
  sheet.layers[2][1] = sheet.G[1];
  return sheet;
}

test('plane-wise film removal preserves every float bit, masking metadata and old layers', () => {
  for (let seed = 0; seed < 40; seed++) for (const strength of [false, true]) {
    const before = fixture(seed, strength), after = fixture(seed, strength);
    liftResist(before); liftResist(after, { byPlane: true });
    for (const key of ['W', 's', 'M', 'G', 'D', 'P', 'layers']) {
      const planes = key === 'layers' ? before[key].flat() : ['G', 'D', 'P'].includes(key) ? before[key] : [before[key]];
      const actual = key === 'layers' ? after[key].flat() : ['G', 'D', 'P'].includes(key) ? after[key] : [after[key]];
      for (let j = 0; j < planes.length; j++) assert.deepEqual(new Uint8Array(actual[j].buffer), new Uint8Array(planes[j].buffer), key + ' seed ' + seed);
    }
    assert.equal(after.resist, null); assert.equal(after.resistFrom, null); assert.equal(after.resistStrength, null);
    assert.equal(after._layerVer, before._layerVer);
  }
});
