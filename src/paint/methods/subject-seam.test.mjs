import test from 'node:test';
import assert from 'node:assert/strict';
import { cutBySubject, seamShare } from './subject-order.mjs';

// A 20x10 passage over two subjects split at x = 10.
const W = 20, H = 10, N = W * H;
const rank = Uint8Array.from({ length: N }, (_, i) => (i % W < 10 ? 0 : 1));
const passageAll = () => ({ mask: new Uint8Array(N).fill(1), box: { x0: 0, y0: 0, x1: W - 1, y1: H - 1 }, amount: 1, area: N });

test('a cut through an even area keeps the passage whole (no ruled seam)', () => {
  const labels = new Int32Array(N).fill(1);
  let id = 0;
  const parts = cutBySubject(passageAll(), new Int32Array(N), () => ++id, { rank, ranks: 2, w: W, phase: 'light', seam: 0.5, labels });
  assert.equal(parts.length, 1);
});

test('a cut along a colour edge still splits the passage by subject', () => {
  const labels = Int32Array.from({ length: N }, (_, i) => (i % W < 10 ? 1 : 2));
  let id = 0;
  const parts = cutBySubject(passageAll(), new Int32Array(N), () => ++id, { rank, ranks: 2, w: W, phase: 'light', seam: 0.5, labels });
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map(p => p.rank).sort(), [0, 1]);
});

test('seam 0 keeps the old behaviour: the passage is cut at the subject edge', () => {
  const labels = new Int32Array(N).fill(1);
  let id = 0;
  const parts = cutBySubject(passageAll(), new Int32Array(N), () => ++id, { rank, ranks: 2, w: W, phase: 'light', seam: 0, labels });
  assert.equal(parts.length, 2);
});

test('seamShare counts the cut cells on a label change', () => {
  const cellsBy = [[], []];
  for (let i = 0; i < N; i++) cellsBy[rank[i]].push(i);
  const half = Int32Array.from({ length: N }, (_, i) => (i % W < 10 || ((i / W) | 0) < 5 ? 1 : 2));
  assert.equal(seamShare(cellsBy, [0, 1], half, W, N, () => true), 0.5);
});
