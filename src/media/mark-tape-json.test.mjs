import test from 'node:test';
import assert from 'node:assert/strict';
import { markTapeJSON } from './mark-tape-json.mjs';

test('incremental tape export preserves replay data and JSON value semantics', () => {
  const tape = { w: 6, h: 4, scale: 10, unused: undefined, marks: [
    { k: 'c', r: [2, 3, 8, 2] }, { k: 'd', b: 0, w: .8, c: [0, .3] },
    { k: 's', b: 0, d: [[10, 20, 100, 60], [40, 20, 50, 60]] },
    undefined, { k: 'm', i: 1, unused: undefined, values: [NaN, Infinity] },
  ] };
  assert.deepEqual(JSON.parse([...markTapeJSON(tape)].join('')), JSON.parse(JSON.stringify(tape)));
  assert.deepEqual(JSON.parse([...markTapeJSON({ marks: [] })].join('')), { marks: [] });
});

test('export string size is bounded by one operation instead of the whole recording', () => {
  const operation = { k: 'c', r: Array.from({ length: 256 }, (_, i) => i) };
  const tape = { w: 512, h: 512, marks: Array(2000).fill(operation) };
  let largest = 0, total = 0;
  for (const chunk of markTapeJSON(tape)) { largest = Math.max(largest, chunk.length); total += chunk.length; }
  assert.equal(largest, JSON.stringify(operation).length);
  assert.ok(total > largest * 1999);
});
