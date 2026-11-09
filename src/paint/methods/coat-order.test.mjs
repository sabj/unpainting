import test from 'node:test';
import assert from 'node:assert/strict';
import { coatTally } from './coat-order.mjs';

const cells = (w, x0, y0, x1, y1) => { const out = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push(y * w + x); return out; };

test('coats over the same place are numbered in the order they are laid, whatever their pigment or band', () => {
  const t = coatTally(100), plane = cells(10, 0, 0, 10, 10);
  assert.deepEqual([0, 1, 2, 3].map(() => t.lay(plane)), [0, 1, 2, 3]);
});

test('a coat counts the coats already lying under it, not coats laid elsewhere', () => {
  const t = coatTally(100), left = cells(10, 0, 0, 5, 10), right = cells(10, 5, 0, 10, 10), whole = cells(10, 0, 0, 10, 10);
  assert.equal(t.lay(left), 0);
  assert.equal(t.lay(left), 1);
  assert.equal(t.lay(right), 0, 'nothing lies on the right half yet');
  assert.equal(t.lay(whole), 2, 'half the plane carries two coats and half one: one and a half on average, rounded to two');
  assert.equal(t.lay(whole), 3);
});

test('a plane that differs from the one under it by a few edge cells still continues its count', () => {
  const t = coatTally(400), a = cells(20, 0, 0, 20, 20), b = cells(20, 1, 0, 20, 20);
  t.lay(a); t.lay(a);
  assert.equal(t.lay(b), 2);
});

test('an empty passage gets coat 0 and changes nothing', () => {
  const t = coatTally(10);
  assert.equal(t.lay([]), 0);
  assert.equal(t.lay([3]), 0);
});
