import test from 'node:test';
import assert from 'node:assert/strict';
import { byArea } from './area-order.mjs';

const st = (id, x, y, phase, unit = -1) => ({ id, points: [[x, y], [x + 2, y], [x + 4, y]], phase, unit, object: unit });

test('lay-in first, main form next, then each area finished before the next, accents last; nothing added or dropped', () => {
  const ordered = [st('lay', 100, 100, 'layin'), st('main1', 100, 100, 'growth', 7), st('farS', 200, 20, 'growth'), st('nearS', 120, 110, 'growth'),
    st('main2', 104, 100, 'detail', 7), st('nearT', 124, 112, 'texture'), st('farT', 204, 22, 'texture'), st('acc', 100, 100, 'emphasis', 7)];
  const out = byArea(ordered, { centre: [100, 100], mainUnit: 7 }).map(s => s.id);
  assert.deepEqual(out, ['lay', 'main1', 'main2', 'nearS', 'nearT', 'farS', 'farT', 'acc']);
});

test('an object is one area even across patch borders, and keeps its own order', () => {
  const ordered = [st('a1', 44, 10, 'growth', 3), st('w', 200, 10, 'growth'), st('a2', 46, 12, 'detail', 3), st('a3', 43, 14, 'texture', 3)];
  const out = byArea(ordered, { centre: [0, 0] }).map(s => s.id);
  assert.deepEqual(out.filter(i => i !== 'w'), ['a1', 'a2', 'a3']);
  assert.ok(Math.abs(out.indexOf('a1') - out.indexOf('a3')) === 2);
});

test('inside an area an object\'s outline comes before the lines inside it, whatever is nearer', () => {
  const o = { ...st('outline', 20, 20, 'growth', 2), role: 'outline' }, i = { ...st('inner', 5, 5, 'growth', 2), role: 'inner' };
  assert.deepEqual(byArea([i, o], { centre: [0, 0] }).map(s => s.id), ['outline', 'inner']);
});
