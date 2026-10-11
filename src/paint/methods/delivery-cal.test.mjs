import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeliveryCal } from './delivery-cal.mjs';

test('starts at 1 and stays there until a pan has been charged', () => {
  const cal = createDeliveryCal(2);
  assert.deepEqual(cal.factors(), [1, 1]);
  cal.observe([0.5, 0.5]);
  assert.deepEqual(cal.factors(), [1, 1]);
});

test('a pan that keeps 0.7 of its charge is charged about 1/0.7 later', () => {
  const cal = createDeliveryCal(1, { smooth: 1 });
  cal.book(0, 10);
  cal.observe([7]);
  assert.ok(Math.abs(cal.factor(0) - 1 / 0.7) < 1e-9);
});

test('once calibrated, full delivery of the boosted charge keeps the factor', () => {
  const cal = createDeliveryCal(1, { smooth: 1 });
  cal.book(0, 10); cal.observe([7]);
  const f = cal.factor(0);
  // the next pass is charged 10 * f and the sheet keeps 0.7 of it: cumulative kept stays 0.7
  cal.book(0, 10 * f); cal.observe([7 + 7 * f]);
  assert.ok(Math.abs(cal.factor(0) - f) < 1e-9);
});

test('clamped: never below 1, never above max', () => {
  const cal = createDeliveryCal(2, { smooth: 1, max: 1.5 });
  cal.book(0, 10); cal.book(1, 10);
  cal.observe([2, 15]);
  assert.deepEqual(cal.factors(), [1.5, 1]);
});

test('smoothing blends the new reading with the old factor', () => {
  const cal = createDeliveryCal(1, { smooth: 0.5, max: 3 });
  cal.book(0, 10); cal.observe([5]);
  assert.ok(Math.abs(cal.factor(0) - 1.5) < 1e-9);
});

test('rejects bad options', () => {
  assert.throws(() => createDeliveryCal(0));
  assert.throws(() => createDeliveryCal(1, { max: 0.5 }));
});
