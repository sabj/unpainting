import test from 'node:test';
import assert from 'node:assert/strict';
import { widestBrushes, softJoinsOf, resultRow, resultsTable } from './results.mjs';

const PASSES = [
  { id: 'sky', widestBrushMm: 38, forms: [{ kind: 'sky', share: 0.9 }] },
  { id: 'cheek', widestBrushMm: 17, forms: [{ kind: 'face', share: 0.4 }, { kind: 'fur', share: 0.3 }, { kind: 'other', share: 0.3 }] },
  { id: 'edge', widestBrushMm: 25.4, forms: [{ kind: 'animal', share: 0.2 }, { kind: 'ground', share: 0.8 }] },
  { id: 'eye', widestBrushMm: 3.5, forms: [{ kind: 'eye', share: 1 }] },
];

test('the widest brush overall, and in passes that lie mostly inside living forms', () => {
  assert.deepEqual(widestBrushes(PASSES), { all: 38, living: 17, livingPass: 'cheek' });
  assert.deepEqual(widestBrushes([{ widestBrushMm: 7 }]), { all: 7, living: null, livingPass: null });
  assert.deepEqual(widestBrushes(undefined), { all: null, living: null, livingPass: null });
});

test('soft joins are read from the planner line', () => {
  assert.equal(softJoinsOf('study washes: 14 colours; 143 washes, 76 nested, 12 laid against a damp neighbour, 2 in dabs'), 12);
  assert.equal(softJoinsOf('nothing'), null);
});

test('a row and the table; a failed run keeps its error', () => {
  const rec = { subject: { id: 'h36', variant: 'approved' }, code: { commit: 'abcdef0123', dirty: true }, seconds: 930, failure: null,
    results: { plan: { shapes: 10, washes: 12, strokes: 300 }, cheatRisk: { level: 'low', risk: 0.21 }, backend: { backend: 'gpu', fallback: false } } };
  const row = resultRow(rec, { passes: PASSES }, '3 laid against a damp neighbour');
  assert.deepEqual(row, { subject: 'h36:approved', commit: 'abcdef01+dirty', minutes: 15.5, shapes: 10, washes: 12, strokes: 300, widestMm: 38, widestLivingMm: 17, softJoins: 3, risk: 'low 0.21', backend: 'gpu', error: null });
  const bad = resultRow({ subject: { id: 'x' }, failure: 'the painter | died' }, null, '');
  const t = resultsTable([row, bad]).split('\n');
  assert.equal(t.length, 4); assert.match(t[2], /^\| h36:approved \| abcdef01\+dirty \| 15.5 \| 10 \| 12 \| 300 \| 38 \| 17 \| 3 \| low 0.21 \| gpu \| - \|$/);
  assert.match(t[3], /the painter \/ died/);
});
