// A gesture put through the pen has to come out as a line: ink along the path, little beside it, and heavier where the
// plan wants more.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, thickness } from './sheet.mjs';
import { drawGestures, lineField, lineBudget } from './draw.mjs';

const pigment = { rho: .05, omega: 1.4, gamma: .15, K: [.35, .49, .66], S: [.06, .025, .014] };
const W = 80, H = 40;
const line = y => ({ points: Array.from({ length: 51 }, (_, i) => ({ x: 15 + i, y })) });
const inkAlong = (sheet, y, r) => { const t = thickness(sheet)[0]; let s = 0; for (let x = 20; x < 60; x++) for (let dy = -r; dy <= r; dy++) s += t[(y + dy) * W + x]; return s; };

test('a gesture drawn with the pen leaves a line, not a band', () => {
  const sheet = createSheet(makePaper(W, H, { seed: 3 }), [pigment]);
  const want = new Float32Array(W * H).fill(0.5);
  const r = drawGestures(sheet, [line(20)], want, W, H, { ink: [1], peak: 1 });
  assert.equal(r.drawn, 1);
  const core = inkAlong(sheet, 20, 1), wide = inkAlong(sheet, 20, 8);
  assert.ok(core > 0, 'ink lands on the path');
  assert.ok(core / wide > 0.6, `most of it within a cell of the path: ${(100 * core / wide).toFixed(0)}%`);
});

test('where the plan wants more ink the line is heavier', () => {
  const light = createSheet(makePaper(W, H, { seed: 3 }), [pigment]);
  const heavy = createSheet(makePaper(W, H, { seed: 3 }), [pigment]);
  drawGestures(light, [line(20)], new Float32Array(W * H).fill(0.15), W, H, { ink: [1], peak: 1 });
  drawGestures(heavy, [line(20)], new Float32Array(W * H).fill(1), W, H, { ink: [1], peak: 1 });
  const a = inkAlong(light, 20, 3), b = inkAlong(heavy, 20, 3);
  assert.ok(b > a * 1.3, `pressed and slow ${b.toFixed(2)} against light and quick ${a.toFixed(2)}`);
});

test('the pen is dipped when it runs low, not once per stroke', () => {
  const sheet = createSheet(makePaper(W, H, { seed: 3 }), [pigment]);
  const gestures = Array.from({ length: 12 }, (_, k) => line(4 + 3 * (k % 11)));
  const r = drawGestures(sheet, gestures, new Float32Array(W * H).fill(0.5), W, H, { ink: [1], peak: 1 });
  assert.ok(r.dips >= 1 && r.dips < 12, `${r.dips} dips for 12 strokes`);
});

test('the line field lights a thin line and not a broad patch of the same darkness', () => {
  const D = new Float32Array(W * H), residual = new Float32Array(W * H);
  for (let x = 5; x < 35; x++) { D[20 * W + x] = 0.8; residual[20 * W + x] = 0.8; }                  // a pen line
  for (let y = 8; y < 32; y++) for (let x = 45; x < 75; x++) { D[y * W + x] = 0.8; residual[y * W + x] = 0.8; }  // shading
  const F = lineField(D, residual, W, H);
  const onLine = F[20 * W + 20], inPatch = F[20 * W + 60];
  assert.ok(onLine > 0 && onLine > 5 * Math.max(1e-6, inPatch), `line ${onLine.toFixed(3)} against patch interior ${inPatch.toFixed(3)}`);
});

test('a sheet with little line in it gets few gestures, one with a lot gets them all', () => {
  const gestures = Array.from({ length: 20 }, (_, k) => ({ length: 40, points: [] }));
  assert.equal(lineBudget(gestures, 0).length, 0, 'no line in the source, no pen');
  assert.equal(lineBudget(gestures, 60 * 5).length, 5, 'room for five 40-cell lines at 1.5 cells wide');
  assert.equal(lineBudget(gestures, 1e9).length, 20, 'and every one when the source is all drawing');
});
