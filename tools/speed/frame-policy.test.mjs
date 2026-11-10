import {test} from 'node:test';
import assert from 'node:assert/strict';
import {framePolicy, fastPaintFrame, progressFrames} from './frame-policy.mjs';

test('checkpoints keep first wash and five completed boundaries plus gallery stages', () => {
  const policy = framePolicy(), kept = [];
  for (const stage of ['paper', 'pen', 'prep', 'frisket']) assert(policy.keep({stage}));
  for (let pass = 1; pass <= 100; pass++) {
    assert.equal(policy.keep({stage: 'paint', pass, of: 100, laying: true}), false);
    if (policy.keep({stage: 'paint', pass, of: 100})) kept.push(pass);
  }
  assert.deepEqual(kept, [1, 10, 25, 50, 75, 100]);
  assert(policy.keep({stage: 'finished'}));
  assert.equal(policy.keep({stage: 'finished'}), false);
});
test('short paintings, video, dynamic pass expansion and explicit all-frame output retain valid states', () => {
  const policy = framePolicy();
  for (let pass = 1; pass <= 3; pass++) assert(policy.keep({stage: 'paint', pass, of: 3}));
  const dyn = framePolicy(), dynKept = [];
  for (let pass = 1; pass <= 21; pass++) if (dyn.keep({stage: 'paint', pass, of: 27})) dynKept.push(pass);
  for (let pass = 22; pass <= 50; pass++) if (dyn.keep({stage: 'paint', pass, of: 50, ...(pass === 26 ? {force: true} : {})})) dynKept.push(pass);
  assert.deepEqual(dynKept, [1, 3, 7, 14, 21, 22, 25, 26, 38, 50]);
  for (const option of [{video: true}, {keepAll: true}]) {
    const all = framePolicy(option);
    assert(all.all);
    assert(all.keep({stage: 'paint', pass: 2, of: 100, laying: true}));
  }
});
test('a forced value-band boundary is kept at any progress and uses no checkpoint', () => {
  const policy = framePolicy(), kept = [];
  for (let pass = 1; pass <= 40; pass++) {
    const boundary = pass === 3 || pass === 12 ? {force: true, boundary: 'value'} : {};
    if (policy.keep({stage: 'paint', pass, of: 40, ...boundary})) kept.push(pass);
  }
  assert.deepEqual(kept, [1, 3, 4, 10, 12, 20, 30, 40]);
});
test('fast all-frame films keep every fourth completed pass, every forced boundary and every other stage', () => {
  assert.equal(fastPaintFrame({stage: 'paint', pass: 1, of: 40}), true);
  assert.equal(fastPaintFrame({stage: 'paint', pass: 5, of: 40}), false);
  assert.equal(fastPaintFrame({stage: 'paint', pass: 8, of: 40}), true);
  assert.equal(fastPaintFrame({stage: 'paint', pass: 8, of: 40, laying: true}), false);
  assert.equal(fastPaintFrame({stage: 'paint', pass: 5, of: 40, force: true, boundary: 'value'}), true);
  assert.equal(fastPaintFrame({stage: 'paint', pass: 5, of: 40, force: true, laying: true}), false);
  for (const stage of ['paper', 'frisket', 'prep', 'finished']) assert.equal(fastPaintFrame({stage}), true);
});

test('progress frames fall at equal shares of the sweeps, and none on the last sweep, which its pass already films', () => {
  const p = progressFrames(120, 12);
  const due = [];
  for (let i = 1; i <= 120; i++) if (p.laid()) due.push(i);
  assert.deepEqual(due, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]);
});

test('progress frames skip shares a long count jumps over, and an empty plan films nothing', () => {
  const p = progressFrames(3, 12);
  assert.deepEqual([p.laid(), p.laid(), p.laid()], [true, true, false]);
  assert.equal(progressFrames(0).laid(), false);
});
