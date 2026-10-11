// Known-answer tests for the ink/wash consistency split on hand-drawn luma buffers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { residual, compare, reconstruction, distanceTo, CLASSES } from './consistency.mjs';

const W = 80, H = 80, N = W * H, PAPER = 240;
const field = v => new Float32Array(N).fill(v);
const rect = (b, x0, y0, x1, y1, v, mode = 'set') => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) b[y * W + x] = mode === 'mul' ? b[y * W + x] * v : v;
  return b;
};
const transmittance = L => Float32Array.from(L, v => v / PAPER);

test('Part 1 split: ink over a wash divides out to the ink alone', () => {
  const wash = rect(field(PAPER), 10, 10, 70, 70, 160);
  const orig = rect(Float32Array.from(wash), 40, 15, 42, 65, 0.1, 'mul');
  const { T } = residual(orig, wash);
  assert.equal(T[20 * W + 20], 1, 'washed cell without ink is no ink');
  assert.ok(Math.abs(T[30 * W + 40] - 0.1) < 1e-6, 'ink keeps its own transmittance under the wash');
});

test('a drawing that matches the residual scores full precision and recall', () => {
  const wash = rect(field(PAPER), 10, 10, 70, 70, 160);
  const orig = rect(Float32Array.from(wash), 40, 15, 42, 65, 0.1, 'mul');
  const pen = transmittance(rect(field(PAPER), 40, 15, 42, 65, 20));
  const { T, ratio } = residual(orig, wash);
  const r = compare(T, pen, ratio, W, H);
  assert.equal(r.precision, 1); assert.equal(r.recall, 1);
  const rec = reconstruction(orig, wash, pen);
  assert.ok(rec.washAndInkError < rec.washOnlyError);
});

test('a long unplanned line is a missed structure line, a broad dark is left by the wash', () => {
  const wash = field(PAPER);
  const orig = rect(rect(field(PAPER), 10, 5, 12, 75, 20), 50, 50, 70, 70, 30);
  const { T, ratio } = residual(orig, wash);
  const r = compare(T, field(1), ratio, W, H);
  assert.equal(r.cls[40 * W + 10], CLASSES.missedStructure);
  assert.equal(r.cls[60 * W + 60], CLASSES.washTooLight);
  assert.equal(r.recall, 0);
});

test('a line with nothing under it is clutter; inside a dark mass it is mass given to ink', () => {
  const wash = field(PAPER);
  const orig = rect(field(PAPER), 50, 50, 70, 70, 30);
  const pen = transmittance(rect(rect(field(PAPER), 10, 5, 12, 75, 20), 59, 52, 61, 68, 20));
  const { T, ratio } = residual(orig, wash);
  const r = compare(T, pen, ratio, W, H);
  assert.equal(r.cls[40 * W + 10], CLASSES.clutter);
  assert.equal(r.cls[60 * W + 60], CLASSES.lineOnMass);
});

test('a line where the wash is darker than the original is a wash error, not clutter', () => {
  const orig = field(PAPER);
  const wash = rect(field(PAPER), 0, 0, 40, 80, 150);
  const pen = transmittance(rect(field(PAPER), 20, 5, 22, 75, 20));
  const { T, ratio } = residual(orig, wash);
  const r = compare(T, pen, ratio, W, H);
  assert.equal(r.cls[40 * W + 20], CLASSES.washTooDark);
});

test('distance transform is zero on the mask and grows away from it', () => {
  const m = new Uint8Array(N); m[40 * W + 40] = 1;
  const d = distanceTo(m, W, H);
  assert.equal(d[40 * W + 40], 0); assert.equal(d[40 * W + 45], 5);
});

test('specks smaller than a pen mark are grain, a dark short stroke is missed texture', () => {
  const wash = field(PAPER);
  const orig = rect(rect(field(PAPER), 10, 10, 12, 12, 20), 30, 30, 32, 50, 20);
  const { T, ratio } = residual(orig, wash);
  const r = compare(T, field(1), ratio, W, H);
  assert.equal(r.cls[10 * W + 10], CLASSES.fineGrain);
  assert.equal(r.cls[40 * W + 30], CLASSES.missedTexture);
});
