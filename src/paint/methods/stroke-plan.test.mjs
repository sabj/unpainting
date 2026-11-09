import test from 'node:test';
import assert from 'node:assert/strict';
import { planLanes } from './stroke-plan.mjs';

const slab = (w, h, x0, x1, y0, y1, g) => {
  const list = [], G = new Float32Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { list.push(y * w + x); G[y * w + x] = g(x, y); }
  return { list, G };
};

const weightedMean = (res) => {
  const wsum = res.cells.reduce((s, c) => s + c, 0);
  return res.factors.reduce((s, f, k) => s + f * res.cells[k], 0) / wsum;
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
  const meanF = weightedMean(r);
  assert.ok(Math.abs(meanF - 1.0) < 1e-4, `Factor cell-weighted mean ${meanF} strictly 1.0`);
});

// --- Milestone M3 Iteration 2: Mass Conservation & Ramp Clamping Regression Tests ---

test('M3 Challenger 2 Regression: Asymmetric gradient preserves cell-weighted mass strictly (diff < 1e-4)', () => {
  const w = 80, h = 40, list = [], G = new Float32Array(w * h);
  let sumG = 0;
  for (let y = 5; y < 35; y++) for (let x = 5; x < 75; x++) {
    const i = y * w + x; list.push(i);
    const v = y >= 30 ? 10.0 : 0.01; G[i] = v; sumG += v;
  }
  const amount = sumG / list.length;
  const res = planLanes(list, w, h, G, amount, { cellMm: 0.3, laneMm: 3, strokeMm: 100, fmin: 0.45, fmax: 1.8 });
  assert.ok(res, 'planLanes returns a result');
  assert.ok(res.factors.length > 0, 'emits stroke factors');
  
  // All factors bounded in [fmin, fmax]
  for (const f of res.factors) {
    assert.ok(f >= 0.45 - 1e-6 && f <= 1.8 + 1e-6, `Factor ${f} out of [0.45, 1.8]`);
  }
  
  // Cell-weighted mean factor strictly equals 1.0 +- 1e-4
  const mean = weightedMean(res);
  assert.ok(Math.abs(mean - 1.0) < 1e-4, `Cell-weighted mean ${mean} deviates from 1.0 by ${Math.abs(mean - 1.0)} >= 1e-4`);
  
  // Unweighted mean also within 2%
  const unweighted = res.factors.reduce((a, b) => a + b, 0) / res.factors.length;
  assert.ok(Math.abs(unweighted - 1.0) < 0.02, `Unweighted mean ${unweighted} near 1.0`);

  // High lane saturated at fmax = 1.80, low lanes scaled to ~0.716 (NOT stuck at 0.56 / 0.87 mean)
  const maxF = Math.max(...res.factors);
  const minF = Math.min(...res.factors);
  assert.ok(Math.abs(maxF - 1.8) < 1e-4, `High factor ${maxF} should saturate at 1.8`);
  assert.ok(minF > 0.65, `Low factor ${minF} should absorb redistributed excess (> 0.65)`);
});

test('Mass Conservation: Uniform gradient profile preserves 1.0 mean exactly', () => {
  const { list, G } = slab(100, 60, 10, 90, 10, 50, () => 2.5);
  const res = planLanes(list, 100, 60, G, 2.5, { cellMm: 0.4, laneMm: 4, strokeMm: 40 });
  const mean = weightedMean(res);
  assert.ok(Math.abs(mean - 1.0) < 1e-6, `Uniform mean ${mean} should be 1.0`);
  assert.ok(res.factors.every(f => Math.abs(f - 1.0) < 1e-6), 'All factors 1.0 for uniform passage');
});

test('Mass Conservation: Linear gradient profile preserves 1.0 mean within 1e-4', () => {
  const { list, G } = slab(120, 60, 10, 110, 10, 50, (x, y) => 0.1 + (y - 10) / 40 * 3.0);
  const meanG = list.reduce((s, i) => s + G[i], 0) / list.length;
  const res = planLanes(list, 120, 60, G, meanG, { cellMm: 0.5, laneMm: 5, strokeMm: 50, fmin: 0.45, fmax: 1.8 });
  const mean = weightedMean(res);
  assert.ok(Math.abs(mean - 1.0) < 1e-4, `Linear mean ${mean} should be 1.0`);
  assert.ok(res.factors.every(f => f >= 0.45 - 1e-6 && f <= 1.8 + 1e-6), 'All factors in bounds');
});

test('Mass Conservation: Step gradient profile preserves 1.0 mean within 1e-4', () => {
  const { list, G } = slab(100, 60, 10, 90, 10, 50, (x, y) => (y < 30 ? 0.05 : 5.0));
  const meanG = list.reduce((s, i) => s + G[i], 0) / list.length;
  const res = planLanes(list, 100, 60, G, meanG, { cellMm: 0.4, laneMm: 4, strokeMm: 40, fmin: 0.45, fmax: 1.8 });
  const mean = weightedMean(res);
  assert.ok(Math.abs(mean - 1.0) < 1e-4, `Step mean ${mean} should be 1.0`);
  assert.ok(res.factors.every(f => f >= 0.45 - 1e-6 && f <= 1.8 + 1e-6), 'All factors in bounds');
  assert.ok(res.factors.some(f => Math.abs(f - 0.45) < 1e-4), 'Lower lanes hit fmin');
  assert.ok(res.factors.some(f => f > 1.5), 'Upper lanes elevated');
});

test('Mass Conservation: Extreme 100:1 asymmetric gradient profile preserves 1.0 mean within 1e-4', () => {
  const { list, G } = slab(120, 60, 10, 110, 10, 50, (x, y) => (y >= 40 ? 10.0 : 0.10));
  const meanG = list.reduce((s, i) => s + G[i], 0) / list.length;
  const res = planLanes(list, 120, 60, G, meanG, { cellMm: 0.3, laneMm: 3, strokeMm: 60, fmin: 0.45, fmax: 1.8 });
  const mean = weightedMean(res);
  assert.ok(Math.abs(mean - 1.0) < 1e-4, `Extreme 100:1 mean ${mean} should be 1.0`);
  assert.ok(res.factors.every(f => f >= 0.45 - 1e-6 && f <= 1.8 + 1e-6), 'All factors in bounds');
});

test('Mass Conservation: Zero-demand lanes conserve mass strictly (no divide-by-zero or loss)', () => {
  const { list, G } = slab(100, 60, 10, 90, 10, 50, (x, y) => (y >= 40 ? 4.0 : 0.0));
  const meanG = list.reduce((s, i) => s + G[i], 0) / list.length;
  const res = planLanes(list, 100, 60, G, meanG, { cellMm: 0.4, laneMm: 4, strokeMm: 40, fmin: 0.45, fmax: 1.8 });
  const mean = weightedMean(res);
  assert.ok(Math.abs(mean - 1.0) < 1e-4, `Zero-lane passage mean ${mean} should be 1.0`);
  assert.ok(res.factors.every(f => f >= 0.45 - 1e-6 && f <= 1.8 + 1e-6), 'All factors in bounds');
});

test('Ramp Clamping: (fStart + fEnd) / 2 strictly preserves fMean with zero mass drift', () => {
  const { list, G } = slab(150, 60, 10, 140, 10, 50, (x, y) => 0.2 + (x - 10) / 130 * 4.0);
  const meanG = list.reduce((s, i) => s + G[i], 0) / list.length;
  const res = planLanes(list, 150, 60, G, meanG, { cellMm: 0.4, laneMm: 6, strokeMm: 30, fmin: 0.45, fmax: 1.8 });
  assert.ok(res.ramps && res.ramps.length === res.factors.length);
  
  for (let k = 0; k < res.ramps.length; k++) {
    const ramp = res.ramps[k];
    const fMean = res.factors[k];
    const rampMid = (ramp.start + ramp.end) / 2;
    
    // (start + end)/2 === fMean strictly
    assert.ok(Math.abs(rampMid - fMean) < 1e-12, `Ramp ${k} midpoint ${rampMid} deviates from fMean ${fMean}`);
    
    // Both start and end strictly lie within [fmin, fmax]
    assert.ok(ramp.start >= 0.45 - 1e-6, `Ramp ${k} start ${ramp.start} < fmin`);
    assert.ok(ramp.start <= 1.8 + 1e-6, `Ramp ${k} start ${ramp.start} > fmax`);
    assert.ok(ramp.end >= 0.45 - 1e-6, `Ramp ${k} end ${ramp.end} < fmin`);
    assert.ok(ramp.end <= 1.8 + 1e-6, `Ramp ${k} end ${ramp.end} > fmax`);
  }
});

// --- Milestone M3 Iteration 2: Curved Path Geometry & Catchlight Split Regression Tests ---

test('Consult #4: curved lane paths stay centered on their cell bins without half-bend damping', () => {
  const w = 120, h = 80, list = [], G = new Float32Array(w * h).fill(1);
  for (let x = 20; x <= 100; x++) {
    const yMid = Math.round(20 + 30 * Math.sin(Math.PI * (x - 20) / 80));
    for (let dy = -3; dy <= 3; dy++) list.push((yMid + dy) * w + x);
  }
  const r = planLanes(list, w, h, G, 1, { cellMm: 0.5, laneMm: 6, strokeMm: 200, curved: true });
  assert.equal(r.paths.length, 1, 'Single-lane curved shape emits exactly 1 lane');
  const path = r.paths[0];
  const peak = path.find(p => Math.abs(p.x - 60.5) < 1.0);
  assert.ok(peak, 'Path has point near center x=60.5');
  assert.ok(Math.abs(peak.y - 50.5) < 0.5, `Peak at ${peak.y} should be near 50.5, not dampened to 39.75`);
  for (const pt of path) {
    const expectedCenter = 20 + 30 * Math.sin(Math.PI * (pt.x - 20) / 80);
    assert.ok(Math.abs(pt.y - expectedCenter) <= 2.0, `Point (${pt.x}, ${pt.y}) stays within shape centerline (+-2 cells)`);
  }
});

test('Consult #4: catchlight detection splits curved strokes on curve and avoids false chord splits', () => {
  const w = 120, h = 80, list = [], G = new Float32Array(w * h).fill(1);
  for (let x = 20; x <= 100; x++) {
    if (x >= 58 && x <= 62) continue; // 4-cell gap around catchlight at x=60
    const yMid = Math.round(20 + 30 * Math.sin(Math.PI * (x - 20) / 80));
    for (let dy = -3; dy <= 3; dy++) list.push((yMid + dy) * w + x);
  }
  // Without protect: gap is 4 cells <= 2*R (R=6), so the stroke bridges across the gap
  const bridged = planLanes(list, w, h, G, 1, { cellMm: 0.5, laneMm: 6, strokeMm: 200, curved: true, protect: null });
  assert.equal(bridged.paths.length, 1, 'Without protect, gap <= 2*R bridges into 1 stroke');

  // A. Catchlight on the chord at (60, 39) - 11 cells away from the curved shape at y=50!
  const protectChord = new Uint8Array(w * h);
  protectChord[39 * w + 60] = 1;
  const chordResult = planLanes(list, w, h, G, 1, { cellMm: 0.5, laneMm: 6, strokeMm: 200, curved: true, protect: protectChord });
  assert.equal(chordResult.paths.length, 1, 'Catchlight on chord must NOT split curved stroke');

  // B. Catchlight on the curved path at (60, 50) - directly in the path across the gap!
  const protectCurve = new Uint8Array(w * h);
  protectCurve[50 * w + 60] = 1;
  const curveResult = planLanes(list, w, h, G, 1, { cellMm: 0.5, laneMm: 6, strokeMm: 200, curved: true, protect: protectCurve });
  assert.ok(curveResult.paths.length > bridged.paths.length, `Catchlight on curve MUST split stroke across gap (got ${curveResult.paths.length} > ${bridged.paths.length})`);
  for (const path of curveResult.paths) {
    for (const pt of path) {
      assert.ok(pt.x < 58 || pt.x > 62, `Path point (${pt.x}, ${pt.y}) lands in protected gap`);
    }
    for (let i = 1; i < path.length; i++) {
      const p0 = path[i - 1], p1 = path[i];
      assert.ok(!(p0.x < 58 && p1.x > 62), 'Stroke path bridges across catchlight gap');
    }
  }
});

test('continuous wash lanes with scattered protected flecks do not shatter into 0.5-cell stubs', () => {
  const { list, G } = slab(200, 100, 10, 190, 20, 80, () => 1);
  const protect = new Uint8Array(200 * 100);
  // Scatter 12 1-cell protected flecks inside the continuous passage
  for (let k = 0; k < 12; k++) protect[(30 + (k * 4) % 40) * 200 + 25 + k * 12] = 1;
  const r = planLanes(list, 200, 100, G, 1, { cellMm: 0.45, laneMm: 12, strokeMm: 60, protect, curved: true });
  assert.ok(r && r.paths.length > 0 && r.paths.length <= 24, `Expected continuous lanes, got ${r?.paths.length}`);
  const stubCount = r.paths.filter(p => p.length <= 2 && Math.hypot(p[p.length - 1].x - p[0].x, p[p.length - 1].y - p[0].y) < 1).length;
  assert.equal(stubCount, 0, 'Zero 0.5-cell stub strokes emitted on continuous passage');
});
