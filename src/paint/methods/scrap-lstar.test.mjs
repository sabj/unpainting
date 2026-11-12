import test from 'node:test';
import assert from 'node:assert/strict';
import { lstarOf, darkerBy } from './scrap-lstar.mjs';

const pigment = { K: [0.25, 0.8, 1.5], S: [0.05, 0.04, 0.03], rho: 0.06, omega: 1, gamma: 0.5 };
test('bare paper is the paper\'s own L*, more paint is darker, and darkerBy reads the difference', () => {
  assert.ok(Math.abs(lstarOf(0, pigment) - 98.8) < 1, `paper L* ${lstarOf(0, pigment)}`);
  assert.ok(lstarOf(0.3, pigment) < lstarOf(0.1, pigment));
  assert.ok(darkerBy(0.31, 0.30, pigment) > 0 && darkerBy(0.30, 0.31, pigment) < 0);
});
