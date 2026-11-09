import test from 'node:test';
import assert from 'node:assert/strict';
import { solveMix, massForLightness, thinToValues, mixtureColour, labOfColour, JND } from './palette-mix.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { renderLayers } from '../../media/km.mjs';

const P = BOX.map(p => boxPigment(p)), at = key => BOX.findIndex(p => p.key === key);
const SHEET = [252, 251, 248];
const masses = of => P.map((_, j) => of[BOX[j].key] ?? 0);
const chroma = lab => Math.hypot(lab[1], lab[2]);
const names = r => r.indices.map(j => BOX[j].key);

test('a mix is the colour the simulator renders for one layer of those masses', () => {
  const mix = masses({ hansa: 0.31, cadred: 0.17, ultramarine: 0.05 });
  const layer = mix.map(v => Float32Array.of(v));
  const rendered = renderLayers([layer], P, Uint8ClampedArray.from(SHEET), 1, 1);
  const mine = mixtureColour(mix, P, SHEET);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(mine[c] - rendered[c]) <= 0.5 + 1e-6, `channel ${c}: ${mine[c]} against ${rendered[c]}`);
});

test('more paint is darker, and the mass for a lightness gives that lightness', () => {
  const shares = masses({ ochre: 0.7, paynes: 0.3 });
  const L = t => labOfColour(mixtureColour(shares.map(v => v * t), P, SHEET))[0];
  assert.ok(L(0.2) > L(0.4) && L(0.4) > L(0.8));
  for (const want of [90, 64.4, 40]) {
    const { mass, reached } = massForLightness(shares, P, SHEET, want);
    assert.equal(reached, true);
    assert.ok(Math.abs(L(mass) - want) < 1e-6);
  }
});

test('paint cannot lighten what is under it', () => {
  const under = [180, 170, 150], L = labOfColour(under)[0];
  assert.deepEqual(massForLightness(masses({ hansa: 1 }), P, under, L + 5), { mass: 0, reached: false });
  const r = solveMix([230, 230, 230], P, under);
  assert.equal(r.mass, 0);
  assert.equal(r.reached, false);
  assert.equal(r.valueReached, false);
  assert.deepEqual(r.indices, []);
});

test('two paints: the shares of a known mix come back', () => {
  const known = masses({ hansa: 0.3, cadred: 0.2 }), target = mixtureColour(known, P, SHEET);
  const r = solveMix(target, P, SHEET, { allowed: [at('hansa'), at('cadred')] });
  assert.ok(r.dE < 1e-3, `dE ${r.dE}`);
  assert.deepEqual(names(r), ['hansa', 'cadred']);
  assert.ok(Math.abs(r.shares[0] - 0.6) < 1e-3 && Math.abs(r.mass - 0.5) < 1e-3);
  assert.ok(Math.abs(r.mix[at('hansa')] - 0.3) < 1e-3 && Math.abs(r.mix[at('cadred')] - 0.2) < 1e-3);
});

test('three paints: a colour inside their reach is matched exactly, value included', () => {
  const known = masses({ cadyellow: 0.25, rose: 0.12, ultramarine: 0.08 }), target = mixtureColour(known, P, SHEET);
  const r = solveMix(target, P, SHEET, { allowed: [at('cadyellow'), at('rose'), at('ultramarine')] });
  assert.equal(r.indices.length, 3);
  for (const key of ['cadyellow', 'rose', 'ultramarine']) assert.ok(Math.abs(r.mix[at(key)] - known[at(key)]) < 1e-6, key);
  assert.ok(r.dE < 1e-6 && Math.abs(r.dL) < 1e-6);
  assert.equal(r.reached, true);
});

test('the fewest paints that make the colour are taken', () => {
  const one = solveMix(mixtureColour(masses({ ultramarine: 0.4 }), P, SHEET), P, SHEET);
  assert.deepEqual(names(one), ['ultramarine']);
  assert.ok(Math.abs(one.mass - 0.4) < 1e-6);
  // a mix of two paints is found as two, although many triples match it exactly as well
  const two = solveMix(mixtureColour(masses({ hansa: 0.3, ultramarine: 0.3 }), P, SHEET), P, SHEET);
  assert.ok(two.indices.length <= 2 && two.reached);
  // and the limit on paints is kept
  const capped = solveMix(mixtureColour(masses({ cadyellow: 0.25, rose: 0.12, ultramarine: 0.08 }), P, SHEET), P, SHEET, { maxPigments: 2 });
  assert.ok(capped.indices.length <= 2);
});

test('the mix lists every pigment and adds up to its mass', () => {
  const r = solveMix([195, 147, 94], P, SHEET);
  assert.equal(r.mix.length, P.length);
  assert.ok(Math.abs(r.mix.reduce((a, v) => a + v, 0) - r.mass) < 1e-12);
  assert.ok(Math.abs(r.shares.reduce((a, v) => a + v, 0) - 1) < 1e-12);
  assert.ok(r.shares.every((v, q) => q === 0 || v <= r.shares[q - 1]));
  assert.deepEqual(r.indices.map(j => r.mix[j] > 0), r.indices.map(() => true));
});

test('a colour outside the paints is reported as not reached, with how it falls short', () => {
  const earths = ['ochre', 'sienna', 'umber', 'paynes'].map(at);
  const r = solveMix([151, 190, 239], P, SHEET, { allowed: earths });
  assert.equal(r.reached, false);
  assert.ok(r.dE > 10 && r.dC < -20);
  assert.equal(r.valueReached, true);
  assert.ok(r.indices.every(j => earths.includes(j)));
});

// Colours measured on the benchmark targets (CIELAB, D65), on the sheet the 0.3.1 runs paint on.
test('Mittens orange (L 64.4 C 36.8 h 71) is reached from the box at its value', () => {
  const r = solveMix([195, 147, 94], P, SHEET);
  assert.equal(r.reached, true);
  assert.ok(Math.abs(r.dL) < 1e-6);
  assert.ok(chroma(r.lab) > 35.5 && Math.abs(r.dC) < 1.5 && Math.abs(r.dh) < 2, `C ${chroma(r.lab)} dh ${r.dh}`);
  assert.ok(r.indices.length <= 2);
  // the four earths that run was given come within two just-noticeable differences: ochre greyed with Payne's grey
  const earths = solveMix([195, 147, 94], P, SHEET, { allowed: ['ochre', 'sienna', 'umber', 'paynes'].map(at) });
  assert.ok(earths.dE < 2 * JND && chroma(earths.lab) > 34);
  assert.deepEqual(names(earths), ['ochre', 'paynes']);
});

test('Trumbull sky mean (L 80.7 C 15.1 h 266) and stone (L 70.1 C 38.0 h 82) are reached from the box', () => {
  const sky = solveMix([183, 202, 228], P, SHEET);
  assert.equal(sky.reached, true);
  assert.ok(Math.abs(sky.dC) < 1 && names(sky).includes('ultramarine'));
  const stone = solveMix([203, 166, 103], P, SHEET);
  assert.equal(stone.reached, true);
  assert.ok(Math.abs(stone.dC) < 1 && Math.abs(stone.dh) < 1);
});

test('the strongest Trumbull sky blue is limited by the sheet, not by the mix', () => {
  // blue 239 against a sheet of 248: every box blue takes more blue light than that at this value
  const onSheet = solveMix([151, 190, 239], P, SHEET), onWhite = solveMix([151, 190, 239], P, [255, 255, 255]);
  assert.equal(onSheet.reached, false);
  assert.ok(onSheet.dC < -2 && onSheet.dC > -5 && onSheet.dE < 2 * JND);
  assert.equal(onWhite.reached, true);
});

test('a glaze is the same solve over the dried colour under it', () => {
  const under = mixtureColour(masses({ ochre: 0.15 }), P, SHEET), glaze = masses({ sienna: 0.2, ultramarine: 0.1 });
  const target = mixtureColour(glaze, P, under);
  const r = solveMix(target, P, under, { allowed: [at('sienna'), at('ultramarine')] });
  assert.ok(r.dE < 1e-3);
  assert.ok(Math.abs(r.mix[at('sienna')] - 0.2) < 1e-3 && Math.abs(r.mix[at('ultramarine')] - 0.1) < 1e-3);
  // a clear blue cannot be glazed over a yellow wash: the yellow has already taken the blue light
  assert.equal(solveMix([151, 190, 239], P, under).reached, false);
});

test('the same puddle with more water is lighter', () => {
  const r = solveMix([195, 147, 94], P, SHEET), steps = thinToValues(r.mix, P, SHEET, [90, 80, 70, r.lab[0], 50]);
  assert.ok(Math.abs(steps[3].water - 1) < 1e-6 && Math.abs(steps[3].mass - r.mass) < 1e-6);
  for (let q = 1; q < steps.length; q++) assert.ok(steps[q].water < steps[q - 1].water && steps[q].mass > steps[q - 1].mass);
  for (const s of steps) { assert.equal(s.reached, true); assert.ok(Math.abs(s.lab[0] - s.L) < 1e-6); }
  // thin washes are weaker in colour as well as lighter
  assert.ok(chroma(steps[0].lab) < chroma(steps[1].lab) && chroma(steps[1].lab) < chroma(steps[2].lab));
  assert.throws(() => thinToValues(P.map(() => 0), P, SHEET, [50]), RangeError);
});

test('a measured one-charge limit turns a heavy mix into equal charges', () => {
  const light = solveMix([195, 147, 94], P, SHEET, { maxMass: 2 }), dark = solveMix([120, 60, 30], P, SHEET, { maxMass: 1 });
  assert.equal(light.charges, 1);
  assert.equal(dark.charges, Math.ceil(dark.mass));
  assert.ok(dark.charges >= 2);
  assert.equal(solveMix([195, 147, 94], P, SHEET).charges, null);
});

test('bad input fails loudly', () => {
  assert.throws(() => solveMix([195, 147, 94], [], SHEET), RangeError);
  assert.throws(() => solveMix([195, 147], P, SHEET), RangeError);
  assert.throws(() => solveMix([195, 147, 300], P, SHEET), RangeError);
  assert.throws(() => solveMix([195, 147, 94], P, [252, NaN, 248]), RangeError);
  assert.throws(() => solveMix([195, 147, 94], P, SHEET, { maxPigments: 4 }), RangeError);
  assert.throws(() => solveMix([195, 147, 94], P, SHEET, { allowed: [99] }), RangeError);
  assert.throws(() => solveMix([195, 147, 94], P, SHEET, { allowed: [] }), RangeError);
  assert.throws(() => solveMix([195, 147, 94], P, SHEET, { maxMass: 0 }), RangeError);
});
