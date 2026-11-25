import test from 'node:test';
import assert from 'node:assert/strict';
import { tintedWhites, readFrom } from './study-whites.mjs';

const shapes = [{ cells: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }, { cells: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] }, { cells: [20, 21] }];
const white = () => [97, 0, 1], paleBlue = () => [88, -2, -9];
// a study that tints the first `n` cells of each ten
const partly = n => q => (q % 10 < n ? paleBlue() : white());
const ask = (richer, share = 0.7) => tintedWhites({ shapes, lights: [0, 1], richer, share, paperL: 91, paperC: 7 });

test('a white of the block-in that every richer study tints is washed; one a richer study keeps white stays paper', () => {
  assert.deepEqual(ask([paleBlue, paleBlue]), [0, 1]);
  assert.deepEqual(ask([paleBlue, white]), [], 'the fine study keeps it white');
  assert.deepEqual(ask([q => (q < 10 ? paleBlue() : white())]), [0]);
  assert.deepEqual(ask([]), [], 'a block-in alone: its whites are the lights');
});

test('the share of a white the richer studies must tint is a setting; above 1 none is washed', () => {
  assert.deepEqual(ask([partly(7)]), [0, 1]);
  assert.deepEqual(ask([partly(6)]), []);
  assert.deepEqual(ask([partly(6)], 0.5), [0, 1]);
  assert.deepEqual(ask([paleBlue], 2), []);
});

test('a tint is a darker cell or a more chromatic one', () => {
  assert.deepEqual(ask([() => [89, 0, 0]]), [0, 1]);
  assert.deepEqual(ask([() => [95, 0, 9]]), [0, 1]);
  assert.deepEqual(ask([() => [95, 0, 5]]), []);
});

test('the washed whites are read from the other study; every other cell is the block-in\'s', () => {
  const grid = new Uint8ClampedArray(22 * 3).fill(255), from = new Uint8ClampedArray(22 * 3).fill(200);
  const out = readFrom(grid, from, shapes, [1]);
  assert.ok(shapes[1].cells.every(q => out[q * 3] === 200 && out[q * 3 + 2] === 200));
  assert.ok([...shapes[0].cells, ...shapes[2].cells].every(q => out[q * 3] === 255));
  assert.equal(grid[30], 255, 'the block-in grid itself is not changed');
});
