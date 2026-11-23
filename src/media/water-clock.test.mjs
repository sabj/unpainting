import test from 'node:test';
import assert from 'node:assert/strict';
import { waterClock, brushEvery, BRUSH_EVERY, PEN_EVERY } from './water-clock.mjs';

const lay = (o, splats) => { for (let s = 1; s <= splats; s++) o.between(s); };

test('the brush cadence is the main painter\'s: max(24, 24 sqrt(n)) splats a step', () => {
  assert.equal(brushEvery(1), BRUSH_EVERY);
  assert.equal(brushEvery(4), 48);
  assert.equal(brushEvery(100), 240);
  assert.equal(brushEvery(0), BRUSH_EVERY);
});

test('brush time is carried from stroke to stroke: short strokes step as often as one long one', () => {
  let n = 0; const c = waterClock(() => n++);
  const o = c.stroke(); assert.equal(o.flowEvery, 24); assert.equal(o.gpuBetween, true);
  lay(o, 10); assert.equal(n, 0);
  // the next stroke is the second of the sitting: 34 splats a step; 10 carried + 30 = 40 >= 34
  lay(c.stroke(), 30); assert.equal(n, 1);
  assert.equal(c.counts.sitting, 2);
});

test('a long stroke steps the sheet at its cadence; a pen at 60 splats', () => {
  let n = 0; const c = waterClock(() => n++);
  lay(c.stroke(), 240); assert.equal(n, 10);
  const p = c.stroke('pen'); assert.equal(p.flowEvery, PEN_EVERY); lay(p, 125); assert.equal(n, 12);
  assert.equal(c.counts.strokeSteps, 12);
});

test('a wait steps n times back to back and starts a new sitting; dried() starts one too', () => {
  let n = 0; const c = waterClock(() => n++);
  for (let k = 0; k < 9; k++) lay(c.stroke(), 5);
  assert.equal(c.counts.sitting, 9);
  assert.equal(n, 0, "45 splats over nine strokes: under the cadence");
  c.wait(20); assert.equal(n, 20); assert.equal(c.counts.waitSteps, 20); assert.equal(c.counts.sitting, 0);
  assert.equal(c.stroke().flowEvery, 24);
  c.dried(); assert.equal(c.counts.sitting, 0);
  for (const bad of [0, -1, 1.5, 3000, NaN]) assert.throws(() => c.wait(bad), /whole number of moments/);
});
