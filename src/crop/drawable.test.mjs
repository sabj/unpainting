// The fit learns which chains were drawn, and the features say what the chain is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chainFeatures, chainDrawn, fitDrawable, drawableScore } from './drawable.mjs';

const W = 100, H = 100;
const D = new Float32Array(W * H), grad = new Float32Array(W * H).fill(0.2);
for (let i = 0; i < W * H; i++) D[i] = (i % W) >= 50 ? 0.9 : 0.05;

const line = (x0, y0, x1, y1, step = 1) => {
  const pts = [], d = Math.hypot(x1 - x0, y1 - y0), k = Math.max(1, Math.round(d / step));
  for (let t = 0; t <= k; t++) pts.push({ x: x0 + (x1 - x0) * t / k, y: y0 + (y1 - y0) * t / k });
  return { points: pts };
};
const curl = (cx, cy, r) => {
  const pts = []; for (let t = 0; t <= 40; t++) { const a = t / 40 * 2 * Math.PI; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return { points: pts };
};

test('a long straight chain reads straighter and longer than a curl', () => {
  const a = chainFeatures(line(50, 10, 50, 90), D, W, H, grad);
  const b = chainFeatures(curl(50, 50, 5), D, W, H, grad);
  assert.ok(a[0] > b[0], `length ${a[0]} vs ${b[0]}`);
  assert.ok(a[3] > b[3] + 0.5, `straight ${a[3]} vs ${b[3]}`);
});

test('a chain across the step reads deeper than one inside the dark', () => {
  const across = chainFeatures(line(50, 10, 50, 90), D, W, H, grad);
  const inside = chainFeatures(line(80, 10, 80, 90), D, W, H, grad);
  assert.ok(across[2] > inside[2], `depth ${across[2]} vs ${inside[2]}`);
});

test('chainDrawn says how much of a chain has ink on it', () => {
  const ink = new Float32Array(W * H);
  for (let y = 10; y <= 90; y++) ink[y * W + 50] = 1;
  assert.ok(chainDrawn(line(50, 10, 50, 90), ink, W, H) > 0.95);
  assert.ok(chainDrawn(line(20, 10, 20, 90), ink, W, H) < 0.05);
});

test('the fit separates drawn chains from undrawn ones', () => {
  const rows = [], labels = [];
  for (let k = 0; k < 20; k++) {
    rows.push(chainFeatures(line(50, 5 + k, 50, 95 - k), D, W, H, grad)); labels.push(1);
    rows.push(chainFeatures(curl(20 + (k % 5) * 6, 20 + k, 4), D, W, H, grad)); labels.push(0);
  }
  const fit = fitDrawable(rows, labels, { rounds: 600 });
  assert.ok(fit.accuracy > 0.9, `accuracy ${fit.accuracy}`);
  assert.ok(drawableScore(chainFeatures(line(50, 10, 50, 90), D, W, H, grad), fit) > 0.5);
  assert.ok(drawableScore(chainFeatures(curl(30, 30, 4), D, W, H, grad), fit) < 0.5);
});
