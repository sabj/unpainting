import test from 'node:test';
import assert from 'node:assert/strict';
import { maskedOpening, lowerEnvelope, scaleLayers, radiiForLayers } from './scale-layers.mjs';

const grid = (w, h, f) => Float32Array.from({ length: w * h }, (_, i) => f(i % w, Math.floor(i / w)));
const all = (w, h) => new Uint8Array(w * h).fill(1);

test('opening keeps a broad plateau and removes a line narrower than the element', () => {
  const w = 40, h = 40, F = grid(w, h, (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 30 ? 1 : x === 35 ? 1 : 0));
  const O = maskedOpening(F, all(w, h), w, h, 3);
  assert.equal(O[20 * w + 20], 1);
  assert.equal(O[20 * w + 35], 0);
});

test('the opening is round: a disc survives whole under a brush of its size, which a square window would cut', () => {
  const w = 60, h = 60, F = grid(w, h, (x, y) => (Math.hypot(x - 30, y - 30) <= 12 ? 1 : 0));
  const O = maskedOpening(F, all(w, h), w, h, 8);
  const diag = Math.round(30 + 11 * Math.SQRT1_2);
  assert.equal(O[diag * w + diag], 1, 'the disc keeps its diagonal rim');
});

test('a large radius on the coarse grid still keeps a broad plateau and drops a line', () => {
  const w = 200, h = 200, F = grid(w, h, (x, y) => (x >= 40 && x < 160 && y >= 40 && y < 160 ? 1 : x === 180 ? 1 : 0));
  const O = maskedOpening(F, all(w, h), w, h, 24);
  assert.equal(O[100 * w + 100], 1);
  assert.equal(O[100 * w + 180], 0);
});

test('cells that take no paint do not pull the opening down', () => {
  const w = 40, h = 40, F = grid(w, h, () => 0.5), live = all(w, h);
  for (let y = 0; y < h; y++) for (const x of [12, 25]) { live[y * w + x] = 0; F[y * w + x] = 0; }
  const O = maskedOpening(F, live, w, h, 10);
  assert.ok(Math.abs(O[20 * w + 18] - 0.5) < 1e-6);
});

test('the lower envelope never exceeds the field', () => {
  const w = 50, h = 30, F = grid(w, h, (x, y) => (x > 25 ? 0.8 : 0.2) + 0.1 * Math.sin(y / 3));
  const E = lowerEnvelope(F, all(w, h), w, h, 5);
  for (let i = 0; i < F.length; i++) assert.ok(E[i] <= F[i] + 1e-6);
});

test('a smooth ramp goes into the first layer: no band cuts, only a small cap at its very peak', () => {
  const w = 120, h = 60, F = grid(w, h, x => 0.1 + 0.5 * x / w);
  const s = scaleLayers({ field: F, live: all(w, h), w, h, cellMm: 0.5, radiiMm: [8, 2], minStep: 0.04, minShape: 16 });
  assert.equal(s.cover.length, 2);
  const radius = 8 / 0.5;
  for (let i = 0; i < F.length; i++) if (s.cover[1][i]) assert.ok(i % w >= w - 1 - 1.5 * radius, `second layer at x ${i % w}`);
  assert.ok(s.share[0][30 * w + 60] > 0.95);
});

test('one wash carries at most maxStep: a dark mass is built in stages and the next layer fades in from the first', () => {
  const w = 120, h = 60, F = grid(w, h, x => 0.1 + 0.6 * x / w);
  const s = scaleLayers({ field: F, live: all(w, h), w, h, cellMm: 0.5, radiiMm: [8, 2], minStep: 0.04, maxStep: 0.3, minShape: 16 });
  const dark = 30 * w + 110, light = 30 * w + 20;
  assert.ok(F[dark] * s.share[0][dark] <= 0.3 + 1e-5, `first layer carries ${F[dark] * s.share[0][dark]}`);
  assert.equal(s.cover[1][dark], 1);
  assert.equal(s.cover[1][light], 0);
  assert.ok(Math.abs(s.share[0][dark] + s.share[1][dark] - 1) < 1e-4);
  // the second layer starts faint where it begins, so its edge there can go soft
  const row = 30 * w; let first = -1; for (let x = 0; x < w; x++) if (s.cover[1][row + x]) { first = x; break; }
  assert.ok(first > 0 && F[row + first] * s.share[1][row + first] < 0.1, `second layer starts at ${F[row + first] * s.share[1][row + first]}`);
});

test('a real dark shape stays a shape of its own in a later layer, and the base stays light under it', () => {
  const w = 120, h = 60, F = grid(w, h, (x, y) => (x >= 55 && x < 62 && y > 10 && y < 50 ? 0.7 : 0.2));
  const s = scaleLayers({ field: F, live: all(w, h), w, h, cellMm: 0.5, radiiMm: [8, 1], minStep: 0.04, minShape: 16 });
  const dark = 30 * w + 58, light = 30 * w + 10;
  assert.equal(s.cover[1][dark], 1);
  assert.equal(s.cover[1][light], 0);
  assert.equal(s.cover[0][dark], 1);
  assert.ok(s.share[0][dark] < 0.5);
  assert.ok(s.share[1][dark] > 0.5);
});

test('a cell carries all its demand: shares sum to 1 wherever it takes paint', () => {
  const w = 80, h = 40, F = grid(w, h, (x, y) => 0.1 + 0.4 * x / w + (x % 17 < 3 ? 0.3 : 0) + (y % 13 < 2 ? 0.2 : 0));
  const s = scaleLayers({ field: F, live: all(w, h), w, h, cellMm: 0.5, radiiMm: [8, 3, 1], minStep: 0.04, minShape: 8 });
  for (let i = 0; i < F.length; i++) {
    const t = s.share.reduce((a, q) => a + q[i], 0);
    assert.ok(Math.abs(t - 1) < 1e-4, `cell ${i} sums to ${t}`);
    for (let j = 0; j < s.share.length; j++) if (s.share[j][i] > 0) assert.equal(s.cover[j][i], 1);
  }
});

test('a cell that takes no paint is in no layer', () => {
  const w = 40, h = 40, F = grid(w, h, () => 0.5), live = all(w, h);
  live[20 * w + 20] = 0; F[20 * w + 20] = 0;
  const s = scaleLayers({ field: F, live, w, h, cellMm: 0.5, radiiMm: [4, 1], minStep: 0.04, minShape: 4 });
  for (let j = 0; j < s.cover.length; j++) assert.equal(s.cover[j][20 * w + 20], 0);
});

test('layers come from the brush kit, broadest first', () => {
  assert.equal(radiiForLayers(1).length, 1);
  for (const c of [2, 3, 4, 6]) {
    const r = radiiForLayers(c);
    assert.equal(r.length, Math.min(c, 4));
    for (let i = 1; i < r.length; i++) assert.ok(r[i] < r[i - 1]);
  }
});
