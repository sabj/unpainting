import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOutlineMedium, describeOutlineMedium } from './outline-medium.mjs';

test('auto draws in ink when the source shows its own line', () => {
  const r = resolveOutlineMedium({ requested: 'auto', share: 0.023, threshold: 0.5 });
  assert.deepEqual(r, { medium: 'ink', chosen: true, percent: 2.3 });
  assert.equal(describeOutlineMedium(r), 'the line: ink, source shows 2.3% line');
});

test('auto draws in graphite when the source shows little line', () => {
  const r = resolveOutlineMedium({ requested: 'auto', share: 0.001, threshold: 0.5 });
  assert.equal(r.medium, 'graphite');
  assert.equal(describeOutlineMedium(r), 'the line: graphite, source shows 0.1% line');
});

test('the threshold itself counts as ink', () => {
  assert.equal(resolveOutlineMedium({ share: 0.005, threshold: 0.5 }).medium, 'ink');
});

test('an explicit medium overrides the source', () => {
  assert.equal(resolveOutlineMedium({ requested: 'graphite', share: 0.2 }).medium, 'graphite');
  assert.equal(resolveOutlineMedium({ requested: 'ink', share: 0 }).medium, 'ink');
  assert.equal(resolveOutlineMedium({ requested: 'ink', share: 0 }).chosen, false);
});

test('bad input is rejected', () => {
  assert.throws(() => resolveOutlineMedium({ requested: 'charcoal', share: 0.1 }), /auto, ink or graphite/);
  assert.throws(() => resolveOutlineMedium({ share: Number.NaN }), /line share/);
  assert.throws(() => resolveOutlineMedium({ share: 1.5 }), /line share/);
});
