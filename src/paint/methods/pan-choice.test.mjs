import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePans, wheelAngles, tint } from './pan-choice.mjs';
import { mixtureColour, labOfColour, JND } from './palette-mix.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';

const SHEET = [252, 251, 248];
const box = keys => keys.map(k => boxPigment(BOX.find(p => p.key === k)));
const names = (keys, r) => r.indices.map(j => keys[j]);
const chroma = lab => Math.hypot(lab[1], lab[2]);

test('the wheel is the mixing space: a pan sits at its own hue, its complement across, a flat black nowhere', () => {
  const keys = ['hansa', 'ultramarine', 'lampblack', 'cadred'], P = box(keys);
  const yellow = mixtureColour([0.4, 0, 0, 0], P, SHEET), angles = wheelAngles(yellow, P, SHEET);
  assert.ok(angles[0] < 1, `hansa ${angles[0]}`);
  assert.ok(angles[1] > 150, `ultramarine ${angles[1]}`);
  assert.equal(angles[2], null);
  assert.ok(angles[3] > angles[0] && angles[3] < 90);
  assert.deepEqual(tint([1, 1, 1]).map(v => Math.abs(v) < 1e-12), [true, true]);
  // a grey has no side
  assert.ok(wheelAngles([128, 128, 128], P, [255, 255, 255]).every(a => a === null));
});

test('a strong orange is mixed from its neighbours and keeps its chroma', () => {
  const keys = BOX.map(p => p.key), P = box(keys);
  const r = choosePans([228, 132, 52], P, SHEET);
  assert.equal(r.side, 'near');
  assert.equal(r.reached, true);
  assert.ok(r.indices.length <= 3);
  assert.ok(r.indices.every(j => r.angles[j] === null || r.angles[j] < 90), names(keys, r).join('+'));
  assert.ok(Math.abs(chroma(r.lab) - chroma(r.target)) < JND, `C ${chroma(r.lab)} against ${chroma(r.target)}`);
  for (const k of ['ultramarine', 'phthaloblue', 'cerulean', 'paynes', 'phthalogreen']) assert.ok(!names(keys, r).includes(k), k);
});

test('a green is not muddied by a red', () => {
  const keys = BOX.map(p => p.key), P = box(keys);
  const r = choosePans([70, 140, 90], P, SHEET);
  assert.equal(r.reached, true);
  for (const k of ['rose', 'cadred', 'sienna']) assert.ok(!names(keys, r).includes(k), `${k} in ${names(keys, r).join('+')}`);
});

test('Trumbull stone from the Trumbull box: no blue, and its farthest pan is the nearest that reaches it', () => {
  const keys = ['ochre', 'rawsienna', 'hansa', 'ultramarine', 'cerulean', 'sepia', 'sapgreen'], P = box(keys);
  const r = choosePans([140, 107, 74], P, [255, 250, 253]);
  assert.equal(r.reached, true);
  assert.equal(r.side, 'near');
  assert.ok(!names(keys, r).some(k => ['ultramarine', 'cerulean'].includes(k)), names(keys, r).join('+'));
  // sap green also makes this stone exactly, but it sits further round the wheel than the pans chosen
  assert.ok(!names(keys, r).includes('sapgreen'), names(keys, r).join('+'));
  assert.ok(r.span < r.angles[keys.indexOf('sapgreen')]);
});

test('a grey that its own side cannot make takes one pan from across the wheel, and only one', () => {
  const keys = ['ochre', 'rawsienna', 'hansa', 'ultramarine', 'cerulean', 'sepia', 'sapgreen'], P = box(keys);
  const r = choosePans([96, 91, 94], P, [255, 250, 253]);
  assert.equal(r.reached, true);
  assert.equal(r.side, 'across');
  assert.equal(r.indices.filter(j => r.far.includes(j)).length, 1);
});

test('the puddle is a mix the solver can lay: shares add to one, masses match, colour matches', () => {
  const keys = BOX.map(p => p.key), P = box(keys), r = choosePans([195, 147, 94], P, SHEET);
  assert.ok(Math.abs(r.shares.reduce((a, v) => a + v, 0) - 1) < 1e-9);
  assert.ok(Math.abs(Array.from(r.mix).reduce((a, v) => a + v, 0) - r.mass) < 1e-9);
  const lab = labOfColour(mixtureColour(r.mix, P, SHEET));
  assert.ok(lab.every((v, c) => Math.abs(v - r.lab[c]) < 1e-9));
  assert.ok(r.drift >= 0 && Number.isFinite(r.drift));
});

test('bad input fails loudly', () => {
  assert.throws(() => choosePans([195, 147, 94], [], SHEET), RangeError);
  assert.throws(() => choosePans([195, 147, 94], box(['ochre']), SHEET, { maxPans: 4 }), RangeError);
});

test('of two greying pans that both reach a colour, the one nearest its complement is taken', () => {
  const keys = ['ochre', 'rawsienna', 'sepia', 'paynes', 'phthaloblue'], P = box(keys);
  const r = choosePans([139, 130, 121], P, [255, 255, 255]);
  assert.equal(r.side, 'across');
  assert.ok(r.indices.includes(keys.indexOf('paynes')) && !r.indices.includes(keys.indexOf('phthaloblue')), r.indices.map(j => keys[j]).join('+'));
  assert.ok(180 - r.angles[keys.indexOf('paynes')] < 180 - r.angles[keys.indexOf('phthaloblue')]);
});

test('a dark muted green on a palette of primaries takes both far primaries, and reaches its colour', () => {
  const keys = ['hansa', 'cerulean', 'rose', 'cadyellow'].filter(k => BOX.some(p => p.key === k)), P = box(keys);
  const r = choosePans([85, 92, 77], P, SHEET);
  assert.ok(r.dE <= JND, `dE ${r.dE.toFixed(2)} with ${names(keys, r).join('+')}`);
  assert.ok(r.indices.length <= 3);
  assert.ok(names(keys, r).includes('rose'), 'the rose that greys it');
});
