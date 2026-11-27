import test from 'node:test';
import assert from 'node:assert/strict';
import { laneFactors, LANE_SPREAD } from './brush-load-variance.mjs';
import { createBrush as makeBrush, dip } from './brush.mjs';

const w = Array.from({ length: 22 }, (_, j) => 1 - 0.5 * ((j / 21) * 2 - 1) ** 2);

test('lane factors are seeded, mean 1, bounded and vary across lanes', () => {
  const a = laneFactors(3, 0, w), b = laneFactors(3, 0, w);
  assert.deepEqual(Array.from(a), Array.from(b));
  const mean = a.reduce((s, v, j) => s + v * w[j], 0) / w.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(mean - 1) < 1e-9);
  assert.ok(Math.max(...a) - Math.min(...a) > 0.001);
  for (const v of a) assert.ok(v > 1 - 2.2 * LANE_SPREAD && v < 1 + 2.2 * LANE_SPREAD);
  const direction = Math.sign(a.at(-1) - a[0]);
  for (let j = 1; j < a.length; j++) assert.ok(direction * (a[j] - a[j - 1]) >= 0, 'one broad gradient, no alternating lanes');
  assert.notDeepEqual(Array.from(laneFactors(3, 1, w)), Array.from(a));
});

test('every dip reloads the requested concentration and water, including a metered brush', () => {
  for (const loadWater of [0, 1000]) for (const seed of [3, 41, 149]) {
    const b = makeBrush({ seed, loadWater });
    let fullWater;
    for (let j = 0; j < 10; j++) {
      dip(b, { water: 0.6, conc: [0.4, 1.5] });
      const water = b.resW + b.hairs.reduce((s, h) => s + h.water, 0);
      fullWater ??= water;
      assert.equal(water, fullWater, 'every explicit dip restores the same finite water load');
      for (const [k, c] of [0.4, 1.5].entries()) {
        const paint = b.resP[k] + b.hairs.reduce((s, h) => s + h.pig[k], 0);
        assert.ok(Math.abs(paint / water - c) < 1e-12, `dip ${j}, pigment ${k}`);
      }
      // A spent brush takes the same fresh load; its old water and paint are not added a second time.
      b.resW *= 0.1; b.resP = b.resP.map(v => v * 0.1);
      for (const h of b.hairs) { h.water *= 0.1; h.pig = h.pig.map(v => v * 0.1); }
    }
  }
});

test('dip applies the factors: hairs differ in concentration, same seed repeats', () => {
  const mk = () => { const b = makeBrush({ seed: 7 }); dip(b, { water: 1, conc: [1] }); return b; };
  const a = mk(), b = mk();
  const c = a.hairs.map(h => h.pig[0] / h.water);
  assert.deepEqual(c, b.hairs.map(h => h.pig[0] / h.water));
  assert.ok(Math.max(...c) - Math.min(...c) > 0.001);
  dip(a, { water: 1, conc: [1] });
  assert.notDeepEqual(c, a.hairs.map(h => h.pig[0] / h.water));
});
