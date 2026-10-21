import test from 'node:test';
import assert from 'node:assert/strict';
import { matchInkLoad, sampleGestures, strokesPeakAbsorbance, lPlane } from './ink-match.mjs';
import { inkKFromSource } from './ink-hue.mjs';

test('the load is raised as well as lowered to meet the target', () => {
  // absorbance linear in the load: 0.4 at full load
  const measure = f => 0.4 * f;
  const up = matchInkLoad({ targetAbsorbance: 1, measure });
  assert.ok(Math.abs(up.factor - 2.5) < 0.01, `up ${up.factor}`);
  const down = matchInkLoad({ targetAbsorbance: 0.2, measure });
  assert.ok(Math.abs(down.factor - 0.5) < 0.01, `down ${down.factor}`);
  const capped = matchInkLoad({ targetAbsorbance: 10, measure });
  assert.equal(capped.factor, 4);
  assert.equal(matchInkLoad({ targetAbsorbance: 0, measure }).factor, 1);
});

test('a dark line core reads more absorbance than a pale one, and blank paper reads none', () => {
  const w = 60, h = 20, rgb = v => { const b = new Uint8Array(w * h * 3).fill(240); for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) b[(10 * w + x) * 3 + c] = v; return b; };
  const g = [{ points: [{ x: 5, y: 10 }, { x: 55, y: 10 }] }];
  const dark = strokesPeakAbsorbance(lPlane(rgb(60), w * h), w, h, g), pale = strokesPeakAbsorbance(lPlane(rgb(180), w * h), w, h, g);
  assert.ok(dark > pale && pale > 0);
  assert.equal(strokesPeakAbsorbance(lPlane(new Uint8Array(w * h * 3).fill(240), w * h), w, h, g), 0);
});

test('the sample is the longest strokes, in drawing order', () => {
  const g = n => ({ points: [{ x: 0, y: 0 }, { x: n, y: 0 }], n });
  assert.deepEqual(sampleGestures([g(1), g(9), g(3), g(7)], 2).map(s => s.n), [9, 7]);
});

test('a brown target line turns the ink toward brown and keeps its absorption sum', () => {
  const n = 400, rgb = new Uint8Array(n * 3), mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) { rgb.set(i < 100 ? [120, 85, 50] : [240, 235, 220], i * 3); mask[i] = i < 100 ? 1 : 0; }
  const base = [0.5, 0.5, 0.5], r = inkKFromSource(rgb, mask, [240, 235, 220], base);
  assert.ok(r.K[2] > r.K[1] && r.K[1] > r.K[0], `K ${r.K}`);
  assert.ok(Math.abs(r.K.reduce((a, v) => a + v, 0) - 1.5) < 0.01);
  assert.equal(inkKFromSource(rgb, new Uint8Array(n), [240, 235, 220], base), null);
  const g = inkKFromSource(rgb, mask, [240, 235, 220], base, { gain: 1.5 });
  assert.ok(g.K[2] / g.K[0] > r.K[2] / r.K[0], `gain ${g.K} vs ${r.K}`);
  assert.ok(Math.abs(g.K.reduce((a, v) => a + v, 0) - 1.5) < 0.01);
});
