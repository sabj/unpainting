import test from 'node:test';
import assert from 'node:assert/strict';
import { laneFactors, loadFactor, LANE_SPREAD, LOAD_SPREAD } from './brush-load-variance.mjs';
import { createBrush as makeBrush, dip } from './brush.mjs';

const w = Array.from({ length: 22 }, (_, j) => 1 - 0.5 * ((j / 21) * 2 - 1) ** 2);

test('lane factors are seeded, mean 1, bounded and vary across lanes', () => {
  const a = laneFactors(3, 0, w), b = laneFactors(3, 0, w);
  assert.deepEqual(Array.from(a), Array.from(b));
  const mean = a.reduce((s, v, j) => s + v * w[j], 0) / w.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(mean - 1) < 1e-9);
  assert.ok(Math.max(...a) - Math.min(...a) > 0.05);
  for (const v of a) assert.ok(v > 1 - 2.2 * LANE_SPREAD && v < 1 + 2.2 * LANE_SPREAD);
  assert.notDeepEqual(Array.from(laneFactors(3, 1, w)), Array.from(a));
});

test('load factors vary between loads, stay bounded and average near 1', () => {
  const f = Array.from({ length: 400 }, (_, i) => loadFactor(5, i));
  assert.ok(new Set(f).size > 300);
  for (const v of f) assert.ok(Math.abs(v - 1) <= LOAD_SPREAD);
  assert.ok(Math.abs(f.reduce((s, v) => s + v, 0) / f.length - 1) < 0.02);
});

test('dip applies the factors: hairs differ in concentration, same seed repeats', () => {
  const mk = () => { const b = makeBrush({ seed: 7 }); dip(b, { water: 1, conc: [1] }); return b; };
  const a = mk(), b = mk();
  const c = a.hairs.map(h => h.pig[0] / h.water);
  assert.deepEqual(c, b.hairs.map(h => h.pig[0] / h.water));
  assert.ok(Math.max(...c) - Math.min(...c) > 0.05);
  dip(a, { water: 1, conc: [1] });
  assert.notDeepEqual(c, a.hairs.map(h => h.pig[0] / h.water));
});
