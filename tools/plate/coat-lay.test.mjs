// The brush's load for a coat stroke: paste and tint for a light, the strand's own paint over the ground for a dark.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lightLoad, darkLoad, LOAD, DEPOSIT } from './coat-lay.mjs';
import { GOUACHE_FILM } from '../../src/media/gouache.mjs';

const palette = [{ K: [1.6, 1.5, 1.2] }, { K: [0.4, 0.8, 2.2] }, { K: [0.2, 0.7, 1.9] }];
const PAPER = [252, 251, 248];

test('a light stroke is loaded with gouache paste and a little of the paints that tint it', () => {
  const { conc } = lightLoad({ rgb: [236, 214, 170] }, PAPER, palette, 3, 4);
  assert.equal(conc.length, 4); assert.ok(Math.abs(conc[3] - GOUACHE_FILM * LOAD) < 1e-9, 'paste');
  assert.ok(conc[1] > 0 || conc[2] > 0, 'a warm tint'); assert.equal(conc[0], 0, 'not the dark paint');
  const white = lightLoad({ rgb: [250, 250, 247] }, PAPER, palette, 3, 4).conc;
  assert.deepEqual(white.slice(0, 3), [0, 0, 0], 'a true white takes no tint');
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
