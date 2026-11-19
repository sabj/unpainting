import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePuddles, dilutionLadder, mixFor, strengthFor, filmLab, PUDDLES_MAX, PUDDLE_TOLERANCE, MAX_STAGES } from './puddles.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { labOf } from '../../eval/colour.mjs';

const PAPER = [252, 251, 248], pigments = ['hansa', 'ultramarine', 'cadred'].map(key => boxPigment(BOX.find(p => p.key === key)));
const shapesOf = colours => colours.map(([c, area = 100]) => ({ amounts: mixFor(c, pigments, PAPER), area }));
const hsv = (hDeg, s, v) => { const f = k => { const q = (k + hDeg / 60) % 6; return 255 * (v - v * s * Math.max(0, Math.min(q, 4 - q, 1))); }; return [f(5), f(3), f(1)]; };

test("a shape's own mix returns the shape's light", () => {
  for (const c of [[190, 150, 110], [90, 110, 160], [60, 50, 45]]) {
    const a = mixFor(c, pigments, PAPER), got = filmLab(a, pigments, PAPER), want = labOf(c, 0, PAPER);
    assert.ok(Math.abs(got[0] - want[0]) < 1.5, `L* ${got[0]} for ${want[0]}`);
  }
  assert.deepEqual(mixFor(PAPER, pigments, PAPER), [0, 0, 0]);
  assert.equal(strengthFor([.5, .3, .2], [255, 255, 255], pigments, PAPER), 0);
});

test('a few close colours need few puddles, and every shape is within the tolerance of its puddle', () => {
  // three colour groups, each at several values
  const colours = []; for (const base of [[200, 160, 110], [110, 130, 180], [150, 170, 120]]) for (const f of [1, .85, .7, .55]) colours.push([base.map(v => v * f)]);
  const shapes = shapesOf(colours), { puddles, assign, worst } = choosePuddles(shapes, { pigments, paperRGB: PAPER });
  assert.ok(puddles.length >= 3 && puddles.length <= 6, `${puddles.length} puddles for three colours at four values each`);
  assert.ok(worst <= PUDDLE_TOLERANCE, `worst ${worst}`);
  assert.ok(assign.every(p => p >= 0 && p < puddles.length));
  for (const p of puddles) assert.ok(Math.abs(p.mix.reduce((a, v) => a + v, 0) - 1) < 1e-6);
  assert.ok(puddles.some(p => p.mix.filter(v => v > .02).length > 1), 'a puddle is a mix of paints');
});

test('puddles stop at the cap however many colours the picture holds', () => {
  const colours = []; for (let q = 0; q < 60; q++) colours.push([hsv(q * 6, .35 + .5 * (q % 3) / 2, .8)]);
  const { puddles, worst } = choosePuddles(shapesOf(colours), { pigments, paperRGB: PAPER });
  assert.equal(puddles.length <= PUDDLES_MAX, true);
  assert.ok(puddles.length > 8, `${puddles.length} puddles`);
  assert.ok(worst > 0);
});

test('a puddle is the pooled paint of its shapes, weighted by area', () => {
  const big = [200, 160, 110], small = [205, 158, 112];
  const { puddles, assign } = choosePuddles(shapesOf([[big, 1000], [small, 10]]), { pigments, paperRGB: PAPER });
  assert.equal(puddles.length, 1); assert.deepEqual([...assign], [0, 0]);
  const own = mixFor(big, pigments, PAPER), total = own.reduce((a, v) => a + v, 0);
  own.forEach((v, j) => assert.ok(Math.abs(v / total - puddles[0].mix[j]) < .01));
});

test('paper shapes take no puddle', () => {
  const { puddles, assign } = choosePuddles(shapesOf([[PAPER], [[120, 120, 150]]]), { pigments, paperRGB: PAPER });
  assert.equal(puddles.length, 1); assert.deepEqual([...assign], [-1, 0]);
});

test('the ladder: at most three value steps from the shapes themselves, each stage laying only the difference', () => {
  const mix = [.3, .4, .3], needs = [.2, .21, .5, .52, 1.1, 1.14, 0];
  const L = dilutionLadder(mix, needs, pigments, PAPER);
  assert.equal(L.levels.length, 3);
  [.205, .51, 1.12].forEach((v, l) => assert.ok(Math.abs(L.levels[l] - v) < .01, `step ${l} at ${L.levels[l]}`));
  assert.deepEqual(L.dilutions.map(d => d.name), ['pale', 'middle', 'full']);
  L.strengths.forEach((v, l) => assert.ok(Math.abs(v - (L.levels[l] - (l ? L.levels[l - 1] : 0))) < 1e-9));
  assert.deepEqual(L.steps, [[0], [0], [0, 1], [0, 1], [0, 1, 2], [0, 1, 2], []]);
  assert.equal(L.steps[4].length, MAX_STAGES);
  // no stage repeats the last over the same shapes: each covers strictly fewer
  const cover = [0, 1, 2].map(j => L.steps.filter(st => st.includes(j)).length); assert.deepEqual(cover, [6, 4, 2]);
});

test('shapes of one value take one wash, and a shape no visible wash would darken is left as paper', () => {
  const mix = [.3, .4, .3], one = dilutionLadder(mix, [.4, .4, .41], pigments, PAPER);
  assert.equal(one.levels.length, 1); assert.deepEqual(one.steps, [[0], [0], [0]]);
  const faint = dilutionLadder(mix, [.4, .0005], pigments, PAPER);
  assert.deepEqual(faint.steps, [[0], []]);
  assert.deepEqual(dilutionLadder(mix, [0, 0], pigments, PAPER).steps, [[], []]);
});
