import test from 'node:test';
import assert from 'node:assert/strict';
import { lookSets, lookCells } from './look.mjs';

test('a small look tells the painter the final painting\'s cells; a look at full size does not', () => {
  assert.equal(lookCells(1086, 'script'), 543);
  assert.deepEqual(lookSets([['video', '0'], ['width', '900'], ['finalwidth', '7']], 1086, 'script'), [['video', '0'], ['width', '543'], ['finalwidth', '1086']]);
  assert.deepEqual(lookSets([['video', '0']], 1086, 'plan'), [['video', '0'], ['width', '1086']]);
});
