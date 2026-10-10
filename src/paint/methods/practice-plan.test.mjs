import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kmeans, darkPair, fitDark, focalDarkCut, quantile, DENSITY_SCALE } from './practice-plan.mjs';

const blue = { K: [0.9, 0.5, 0.1] }, earth = { K: [0.2, 0.4, 0.8] }, yellow = { K: [0.05, 0.1, 0.7] };

test('k-means separates two clusters and repeats itself', () => {
  const pts = [...Array(20)].map((_, i) => Float64Array.from([i < 10 ? 0 : 1, 0]));
  const a = kmeans(pts, 2), b = kmeans(pts, 2);
  assert.deepEqual([...a.labels], [...b.labels]);
  assert.notEqual(a.labels[0], a.labels[19]);
  assert.equal(new Set(a.labels.slice(0, 10)).size, 1);
});

test('the dark pair is the palette blue and its earth', () => {
  const { blue: b, earth: e } = darkPair([yellow, blue, earth]);
  assert.equal(b, 1);
  assert.ok(e === 0 || e === 2);
  assert.notEqual(e, b);
  assert.deepEqual(darkPair([blue]), { blue: 0, earth: 0 });
});

test('a dark mixed from the pair matches a target it can make', () => {
  const PIGS = [yellow, blue, earth], pair = { blue: 1, earth: 2 };
  const want = [0.8, 0.3];
  const target = [0, 1, 2].map(c => (want[0] * blue.K[c] + want[1] * earth.K[c]) / DENSITY_SCALE);
  const mix = fitDark(target, PIGS, pair);
  assert.equal(mix[0], 0);
  assert.ok(Math.abs(mix[1] - 0.8) < 1e-6 && Math.abs(mix[2] - 0.3) < 1e-6, mix.join(','));
  // amounts never go negative, even for a target the pair cannot match
  assert.ok(fitDark([0, 0, 5], PIGS, pair).every(v => v >= 0));
});

test('the closing pen is cut to its runs inside the zone', () => {
  const w = 10, h = 1, zone = Uint8Array.from([0, 1, 1, 1, 0, 0, 1, 1, 0, 0]);
  const g = { points: [...Array(10)].map((_, x) => ({ x, y: 0 })) };
  const out = focalDarkCut({ zone, w, h })([g]);
  assert.deepEqual(out.map(r => r.points.map(q => q.x)), [[1, 2, 3], [6, 7]]);
  assert.equal(focalDarkCut({ zone, w, h })(null), null);
});

test('quantile reads a sorted copy', () => {
  assert.equal(quantile([5, 1, 3], 0), 1);
  assert.equal(quantile([5, 1, 3], 1), 5);
  assert.equal(quantile([], 0.5), 0);
});
