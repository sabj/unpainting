import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSoftCells, gradientAngle } from './soft-edge-choice.mjs';

const W = 60, H = 40;
const idx = (x, y) => y * W + x;
const column = x => Array.from({ length: H }, (_, y) => idx(x, y));

test('an edge is soft where the layer fades out and the target has no step', () => {
  const G = new Float32Array(W * H).fill(0.05), values = new Float32Array(W * H).fill(0.3);
  const s = chooseSoftCells({ candidates: column(20), G, amount: 1, values, w: W, h: H, cellMm: 0.5 });
  assert.equal(s.soft.length, H);
  assert.equal(s.hard.length, 0);
});

test('a layer at full strength on its boundary keeps a hard edge, however low the contrast', () => {
  const G = new Float32Array(W * H).fill(1), values = new Float32Array(W * H).fill(0.3);
  const s = chooseSoftCells({ candidates: column(20), G, amount: 1, values, w: W, h: H, cellMm: 0.5 });
  assert.equal(s.soft.length, 0);
  assert.equal(s.hard.length, H);
});

test('a sharp step in the target keeps a hard edge even where the layer fades', () => {
  const G = new Float32Array(W * H).fill(0.05), values = Float32Array.from({ length: W * H }, (_, i) => (i % W > 21 ? 0.8 : 0.2));
  const s = chooseSoftCells({ candidates: column(21), G, amount: 1, values, w: W, h: H, cellMm: 0.5 });
  assert.equal(s.soft.length, 0);
});

test('the same value change spread over several millimetres reads as a gradual turn, so it may go soft', () => {
  const G = new Float32Array(W * H).fill(0.05), values = Float32Array.from({ length: W * H }, (_, i) => 0.2 + 0.05 * Math.min(12, Math.max(0, i % W - 14)));
  const s = chooseSoftCells({ candidates: column(20), G, amount: 1, values, w: W, h: H, cellMm: 0.5 });
  assert.equal(s.soft.length, H);
});

test('a few stray cells are not a soft edge: a chain must be long enough to read', () => {
  const G = new Float32Array(W * H).fill(0.05), values = new Float32Array(W * H).fill(0.3);
  const s = chooseSoftCells({ candidates: column(20).slice(0, 3), G, amount: 1, values, w: W, h: H, cellMm: 0.5 });
  assert.equal(s.soft.length, 0);
  assert.equal(s.hard.length, 3);
});

test('lanes run across the gradient: the angle follows the iso-lines of the passage demand', () => {
  const list = [], G = new Float32Array(W * H);
  for (let y = 5; y < 35; y++) for (let x = 5; x < 55; x++) { const i = idx(x, y); list.push(i); G[i] = 0.2 + y * 0.02; }
  const a = gradientAngle(list, G, W, { minSpan: 0.1 });
  assert.ok(Math.abs(Math.sin(a)) < 0.05, `angle ${a}: horizontal lanes for a vertical gradient`);
});

test('a flat passage has no gradient to follow', () => {
  const list = [], G = new Float32Array(W * H);
  for (let y = 5; y < 35; y++) for (let x = 5; x < 55; x++) { const i = idx(x, y); list.push(i); G[i] = 0.5; }
  assert.equal(gradientAngle(list, G, W, { minSpan: 0.1 }), null);
});
