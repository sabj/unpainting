import test from 'node:test';
import assert from 'node:assert/strict';
import { meaningOf, joinNearest, inkBudget, decideByMeaning } from './line-meaning.mjs';

// a 100 x 60 mm sheet at 0.5 mm a cell: a building part (id 1) left of x 50, another (id 2) right, foliage (3) below y 45
const W = 200, H = 120, px = 0.5, lum = new Float32Array(W * H).fill(0.8);
for (let y = 0; y < H; y++) lum[y * W + 60] = lum[y * W + 61] = 0.1; // a pen line at x 30 mm inside part 1
for (let y = 0; y < 90; y++) for (let x = 120; x < 160; x++) lum[y * W + x] = 0.4; // a tone change inside part 2 at x 60 mm (not a line)
const regionAt = (x, y) => (y >= 45 ? 3 : x < 50 ? 1 : 2), labelOf = id => (id === 3 ? 'foliage' : 'architecture');
const ctx = { lum, W, H, pxMm: px, regionAt, labelOf, shadow: null, step: 0.1, sheet: { W: 100, H: 60 }, tolMm: 0.93 };
const seg = (x0, y0, x1, y1) => Array.from({ length: 41 }, (_, k) => [x0 + (x1 - x0) * k / 40, y0 + (y1 - y0) * k / 40]);

test('each line is read by what it is', () => {
  assert.equal(meaningOf(seg(50, 5, 50, 40), ctx).cls, 'structure', 'a boundary between two built parts');
  assert.equal(meaningOf(seg(30.25, 5, 30.25, 40), ctx).cls, 'structure', 'a regular pen line inside a built part');
  assert.equal(meaningOf(seg(60, 5, 60, 40), ctx).cls, 'shadow', 'a tone edge inside a part');
  assert.equal(meaningOf(seg(10, 45, 40, 45), ctx).cls, 'structure', 'a building against foliage');
  assert.equal(meaningOf(seg(5, 0.5, 95, 0.5), ctx).cls, 'border', 'the sheet edge');
  assert.equal(meaningOf(seg(60, 5, 60, 40), { ...ctx, planAt: () => ({ id: 'jamb', what: 'jamb', role: 'contour' }) }).cls, 'structure', 'a line the plan names');
});

test('pieces of one contour join end to end; pieces side by side do not', () => {
  assert.equal(joinNearest([seg(0, 0, 10, 0), seg(12, 0, 20, 0)], 3.7).length, 1);
  assert.equal(joinNearest([seg(0, 0, 10, 0), seg(10, 2, 0, 2)], 3.7).length, 2);
});

for (const background of ['sky', 'foliage', 'paper']) test(`architecture against ${background} is structure in either direction`, () => {
  for (const reverse of [false, true]) {
    const c = { ...ctx, regionAt: (x) => x < 50 ? 1 : 2, labelOf: id => (id === (reverse ? 2 : 1) ? 'architecture' : background) };
    const m = meaningOf(seg(50, 5, 50, 40), c);
    assert.equal(m.cls, 'structure'); assert.equal(m.made, true);
  }
});

test('face and hands are regions, not feature labels', () => {
  for (const label of ['face', 'hands']) {
    const c = { ...ctx, labelOf: () => label };
    assert.notEqual(meaningOf(seg(30, 5, 30, 40), c).cls, 'landmark');
    assert.equal(meaningOf(seg(30, 5, 30, 40), { ...c, planAt: () => ({ id: 'nose', what: 'nose contour', role: 'landmark', feature: 'nose' }) }).cls, 'landmark');
    assert.equal(meaningOf(seg(30, 5, 30, 40), { ...c, planAt: () => ({ id: 'head', what: 'head outline', role: 'landmark' }) }).cls, 'structure');
  }
});

test('a late landmark spends the budget before earlier structure and texture', () => {
  const line = (inkClass, len) => ({ inkClass, points: [[0, 0], [len, 0]] });
  const r = inkBudget([line('texture', 8), line('structure', 8), line('landmark', 3)], 10, 1);
  assert.deepEqual(r.lines.map(g => g.inkClass), ['landmark']);
  assert.equal(r.record.spentMm, 3);
  assert.deepEqual(inkBudget([line('landmark', 6)], 3, 0.5).lines.length, 1);
});

test('a semantic shadow region is a value edge, not a body contour', () => {
  const c = { ...ctx, regionAt: x => x < 50 ? 1 : 2, labelOf: id => id === 1 ? 'face' : 'shadow_mass' };
  assert.equal(meaningOf(seg(50, 5, 50, 40), c).cls, 'shadow');
});

test('a resolved short structure or named feature survives the old tracer length gate', () => {
  for (const named of [false, true]) {
    const r = decideByMeaning([{ points: [[100, 20], [100, 30]] }], { ...ctx, budgetMm: 100,
      ...(named ? { planAt: () => ({ id: 'window', what: 'window jamb', role: 'landmark', feature: 'window', plannedMm: 40 }) } : {}) });
    assert.equal(r.lines.length, 1, '5 mm contour is resolved and meaningful');
    assert.equal(r.lines[0].inkClass, named ? 'landmark' : 'structure');
  }
});

test('every detector piece is classified before pieces can be joined', () => {
  const r = decideByMeaning([{ points: [[100, 20], [100, 30]] }, { points: [[100, 31], [100, 60]] }], {
    ...ctx, budgetMm: 100, planAt: P => P[0][1] < 15 ? { id: 'window', what: 'window jamb', feature: 'window', role: 'landmark' } : null });
  assert.equal(r.record.classified.length, 2);
  assert.equal(r.record.byClass.landmark.lines, 1);
  assert.equal(r.record.byClass.structure.lines, 1);
  assert.deepEqual(r.record.classified.map(g => g.cls), ['landmark', 'structure']);
});

test('unlabelled flanks fail in the pure semantic classifier too', () => {
  assert.throws(() => meaningOf(seg(50, 5, 50, 40), { ...ctx, labelOf: () => undefined }), /unlabelled or unknown semantic region/);
});
