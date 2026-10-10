import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetDensity, residualOf, proposeShapes, passesMedian } from './look.mjs';

const W = 50, H = 40, N = W * H;

test('sheetDensity reads the render against its own paper', () => {
  const base = new Uint8ClampedArray(N * 3).fill(240), rgb = new Uint8ClampedArray(N * 3).fill(240);
  rgb[3 * 7] = 120; // one cell, red channel, half the light
  const D = sheetDensity(rgb, base, N);
  assert.ok(Math.abs(D[3 * 7] - Math.log(2)) < 1e-6);
  assert.equal(D[3 * 7 + 1], 0);
});

test('residualOf is what is still wanted, never negative, and reports the overshoot', () => {
  const want = new Float32Array(N * 3), have = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { want[i * 3] = 0.5; have[i * 3] = i < N / 2 ? 0.2 : 0.7; }
  const { R, mag, over } = residualOf(want, have, N);
  assert.ok(Math.abs(R[0] - 0.3) < 1e-6 && R[(N - 1) * 3] === 0);
  assert.ok(Math.abs(mag[0] - 0.1) < 1e-6, 'tone is the channel mean');
  assert.ok(Math.abs(over - 0.5) < 0.01, `over ${over}`);
});

test('proposeShapes finds the square that still wants paint, at about its area and mean', () => {
  const mag = new Float32Array(N);
  for (let y = 10; y < 30; y++) for (let x = 15; x < 35; x++) mag[y * W + x] = 0.5;
  const shapes = proposeShapes(mag, W, H, { level: 0.25, minArea: 10, sigma: 0 });
  assert.equal(shapes.length, 1);
  assert.ok(Math.abs(shapes[0].area - 400) <= 40, `area ${shapes[0].area}`);
  let s = 0, c = 0; for (let i = 0; i < N; i++) if (shapes[0].mask[i]) { s += mag[i]; c++; }
  assert.ok(Math.abs(s / c - 0.5) < 0.05);
});

test('proposeShapes leaves out excluded cells and specks under the minimum area', () => {
  const mag = new Float32Array(N), exclude = new Uint8Array(N);
  for (let y = 10; y < 30; y++) for (let x = 15; x < 35; x++) mag[y * W + x] = 0.5;
  mag[2 * W + 2] = 0.9; // a speck
  for (let y = 10; y < 30; y++) for (let x = 15; x < 25; x++) exclude[y * W + x] = 1; // the left half is spoken for
  const shapes = proposeShapes(mag, W, H, { level: 0.25, minArea: 10, sigma: 0, exclude });
  assert.equal(shapes.length, 1);
  assert.ok(shapes[0].area <= 200 && shapes[0].area >= 150, `area ${shapes[0].area}`);
  assert.equal(shapes[0].mask[2 * W + 2], 0);
});

test('passesMedian counts the acts over painted cells only', () => {
  const passes = new Uint8Array(N);
  for (let i = 0; i < 100; i++) passes[i] = 3;
  for (let i = 100; i < 150; i++) passes[i] = 7;
  assert.equal(passesMedian(passes), 3);
});
