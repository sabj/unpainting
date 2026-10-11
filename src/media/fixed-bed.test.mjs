import test from 'node:test';
import assert from 'node:assert/strict';
import { fixedBedLower } from './fixed-bed.mjs';

test('empty-plane skipping retains float32 bed sums and excludes the liftable top', () => {
  let state = 71;
  const rnd = () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296);
  for (let trial = 0; trial < 100; trial++) {
    const n = 143, zero = new Float32Array(n);
    const sheet = { n, _zeroLayer: zero, layers: Array.from({ length: trial % 13 }, () => Array.from({ length: 8 }, () => rnd() < .7 ? zero : Float32Array.from({ length: n }, () => (rnd() - .5) * 2 ** Math.floor(rnd() * 200 - 100)))) };
    const before = fixedBedLower(sheet), after = fixedBedLower(sheet, { skipEmpty: true });
    assert.deepEqual(new Uint8Array(after.buffer), new Uint8Array(before.buffer));
    if (sheet.layers.length) {
      sheet.layers.at(-1)[0] = new Float32Array(n).fill(10000);
      assert.deepEqual(fixedBedLower(sheet, { skipEmpty: true }), before);
    }
  }
});

test('edited shared-zero planes fall back to the complete sum, including signed zero and NaN', () => {
  const zero = new Float32Array(4), sheet = { n: 4, _zeroLayer: zero, layers: [[Float32Array.of(-0, 2, -2, NaN), zero], [zero, zero], [Float32Array.of(7, 7, 7, 7)]] };
  for (const value of [0, -0, .1, NaN, Infinity]) {
    zero[0] = value;
    const before = fixedBedLower(sheet), after = fixedBedLower(sheet, { skipEmpty: true });
    assert.deepEqual(new Uint8Array(after.buffer), new Uint8Array(before.buffer));
  }
  const short = new Float32Array(2), invalid = { n: 4, _zeroLayer: short, layers: [[short], [zero]] };
  assert.deepEqual(fixedBedLower(invalid, { skipEmpty: true }), fixedBedLower(invalid));
});
