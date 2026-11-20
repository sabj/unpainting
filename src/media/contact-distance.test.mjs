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
