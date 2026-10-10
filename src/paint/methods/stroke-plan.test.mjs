import test from 'node:test';
import assert from 'node:assert/strict';
import { planLanes } from './stroke-plan.mjs';

const slab = (w, h, x0, x1, y0, y1, g) => {
  const list = [], G = new Float32Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { list.push(y * w + x); G[y * w + x] = g(x, y); }
  return { list, G };
};

test('a long passage becomes several lanes of strokes, not one shape-wide gesture', () => {
  const { list, G } = slab(200, 100, 10, 190, 30, 70, () => 1);
  const r = planLanes(list, 200, 100, G, 1, { cellMm: .5, laneMm: 6, strokeMm: 30 });
  assert.ok(r.paths.length >= 6, `paths ${r.paths.length}`);
  assert.ok(r.paths.every(p => p.every(q => q.r === r.laneR)));
  assert.ok(r.factors.every(f => Math.abs(f - 1) < 1e-6));
});

test('per-stroke factors follow the plan under each stroke and keep the passage mean', () => {
  const { list, G } = slab(200, 100, 10, 190, 30, 70, x => (x < 100 ? .5 : 1.5));
  const r = planLanes(list, 200, 100, G, 1, { cellMm: .5, laneMm: 6, strokeMm: 20 });
  const left = r.factors.filter((f, k) => r.paths[k][0].x < 90), right = r.factors.filter((f, k) => r.paths[k][0].x > 110);
  assert.ok(Math.max(...left) < 1 && Math.min(...right) > 1);
});

test('reach moves lane ends off the outline, seeded', () => {
  const { list, G } = slab(200, 100, 10, 190, 30, 70, () => 1);
  const a = planLanes(list, 200, 100, G, 1, { cellMm: .5, laneMm: 6, strokeMm: 400, reachMm: 3, seed: 5 });
  const b = planLanes(list, 200, 100, G, 1, { cellMm: .5, laneMm: 6, strokeMm: 400, reachMm: 3, seed: 5 });
  assert.deepEqual(a.paths, b.paths);
  const ends = a.paths.map(p => p[0].x);
  assert.ok(new Set(ends.map(v => v.toFixed(2))).size > 1, 'ends not all on one line');
});
