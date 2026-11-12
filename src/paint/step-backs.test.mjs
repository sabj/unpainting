import test from 'node:test';
import assert from 'node:assert/strict';
import { planStepBacks, createStepBacks, subjectValueStep, lumOf } from './step-backs.mjs';

const fakeGuard = () => { const calls = []; return { calls, look: (...a) => { calls.push(a[1]); return { cells: 99, ref: { px: [10, 10, 10] }, sheet: {} }; } }; };

test('step-backs are planned from the options alone, before the first mark', () => {
  assert.deepEqual(planStepBacks({}).map(p => p.id), []);
  assert.deepEqual(planStepBacks({ touchpoints: 1 }).map(p => p.id), ['washes']);
  // --touchpoints 2 is one step-back, not two rounds: a second round would look again at what the first corrected
  assert.deepEqual(planStepBacks({ touchpoints: 2 }).map(p => p.id), ['washes']);
  assert.deepEqual(planStepBacks({ touchpoints: 2, finalDarks: 1 }).map(p => p.id), ['washes', 'accents']);
});

test('no look outside an open step-back: passages keep their frozen charge', () => {
  const g = fakeGuard(), sb = createStepBacks(g, 0, planStepBacks({ touchpoints: 2 }));
  assert.equal(sb.look('passage', 'L1/s0', null), null);
  assert.equal(sb.look('texture', 'L2/s3', null), null);
  assert.deepEqual(g.calls, []);
  sb.open('washes');
  assert.ok(sb.look('passage', 'touch/s0', null));
  sb.close(1);
  assert.equal(sb.look('passage', 'L9/s0', null), null);
  const r = sb.record();
  assert.deepEqual(r.declinedOutsideStepBacks, { passage: 2, texture: 1 });
  assert.equal(r.shapeLooks, 1);
  assert.deepEqual(r.taken.map(t => [t.id, t.looks, t.corrections]), [['washes', 1, 1]]);
});

test('a step-back is never repeated, never unplanned, and reads each shape once', () => {
  const sb = createStepBacks(fakeGuard(), 0, planStepBacks({ touchpoints: 2 }));
  assert.throws(() => sb.open('accents'), /not a planned step-back/);
  sb.open('washes');
  sb.look('passage', 'touch/s4', null);
  assert.throws(() => sb.look('passage', 'touch/s4', null), /looked at once/);
  sb.close(0);
  assert.throws(() => sb.open('washes'), /never repeated/);
});

test('strict mode takes the planned step-backs with no look at all', () => {
  const g = fakeGuard(), sb = createStepBacks(g, 1, planStepBacks({ touchpoints: 2, finalDarks: 1 }));
  sb.open('washes');
  assert.equal(sb.look('passage', 'touch/s0', null), null);
  sb.close(0);
  assert.deepEqual(g.calls, []);
  assert.equal(sb.record().shapeLooks, 0);
});

test('the value step is one step of the subject\'s own nine-step scale', () => {
  const lum = new Float32Array(1000).map((_, i) => i / 999);
  assert.ok(Math.abs(subjectValueStep(lum) - (lum[990] - lum[1]) / 8) < 1e-6);
  const pale = lum.map(v => 0.6 + 0.4 * v); // a pale subject has smaller steps
  assert.ok(subjectValueStep(pale) < subjectValueStep(lum));
  assert.ok(Math.abs(lumOf([255, 255, 255]) - 1) < 1e-9);
});
