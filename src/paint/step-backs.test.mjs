import test from 'node:test';
import assert from 'node:assert/strict';
import { planStepBacks, createStepBacks } from './step-backs.mjs';

const fakeGuard = () => { const calls = []; return { calls, look: (...a) => { calls.push(a[1]); return { cells: 99, ref: { px: [10, 10, 10] }, sheet: {} }; } }; };

test('step-backs are planned from the options alone, before the first mark', () => {
  assert.deepEqual(planStepBacks({}).map(p => p.id), []);
  assert.deepEqual(planStepBacks({ touchpoints: 1 }).map(p => p.id), ['washes']);
  // --touchpoints 2 is two rounds, each its own step-back, fixed before painting
  assert.deepEqual(planStepBacks({ touchpoints: 2 }).map(p => p.id), ['washes', 'washes-2']);
  assert.deepEqual(planStepBacks({ touchpoints: 2, finalDarks: 1 }).map(p => p.id), ['washes', 'washes-2', 'accents']);
});

test('a passage takes its own look, any other look needs an open step-back', () => {
  const g = fakeGuard(), sb = createStepBacks(g, 0, planStepBacks({ touchpoints: 2 }));
  assert.ok(sb.look('passage', 'L1/s0', null), 'a passage looks as it is laid');
  assert.equal(sb.look('texture', 'L2/s3', null), null);
  assert.deepEqual(g.calls, ['L1/s0']);
  sb.open('washes');
  assert.ok(sb.look('passage', 'touch1/s0', null));
  sb.close(1);
  assert.ok(sb.look('passage', 'L9/s0', null));
  assert.equal(sb.look('kept', 'L9/s1', null), null);
  const r = sb.record();
  assert.deepEqual(r.declinedOutsideStepBacks, { texture: 1, kept: 1 });
  assert.equal(r.shapeLooks, 1);
  assert.equal(r.passageLooks, 2);
  assert.deepEqual(r.taken.map(t => [t.id, t.looks, t.corrections]), [['washes', 1, 1]]);
});

test('a step-back is never repeated, never unplanned, and reads each shape once', () => {
  const sb = createStepBacks(fakeGuard(), 0, planStepBacks({ touchpoints: 2 }));
  assert.throws(() => sb.open('accents'), /not a planned step-back/);
  sb.open('washes');
  sb.look('passage', 'touch1/s4', null);
  assert.throws(() => sb.look('passage', 'touch1/s4', null), /looked at once/);
  sb.close(0);
  assert.throws(() => sb.open('washes'), /never repeated/);
  sb.open('washes-2');
  sb.look('passage', 'touch2/s4', null);
  sb.close(0);
  assert.throws(() => sb.look('passage', 'L1/s0', null) && sb.look('passage', 'L1/s0', null), /looked at once/);
});

test('strict mode takes the planned step-backs with no look at all, passages included', () => {
  const g = fakeGuard(), sb = createStepBacks(g, 1, planStepBacks({ touchpoints: 2, finalDarks: 1 }));
  assert.equal(sb.look('passage', 'L1/s0', null), null);
  sb.open('washes');
  assert.equal(sb.look('passage', 'touch1/s0', null), null);
  sb.close(0);
  assert.deepEqual(g.calls, []);
  const r = sb.record();
  assert.equal(r.shapeLooks, 0);
  assert.equal(r.passageLooks, 0);
});
