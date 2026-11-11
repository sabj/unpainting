// The plan's move is final (reasoning inventory move 2): no painter switch replaces a planned technique.
import test from 'node:test';
import assert from 'node:assert/strict';
import { painterSource } from '../plate/source.mjs';
import { REMOVED_OPTIONS } from '../../src/paint/removed-options.mjs';
import { semanticTechnique } from './semantic-areas.mjs';

const SRC = painterSource();

test('no forcing switch is left in the painter: each is a removed option with its reason', () => {
  for (const k of ['masswet', 'gradedwet', 'firstwet', 'firstwashwet', 'wetpolicy', 'wetlight', 'wetbig', 'wetmin', 'wetsubject', 'figuredry', 'nowow', 'nowowpart', 'dryeach']) {
    assert.ok(Object.hasOwn(REMOVED_OPTIONS, k), k);
    assert.doesNotMatch(SRC, new RegExp(`(num|opt)\\('${k}'`), `the painter still reads --${k}`);
  }
});

test('the technique is chosen once: an area pass by its move, a value plan by its own, the source only with no plan', () => {
  // the only assignment that makes a passage wet on wet from the paint loop's own numbers is gone
  assert.doesNotMatch(SRC, /T = \{ \.\.\.T, name: 'wet on wet', water: 0\.88/);
  assert.match(SRC, /let T = sh\._semantic \? \{\} : sh\._valuePlan \? valueTechnique\(sh\._valuePlan\) : techniqueOf\(sh\);/);
  // a value plan's technique never overwrites an area pass's move
  assert.match(SRC, /if\(sh\._valuePlan\)\{if\(!sh\._semantic\)T=valueTechnique\(sh\._valuePlan\);/);
});

test('an area pass takes its own move whatever the starting technique', () => {
  const pass = { move: 'wet on dry', source: 'numeric', load: { water: 0.5 } };
  for (const start of [{}, { name: 'wet on wet', intoWet: true, passes: 2 }]) {
    const T = semanticTechnique({ pass }, start);
    assert.deepEqual([T.name, T.intoWet, T.dryAfter, T.water, T.passes], ['wet on dry', false, true, 0.5, 1]);
  }
});
