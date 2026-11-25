import test from 'node:test';
import assert from 'node:assert/strict';
import { boundaryOfStage, stoppedText } from './stage-look.mjs';
import { stoppedLookFault } from './look.mjs';

test('a stage ends at the boundary after its last pass; a plan that ends with the stage runs whole', () => {
  const passes = [{ stage: 1 }, { stage: 1 }, { stage: 2 }, { stage: 3 }, { stage: 3 }];
  assert.equal(boundaryOfStage(passes, 1), 2); assert.equal(boundaryOfStage(passes, 2), 3); assert.equal(boundaryOfStage(passes, 3), 5); assert.equal(boundaryOfStage(passes, 5), 5);
  assert.equal(boundaryOfStage([{ stage: 2 }], 1), 0, 'nothing of stage 1: the stop is before the first wash');
  const said = stoppedText({ passesDone: 2, passesPlanned: 5, strokes: 40, remaining: [{ stage: 2, passages: 1 }, { stage: 3, passages: 4 }, { stage: 3, passages: 2 }] }, 1);
  assert.match(said, /PAINTED THROUGH STAGE 1 AND STOPPED: 2 of 5 passes are on the paper \(40 strokes\)[\s\S]*stage 2: 1 washes; stage 3: 6 washes/); assert.doesNotMatch(said, /unpaint keep/);
});

test('a look stopped at a stage is shown only when the painter said its sheet ran on the GPU and nothing says it left it', () => {
  assert.equal(stoppedLookFault('plan ready\n[gpu] sheet running on the GPU\nsheet backend: gpu (webgpu (Dawn), apple metal-3; --gpu on)\nwash 1'), null);
  assert.match(stoppedLookFault('sheet backend: cpu (--gpu off)'), /did not stay on the GPU \(the painter's log: sheet backend: cpu\)/);
  assert.match(stoppedLookFault('sheet backend: gpu (webgpu)\n!!! the GPU was lost: falling back to the CPU'), /did not stay on the GPU/);
  assert.match(stoppedLookFault('nothing of the kind'), /did not say which backend/); assert.match(stoppedLookFault(null), /did not say which backend/);
});
