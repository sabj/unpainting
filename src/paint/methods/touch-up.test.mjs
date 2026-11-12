import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { touchLack, touchDue } from './touch-up.mjs';

test('a touch-up only darkens: a family darker than the subject lacks nothing', () => {
  assert.deepEqual(touchLack([0.5, 0.4, 0.3], [0.2, 0.6, 0.3]), [0.3, 0, 0]);
  assert.deepEqual(touchLack([0.1, 0.1, 0.1], [0.9, 0.9, 0.9]), [0, 0, 0]);
});

test('a family is corrected only a whole value step lighter than the subject', () => {
  assert.equal(touchDue(0.80, 0.70, 0.1), true);
  assert.equal(touchDue(0.79, 0.70, 0.1), false);
  assert.equal(touchDue(0.60, 0.70, 0.1), false); // darker than the subject: never lifted
  assert.throws(() => touchDue(0.8, 0.7, 0), /value step/);
});

test('the painter takes the touch-up lack from the darken-only rule, once, at its step-back', () => {
  const paint = fs.readFileSync(new URL('../../../tools/plate/paint.mjs', import.meta.url), 'utf8');
  const touch = paint.slice(paint.indexOf('const touchCorrections'), paint.indexOf('const finalDarks'));
  assert.match(touch, /touchLack\(od\(lk\.ref\.px\), od\(have\)\)/);
  assert.match(touch, /STEP_BACKS\.open\('washes'\)/);
  assert.match(touch, /touchDue\(/);
  // no second round is inserted after the first one's glazes (look, correct, look again)
  assert.doesNotMatch(paint, /_touch: layer\._touch \+ 1/);
  const planArgs = fs.readFileSync(new URL('../../../bench/scripts/pipeline/plan-args.mjs', import.meta.url), 'utf8');
  assert.match(planArgs, /'--touchpoints', '2'/);
  assert.doesNotMatch(planArgs.slice(planArgs.indexOf('ALLOWED_EXTRA_ARGS')), /touch(points|gain|dmin):/);
});
