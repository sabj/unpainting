import test from 'node:test';
import assert from 'node:assert/strict';
import { lookSets, lookCells, lookFromPlan, lookSizeNote } from './look.mjs';

test('every look is half the cells across and tells the painter the final painting\'s cells', () => {
  assert.equal(lookCells(1086), 543); assert.equal(lookCells(20), 16);
  assert.deepEqual(lookSets([['seed', '3'], ['width', '900'], ['finalwidth', '7']], 1086), [['seed', '3'], ['width', '543'], ['finalwidth', '1086'], ['video', '0'], ['recording', 'light']]);
  // a sheet already at the least size is its own final
  assert.deepEqual(lookSets([], 16), [['width', '16'], ['video', '0'], ['recording', 'light']]);
});

test('a look encodes no film and records lightly, whatever the run records of its final', () => {
  const sets = lookSets([['video', '1'], ['frames', '48'], ['recording', 'full'], ['marks', '1']], 1086);
  assert.deepEqual(sets.filter(([k]) => ['video', 'recording'].includes(k)), [['video', '0'], ['recording', 'light']]);
  // the film's frames asked are kept (light caps them at 40), and the marks are still recorded
  assert.deepEqual(sets.filter(([k]) => ['frames', 'marks'].includes(k)), [['frames', '48'], ['marks', '1']]);
});

test('the code planner\'s plan (as it stands, tuned or edited) is painted from its kept plan; a script from the script', () => {
  assert.equal(lookFromPlan('plan'), true); assert.equal(lookFromPlan('settings'), true); assert.equal(lookFromPlan('script'), false);
  assert.match(lookSizeNote({ cells: 543, fullCells: 1086, cellMm: 0.52, kind: 'plan' }), /543 cells across .* final painting has 1086.*the final plan's own, wash for wash/);
  assert.doesNotMatch(lookSizeNote({ cells: 543, fullCells: 1086, cellMm: 0.52, kind: 'script' }), /wash for wash/);
});
