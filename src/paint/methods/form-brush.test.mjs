import test from 'node:test';
import assert from 'node:assert/strict';
import { namedForms } from './named-forms.mjs';
import { brushCeilingMm, kitUnder } from './form-brush.mjs';

test('the brush ceiling: a wash in a face takes the ceiling; one in the sky, in no form, or only overlapping a face\'s edge does not; a wash spanning the boundary does', () => {
  const m = { width: 10, height: 10, ids: Uint8Array.from({ length: 100 }, (_, i) => (i % 10 < 5 ? 1 : i % 10 < 9 ? 2 : 0)), names: ['a face', 'the sky'], kinds: ['face', 'sky'] };
  const f = namedForms(m, 10, 10), col = x => Array.from({ length: 10 }, (_, y) => y * 10 + x), cols = (...xs) => xs.flatMap(col);
  assert.equal(brushCeilingMm(cols(0, 1, 2), f, 17), 17);
  assert.equal(brushCeilingMm(cols(5, 6, 7), f, 17), Infinity);
  assert.equal(brushCeilingMm(cols(9), f, 17), Infinity);
  assert.equal(brushCeilingMm(cols(3, 4, 5, 6), f, 17), 17, 'spans the boundary');
  assert.equal(brushCeilingMm([...cols(5, 6, 7, 8), ...cols(5, 6, 7, 8), ...cols(5, 6, 7, 8), 4], f, 17), Infinity, 'one cell of the face in 121');
  assert.equal(brushCeilingMm(cols(0), null, 17), Infinity);
  assert.deepEqual(kitUnder([38, 25.4, 17, 13, 10, 7, 5], 17), [17, 13, 10, 7, 5]);
  const kit = [38, 25.4, 7, 5]; assert.equal(kitUnder(kit, Infinity), kit);
  assert.deepEqual(kitUnder([38, 25.4], 17), [25.4]);
});
