import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mixPalette, pickWell, wellFor, wellK, wellName, describePalette } from './palette.mjs';

const K = [[0.05, 0.10, 0.60], [0.10, 0.55, 0.45], [0.60, 0.40, 0.05]];
const paints = K.map((k, j) => ({ name: ['hansa yellow', 'quinacridone rose', 'ultramarine'][j], K: k }));
const mix = (c, s = 1) => [0, 1, 2].map(ch => s * K.reduce((a, k, j) => a + c[j] * k[ch], 0));

/** A picture made of two colours: an orange (yellow and rose) over most of it, a blue over a quarter. */
function twoColourSamples(n = 400) {
  const D = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = i % 4 === 0 ? mix([0, 0, 1], 0.5 + 0.5 * ((i * 7) % 10) / 10) : mix([0.6, 0.4, 0], 0.3 + 0.7 * ((i * 3) % 10) / 10);
    for (let c = 0; c < 3; c++) D[i * 3 + c] = d[c];
  }
  return D;
}

test('mixPalette finds the two puddles a two-colour picture needs, and no more', () => {
  const pal = mixPalette(paints, twoColourSamples(), { wells: 8 });
  assert.equal(pal.wells.length, 2, describePalette(pal));
  const orange = pal.wells.find(w => w.recipe[2] < 0.01), blue = pal.wells.find(w => w.recipe[2] > 0.99);
  assert.ok(orange && blue, describePalette(pal));
  assert.ok(Math.abs(orange.recipe[0] - 0.6) < 0.02 && Math.abs(orange.recipe[1] - 0.4) < 0.02, `orange ${Array.from(orange.recipe)}`);
  assert.equal(pal.mixed, 2);
});

test('wellName reads as a painter would write the recipe', () => {
  assert.equal(wellName(paints, [0.6, 0.4, 0]), '60% hansa yellow + 40% quinacridone rose');
  assert.equal(wellName(paints, [0.01, 0, 0.99]), 'ultramarine');
});

test('pickWell chooses by direction and sets the mass from the wanted density', () => {
  const pal = mixPalette(paints, twoColourSamples(), { wells: 8 });
  const want = mix([0.6, 0.4, 0], 0.8);
  const pick = pickWell(pal, want);
  assert.ok(pick.fit > 0.999);
  // density is 2 K mass (km.mjs, a transparent layer crossed twice), so the mass along the well brings that density back
  const Kw = wellK(paints, pal.wells[pick.index].recipe);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(2 * Kw[c] * pick.mass - want[c]) < 1e-6);
});

test('wellFor varies the water for a value change and mixes a new well only for a new colour', () => {
  const pal = mixPalette(paints, twoColourSamples(), { wells: 8, cap: 8, tol: 0.985 });
  const a = wellFor(pal, mix([0.6, 0.4, 0], 0.2)), b = wellFor(pal, mix([0.6, 0.4, 0], 1.4));
  assert.equal(a.index, b.index, 'same puddle, more or less water');
  assert.ok(b.mass > a.mass * 5);
  assert.equal(pal.mixed, 2);
  const g = wellFor(pal, mix([0.5, 0, 0.5], 0.6)); // a green nobody mixed yet
  assert.ok(g.fresh, 'a new colour is a new puddle');
  assert.equal(pal.wells.length, 3);
  assert.equal(pal.mixed, 3);
  assert.equal(pal.washouts, 0);
});

test('past the cap a well is washed out and re-mixed, and it is counted', () => {
  const pal = mixPalette(paints, twoColourSamples(), { wells: 8, cap: 2, tol: 0.985 });
  assert.equal(pal.wells.length, 2);
  wellFor(pal, mix([0.6, 0.4, 0], 0.5)); wellFor(pal, mix([0.6, 0.4, 0], 0.5)); // the orange is the busy well
  const g = wellFor(pal, mix([0.5, 0, 0.5], 0.6));
  assert.ok(g.fresh && g.washed);
  assert.equal(pal.wells.length, 2, 'the cap holds');
  assert.equal(pal.washouts, 1);
  assert.equal(pal.mixed, 3);
  assert.ok(pal.wells.find(w => w.recipe[0] > 0.5 && w.recipe[1] > 0.3), 'the busy orange survived; the idle blue was washed out');
});

test('a wanted colour no paint can reach still gets the nearest well, at a lower fit, and is not re-mixed every act', () => {
  const pal = mixPalette(paints, twoColourSamples(), { wells: 8, cap: 8 });
  const before = pal.mixed;
  const p1 = wellFor(pal, [0.6, 0.0, 0.0]);
  const p2 = wellFor(pal, [0.6, 0.0, 0.0]);
  // the nearest recipe the paints allow is the ultramarine alone, and that well is already on the palette
  assert.equal(pal.mixed, before, 'nothing new to mix');
  assert.equal(p1.index, p2.index);
  assert.ok(!p1.fresh && !p2.fresh);
  assert.ok(p1.fit < 0.9 && p1.fit > 0.8, `fit ${p1.fit}`);
});

test('describePalette prints one line per well with its recipe', () => {
  const pal = mixPalette(paints, twoColourSamples(), { wells: 8 });
  const text = describePalette(pal);
  assert.match(text, /well 1: /);
  assert.match(text, /hansa yellow/);
  assert.equal(text.trim().split('\n').length, 2);
});
