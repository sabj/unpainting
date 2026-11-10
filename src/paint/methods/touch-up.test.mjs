import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { touchLack } from './touch-up.mjs';

test('a touch-up only darkens: a family darker than the subject lacks nothing', () => {
  assert.deepEqual(touchLack([0.5, 0.4, 0.3], [0.2, 0.6, 0.3]), [0.3, 0, 0]);
  assert.deepEqual(touchLack([0.1, 0.1, 0.1], [0.9, 0.9, 0.9]), [0, 0, 0]);
});

test('the painter takes the touch-up lack from the darken-only rule and the plan keeps two fixed rounds', () => {
  const paint = fs.readFileSync(new URL('../../../tools/plate/paint.mjs', import.meta.url), 'utf8');
  const touch = paint.slice(paint.indexOf('const touchCorrections'), paint.indexOf('const finalDarks'));
  assert.match(touch, /touchLack\(Dt, Ds\)/);
  const planArgs = fs.readFileSync(new URL('../../../bench/scripts/pipeline/plan-args.mjs', import.meta.url), 'utf8');
  assert.match(planArgs, /'--touchpoints', '2'/);
  assert.doesNotMatch(planArgs.slice(planArgs.indexOf('ALLOWED_EXTRA_ARGS')), /touch(points|gain|dmin):/);
});
