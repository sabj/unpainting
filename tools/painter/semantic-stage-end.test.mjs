import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticStageEnd } from './semantic-stage-end.mjs';

const pass = (area, id, stage) => ({ _semantic: { area: { id: area }, pass: { id, ...(stage ? { stage } : {}) }, key: `${area}/${id}` } });

test('an area plan steps past its first layer when touch-up and final-dark layers follow the area passes', () => {
  // the paint loop appends these after the area passes (tools/plate/paint.mjs, TP_SHAPES and FD_SHAPES)
  const layers = [pass('sky', 'wash'), pass('hill', 'wash'), pass('hill', 'shade', 'shade'), { _touch: 1, shapes: [] }, { _darks: 1, shapes: [] }];
  for (let L = 0; L < 3; L++) assert.doesNotThrow(() => semanticStageEnd(layers, L), `layer ${L}`);
  assert.deepEqual(semanticStageEnd(layers, 0), { stage: 'wash', lastArea: true, lastStage: false });
  assert.deepEqual(semanticStageEnd(layers, 1), { stage: 'wash', lastArea: false, lastStage: true });
  assert.deepEqual(semanticStageEnd(layers, 2), { stage: 'shade', lastArea: true, lastStage: true });
});
