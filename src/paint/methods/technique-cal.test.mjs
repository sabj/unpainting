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

test('initial baseline allows calibration on the very first booking window', () => {
  const cal = createTechniqueCal({ smooth: 1, baseline: 0 });
  cal.book('wet on dry', 4);
  const r = cal.observe(2);
  assert.equal(r.technique, 'wet on dry');
  assert.equal(r.kept, 0.5);
  assert.equal(cal.factor('wet on dry'), 2);
});

test('mixed window with dominant technique isolates yield by deducting secondary technique expected gain', () => {
  const cal = createTechniqueCal({ smooth: 1, baseline: 10 });
  // Dominant: 'glazed graded' (mass 8), Secondary: 'wet on dry' (mass 2). Total charged = 10.
  // 'wet on dry' has default factor 1 (expected yield 2/1 = 2).
  // Total gain observed = 6. Dominant net gained = 6 - 2 = 4. Kept = 4 / 8 = 0.5 -> factor = 2.
  cal.book('glazed graded', 8);
  cal.book('wet on dry', 2);
  const r = cal.observe(16);
  assert.equal(r.technique, 'glazed graded');
  assert.equal(r.kept, 0.5);
  assert.equal(cal.factor('glazed graded'), 2);
  assert.equal(cal.factor('wet on dry'), 1);
});

