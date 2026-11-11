import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readbackAmount } from './link.mjs';

test('a GPU readback a float32 step below zero is zero; further below is a fault, said loudly', () => {
  assert.equal(readbackAmount(0.27, 0.45, 'hair water'), 0.27);
  assert.equal(readbackAmount(-4.6e-10, 0.45, 'hair pigment'), 0); // seen on Mittens: float32 rounding after pickup
  assert.throws(() => readbackAmount(-1e-4, 0.45, 'hair pigment'), /below zero by more than float32 rounding/);
  assert.throws(() => readbackAmount(NaN, 0.45, 'hair water'), /below zero/);
});
