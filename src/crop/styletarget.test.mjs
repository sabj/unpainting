import test from 'node:test';
import assert from 'node:assert/strict';
import { seeAsMasses, setKey, chooseValues, styleTarget } from './styletarget.mjs';

test('masses keep an edge and lose the speckle beside it', () => {
  const w = 20, h = 20, L = new Float32Array(w * h);
  // left half dark, right half light, with one-cell noise on both
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) L[y * w + x] = (x < 10 ? 0.7 : 0.1) + ((x + y) % 2 ? 0.03 : -0.03);
  const M = seeAsMasses(L, w, h, { radius: 3, range: 0.12 });
  const noise = a => { let s = 0; for (let y = 5; y < 15; y++) for (let x = 2; x < 8; x++) s += Math.abs(a[y * w + x] - 0.7); return s; };
  assert.ok(noise(M) < noise(L) * 0.35, 'the speckle inside a mass is averaged away');
  // the step across the edge survives
  assert.ok(M[10 * w + 8] - M[10 * w + 11] > 0.5, 'the edge between the masses is kept');
});

test('the key leaves paper as paper and stops short of black', () => {
  const D = Float32Array.from([0, 0.02, 0.3, 0.6, 1.0]);
  const out = setKey(D, D.length, { paperAt: 0.06, deepest: 0.82 });
  assert.equal(out[0], 0);
  assert.equal(out[1], 0, 'anything under the paper threshold is unpainted');
  assert.ok(Math.abs(out[4] - 0.82) < 1e-6, 'the darkest note stops at deepest');
  assert.ok(out[2] < out[3] && out[3] < out[4], 'order is kept');
});

test('values become a few washes', () => {
  const D = Float32Array.from({ length: 200 }, (_, i) => i / 199);
  const out = chooseValues(D, D.length, { values: 5 });
  const levels = new Set(Array.from(out).map(v => v.toFixed(5)));
  assert.ok(levels.size <= 6, `got ${levels.size} levels`);
  assert.ok(levels.has('0.00000'), 'paper survives quantising');
});

test('a value never rounds down to paper', () => {
  const D = Float32Array.from([0.001, 0.5, 1]);
  const out = chooseValues(D, 3, { values: 4 });
  assert.ok(out[0] > 0, 'the faintest painted note stays painted');
});

test('the target holds only colour the palette can mix', () => {
  const w = 4, h = 4, n = w * h, D3 = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { D3[i * 3] = 0.2; D3[i * 3 + 1] = 0.4; D3[i * 3 + 2] = 0.9; }
  // a palette that can only make grey
  const greyOnly = X => { const o = new Float32Array(X.length); for (let i = 0; i < X.length / 3; i++) { const m = (X[i * 3] + X[i * 3 + 1] + X[i * 3 + 2]) / 3; o[i * 3] = o[i * 3 + 1] = o[i * 3 + 2] = m; } return o; };
  const out = styleTarget(D3, w, h, greyOnly, { chroma: 1 });
  for (let i = 0; i < n; i++) assert.ok(Math.abs(out[i * 3] - out[i * 3 + 2]) < 1e-6, 'no hue the box cannot mix');
});

test('chroma pushes what survived without moving the tone', () => {
  const w = 2, h = 2, n = 4, D3 = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { D3[i * 3] = 0.2; D3[i * 3 + 1] = 0.5; D3[i * 3 + 2] = 0.8; }
  const flat = styleTarget(D3, w, h, null, { chroma: 1 });
  const pushed = styleTarget(D3, w, h, null, { chroma: 1.5 });
  const spread = (a, i) => Math.max(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]) - Math.min(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
  const mean = (a, i) => (a[i * 3] + a[i * 3 + 1] + a[i * 3 + 2]) / 3;
  assert.ok(spread(pushed, 0) > spread(flat, 0) * 1.4, 'chroma widens');
  assert.ok(Math.abs(mean(pushed, 0) - mean(flat, 0)) < 1e-6, 'tone does not move');
});

test('a flat field comes back flat', () => {
  const w = 6, h = 6, n = w * h, D3 = new Float32Array(n * 3).fill(0.4);
  const out = styleTarget(D3, w, h, null, {});
  for (let i = 1; i < n; i++) assert.ok(Math.abs(out[i * 3] - out[0]) < 1e-6);
});

test('an empty picture stays empty', () => {
  const out = styleTarget(new Float32Array(3 * 9), 3, 3, null, {});
  for (const v of out) assert.equal(v, 0);
});
