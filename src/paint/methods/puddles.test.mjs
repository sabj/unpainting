import test from 'node:test';
import assert from 'node:assert/strict';
import { mixFor, mixOver, filmLab } from './puddles.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { labOf } from '../../eval/colour.mjs';

const PAPER = [252, 251, 248], pigments = ['hansa', 'ultramarine', 'cadred'].map(key => boxPigment(BOX.find(p => p.key === key)));

test("a shape's own mix returns the shape's light", () => {
  for (const c of [[190, 150, 110], [90, 110, 160], [60, 50, 45]]) {
    const a = mixFor(c, pigments, PAPER), got = filmLab(a, pigments, PAPER), want = labOf(c, 0, PAPER);
    assert.ok(Math.abs(got[0] - want[0]) < 1.5, `L* ${got[0]} for ${want[0]}`);
  }
  assert.deepEqual(mixFor(PAPER, pigments, PAPER), [0, 0, 0]);
});

test('over bare paper a wash is the colour\'s own mix', () => {
  const c = [150, 124, 92], own = mixFor(c, pigments, PAPER), over = mixOver(c, [0, 0, 0], pigments, PAPER);
  over.forEach((v, j) => assert.ok(Math.abs(v - own[j]) < 1e-9));
});

test('over a paler wash the mix is what brings the film under it to the colour', () => {
  const under = mixFor([205, 170, 125], pigments, PAPER);
  for (const c of [[150, 124, 92], [90, 80, 75], [120, 130, 150]]) {
    const over = mixOver(c, under, pigments, PAPER), got = filmLab(under.map((v, j) => v + over[j]), pigments, PAPER), want = labOf(c, 0, PAPER);
    assert.ok(over.every(v => v >= 0) && over.some(v => v > 0));
    assert.ok(Math.abs(got[0] - want[0]) < 1.5, `L* ${got[0]} for ${want[0]}`);
  }
});

test('nothing is laid over a film already as dark as the colour', () => {
  const under = mixFor([90, 80, 75], pigments, PAPER);
  assert.deepEqual(mixOver([205, 170, 125], under, pigments, PAPER), [0, 0, 0]);
  assert.deepEqual(mixOver([90, 80, 75], under, pigments, PAPER), [0, 0, 0]);
});

test('a paint already under the wash in excess makes the wash weaker, not the result darker', () => {
  // a yellow first wash under a blue-grey shape: the yellow cannot be taken back, so less of the rest is laid
  const under = mixFor([225, 200, 120], pigments, PAPER), c = [120, 130, 150], own = mixFor(c, pigments, PAPER);
  const over = mixOver(c, under, pigments, PAPER), got = filmLab(under.map((v, j) => v + over[j]), pigments, PAPER), want = labOf(c, 0, PAPER);
  assert.ok(under[0] > own[0], 'more yellow under than the colour holds');
  assert.equal(over[0], 0);
  assert.ok(Math.abs(got[0] - want[0]) < 1.5, `L* ${got[0]} for ${want[0]}`);
  assert.ok(over.reduce((a, v) => a + v, 0) < own.reduce((a, v) => a + v, 0));
});
