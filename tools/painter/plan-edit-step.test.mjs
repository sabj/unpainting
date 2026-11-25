import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPlanEdit } from './plan-edit-step.mjs';

test('a wash plan may begin with an edit file; the studies follow it', () => {
  assert.deepEqual(splitPlanEdit('a.png:6,b.png:4@clusters=20'), [null, 'a.png:6,b.png:4@clusters=20']);
  assert.deepEqual(splitPlanEdit('edit:/r/author/plan-edit.json,a.png:6,b.png:4'), ['/r/author/plan-edit.json', 'a.png:6,b.png:4']);
  assert.deepEqual(splitPlanEdit('script:s.json'), [null, 'script:s.json']); assert.deepEqual(splitPlanEdit(''), [null, '']);
  assert.throws(() => splitPlanEdit('edit:x.json'), /the edit file, then the studies/); assert.throws(() => splitPlanEdit('edit:,a.png'), /the edit file, then the studies/);
});
