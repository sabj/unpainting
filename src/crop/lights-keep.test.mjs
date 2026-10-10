// The reserve keeps the lights a painter would mask and drops the dust.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keepLargestLights } from './lights.mjs';

const W = 40, H = 40;
const sheet = () => {
  const m = new Uint8Array(W * H);
  for (let y = 5; y < 9; y++) for (let x = 5; x < 9; x++) m[y * W + x] = 1; // a catchlight, 16 cells
  for (let y = 20; y < 22; y++) for (let x = 20; x < 26; x++) m[y * W + x] = 1; // a whisker, 12 cells
  for (const i of [100, 305, 712, 913, 1111]) m[i] = 1; // dust, one cell each
  return m;
};

test('one-cell specks are dropped and the real lights kept', () => {
  const { mask, kept, dropped } = keepLargestLights(sheet(), W, H, { min: 2, max: 24 });
  assert.equal(kept, 2);
  assert.equal(dropped, 5);
  assert.equal(mask[6 * W + 6], 1);
  assert.equal(mask[20 * W + 21], 1);
  assert.equal(mask[100], 0);
});

test('at most max lights survive, largest first', () => {
  const { mask, kept } = keepLargestLights(sheet(), W, H, { min: 1, max: 1 });
  assert.equal(kept, 1);
  assert.equal(mask[6 * W + 6], 1);
  assert.equal(mask[20 * W + 21], 0);
});
