import test from 'node:test';
import assert from 'node:assert/strict';
import { colourEdges, nearestEdge, edgeEvidence, labPlanes } from './line-evidence.mjs';

// a w x h image, left half dark grey, right half white
const halves = (w, h, left = [60, 60, 60], right = [240, 240, 240]) => {
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgb.set(x < w / 2 ? left : right, 3 * (y * w + x));
  return rgb;
};

test('lab planes put white at L 1 and grey near the middle, with no chroma', () => {
  const { L, A, B } = labPlanes(Uint8Array.from([255, 255, 255, 119, 119, 119]), 2, 1);
  assert.ok(Math.abs(L[0] - 1) < 1e-3 && Math.abs(L[1] - 0.5) < 0.01);
  assert.ok(Math.abs(A[1]) < 1e-3 && Math.abs(B[1]) < 1e-3);
});

test('a step between two halves is one thin vertical edge, its gradient across it', () => {
  const w = 40, h = 30, e = colourEdges(halves(w, h), w, h);
  const cols = new Set();
  for (let i = 0; i < w * h; i++) if (e.edge[i]) cols.add(i % w);
  assert.ok(cols.size >= 1 && cols.size <= 2, `edge columns ${[...cols]}`);
  for (const x of cols) assert.ok(Math.abs(x - w / 2) <= 1);
  const i = 15 * w + [...cols][0];
  assert.ok(Math.abs(Math.cos(e.ori[i])) > 0.95, 'gradient runs along x');
});

test('a flat image has no edges', () => {
  const w = 20, h = 20, e = colourEdges(halves(w, h, [200, 200, 200], [200, 200, 200]), w, h);
  assert.equal(e.edge.reduce((a, b) => a + b, 0), 0);
});

test('the distance transform is exact and points to the nearest set cell', () => {
  const w = 9, h = 7, mask = new Uint8Array(w * h); mask[3 * w + 4] = 1;
  const { dist, near } = nearestEdge(mask, w, h);
  assert.equal(dist[3 * w + 4], 0);
  assert.ok(Math.abs(dist[0] - Math.hypot(4, 3)) < 1e-6);
  assert.equal(near[6 * w + 8], 3 * w + 4);
  const empty = nearestEdge(new Uint8Array(w * h), w, h);
  assert.equal(empty.near[0], -1);
});

test('edge evidence carries the grid size and the distance to the edge', () => {
  const w = 40, h = 30, ev = edgeEvidence(halves(w, h), w, h);
  assert.equal(ev.w, w); assert.equal(ev.h, h);
  assert.ok(ev.dist[15 * w + 5] >= 13);
});
