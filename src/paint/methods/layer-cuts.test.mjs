import test from 'node:test';
import assert from 'node:assert/strict';
import { layerFractions, regionCuts } from './layer-cuts.mjs';

test('four layers keep the historical cuts; more layers are evenly spaced', () => {
  assert.deepEqual(layerFractions(4), [0, 0.3, 0.55, 0.78]);
  assert.deepEqual(layerFractions(8), [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]);
});

test('a pale region gets cut levels from its own values, not the dark scene around it', () => {
  // region 1: a pale face, values 0.10..0.29; region 2: a dark coat, values 0.60..0.99
  const n = 40, labels = Int32Array.from({ length: n }, (_, i) => (i < 20 ? 1 : 2));
  const values = Float32Array.from({ length: n }, (_, i) => (i < 20 ? 0.10 + i * 0.01 : 0.60 + (i - 20) * 0.02));
  const cuts = regionCuts(labels, values, () => true, layerFractions(4), 10);
  const face = cuts.get(1);
  assert.ok(face.every(v => v >= 0.10 && v < 0.30), `face cuts ${face}`);
  assert.ok(face[3] > face[1], 'distinct steps inside the face');
});

test('regions too small for their own cuts fall back to the sheet', () => {
  const labels = Int32Array.from({ length: 12 }, (_, i) => (i < 3 ? 1 : 2));
  const cuts = regionCuts(labels, new Float32Array(12).fill(0.5), () => true, layerFractions(4), 5);
  assert.equal(cuts.has(1), false);
  assert.equal(cuts.has(2), true);
});
