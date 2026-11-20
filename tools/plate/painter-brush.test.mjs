import test from 'node:test';
import assert from 'node:assert/strict';
import { painterBrushOptions, isSection } from './painter-brush.mjs';

test('the painter makes section brushes unless a plan names the tuft', () => {
  assert.equal(painterBrushOptions({ radius: 4 }).model, 'section');
  assert.equal(painterBrushOptions({ radius: 4, model: 'row' }).model, 'section');
  assert.equal(painterBrushOptions({ radius: 4, model: 'tuft' }).model, 'tuft');
  assert.ok(isSection(painterBrushOptions({})) && !isSection({ model: 'tuft' }));
});
