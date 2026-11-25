import test from 'node:test';
import assert from 'node:assert/strict';
import { contactDistance, cellEdgeFlux } from './contact-distance.mjs';
import { edgeProfile } from './edge-feed.mjs';

test('contact distances reach straight faces and diagonal corners in physical cells', () => {
  const w = 10, mask = Uint8Array.from({ length: w * w }, (_, i) => +(i % w >= 2 && ((i / w) | 0) >= 2));
  const f = contactDistance(mask, w, w, (x, y) => x >= 0 && y >= 0 && x < w && y < w && !mask[y * w + x]);
  assert.equal(f.distance[5 * f.width + 5], .5);
  assert.equal(f.distance[9 * f.width + 9], 2.5);
  // A dry diagonal corner, with both face neighbours wet.
  mask.fill(1); mask[0] = 0;
  const g = contactDistance(mask, w, w, (x, y) => x === 0 && y === 0);
  assert.ok(Math.abs(g.distance[3 * g.width + 3] - Math.SQRT1_2) < 1e-12);
});

test('whole-cell square averages reproduce the analytic flat-edge integral, including a partial band', () => {
  for (const mm of [.1, .25, .3]) {
    const w = 40, mask = Uint8Array.from({ length: w * w }, (_, i) => +(i % w >= 2));
    const f = contactDistance(mask, w, w, (x, y) => x === 1 && y >= 0 && y < w);
    for (let x = 2; x < 2 + Math.ceil(1 / mm); x++) {
      const v = cellEdgeFlux(f, x, 20, mm, 1), exact = edgeProfile((x - 2) * mm, (x - 1) * mm, 1);
      assert.ok(Math.abs(v - exact) < .002, `${mm} cell ${x}: ${v} vs ${exact}`);
    }
  }
});

test('threaded curved-edge quadrature preserves every sink and its ordered sum', async t => {
  const { applyEdgeFlux } = await import('./contact-distance.mjs');
  const pool = await import('./sheet-par.mjs');
  t.after(() => pool.stop());
  const w = 111, h = 82, box = [7, 9, 94, 73], mm = 0.25, edgeMm = 1;
  const mask = Uint8Array.from({ length: w * h }, (_, i) => {
    const x = i % w, y = Math.floor(i / w);
    return x >= 12 && x <= 89 && y >= 13 && y <= 69 && (x % 13 !== 6 || y % 9 !== 3);
  });
  const field = contactDistance(mask, w, h, (x, y) => x >= 0 && y >= 0 && x < w && y < h && !mask[y * w + x], box);
  const indices = Array.from(mask.keys()).filter(i => mask[i]).reverse();
  const order = Int32Array.from([...indices, 0]);  // the backing array may be longer than its active span
  const weights = Float64Array.from(mask, (v, i) => v ? (i % 23) * 0.023666067 : 77);
  const ref = weights.slice();
  let sum = 0;
  for (const i of indices) {
    ref[i] *= cellEdgeFlux(field, i % w, Math.floor(i / w), mm, edgeMm);
    sum += ref[i];
  }
  pool.useEdgeThreads(3);
  applyEdgeFlux(field, order, 1, w, mm, edgeMm, weights.slice());
  assert.equal(pool.threads(), 1, 'a short contact starts no workers');
  for (let run = 1; run <= 2; run++) {
    const result = weights.slice();
    assert.equal(applyEdgeFlux(field, order, indices.length, w, mm, edgeMm, result), sum);
    assert.deepEqual(result, ref);
    assert.equal(pool.threads(), 3);
    assert.equal(pool.stats().edgeFlux, run);
  }
});
