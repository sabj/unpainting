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
  const m = segmentDetailMask(seg, W, H);
  assert.equal(m[18 * W + 58], 1, 'compact interior feature region kept');
  assert.equal(m[5 * W + 58], 0, 'border-spanning coat skipped');
  const dSeg = detailField(values, W, H, CELL, m);
  assert.ok(dSeg[18 * W + 58] > 0.5);
  assert.equal(dSeg[5 * W + 58], 0);
});

// A focal form is a subject whatever its colour and size, and touching the frame a little does not make it the setting.
// Shapes on a W x H grid; `f` scales them to a finer grid.
function forms(f) {
  const w = W * f, h = H * f, n = w * h, animal = new Uint8Array(n), ground = new Uint8Array(n), flat = new Uint8Array(n);
  // A grey-blue animal filling the right half, its neck running off the bottom edge: a third of the sheet.
  for (let y = 6 * f; y < 34 * f; y++) for (let x = 42 * f; x < 78 * f; x++) animal[y * w + x] = 1;
  for (let y = 34 * f; y < h; y++) for (let x = 56 * f; x < 64 * f; x++) animal[y * w + x] = 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < 40 * f; x++) ground[y * w + x] = 1;
  for (let y = 10 * f; y < 30 * f; y++) for (let x = 10 * f; x < 30 * f; x++) flat[y * w + x] = 1;
  const area = m => m.reduce((a, v) => a + v, 0) / n;
  return { w, h, area, seg: { regions: [
    { id: 1, foreground: true, area: area(animal), mask: animal },
    { id: 2, foreground: true, area: area(ground), mask: ground },
    { id: 3, foreground: true, area: area(flat), mask: flat },
    { id: 4, foreground: false, area: area(animal), mask: animal },
  ] } };
}

test('segmentDetailMask keeps a cool, large focal form that touches one edge, and skips the setting', () => {
  const { seg, area } = forms(1), d0 = detailField(values, W, H, CELL);
  const m = segmentDetailMask(seg, W, H);
  assert.deepEqual(m.regions, [1, 3], 'the animal and the patch inside the picture; not the frame-spanning ground or an unflagged copy');
  assert.ok(area(seg.regions[0].mask) > 0.3);
  // Inside the accepted even-wash patch the detail is still nil, so its minimum shape does not shrink.
  const d = detailField(values, W, H, CELL, m);
  assert.ok(d[20 * W + 60] > 0.5 && d[20 * W + 20] < 0.1, `animal ${d[20 * W + 60]}, patch ${d[20 * W + 20]}`);
  assert.ok(d0[20 * W + 20] < 0.1);
});

test('segmentDetailMask accepts the same forms on the render grid and on half of it', () => {
  for (const f of [1, 2, 3]) {
    const { seg, w, h } = forms(f);
    assert.deepEqual(segmentDetailMask(seg, w, h).regions, [1, 3], `grid x${f}`);
  }
});
