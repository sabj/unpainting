import test from 'node:test';
import assert from 'node:assert/strict';
import { leaveTouchUp } from './touch-cover.mjs';

test('a touch-up dab that reaches a small share of its shape is left out', () => {
  assert.equal(leaveTouchUp({ touched: 1, cover: 0.04, minCover: 0.3 }), true);
});

test('a touch-up that covers its shape, any ladder passage, and the off setting are laid', () => {
  assert.equal(leaveTouchUp({ touched: 1, cover: 0.95, minCover: 0.3 }), false);
  assert.equal(leaveTouchUp({ touched: undefined, cover: 0.04, minCover: 0.3 }), false);
  assert.equal(leaveTouchUp({ touched: 1, cover: 0.04, minCover: 0 }), false);
});
