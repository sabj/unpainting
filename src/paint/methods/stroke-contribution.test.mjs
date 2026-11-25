import test from 'node:test';
import assert from 'node:assert/strict';
import { strokeContributions, strokesFor } from './stroke-contribution.mjs';

const seg = (x0, y0, x1, y1, n = 10) => Array.from({ length: n + 1 }, (_, k) => [x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);

test('contribution: a long contour outranks a fat dab, a stroke over ink already laid adds almost nothing', () => {
  const S = [
    { points: seg(10, 10, 60, 10), width: 0.3, weight: 1, role: 'outline' },
    { points: seg(30, 30, 31, 30), width: 1.2, weight: 1, role: 'texture' },
    { points: seg(10, 10.05, 60, 10.05), width: 0.3, weight: 1, role: 'outline' },
    { points: seg(10, 20, 20, 20), width: 0.3, weight: 0.4, role: 'inner' },
  ];
  const r = strokeContributions(S, 80, 50);
  // of a contour and its double (0, 2), one ranks first and the other adds little
  const [a, b] = r.rank[0] < r.rank[2] ? [0, 2] : [2, 0];
  assert.equal(r.rank[a], 0);
  assert.ok(r.contribution[a] > r.contribution[1], 'contour over dab');
  assert.ok(r.contribution[b] < 0.1 * r.contribution[a], 'a double adds little');
  assert.ok(Math.abs(r.curve.at(-1) - 1) < 1e-9 && r.curve.every((v, k) => !k || v >= r.curve[k - 1]), 'the curve rises to the whole drawing');
  assert.deepEqual(strokesFor(r.curve, [0.5, 1]), { 0.5: 1, 1: 4 });
});

test('contribution: per-point widths and pieces count their own ink', () => {
  const thin = strokeContributions([{ points: seg(0, 5, 20, 5), width: 0.2, weight: 1 }], 30, 10).total;
  const swell = strokeContributions([{ points: seg(0, 5, 20, 5), width: 0.2, widths: Array.from({ length: 11 }, (_, k) => (k > 3 && k < 7 ? 1 : 0.2)), weight: 1 }], 30, 10).total;
  const pieces = strokeContributions([{ paths: [{ points: seg(0, 5, 10, 5), width: 0.2 }, { points: seg(10, 5, 20, 5), width: 0.2 }], weight: 1 }], 30, 10).total;
  assert.ok(swell > 1.5 * thin);
  assert.ok(Math.abs(pieces - thin) / thin < 0.05);
});
