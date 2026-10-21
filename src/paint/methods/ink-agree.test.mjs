import test from 'node:test';
import assert from 'node:assert/strict';
import { agreeLines } from './ink-agree.mjs';

const w = 20, h = 5;
const mask = new Uint8Array(w * h);
for (let x = 0; x < 8; x++) mask[2 * w + x] = 1;
for (let x = 12; x < 20; x++) mask[2 * w + x] = 1;
const line = (xs, y = 2) => ({ points: xs.map(x => [x, y]), widths: xs.map(() => 1), weights: xs.map(() => 1), weight: 1, length: xs.length - 1 });
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

test('a line wholly on the mask is kept whole', () => {
  const r = agreeLines([line(range(0, 8))], mask, w, h);
  assert.equal(r.kept, 1);
  assert.equal(r.lines[0].points.length, 8);
});

test('a line off the mask is dropped', () => {
  const r = agreeLines([line(range(0, 8), 0)], mask, w, h);
  assert.equal(r.dropped, 1);
  assert.equal(r.lines.length, 0);
});

test('a line across a long gap is cut in two, with its widths cut alongside', () => {
  const r = agreeLines([line(range(0, 20))], mask, w, h, { gap: 2 });
  assert.equal(r.cut, 1);
  assert.deepEqual(r.lines.map(l => l.points.length), [8, 8]);
  assert.deepEqual(r.lines.map(l => l.widths.length), [8, 8]);
  assert.equal(r.lines[0].length, 7);
});

test('a short gap is crossed', () => {
  const r = agreeLines([line(range(0, 20))], mask, w, h, { gap: 4 });
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].points.length, 20);
});

test('runs shorter than minRun are dropped', () => {
  const r = agreeLines([line(range(6, 14))], mask, w, h, { gap: 0, minRun: 3 });
  assert.equal(r.lines.length, 0);
});
