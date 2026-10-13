import test from 'node:test';
import assert from 'node:assert/strict';
import { recordMarks } from '../media/brush.mjs';
import { compactEntry, startStrokeLedger } from './stroke-ledger.mjs';

test('the compact ledger keeps what the gate measures and drops the rest', t => {
  t.after(() => recordMarks(false));
  const tape = startStrokeLedger({ full: false });
  const pen = { k: 'P', pen: 0, points: [{ x: 1, y: 1 }], d: [[10, 10, 100, -1, 0]] };
  tape.push({ k: 'f' }, { k: 'y', m: 1 }, { k: 'W', r: 2 }, { k: 'm', i: 3 }, { k: 'd', b: 0, w: 1, c: [0.5] },
    { k: 's', b: 0, points: [{ x: 1, y: 2 }], fl: [1, 2], d: [[10, 20, -1]], wt: 1 }, pen, { k: 'r', m: [0, 1, 1], s: [0, 50, 100] },
    { k: 'b', m: [1, 1, 1], s: 1, p: 0.5 }, { k: 'g', pigment: 0, points: [[1, 2]] }, { k: 'c', r: [3, 4] });
  assert.deepEqual(tape.map(m => m.k), ['m', 'd', 's', 'P', 'r', 'b', 'g', 'c']);
  assert.deepEqual(tape[2], { k: 's', b: 0, d: [[10, 20, -1]], wt: 1 });
  assert.equal(tape[3], pen, 'a pen line stays the object the pen rewrites in place');
  assert.ok(tape[4].m instanceof Uint8Array);
  assert.deepEqual([...tape[4].s], [0, 50, 100]);
  assert.deepEqual(tape[5], { k: 'b' });
  assert.equal(compactEntry(null), null);
});

test('the full tape is the playback tape, unchanged', t => {
  t.after(() => recordMarks(false));
  const tape = startStrokeLedger({ full: true });
  const s = { k: 's', b: 0, points: [{ x: 1, y: 2 }], fl: [], d: [[10, 20, -1]] };
  tape.push({ k: 'f' }, s);
  assert.equal(tape.length, 2);
  assert.equal(tape[1], s);
});
