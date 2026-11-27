import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForDamp } from './wash-state.mjs';

test('a low mean does not certify a damp drop footprint when a glossy patch remains', () => {
  const make = () => ({ W: [0.005, 0.045], s: [0.2, 0.2], paper: { capacity: [1, 1] } });
  const O = { dt: 1, film: 0.03, wetEps: 0.001 };
  const mean = waitForDamp(make(), [0, 1], O, () => { throw new Error('the legacy mean is already ready'); });
  assert.equal(mean.time, 0); assert.equal(mean.dampFraction, 0.5);
  const footprint = waitForDamp(make(), [0, 1], O, sheet => { sheet.W[1] = 0.02; }, 3, { dampFraction: 0.95, wetFraction: 0.99 });
  assert.equal(footprint.time, 1); assert.equal(footprint.dampFraction, 1); assert.equal(footprint.wetFraction, 1);
  assert.equal(footprint.minFilm, 0.005); assert.equal(footprint.maxFilm, 0.02);
});

test('a mostly dry footprint or an unachievable damp fraction stops the material test', () => {
  const sheet = { W: [0, 0.01], s: [0.2, 0.2], paper: { capacity: [1, 1] } }, O = { dt: 1, film: 0.03, wetEps: 0.001 };
  assert.throws(() => waitForDamp(sheet, [0, 1], O, () => {}, 2, { dampFraction: 0.95, wetFraction: 0.99 }), /did not reach damp state/);
  assert.throws(() => waitForDamp(sheet, [0, 1], O, () => {}, 2, { dampFraction: 2 }), /between zero and one/);
});
