import test from 'node:test';
import assert from 'node:assert/strict';
import { joinDomainFragments } from './wash-join.mjs';

// A 20x10 band mask split into two domains (left 1, right 2) with a 2x2 island of domain 3 inside domain 1.
const grid = () => {
  const w = 20, h = 10, mask = new Uint8Array(w * h).fill(1), dom = new Int32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dom[y * w + x] = x < 10 ? 1 : 2;
  for (const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]]) dom[y * w + x] = 3;
  return { w, h, mask, dom };
};

test('a domain piece under the minimum shape joins the passage around it instead of leaving a hole', () => {
  const { w, h, mask, dom } = grid();
  const key = joinDomainFragments(mask, w, h, i => dom[i], 10);
  assert.equal(key[4 * w + 4], 1);
  assert.equal([...key].filter(k => k === 3).length, 0);
  // every painted cell still belongs to some passage
  assert.ok([...key].every(k => k > 0));
});

test('pieces at or over the minimum shape and cells the step does not paint are left alone', () => {
  const { w, h, mask, dom } = grid();
  mask[0] = 0;
  const key = joinDomainFragments(mask, w, h, i => dom[i], 4);
  assert.equal(key[4 * w + 4], 3, 'a 4-cell piece at minArea 4 keeps its own domain');
  assert.equal(key[0], -1);
  assert.equal(key[w * h - 1], 2);
});

test('an isolated small piece with no painted neighbour keeps its own domain', () => {
  const w = 10, h = 10, mask = new Uint8Array(w * h);
  mask[55] = 1;
  const key = joinDomainFragments(mask, w, h, () => 7, 10);
  assert.equal(key[55], 7);
});
