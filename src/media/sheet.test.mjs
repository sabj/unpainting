import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, soak, step, blot, DEFAULTS } from './sheet.mjs';

const pigments = [{ K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 }];
const wetBlock = (w = 64) => {
  const sheet = createSheet(makePaper(w, w, { seed: 5 }), pigments);
  for (let y = 16; y < 48; y++) for (let x = 16; x < 48; x++) deposit(sheet, y * w + x, 0.8, [0.05]);
  step(sheet);
  return sheet;
};

test('a tissue takes its share of the film and of the pigment in it, and nothing beside it', () => {
  const sheet = wetBlock(), w = sheet.w;
  const mask = new Uint8Array(sheet.n);
  for (let y = 16; y < 48; y++) for (let x = 16; x < 32; x++) mask[y * w + x] = 1;   // half the block
  const W0 = Float32Array.from(sheet.W), G0 = Float32Array.from(sheet.G[0]);
  const s0 = Float32Array.from(sheet.s), P0 = Float32Array.from(sheet.P[0]), D0 = Float32Array.from(sheet.D[0]);
  const strength = 0.5, pigmentShare = 0.75;
  const taken = blot(sheet, mask, { strength, pigmentShare });
  let water = 0, pigment = 0, pressed = 0;
  for (let i = 0; i < sheet.n; i++) {
    const wet = mask[i] && sheet.M[i] && W0[i] >= DEFAULTS.film;
    if (wet) {
      assert.ok(Math.abs(sheet.W[i] - W0[i] * (1 - strength)) < 1e-7, `water left at ${i}`);
      assert.ok(Math.abs(sheet.G[0][i] - G0[i] * (1 - pigmentShare)) < 1e-7, `pigment left at ${i}`);
      water += W0[i] * strength; pigment += G0[i] * pigmentShare; pressed++;
    } else {
      assert.equal(sheet.W[i], W0[i], `water changed outside the tissue at ${i}`);
      assert.equal(sheet.G[0][i], G0[i], `pigment changed outside the tissue at ${i}`);
    }
    assert.equal(sheet.s[i], s0[i], `pore water changed at ${i}`);
    assert.equal(sheet.P[0][i], P0[i], `pore pigment changed at ${i}`);
    assert.equal(sheet.D[0][i], D0[i], `deposit changed at ${i}`);
  }
  assert.ok(pressed > 0, 'the tissue found no wet cells to press');
  assert.ok(Math.abs(taken.water - water) < 1e-5, `${taken.water} != ${water}`);
  assert.ok(Math.abs(taken.pigment[0] - pigment) < 1e-6, `${taken.pigment[0]} != ${pigment}`);
});

test('a tissue on paper with no film takes nothing, dry or damp', () => {
  const sheet = createSheet(makePaper(32, 32, { seed: 5 }), pigments);
  for (let i = 0; i < 64; i++) soak(sheet, i, 0.01, [0.02]);   // into the pores, nothing standing
  const mask = new Uint8Array(sheet.n).fill(1);
  const s0 = Float32Array.from(sheet.s), P0 = Float32Array.from(sheet.P[0]), D0 = Float32Array.from(sheet.D[0]);
  const taken = blot(sheet, mask, { strength: 1, pigmentShare: 1 });
  assert.equal(taken.water, 0);
  assert.equal(taken.pigment[0], 0);
  assert.ok(sheet.W.every(v => v === 0));
  assert.deepEqual(sheet.s, s0);
  assert.deepEqual(sheet.P[0], P0);
  assert.deepEqual(sheet.D[0], D0);
});

test('a blot mask has to cover the sheet, and its shares have to be fractions', () => {
  const sheet = createSheet(makePaper(16, 16, { seed: 5 }), pigments);
  assert.throws(() => blot(sheet, new Uint8Array(4)), RangeError);
  for (const bad of [-0.1, 1.5, NaN]) {
    assert.throws(() => blot(sheet, new Uint8Array(sheet.n), { strength: bad }), RangeError);
    assert.throws(() => blot(sheet, new Uint8Array(sheet.n), { pigmentShare: bad }), RangeError);
  }
});
