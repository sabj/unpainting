import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSubject, lightsMask, bigShapes } from './subject.mjs';

const W = 60, H = 40, N = W * H, PAPER = [250, 249, 245];
/** Left half a pale grey-blue, right half a dark brown, a white disc of paper in the brown. */
function picture() {
  const px = new Uint8ClampedArray(N * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let rgb = x < W / 2 ? [200, 210, 230] : [120, 90, 60];
    if (Math.hypot(x - 45, y - 20) < 5) rgb = PAPER;
    for (let c = 0; c < 3; c++) px[i * 3 + c] = rgb[c];
  }
  return px;
}

test('readSubject gives density against the paper, zero on the paper', () => {
  const S = readSubject(picture(), W, H, PAPER);
  assert.equal(S.D.length, N * 3);
  assert.ok(S.tone[20 * W + 45] < 0.01, 'the disc is paper');
  assert.ok(S.tone[20 * W + 10] > 0.05 && S.tone[20 * W + 10] < S.tone[20 * W + 35], 'left is lighter than right');
});

test('lightsMask is the paper the picture leaves', () => {
  const S = readSubject(picture(), W, H, PAPER);
  const L = lightsMask(S.tone, W, H, { bare: 0.05 });
  let inDisc = 0, disc = 0, elsewhere = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (Math.hypot(x - 45, y - 20) < 3) { disc++; inDisc += L[i]; } else if (Math.hypot(x - 45, y - 20) > 8) elsewhere += L[i]; }
  assert.equal(inDisc, disc, 'the disc is light');
  assert.equal(elsewhere, 0, 'nothing else is');
});

test('bigShapes: two shapes, the light one first, the paper left out of both', () => {
  const S = readSubject(picture(), W, H, PAPER);
  const lights = lightsMask(S.tone, W, H, { bare: 0.05 });
  const shapes = bigShapes(S, W, H, { k: 4, sigma: 1, minArea: 0.02, lights });
  assert.equal(shapes.length, 2, `${shapes.length} shapes: ${shapes.map(s => s.area).join(', ')}`);
  assert.ok(shapes[0].tone < shapes[1].tone, 'light first');
  assert.ok(shapes[0].mask[20 * W + 10] === 1 && shapes[1].mask[20 * W + 55] === 1);
  assert.equal(shapes[0].mask[20 * W + 45] + shapes[1].mask[20 * W + 45], 0, 'the disc is in neither');
  // the light note of the brown is its lightest quarter: no lighter than its mean, and the same colour direction
  assert.ok(shapes[1].light[2] <= shapes[1].mean[2] + 1e-6);
  assert.ok(shapes[1].light[2] > shapes[1].light[0], 'the brown absorbs more blue than red');
});
