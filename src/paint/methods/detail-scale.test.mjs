import test from 'node:test';
import assert from 'node:assert/strict';
import { detailField, keepByDetail, localMinShape } from './detail-scale.mjs';

const W = 80, H = 40, CELL = 0.282;
// left half: an even wash; right half: a face-like field of small light and dark features (2-cell spots)
const values = Float32Array.from({ length: W * H }, (_, i) => { const x = i % W, y = (i / W) | 0; return x < 40 ? 0.4 : ((Math.floor(x / 6) + Math.floor(y / 6)) % 2 ? 0.7 : 0.2); });

test('detail is high where small features are and low in an even wash', () => {
  const d = detailField(values, W, H, CELL);
  assert.ok(d[20 * W + 60] > 0.5, `features ${d[20 * W + 60]}`);
  assert.ok(d[20 * W + 10] < 0.1, `wash ${d[20 * W + 10]}`);
});

test('a small piece survives where the detail is and is dropped in the even wash', () => {
  const d = detailField(values, W, H, CELL), mask = new Uint8Array(W * H);
  for (const [x0, y0] of [[8, 18], [60, 18]]) for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 8; x++) mask[y * W + x] = 1;
  const kept = keepByDetail(mask, W, H, 144, d, 0.85);
  assert.equal(kept[20 * W + 62], 1);
  assert.equal(kept[20 * W + 10], 0);
  assert.equal(localMinShape(144, 0, 0.85), 144);
  assert.equal(localMinShape(144, 1, 0.85), 22);
});
