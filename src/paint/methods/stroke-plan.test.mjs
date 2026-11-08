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

test('Consult #3: planLanes splits runs across gaps containing protected catchlights', () => {
  const w = 100, h = 50, list = [], G = new Float32Array(w * h).fill(1);
  const protect = new Uint8Array(w * h);
  // Two rectangular blocks separated by a 4-cell gap at x in [48..51] along row y in [20..30]
  for (let y = 20; y < 30; y++) {
    for (let x = 10; x < 48; x++) list.push(y * w + x);
    for (let x = 52; x < 90; x++) list.push(y * w + x);
  }
  // Without protect, gap is small (<= 2*R) so runs bridge
  const bridged = planLanes(list, w, h, G, 1, { cellMm: 0.5, laneMm: 8, strokeMm: 200, protect: null });
  // With protect placed in the gap at x=50, y=25
  protect[25 * w + 50] = 1;
  const unbridged = planLanes(list, w, h, G, 1, { cellMm: 0.5, laneMm: 8, strokeMm: 200, protect });
  assert.ok(unbridged.paths.length > bridged.paths.length, `Unbridged count ${unbridged.paths.length} > bridged ${bridged.paths.length}`);
  for (const path of unbridged.paths) {
    for (const pt of path) {
      assert.ok(pt.x < 48 || pt.x > 51, `Path point (${pt.x}, ${pt.y}) lands in protected gap`);
    }
    for (let i = 1; i < path.length; i++) {
      const p0 = path[i - 1], p1 = path[i];
      assert.ok(!(p0.x < 48 && p1.x > 51), 'Stroke path bridges across catchlight gap');
    }
  }
});

test('Consult #3 Part 2: post-clamp factor renormalization preserves passage mass', () => {
  const { list, G } = slab(200, 100, 10, 190, 30, 70, x => (x < 30 ? 0.05 : 2.5));
  const r = planLanes(list, 200, 100, G, 1, { cellMm: 0.5, laneMm: 6, strokeMm: 15, fmin: 0.45, fmax: 1.8 });
  assert.ok(r.ramps && r.ramps.length === r.paths.length, 'Generates start/end ramps');
  // Confirm some factors saturated at clamp bounds
  const hasClamped = r.factors.some(f => Math.abs(f - 0.45) < 1e-4 || Math.abs(f - 1.8) < 1e-4);
  assert.ok(hasClamped, 'Some factors clamped at bound');
  // Check that factor mean across passages is centered around 1.0
  const meanF = r.factors.reduce((a, b) => a + b, 0) / r.factors.length;
  assert.ok(Math.abs(meanF - 1.0) < 0.25, `Factor mean ${meanF} near 1`);
});

