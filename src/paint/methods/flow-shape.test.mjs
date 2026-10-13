import test from 'node:test';
import assert from 'node:assert/strict';
import { flowField, flowShapeMask, fillSmallHoles } from './flow-shape.mjs';

// Horizontal stripes: the structure direction runs along x.
const stripes = (w, h) => Float32Array.from({ length: w * h }, (_, i) => (Math.floor(i / w / 6) % 2 ? 1 : 0));

test('the flow field runs along stripes with high coherence', () => {
  const w = 60, h = 60, f = flowField(stripes(w, h), w, h, { sigma: 2 });
  const i = 30 * w + 30;
  assert.ok(Math.abs(f.dx[i]) > 0.95, `dx ${f.dx[i]}`);
  assert.ok(f.coherence[i] > 0.8, `coherence ${f.coherence[i]}`);
});

test('a ragged patch in a striped field is drawn out along the flow, not across it', () => {
  const w = 60, h = 60, f = flowField(stripes(w, h), w, h, { sigma: 2 });
  const M = new Uint8Array(w * h);
  // a 9x9 block with a one-cell staircase notch on its top edge
  for (let y = 26; y < 35; y++) for (let x = 26; x < 35; x++) M[y * w + x] = 1;
  M[26 * w + 30] = 0;
  const out = flowShapeMask(M, w, h, f, { along: 6, across: 1 });
  let span = 0, tall = 0;
  for (let x = 0; x < w; x++) if (out[30 * w + x]) span++;
  for (let y = 0; y < h; y++) if (out[y * w + 30]) tall++;
  assert.ok(span >= 9, `along-flow width ${span}`);
  assert.ok(tall <= 9, `across-flow height ${tall}`);
  assert.equal(out[26 * w + 30], 1, 'the notch is filled');
});

test('flow shaping never paints a protected light or a cell outside the allowed set', () => {
  const w = 40, h = 40, f = flowField(stripes(w, h), w, h, { sigma: 2 });
  const M = new Uint8Array(w * h), protect = new Uint8Array(w * h), allowed = new Uint8Array(w * h);
  for (let y = 15; y < 25; y++) for (let x = 10; x < 30; x++) { M[y * w + x] = 1; allowed[y * w + x] = 1; }
  protect[20 * w + 20] = 1;
  const out = flowShapeMask(M, w, h, f, { along: 6, across: 1, allowed, protect });
  assert.equal(out[20 * w + 20], 0);
  for (let i = 0; i < w * h; i++) if (out[i]) assert.ok(allowed[i] || M[i]);
});

test('pinholes inside a passage are filled, reserved lights and open gaps are not', () => {
  const w = 20, h = 20, M = new Uint8Array(w * h).fill(0), protect = new Uint8Array(w * h);
  for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) M[y * w + x] = 1;
  M[5 * w + 5] = 0; M[10 * w + 10] = 0; protect[10 * w + 10] = 1;
  for (let y = 12; y < 18; y++) for (let x = 12; x < 18; x++) M[y * w + x] = 0; // a 36-cell hole
  const out = fillSmallHoles(M, w, h, 4, protect);
  assert.equal(out[5 * w + 5], 1);
  assert.equal(out[10 * w + 10], 0);
  assert.equal(out[14 * w + 14], 0);
  assert.equal(out[0], 0, 'the paper outside the passage is not a hole');
});
