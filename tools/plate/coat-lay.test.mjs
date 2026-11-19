// The brush's load for a coat stroke: paste and tint for a light, the strand's own paint over the ground for a dark.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lightLoad, darkLoad, LOAD, DEPOSIT } from './coat-lay.mjs';
import { GOUACHE_FILM, tintedGouache } from '../../src/media/gouache.mjs';

const palette = [{ K: [1.6, 1.5, 1.2] }, { K: [0.4, 0.8, 2.2] }, { K: [0.2, 0.7, 1.9] }];
const PAPER = [252, 251, 248];

test('a light stroke is loaded with white paste and the pot of tint in the share its colour asks for', () => {
  const pot = tintedGouache([170, 175, 190], PAPER);
  const mid = lightLoad({ rgb: [170, 175, 190] }, PAPER, pot, 3, 4, 5).conc;
  assert.equal(mid.length, 5); assert.ok(Math.abs(mid[3] + mid[4] - GOUACHE_FILM * LOAD) < 1e-6, 'one paste in all');
  assert.ok(mid[4] > 0.9 * GOUACHE_FILM * LOAD, 'the pot as it is for the colour it was made for');
  const lighter = lightLoad({ rgb: [235, 235, 238] }, PAPER, pot, 3, 4, 5).conc;
  assert.ok(lighter[3] > lighter[4], 'a lighter strand takes more white');
  const white = lightLoad({ rgb: [250, 250, 247] }, PAPER, pot, 3, 4, 5).conc;
  assert.ok(white[4] < 0.05 * GOUACHE_FILM * LOAD, 'a true white takes none of the tint');
  assert.equal(lightLoad({ rgb: null }, PAPER, pot, 3, 4, 5).conc[4], 0);
});

test('a dark stroke adds what the strand needs over the ground, and nothing where the ground is already as dark', () => {
  const strand = [1.2, 1.3, 1.4], ground = [0.3, 0.3, 0.4];
  const load = darkLoad(strand, ground, palette, 4);
  assert.ok(load && load.conc.slice(0, 3).some(v => v > 0) && load.conc[3] === 0);
  const added = load.mix.reduce((s, m) => s + m.amount * palette[m.pigment].K[0], 0);
  assert.ok(added > 0.3, `the paint adds density: ${added}`);
  assert.equal(darkLoad([0.5, 0.5, 0.5], [0.6, 0.6, 0.6], palette, 4), null, 'a ground that is darker needs no stroke');
  assert.ok(DEPOSIT > 0 && DEPOSIT < 1);
});
