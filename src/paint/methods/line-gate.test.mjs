import test from 'node:test';
import assert from 'node:assert/strict';
import { decideLinework } from './line-gate.mjs';

const built = { vanishingPoints: 3, share: 0.4 }, soft = { vanishingPoints: 0, share: 0 };

test('built structure gets ink, a soft subject a light pencil, too little line nothing', () => {
  const b = decideLinework({ perspective: built, penLine: 0.01, density: 10, sketch: false });
  assert.equal(b.medium, 'ink'); assert.equal(b.draw, true); assert.equal(b.chosen, true); assert.equal(b.built, true);
  const s = decideLinework({ perspective: soft, penLine: 0.01, density: 10, sketch: false });
  assert.equal(s.medium, 'graphite'); assert.equal(s.built, false);
  const empty = decideLinework({ perspective: built, penLine: 0.01, density: 0.5, sketch: false });
  assert.equal(empty.draw, false); assert.equal(empty.medium, 'none');
});

test('one weak vanishing point is not built structure', () => {
  assert.equal(decideLinework({ perspective: { vanishingPoints: 1, share: 0.3 }, penLine: 0, density: 10, sketch: false }).built, false);
  assert.equal(decideLinework({ perspective: { vanishingPoints: 2, share: 0.05 }, penLine: 0, density: 10, sketch: false }).built, false);
});

test('a checked sketch is drawn in ink, and unknown perspective falls back to a light pencil', () => {
  assert.equal(decideLinework({ perspective: soft, penLine: 0, density: 10, sketch: true }).medium, 'ink');
  const unknown = decideLinework({ perspective: null, penLine: 0, density: 10, sketch: false });
  assert.equal(unknown.medium, 'graphite'); assert.match(unknown.why[0], /unknown/);
});

test('an explicit medium wins and the gate records its own choice', () => {
  const fixed = decideLinework({ perspective: soft, penLine: 0, density: 10, sketch: false }, { requested: 'ink' });
  assert.equal(fixed.medium, 'ink'); assert.equal(fixed.gate, 'graphite'); assert.equal(fixed.chosen, false);
  const off = decideLinework({ perspective: built, penLine: 0, density: 10, sketch: false }, { requested: 'none' });
  assert.equal(off.draw, false);
});

test('built structure keeps a larger line budget than a soft subject', () => {
  const b = decideLinework({ perspective: built, penLine: 0, density: 10, sketch: false }), s = decideLinework({ perspective: soft, penLine: 0, density: 10, sketch: false });
  assert.ok(b.budget > s.budget);
});
