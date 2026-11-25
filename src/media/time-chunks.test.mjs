import test from 'node:test';
import assert from 'node:assert/strict';
import { timeChunks, STEP_CHUNK_DT, DRY_TAIL_CHUNK_DT } from './time-chunks.mjs';

test('an ordinary step is cut into chunks of at most 2, the fast dry tail into longer ones', () => {
  assert.equal(STEP_CHUNK_DT, 2);
  assert.equal(timeChunks(0.1), 1); assert.equal(timeChunks(2), 1); assert.equal(timeChunks(28), 14);
  assert.ok(DRY_TAIL_CHUNK_DT > STEP_CHUNK_DT);
  assert.equal(timeChunks(28, DRY_TAIL_CHUNK_DT), Math.ceil(28 / DRY_TAIL_CHUNK_DT));
  assert.ok(timeChunks(140, DRY_TAIL_CHUNK_DT) < timeChunks(140));
});
