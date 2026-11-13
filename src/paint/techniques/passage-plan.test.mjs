import test from 'node:test';
import { STYLE_NAMES } from '../styles/loader.mjs';
import { TECHNIQUES, layPassage, dryFully } from '../methods/lay.mjs';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness, DEFAULTS } from '../../media/sheet.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import assert from 'node:assert/strict';
import { normalizePassageMove, passageFamily, passageMaterial, settlePassageBed, preparePassageBed } from './passage-plan.mjs';
import { planLightToDark, valueTechnique } from '../methods/light-to-dark.mjs';

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
    for (const calibratedPlan of [false, true]) for (const style of [null, ...STYLE_NAMES]) {
      for (const water of [0, .17, .22]) {
        const intent = { move, phase, calibratedPlan, style, load: { water }, wetMix: .9, bridge: .99, bridgeSoft: 3 };
        const T = valueTechnique(intent);
        assert.deepEqual(T, { ...TECHNIQUES['dry brush'], water, valuePlan: intent });
        assert.equal(intent.move, move, 'selection must not rewrite authored intent');
      }
    }
  }
});

test('authored dry families reach real dry contact through the planner in every style and calibration mode', () => {
  const w = 64, h = 64, density = Float32Array.from({ length: w * h }, (_, i) => .15 + .85 * (i % w) / w);
  for (const baseMove of dryMoves) for (const calibratedPlan of [false, true]) for (const style of [null, ...STYLE_NAMES]) {
    const plan = planLightToDark({ w, h, k: 1, density, demand: density.slice(), shaped: true, calibratedPlan, cellLight: false, massTone: false,
      styleSelection: style ? { style, reason: 'test authored material intent' } : null,
      families: [{ id: 'texture', bounds: [0, 0, 1, 1], baseMove }] });
    assert.ok(plan.instructions.length > 0);
    // Styles intentionally schedule different phases; the direct matrix above covers every branch.
    if (!style) assert.deepEqual([...new Set(plan.instructions.map(i => i.phase))].sort(), ['light', 'mid', 'shadow']);
    for (const intent of plan.instructions) {
      assert.equal(intent.move, 'dry on dry');
      assert.equal(intent.baseBefore, 'fully dry');
      assert.match(intent.paperBefore, /fully dry/);
      assert.deepEqual(valueTechnique(intent), { ...TECHNIQUES['dry brush'], water: intent.load.water, valuePlan: intent });
    }
  }
});

test('planned dry brush deposits paint while leaving more paper tooth than a wet passage', () => {
  const w = 64, h = 64, density = new Float32Array(w * h).fill(.8);
  const plan = baseMove => planLightToDark({ w, h, k: 1, density, demand: density.slice(), shaped: true,
    families: [{ id: 'texture', bounds: [0, 0, 1, 1], baseMove }] });
  const mask = new Uint8Array(w * h);
  for (let y = 12; y < 52; y++) for (let x = 12; x < 52; x++) mask[y * w + x] = 1;
  const measure = baseMove => {
    const sheet = createSheet(makePaper(w, h, { seed: 5, scale: 1, toothScale: .2 }), [boxPigment(BOX.find(p => p.key === 'sienna'))]);
    const O = { ...DEFAULTS, edgeEvap: .0012, gran: .25 };
    const T = valueTechnique(plan(baseMove).instructions.find(i => i.phase === 'mid'));
    const result = layPassage(sheet, mask, [1], { w, h, T, maxRadius: 8, seed: 3, O });
    assert.ok(result.sweeps > 0 && result.dips > 0);
    dryFully(sheet, O);
    const th = thickness(sheet)[0]; let bare = 0, mass = 0, count = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) { count++; mass += th[i]; if (th[i] < .01) bare++; }
    assert.ok(mass > 0, 'dry brush is pigment-bearing contact, not omitted paint');
    return bare / count;
  };
  const dry = measure('dry brush'), wet = measure('wet on dry');
  assert.ok(dry > wet + .1, `dry ${dry}, wet ${wet}`);
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
