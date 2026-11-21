import test from 'node:test';
import assert from 'node:assert/strict';
import { namedForms, formCoverage, formGrid } from './named-forms.mjs';

// a 4 x 2 id map: the left half form 1 (a face), the right half form 2 (no kind), one cell of no form
const mask = { width: 4, height: 2, ids: Uint8Array.from([1, 1, 2, 2, 1, 1, 2, 0]), names: ['cat face', 'thing'], kinds: ['face', null] };

test('the id map is read at cell centres on the plan grid, never interpolated', () => {
  assert.deepEqual([...formGrid(mask, 8, 4)].slice(0, 8), [1, 1, 1, 1, 2, 2, 2, 2]);
  assert.deepEqual([...formGrid(mask, 2, 1)], [1, 0]);
});

test('each plan cell has its form id and kind; a form with no known kind is other; no form is null', () => {
  const f = namedForms(mask, 8, 4);
  assert.equal(f.kindAt(0), 'face'); assert.equal(f.kindAt(5), 'other'); assert.equal(f.kindAt(31), null);
  assert.deepEqual(f.forms.map(x => [x.id, x.name, x.kind, x.cells]), [[1, 'cat face', 'face', 16], [2, 'thing', 'other', 12]]);
  assert.equal(namedForms(null, 8, 4), null);
  assert.throws(() => namedForms({ ...mask, ids: new Uint8Array(3) }, 8, 4), /width x height/);
});

test('coverage lists the forms under a wash by share', () => {
  const f = namedForms(mask, 4, 2);
  assert.deepEqual(formCoverage([0, 1, 2, 7], f), [{ id: 1, name: 'cat face', kind: 'face', share: 0.5 }, { id: 2, name: 'thing', kind: 'other', share: 0.25 }]);
});
