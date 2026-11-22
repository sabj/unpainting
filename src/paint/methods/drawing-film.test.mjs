import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingBatches, strokeLengthMm, drawingTimeMm } from './drawing-film.mjs';
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
