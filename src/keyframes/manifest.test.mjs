import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSequence } from './manifest.mjs';

const plan = (frames, canvas = [240, 186]) => ({ version: 1, kind: 'artwork-keyframes', title: 'a sequence', canvas, frames });
const f = (id, position, extra = {}) => ({ id, label: id, position, src: `${id}.png`, ...extra });
const good = () => plan([f('paper', 0), f('preparation', 0.2), f('finished', 1)]);

test('a well formed sequence passes and comes back', () => { const p = good(); assert.equal(checkSequence(p), p); });

test('the canvas must be two whole pixel counts', () => {
  for (const canvas of [null, [240], [240, 186, 1], [240.5, 186], [0, 186], [240, 9000], ['240', 186]])
    assert.throws(() => checkSequence(plan(good().frames, canvas)), /canvas/);
});

test('every frame needs an id of its own, a label and an image', () => {
  assert.throws(() => checkSequence(plan([f('paper', 0), { ...f('x', 0.5), id: '' }, f('finished', 1)])), /id of its own/);
  assert.throws(() => checkSequence(plan([f('paper', 0), f('paper', 0.5), f('finished', 1)])), /id of its own/);
  assert.throws(() => checkSequence(plan([f('paper', 0), { ...f('x', 0.5), label: '' }, f('finished', 1)])), /label/);
  assert.throws(() => checkSequence(plan([f('paper', 0), { ...f('x', 0.5), src: '' }, f('finished', 1)])), /image/);
});

test('positions run from zero to one and always forward', () => {
  assert.throws(() => checkSequence(plan([f('a', 0.1), f('b', 1)])), /first frame must sit at 0/);
  assert.throws(() => checkSequence(plan([f('a', 0), f('b', 0.9)])), /last frame must sit at 1/);
  assert.throws(() => checkSequence(plan([f('a', 0), f('b', 0.5), f('c', 0.5), f('d', 1)])), /does not come after/);
  assert.throws(() => checkSequence(plan([f('a', 0), f('b', 0.7), f('c', 0.3), f('d', 1)])), /does not come after/);
  assert.throws(() => checkSequence(plan([f('a', 0), f('b', NaN), f('c', 1)])), /outside 0 to 1/);
  assert.throws(() => checkSequence(plan([f('a', 0), f('b', 1.2), f('c', 1)])), /outside 0 to 1/);
});

test('two frames are the fewest a sequence can have', () => {
  checkSequence(plan([f('paper', 0), f('finished', 1)]));
  assert.throws(() => checkSequence(plan([f('paper', 0)])), /at least two frames/);
  assert.throws(() => checkSequence({ canvas: [10, 10] }), /at least two frames/);
});
