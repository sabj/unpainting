import test from 'node:test';
import assert from 'node:assert/strict';
import { levelOf, handedAt, BENCHMARK_LEVELS } from './levels.mjs';
import { levelBlock } from './brief.mjs';

test('L4b open-book level is registered with openBook=true and stays off default honest BENCHMARK_LEVELS', () => {
  assert.ok(!BENCHMARK_LEVELS.includes('L4b'), 'L4b is a separate open-book track, not mixed into honest L1-L4');
  const lv = levelOf('L4b');
  assert.equal(lv.work, 'session');
  assert.equal(lv.openBook, true);
  const h = handedAt(lv, { work: 'session' });
  assert.equal(h.openBook, true);
  assert.equal(h.auto, true);
  assert.equal(h.shapes, true);
  assert.throws(() => handedAt(lv, { work: 'rounds' }), /open session/);
});

test('L4b brief enables full pixel access, drops eyes-only disqualification, and states Auto complexity budget', () => {
  const txt = levelBlock({
    level: 'L4b',
    pictures: [{ name: 'inputs/source.png', label: 'SUBJECT', what: 'the picture to paint.' }],
    session: {
      steps: 1000,
      reverts: 20,
      showCost: 0.05,
      openBook: true,
      autoBudget: { autoStrokes: 1420, autoWashes: 58, autoUnit: 1600, maxStrokes: 1420, maxGzipBytes: 24576 },
    },
  });
  assert.match(txt, /OPEN-BOOK OPTIMIZATION MODE \(Level L4b\)/);
  assert.match(txt, /full unrestricted read access/);
  assert.match(txt, /no human-ness progression judge applies/);
  assert.match(txt, /at most 1420 strokes/);
  assert.match(txt, /at most 24576 gzipped bytes/);
  assert.doesNotMatch(txt, /disqualifies the/);
});
