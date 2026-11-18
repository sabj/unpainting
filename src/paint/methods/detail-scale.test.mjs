import test from 'node:test';
import assert from 'node:assert/strict';
import { detailField, keepByDetail, localMinShape, segmentDetailMask } from './detail-scale.mjs';

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

test('segmentDetailMask picks compact warm foreground feature regions and skips border coats', () => {
  const d0 = detailField(values, W, H, CELL), n = W * H, rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) { rgb[3 * i] = 210; rgb[3 * i + 1] = 170; rgb[3 * i + 2] = 140; }
  const faceMask = new Uint8Array(n), coatMask = new Uint8Array(n);
  for (let y = 10; y < 26; y++) for (let x = 50; x < 66; x++) faceMask[y * W + x] = 1;
  for (let y = 0; y < H; y++) for (let x = 40; x < W; x++) coatMask[y * W + x] = 1;
  const seg = { regions: [
    { id: 1, foreground: true, area: 16 * 16 / n, mask: faceMask },
    { id: 2, foreground: true, area: 40 * H / n, mask: coatMask },
  ] };
  const m = segmentDetailMask(seg, rgb, d0, W, H);
  assert.equal(m[18 * W + 58], 1, 'compact interior feature region kept');
  assert.equal(m[5 * W + 58], 0, 'border-spanning coat skipped');
  const dSeg = detailField(values, W, H, CELL, m);
  assert.ok(dSeg[18 * W + 58] > 0.5);
  assert.equal(dSeg[5 * W + 58], 0);
});
