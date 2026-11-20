import test from 'node:test';
import { TECHNIQUES, layPassage, dryFully } from '../methods/lay.mjs';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness, DEFAULTS } from '../../media/sheet.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import assert from 'node:assert/strict';
import { normalizePassageMove, passageFamily, passageMaterial, settlePassageBed, preparePassageBed } from './passage-plan.mjs';
import {valueTechnique} from '../methods/value-shared.mjs';

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
  const r = preparePassageBed({ observe: () => p, wet: () => { p = { moistShare: .9, waterMax: .4, waterP50: .4 }; }, pickup: () => { p = { moistShare: .85, waterMax: .1, waterP50: .1 }; } });
  assert.deepEqual(r.actions.map(a => a.operation), ['prewet the planned contact', 'pick up excess surface water']);
  let partial = { moistShare: .55, waterMax: .42 };
  const r2 = preparePassageBed({ observe: () => partial, wet: () => { partial = { moistShare: .9, waterMax: .42, waterP50: .42 }; }, pickup: () => { partial = { moistShare: .88, waterMax: .12, waterP50: .12 }; } });
  assert.deepEqual(r2.actions.map(a => a.operation), ['prewet the planned contact', 'pick up excess surface water']);
  assert.throws(() => preparePassageBed({ observe: () => ({ moistShare: .5, waterMax: .5, waterP50: .5 }), wet: () => {}, pickup: () => {}, maxActions: 2 }), /without a pixel correction/);
});

const dryMoves = ['dry on dry', 'dry brush', 'dry-on-dry', 'dry-brush', ' Dry Brush '];

test('explicit dry intent survives every phase and technique branch without losing brush load', () => {
  for (const move of dryMoves) for (const phase of ['light', 'mid', 'shadow']) {
    const material = passageMaterial({ phase, family: { baseMove: move } });
    assert.equal(material.move, 'dry on dry');
    assert.equal(material.technique, 'dry-brush');
    for (const calibratedPlan of [false, true]) for (const style of [null, 'a style name']) {
      for (const water of [0, .17, .22]) {
        const intent = { move, phase, calibratedPlan, style, load: { water }, wetMix: .9, bridge: .99, bridgeSoft: 3 };
        const T = valueTechnique(intent);
        assert.deepEqual(T, { ...TECHNIQUES['dry brush'], water, valuePlan: intent });
        assert.equal(intent.move, move, 'selection must not rewrite authored intent');
      }
    }
  }
});

test('wet foundations, later glazes and non-dry style contacts retain their existing settings', () => {
  for (const phase of ['light', 'mid', 'shadow']) {
    for (const baseMove of ['wet on wet', 'wet in wet']) {
      const m = passageMaterial({ phase, family: { baseMove } });
      assert.equal(m.move, phase === 'light' ? 'wet on wet' : 'wet on dry');
      assert.equal(m.water, phase === 'light' ? .55 : phase === 'shadow' ? .45 : .62);
    }
    for (const calibratedPlan of [false, true]) {
      const intent = { phase, move: 'wet on dry', calibratedPlan, load: { water: .37 } };
      const T = valueTechnique(intent), shadow = phase === 'shadow';
      assert.deepEqual(T, { name: shadow ? 'glazed' : 'wet on dry',
        water: calibratedPlan ? shadow ? .58 : .62 : .37,
        wetMix: calibratedPlan && !shadow ? .55 : .3,
        bridge: calibratedPlan && !shadow ? .78 : .82,
        bridgeSoft: calibratedPlan && !shadow ? 2.2 : 2.4,
        intoWet: false, dryAfter: true, passes: 1, valuePlan: intent });
    }
    const intent = { phase, move: 'dry on wet', style: 'atmospheric-wet', load: { water: .41 }, wetMix: .8, bridge: .9, bridgeSoft: 3 };
    assert.deepEqual(valueTechnique(intent), { name: 'dry on wet', water: .41, wetMix: .8, bridge: .9, bridgeSoft: 3, intoWet: true, dryAfter: false, passes: 1, valuePlan: intent });
  }
});
