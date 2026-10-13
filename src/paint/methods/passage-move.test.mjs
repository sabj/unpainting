import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePassageMove } from './passage-move.mjs';
import { planLightToDark } from './light-to-dark.mjs';

test('authored move names map to the painter moves', () => {
  for (const m of ['wet in wet', 'Wet in wet', 'wet-in-wet', 'wet-on-wet', 'wet on wet']) assert.equal(normalizePassageMove(m), 'wet on wet');
  for (const m of ['glaze', 'glazed', 'glazing', 'wet on dry']) assert.equal(normalizePassageMove(m), 'wet on dry');
  assert.equal(normalizePassageMove('dry brush'), 'dry on dry');
  assert.equal(normalizePassageMove('lift'), 'lift');
  assert.equal(normalizePassageMove(undefined), undefined);
});

test('an authored wet in wet light family is painted wet on wet, with unchanged geometry', () => {
  const w = 32, h = 24, n = w * h, density = new Float32Array(n).fill(.5);
  const plan = baseMove => planLightToDark({ w, h, k: 1, density, demand: density.slice(), shaped: true, families: [{ id: 'fur', bounds: [0, 0, 1, 1], baseMove }] });
  const wet = plan('wet in wet'), dry = plan('wet on dry');
  const geometry = p => p.layers.map(l => l.shapes.map(s => [s.area, s.amount, Array.from(s.mask)]));
  assert.deepEqual(geometry(wet), geometry(dry));
  const light = p => p.instructions.filter(i => i.phase === 'light');
  assert.ok(light(wet).length > 0);
  assert.ok(light(wet).every(i => i.move === 'wet on wet'));
  assert.ok(light(dry).every(i => i.move === 'wet on dry'));
  assert.ok(wet.instructions.filter(i => i.phase !== 'light').every(i => i.move !== 'wet on wet'));
});
