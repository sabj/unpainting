import test from 'node:test';
import assert from 'node:assert/strict';
import { structuralLines, detailRegion } from './structure-filter.mjs';

const course = [[10, 10], [40, 10]], crack = [[60, 60], [63, 62]], wander = [[10, 80], [20, 70], [30, 82], [40, 70], [50, 80]];

test('keeps long straight lines and drops cracks and wandering shadow edges', () => {
  assert.deepEqual(structuralLines([course, crack, wander], { w: 100, h: 100 }), [0]);
});

test('detail region: a dense trace over high contrast keeps its short lines; the same mesh on a flat wall does not', () => {
  const w = 100, h = 100, lum = new Float32Array(w * h).fill(80), mesh = [];
  // Ironwork: dark and light alternate under the left mesh; the right mesh lies on flat, even stone.
  for (let y = 40; y < 60; y++) for (let x = 10; x < 30; x++) lum[y * w + x] = (x + y) % 4 < 2 ? 15 : 90;
  for (const x0 of [10, 70]) for (let y = 40; y < 60; y += 3) for (let x = x0; x < x0 + 20; x += 3) mesh.push([[x, y], [x + 2, y + 1]]);
  const detail = detailRegion(mesh, lum, w, h, { radius: 4, quantile: 0.8 });
  const kept = structuralLines(mesh, { w, h, detail });
  const left = kept.filter(i => mesh[i][0][0] < 50).length, right = kept.filter(i => mesh[i][0][0] >= 50).length;
  assert.ok(left > 20 && right === 0, `kept ${left} ironwork and ${right} flat-wall fragments`);
});

test('needs a sheet size', () => {
  assert.throws(() => structuralLines([course], {}), /sheet w and h/);
});
