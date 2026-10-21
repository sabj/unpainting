import test from 'node:test';
import assert from 'node:assert/strict';
import { cropBox, showSize, parseReply, verdict, tally } from './legibility-core.mjs';

test('cropBox turns fractions into a pixel extract inside the picture', () => {
  assert.deepEqual(cropBox([0.25, 0.5, 0.75, 1], 400, 200), { left: 100, top: 100, width: 200, height: 100 });
  const b = cropBox([0.9, 0.9, 1.2, 1.2], 100, 100);
  assert.ok(b.left + b.width <= 100 && b.top + b.height <= 100);
});

test('showSize takes the long side into the shown range', () => {
  assert.deepEqual(showSize(300, 150), { width: 900, height: 450 });
  assert.deepEqual(showSize(2800, 1400), { width: 1400, height: 700 });
  assert.deepEqual(showSize(1000, 500), { width: 1000, height: 500 });
});

test('parseReply finds the JSON object inside chatter and returns null without one', () => {
  assert.deepEqual(parseReply('Sure.\n```json\n{"object":"an arch","readable":true}\n```'), { object: 'an arch', readable: true });
  assert.equal(parseReply('no json here'), null);
  assert.equal(parseReply(undefined), null);
});

const spec = { says: 'arch|vault', parts: ['a', 'b', 'c', 'd'], need: 3 };

test('verdict needs the name and enough parts', () => {
  const ticks = n => ({ parts: Object.fromEntries([1, 2, 3, 4].map(i => [String(i), i <= n])) });
  assert.equal(verdict(spec, { object: 'A stone ARCH' }, ticks(3)).recognised, true);
  assert.equal(verdict(spec, { object: 'a stone arch' }, ticks(2)).recognised, false);
  assert.equal(verdict(spec, { object: 'scribbles' }, ticks(4)).recognised, false);
  assert.equal(verdict(spec, null, null).seen, 0);
});

test('tally counts recognised crops', () => {
  assert.deepEqual(tally({ a: { recognised: true }, b: { recognised: false }, c: { recognised: true } }), { recognised: 2, total: 3 });
});
