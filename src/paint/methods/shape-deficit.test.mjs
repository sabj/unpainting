import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeDeficit, shapeCharge, shapeOwedColour } from './shape-deficit.mjs';

test('single pigment: the gap between the shape means, never negative', () => {
  assert.ok(Math.abs(shapeDeficit([0.5, 0.2], [0.3, 0.9], { pigment: 0 }) - 0.2) < 1e-12);
  assert.equal(shapeDeficit([0.5, 0.2], [0.3, 0.9], { pigment: 1 }), 0);
});

test('a mix: the mean gap along the mix direction', () => {
  // 0.4 and 0.2 still owed along a 2:1 mix is 0.6 of the puddle
  assert.ok(Math.abs(shapeDeficit([0.6, 0.3, 0], [0.2, 0.1, 0], { mix: [2 / 3, 1 / 3, 0] }) - 0.6) < 1e-9);
});

test('charge: lack over asked, 0 to 2, 1 when the plan asked nothing', () => {
  assert.equal(shapeCharge(0.1, 0.2), 0.5);
  assert.equal(shapeCharge(1, 0.1), 2);
  assert.equal(shapeCharge(0.3, 0), 1);
});

test('owed colour per pigment from the shape means', () => {
  assert.deepEqual(shapeOwedColour([0.5, 0.1], [0.2, 0.3]).map(v => +v.toFixed(6)), [0.3, 0]);
});
