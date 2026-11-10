import test from 'node:test';
import assert from 'node:assert/strict';
import { gradientPlane } from './graded-plane.mjs';

const W = 60;
const block = g => { const list = [], G = new Float32Array(W * 40); for (let y = 5; y < 35; y++) for (let x = 5; x < 55; x++) { const i = y * W + x; list.push(i); G[i] = g(x, y); } return { list, G }; };

test('lanes run across the gradient: the angle follows the level lines of the demand', () => {
  const { list, G } = block((x, y) => 0.2 + y * 0.02);
  const p = gradientPlane(list, G, W);
  assert.ok(Math.abs(Math.sin(p.angle)) < 0.05, `angle ${p.angle}: horizontal lanes for a vertical gradient`);
  assert.ok(p.fit > 0.99);
  assert.ok(Math.abs(p.at(20 * W + 20) - G[20 * W + 20]) < 1e-3);
});

test('a flat passage has no gradient to follow', () => {
  const { list, G } = block(() => 0.5);
  assert.equal(gradientPlane(list, G, W), null);
});

test('a passage the plane does not describe is not graded', () => {
  const { list, G } = block((x, y) => 0.5 + 0.4 * ((x >> 2) % 2 ? 1 : -1) * ((y >> 2) % 2 ? 1 : -1));
  assert.equal(gradientPlane(list, G, W), null);
});

test('a slight slope under the least span is not graded', () => {
  const { list, G } = block((x, y) => 0.5 + y * 0.001);
  assert.equal(gradientPlane(list, G, W), null);
});
