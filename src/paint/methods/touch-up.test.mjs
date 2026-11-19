import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { touchLack, touchGap, touchDue, touchFilmUnits, TOUCH_VISIBLE } from './touch-up.mjs';
import { unmix } from '../../crop/pigments.mjs';
import { renderLayers } from '../../media/km.mjs';

const PAPER = [252, 251, 248];

test('a touch-up only darkens: a family darker than the subject lacks nothing', () => {
  assert.deepEqual(touchLack([0.5, 0.4, 0.3], [0.2, 0.6, 0.3]), [0.3, 0, 0]);
  assert.deepEqual(touchLack([0.1, 0.1, 0.1], [0.9, 0.9, 0.9]), [0, 0, 0]);
});

test('a dark that dried light is seen: a few lightness steps in the darks is a gap, though it is a hair of linear luminance', () => {
  const gap = touchGap([60, 58, 56], [36, 34, 32], PAPER);
  assert.ok(gap.lighter > 8, `${gap.lighter}`);
  assert.ok(0.2126 * (60 - 36) / 255 < 0.12, 'under the old 0.12 luminance step, so it was never read');
  assert.equal(touchDue(gap), true);
});

test('a family is corrected when it reads lighter or less chromatic by a visible step, and never lifted', () => {
  assert.equal(touchDue({ lighter: TOUCH_VISIBLE, lessChromatic: 0 }), true);
  assert.equal(touchDue({ lighter: TOUCH_VISIBLE - 0.1, lessChromatic: 0 }), false);
  assert.equal(touchDue({ lighter: -30, lessChromatic: 0 }), false); // darker than the subject: left alone
  assert.equal(touchDue({ lighter: 0, lessChromatic: TOUCH_VISIBLE }), true); // a shirt that dried grey
  const salmon = touchGap([205, 140, 120], [190, 60, 50], PAPER);
  assert.ok(salmon.lessChromatic > 10, `${salmon.lessChromatic}`);
  assert.equal(touchDue(salmon), true);
  assert.equal(touchDue(touchGap([200, 120, 100], [200, 120, 100], PAPER)), false);
});

test('a glaze is sized from the measured gap: the amounts laid as a film give back the density that was lacking', () => {
  const pigs = [{ K: [0.5, 0.2, 0.05], S: [0, 0, 0] }, { K: [0.05, 0.25, 0.5], S: [0, 0, 0] }, { K: [0.0, 0.45, 0.32], S: [0, 0, 0] }];
  const lack = [0.3, 0.5, 0.45], a = unmix(Float32Array.from(lack), 1, touchFilmUnits(pigs), { iterations: 400 });
  const out = renderLayers([pigs.map((_, j) => Float32Array.of(a[j]))], pigs, Uint8ClampedArray.from([255, 255, 255]), 1, 1);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(-Math.log(out[c] / 255) - lack[c]) < 0.03, `channel ${c}: ${-Math.log(out[c] / 255)} against ${lack[c]}`);
});

test('the painter takes the touch-up lack from the darken-only rule, once a round, in rounds fixed before painting', () => {
  const paint = fs.readFileSync(new URL('../../../tools/plate/paint.mjs', import.meta.url), 'utf8');
  const touch = paint.slice(paint.indexOf('const touchCorrections'), paint.indexOf('const finalDarks'));
  assert.match(touch, /touchLack\(od\(lk\.ref\.px\), od\(have\)\)/);
  assert.match(touch, /STEP_BACKS\.open\(/);
  assert.match(touch, /touchDue\(touchGap\(/);
  assert.match(touch, /touchFilmUnits\(PIGS\)/);
  // a gain that covers an engine error is a calibration: the glaze is sized from the gap, not scaled by a constant
  assert.doesNotMatch(touch, /touchgain/);
  // the next round is queued after a round that corrected something, up to --touchpoints
  assert.match(paint, /_touch: layer\._touch \+ 1/);
  assert.match(paint, /layer\._touch < TP_ROUNDS/);
  const recipe = fs.readFileSync(new URL('../recipe.mjs', import.meta.url), 'utf8');
  // the default recipe lays no touch-up round: correcting toward the subject's colour after a look is off since 0.4
  assert.match(recipe, /--touchpoints 0/);
});
