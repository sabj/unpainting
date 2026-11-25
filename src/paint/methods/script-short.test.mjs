import test from 'node:test';
import assert from 'node:assert/strict';
import { expandPassage, pressureAt, PRESSURE_WORDS } from './script-short.mjs';
import { passageStrokes } from './script-washes.mjs';

const brushes = { r10: { shape: 'round', widthMm: 10 }, r4: { shape: 'round', widthMm: 4 } };

test('pressure words: lists by name, read along a stroke', () => {
  for (const w of ['swell', 'taper', 'fade', 'press', 'light', 'medium', 'firm']) assert.ok(PRESSURE_WORDS[w].every(v => v >= 0 && v <= 1), w);
  assert.equal(pressureAt([0, 1], 0.5), 0.5); assert.equal(pressureAt(PRESSURE_WORDS.swell, 0.5), 1); assert.equal(pressureAt([0.4], 0.9), 0.4);
});

test('a stroke\'s pressure word: a list for a placed stroke, and pressures at the points that carry none', () => {
  const p = expandPassage({ id: 'a', kind: 'strokes', brush: 'r10', strokes: [{ from: [10, 10], direction: 0, lengthMm: 20, pressure: 'taper' }, { points: [[0, 0], [10, 0, 0.9], [20, 0]], pressure: 'press' }] });
  assert.deepEqual(p.strokes[0].pressure, PRESSURE_WORDS.taper);
  assert.deepEqual(p.strokes[1].points.map(q => q[2]), [0.15, 0.9, 1]);
  // laid: the placed stroke thins from its start to its end; the written one keeps its own middle pressure
  const st = passageStrokes({ id: 'a', kind: 'strokes', brush: 'r10', paper: 'dry', strokes: [{ from: [10, 10], direction: 0, lengthMm: 20, pressure: 'taper' }] }, brushes, 1);
  assert.ok(st[0].points[0][2] > st[0].points.at(-1)[2]);
  const same = { id: 'b', kind: 'wash', region: [[0, 0], [10, 0], [10, 10]] }; assert.equal(expandPassage(same), same);
});

test('a wash: a new pressure word is its list along the lanes; direction "form" is left to the fill', () => {
  const tall = [[40, 0], [60, 0], [60, 100], [40, 100]];
  const p = expandPassage({ id: 'w', kind: 'wash', region: tall, handling: { direction: 'form', pressure: 'swell' } });
  assert.deepEqual([p.handling.direction, p.handling.pressure, p.handling.pressureGiven], ['form', PRESSURE_WORDS.swell, 'swell']);
  const old = { id: 'w', kind: 'wash', region: tall, handling: { pressure: 'firm' } }; assert.equal(expandPassage(old), old);
});
