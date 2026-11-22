import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingBatches, strokeLengthMm, drawingTimeMm, bigFormsFirst } from './drawing-film.mjs';
import { layVectors } from './ink-vectors.mjs';

const line = (seq, x0, len) => ({ seq, dark: 0.5, path: [[x0, 5], [x0 + len, 5]], outline: [[[x0, 4.8], [x0 + len, 4.8], [x0 + len, 5.2], [x0, 5.2]]] });

test('a stroke\'s length is its path; a filled shape\'s half its outline', () => {
  assert.equal(strokeLengthMm(line(0, 0, 30)), 30);
  assert.ok(Math.abs(strokeLengthMm({ seq: 0, outline: [[[0, 0], [10, 0], [10, 2], [0, 2]]] }) - 12) < 1e-9);
});

test('the batches keep the drawing\'s order, leave no stroke out and none empty, and cut at equal shares of the hand\'s time', () => {
  // one long contour first (big forms), then forty short hatches (detail), given out of order
  const strokes = [...Array.from({ length: 40 }, (_, k) => line(40 - k, k, 2)), line(0, 0, 120)];
  const b = drawingBatches(strokes, 8);
  assert.ok(b.length >= 5 && b.length <= 8, `${b.length} batches`);
  assert.deepEqual(b.flatMap(q => q.strokes.map(s => s.seq)), Array.from({ length: 41 }, (_, k) => k));
  assert.ok(b.every(q => q.strokes.length >= 1));
  // the long contour is a frame by itself (it runs through more than two shares); the hatches come several to a frame
  assert.equal(b[0].strokes.length, 1);
  assert.ok(b.slice(1).every(q => q.strokes.length >= 3), b.map(q => q.strokes.length).join(' '));
  assert.ok(Math.abs(b.at(-1).done - 1) < 1e-9 && b.every((q, k) => k === 0 || q.done > b[k - 1].done));
});

test('never more batches than strokes or than frames; one frame, or none asked: the whole drawing at once', () => {
  const strokes = [line(0, 0, 10), line(1, 0, 20), line(2, 0, 5)];
  const many = drawingBatches(strokes, 50);
  assert.ok(many.length >= 2 && many.length <= 3 && many.flatMap(q => q.strokes).length === 3);
  assert.equal(drawingBatches(Array.from({ length: 30 }, (_, k) => line(k, 0, 10)), 10).length, 10);
  assert.deepEqual(drawingBatches(strokes, 1).map(q => q.strokes.length), [3]);
  assert.deepEqual(drawingBatches(strokes, 0).map(q => q.strokes.length), [3]);
  assert.deepEqual(drawingBatches([], 5), []);
});

test('laid in batches the drawing is the same as laid in one step', () => {
  const w = 60, h = 20, mm = 0.5, strokes = [line(0, 2, 20), line(1, 10, 15), { ...line(2, 5, 12), dark: 0.9 }, line(3, 0, 28)], inkOf = d => d * 2;
  const whole = new Float32Array(w * h), parts = new Float32Array(w * h);
  layVectors({ strokes }, whole, w, h, mm, inkOf);
  for (const b of drawingBatches(strokes, 3)) layVectors({ strokes: b.strokes }, parts, w, h, mm, inkOf);
  assert.deepEqual(parts, whole);
  assert.ok(whole.some(v => v > 0));
});

test('big forms first: the passes in turn over the whole sheet, the largest form first in each; the same strokes, laid the same', () => {
  // a file ordered form by form: a small ear (outline, then its tone), then the big head (outline, features, tone)
  const st = (seq, object, pass, x0, len, part) => ({ ...line(seq, x0, len), object, pass, part });
  const file = [st(0, 7, 1, 50, 6, 'outline'), st(1, 7, 5, 51, 2, 'tone'), st(2, 7, 5, 52, 2, 'tone'), st(3, 2, 1, 0, 28, 'outline'), st(4, 2, 1, 1, 26, 'outline'), st(5, 2, 2, 5, 8, 'inner'), st(6, 2, 5, 6, 3, 'tone'), st(7, 2, 6, 9, 1, 'small')];
  const order = bigFormsFirst(file).map(s => s.seq);
  assert.deepEqual(order, [3, 4, 0, 5, 6, 1, 2, 7], 'head outline, ear outline, head features, the tones (head first), the accent last');
  // in a form's outline the long stroke comes before the short, whatever the file's order; lay-in lines come before all
  assert.deepEqual(bigFormsFirst([st(0, 2, 1, 0, 5, 'outline'), st(1, 2, 1, 0, 30, 'outline'), st(2, 2, 1, 0, 40, 'inner'), { ...st(3, 9, 3, 0, 4, 'small'), phase: 'layin' }]).map(s => s.seq), [3, 1, 0, 2]);
  assert.equal(file[0].seq, 0, 'the list given is not reordered');
  // without passes the part of the drawing says which pass; with neither, the file's order stands
  assert.deepEqual(bigFormsFirst(file.map(({ pass, ...s }) => s)).map(s => s.seq), [3, 4, 0, 5, 7, 6, 1, 2]);
  assert.deepEqual(bigFormsFirst([line(2, 0, 3), line(0, 0, 9), line(1, 0, 5)]).map(s => s.seq), [0, 1, 2]);
  // batches keep the order given, and the sheet ends the same
  const b = drawingBatches(bigFormsFirst(file), 4, { given: true });
  assert.deepEqual(b.flatMap(q => q.strokes.map(s => s.seq)), order);
  const w = 140, h = 20, mm = 0.5, inkOf = d => d * 2, whole = new Float32Array(w * h), parts = new Float32Array(w * h);
  layVectors({ strokes: file }, whole, w, h, mm, inkOf);
  for (const q of b) layVectors({ strokes: q.strokes }, parts, w, h, mm, inkOf);
  assert.deepEqual(parts, whole);
});
