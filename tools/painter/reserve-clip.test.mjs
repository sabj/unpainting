import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, setClip, totals } from '../../src/media/sheet.mjs';
import { createBrush, dip, stroke, candidateContact } from '../../src/media/brush.mjs';
import { reservedContact, withReserveClip } from './reserve-clip.mjs';

const pigments = [{ K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 }];
const pigmentAt = (s, i) => s.G[0][i] + s.D[0][i] + s.P[0][i];

test('a stroke across a bare-paper reserve paints around it, and the clip is restored', () => {
  const s = createSheet(makePaper(32, 32, { seed: 3 }), pigments), path = [{ x: 4, y: 16 }, { x: 28, y: 16 }];
  const reserve = i => i % 32 >= 14 && i % 32 < 18;
  const b = createBrush(); dip(b, { water: .6, conc: [.5] });
  const hits = reservedContact(candidateContact(b, s, path), reserve);
  assert.ok(hits.length > 0, 'the stroke reaches the reserve');
  const ran = withReserveClip(s, hits, setClip, () => { stroke(b, s, path); return 'laid'; });
  assert.equal(ran, 'laid');
  assert.equal(s.clip, null);
  assert.ok(totals(s).pig[0] > 0, 'the stroke was laid');
  for (const i of hits) assert.equal(pigmentAt(s, i), 0, `reserved cell ${i} stays white`);
});

test('no reserved contact leaves the clip alone', () => {
  const s = { n: 4, clip: null };
  let calls = 0;
  assert.equal(withReserveClip(s, [], () => { calls++; }, () => 7), 7);
  assert.equal(calls, 0);
  const prior = Uint8Array.from([1, 1, 0, 1]), t = { n: 4, clip: prior }, seen = [];
  withReserveClip(t, [0], (target, mask) => { seen.push(mask && Array.from(mask)); target.clip = mask; }, () => {});
  assert.deepEqual(seen, [[0, 1, 0, 1], [1, 1, 0, 1]]);
  assert.deepEqual(Array.from(prior), [1, 1, 0, 1], 'the caller\'s clip is not changed in place');
});

test('authored contact on paper or negative cells is returned for clipping and counted, or stops under strict', async () => {
  const { admitAuthoredContact } = await import('./authored-gestures.mjs');
  const { resetChecks, setStrict, continuedSummary } = await import('../../src/media/checks.mjs');
  const contact = { cells: [0, 1, 2, 3], primaryMask: Uint8Array.from([1, 1, 1, 0]), liftMask: Uint8Array.from([0, 0, 0, 1]), neighborIndices: [] };
  const material = { cells: [3], conservativeCells: [] };
  const args = { reserved: i => i === 1 || i === 3, film: i => i === 3 };
  resetChecks();
  const log = console.log; console.log = () => {};
  let admitted;
  try { admitted = admitAuthoredContact(contact, material, args); } finally { console.log = log; }
  assert.deepEqual(admitted.reservedCells, [1], 'film protects cell 3');
  assert.equal(continuedSummary().checks['paper/negative contact cell'].count, 1);
  setStrict(true);
  try { assert.throws(() => admitAuthoredContact(contact, material, args), /paper\/negative contact cell/); } finally { resetChecks(); }
});
