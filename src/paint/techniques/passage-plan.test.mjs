import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePassageMove, passageFamily, passageMaterial, settlePassageBed, preparePassageBed } from './passage-plan.mjs';
import { planLightToDark } from '../methods/light-to-dark.mjs';

test('authored move names map to the painter moves, while later glazes remain dry', () => {
  for (const m of ['wet in wet', 'Wet in wet', 'wet-in-wet', 'wet-on-wet', 'wet on wet']) assert.equal(normalizePassageMove(m), 'wet on wet');
  for (const m of ['glaze', 'glazed', 'glazing', 'wet on dry']) assert.equal(normalizePassageMove(m), 'wet on dry');
  assert.equal(normalizePassageMove('dry brush'), 'dry on dry');
  const family = { id: 'fur', baseMove: 'wet in wet' };
  assert.equal(passageMaterial({ phase: 'light', family }).move, 'wet on wet');
  assert.equal(passageMaterial({ phase: 'shadow', family }).move, 'wet on dry');
});

test('identical colours on different subjects get local intent without a box-shaped clip', () => {
  const families = [{ id: 'fur', bounds: [0, 0, .5, 1] }, { id: 'skin', bounds: [.5, 0, 1, 1] }];
  assert.equal(passageFamily([0, 1, 10, 11], 10, 2, families).id, 'fur');
  assert.equal(passageFamily([8, 9, 18, 19], 10, 2, families).id, 'skin');
  assert.equal(passageFamily([0, 1, 8, 9, 10, 11, 18, 19], 10, 2, families), null);
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

test('a wet passage waits for a workable bed, refuses dried or flooded contact and leaves ready beds alone', () => {
  let water = .6, steps = 0;
  const result = settlePassageBed({ observe: () => ({ waterMax: water, moistShare: .8 }), advance: () => { water *= .5; steps++; } });
  assert.equal(steps, 2);
  assert.equal(result.paper.waterMax, .15);
  assert.throws(() => settlePassageBed({ observe: () => ({ waterMax: .4, moistShare: .9 }), advance: () => {}, maxSteps: 3 }), /material window/);
  assert.throws(() => settlePassageBed({ observe: () => ({ waterMax: 0, moistShare: .2 }), advance: () => { throw Error('do not paint dried contact'); } }), /material window/);
  assert.equal(settlePassageBed({ observe: () => ({ waterMax: .1, moistShare: .8 }), advance: () => { throw Error('ready bed must not wait'); } }).steps, 0);
});

test('wet preparation uses whole gestures and refuses an oscillating bed instead of relaxing the window', () => {
  let p = { moistShare: .5, waterMax: .02 };
  const r = preparePassageBed({ observe: () => p, wet: () => { p = { moistShare: .9, waterMax: .4 }; }, pickup: () => { p = { moistShare: .85, waterMax: .1 }; } });
  assert.deepEqual(r.actions.map(a => a.operation), ['prewet the planned contact', 'pick up excess surface water']);
  let partial = { moistShare: .55, waterMax: .42 };
  const r2 = preparePassageBed({ observe: () => partial, wet: () => { partial = { moistShare: .9, waterMax: .42 }; }, pickup: () => { partial = { moistShare: .88, waterMax: .12 }; } });
  assert.deepEqual(r2.actions.map(a => a.operation), ['prewet the planned contact', 'pick up excess surface water']);
  assert.throws(() => preparePassageBed({ observe: () => ({ moistShare: .5, waterMax: .5 }), wet: () => {}, pickup: () => {}, maxActions: 2 }), /without a pixel correction/);
});
