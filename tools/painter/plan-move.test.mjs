// The plan's move is final (reasoning inventory move 2): no painter switch replaces a planned technique.
import test from 'node:test';
import assert from 'node:assert/strict';
import { painterSource } from '../plate/source.mjs';
import { REMOVED_OPTIONS } from '../../src/paint/removed-options.mjs';

const SRC = painterSource();

test('no forcing switch is left in the painter: each is a removed option with its reason', () => {
  for (const k of ['masswet', 'gradedwet', 'firstwet', 'firstwashwet', 'wetpolicy', 'wetlight', 'wetbig', 'wetmin', 'wetsubject', 'figuredry', 'nowow', 'nowowpart', 'dryeach']) {
    assert.ok(Object.hasOwn(REMOVED_OPTIONS, k), k);
    assert.doesNotMatch(SRC, new RegExp(`(num|opt)\\('${k}'`), `the painter still reads --${k}`);
  }
});

test('the technique is chosen once: every passage takes its wash plan\'s move', () => {
  // the only assignment that makes a passage wet on wet from the paint loop's own numbers is gone
  assert.doesNotMatch(SRC, /T = \{ \.\.\.T, name: 'wet on wet', water: 0\.88/);
  assert.match(SRC, /let T = valueTechnique\(sh\._valuePlan\);/);
  // the source is no longer read for a technique (the ladder's chooseTechnique was removed in 0.4)
  assert.doesNotMatch(SRC, /techniqueOf\(/);
});
