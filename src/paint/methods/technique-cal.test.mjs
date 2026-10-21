import test from 'node:test';
import assert from 'node:assert/strict';
import { createTechniqueCal } from './technique-cal.mjs';

test('a technique that lays half its charge is charged about twice, within the clamp', () => {
  const cal = createTechniqueCal({ smooth: 1 });
  cal.observe(10);
  cal.book('glazed graded', 4);
  const r = cal.observe(12);
  assert.equal(r.technique, 'glazed graded');
  assert.equal(r.kept, 0.5);
  assert.equal(cal.factor('glazed graded'), 2);
  assert.equal(cal.factor('wet on dry'), 1);
  cal.book('glazed graded', 1); cal.observe(12.1);
  assert.equal(cal.factor('glazed graded'), 2.5);
});

test('a mixed window calibrates nothing; the first read only sets the baseline', () => {
  const cal = createTechniqueCal();
  cal.book('glazed', 5);
  assert.equal(cal.observe(3).kept, null);
  cal.book('glazed', 1); cal.book('wet on dry', 1);
  assert.equal(cal.observe(4).technique, null);
  assert.deepEqual(cal.factors(), {});
  assert.equal(cal.history().length, 2);
});

test('an over-delivering technique is lowered no further than min', () => {
  const cal = createTechniqueCal({ smooth: 1, min: 0.8 });
  cal.observe(0); cal.book('wet on wet', 1); cal.observe(2);
  assert.equal(cal.factor('wet on wet'), 0.8);
  assert.throws(() => createTechniqueCal({ share: 0.4 }), /share/);
});
