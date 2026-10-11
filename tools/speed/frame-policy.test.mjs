import {test} from 'node:test';
import assert from 'node:assert/strict';
import {framePolicy} from './frame-policy.mjs';

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
test('short paintings, video and explicit all-frame output retain valid states', () => {
  const policy = framePolicy();
  for (let pass = 1; pass <= 3; pass++) assert(policy.keep({stage: 'paint', pass, of: 3}));
  for (const option of [{video: true}, {keepAll: true}]) {
    const all = framePolicy(option);
    assert(all.all);
    assert(all.keep({stage: 'paint', pass: 2, of: 100, laying: true}));
  }
});
