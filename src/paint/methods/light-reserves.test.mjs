import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveLights, validateReserves } from './light-reserves.mjs';

const grid = (w, h, fill = 0) => new Uint8Array(w * h).fill(fill);
const count = m => m.reduce((a, v) => a + v, 0);

test('a reserve is the target light inside its box, not the box', () => {
  const w = 40, h = 40, light = grid(w, h);
  // 3x3 light blob at (20..22, 20..22) inside a 10x10 box [15..25)
  for (let y = 20; y < 23; y++) for (let x = 20; x < 23; x++) light[y * w + x] = 1;
  const r = reserveLights([{ reason: 'catchlight', bounds: [15 / w, 15 / h, 25 / w, 25 / h] }], { w, h, light });
  assert.equal(count(r.mask), 9);
  for (let y = 20; y < 23; y++) for (let x = 20; x < 23; x++) assert.equal(r.mask[y * w + x], 1);
  assert.equal(r.mask[15 * w + 15], 0, 'box corner is not reserved');
  assert.equal(r.mask[24 * w + 24], 0, 'box corner is not reserved');
  assert.deepEqual(r.report, [{ reason: 'catchlight', boxCells: 100, kept: 9 }]);
});

test('a box with no target light reserves nothing and says so', () => {
  const w = 30, h = 30;
  const r = reserveLights([{ reason: 'catchlight, dark eye', bounds: [.2, .2, .4, .4] }], { w, h, light: grid(w, h) });
  assert.equal(count(r.mask), 0);
  assert.equal(r.report[0].kept, 0);
  assert.equal(r.report[0].boxCells, 36);
});

test('a box that is all light reserves the whole box', () => {
  const w = 30, h = 30;
  const r = reserveLights([{ reason: 'cloud', bounds: [0, 0, .5, .5] }], { w, h, light: grid(w, h, 1) });
  assert.equal(count(r.mask), 225);
});

test('light outside every box is not reserved; boxes clip at the sheet edge', () => {
  const w = 20, h = 20, light = grid(w, h, 1);
  const r = reserveLights([{ reason: 'edge', bounds: [.8, .8, 1, 1] }], { w, h, light });
  assert.equal(count(r.mask), 16);
  assert.equal(r.mask[0], 0);
  assert.equal(r.mask[19 * w + 19], 1);
});

test('two reserves add up; an empty list reserves nothing', () => {
  const w = 40, h = 20, light = grid(w, h, 1);
  const r = reserveLights([{ reason: 'a', bounds: [0, 0, .25, .5] }, { reason: 'b', bounds: [.75, .5, 1, 1] }], { w, h, light });
  assert.equal(count(r.mask), 100 + 100);
  assert.equal(count(reserveLights([], { w, h, light }).mask), 0);
});

test('validateReserves rejects malformed reserves', () => {
  for (const bad of [{ bounds: [0, 0, 1, 1] }, { reason: 'x', bounds: [0, 0, 1] }, { reason: 'x', bounds: [0, 0, 1, 2] }, { reason: 'x', bounds: [.5, 0, .5, 1] }, { reason: 'x', bounds: [0, .6, 1, .4] }, { reason: 'x' }]) {
    assert.throws(() => validateReserves([bad]), /invalid explicit light reserve/);
  }
  assert.doesNotThrow(() => validateReserves([{ reason: 'ok', bounds: [0, 0, .5, .5] }]));
});
