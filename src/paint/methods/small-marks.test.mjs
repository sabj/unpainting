import test from 'node:test';
import assert from 'node:assert/strict';
import { smallLandmarks } from './small-marks.mjs';

const W = 40, H = 40, CELL = 0.282;
const field = fill => Float32Array.from({ length: W * H }, (_, i) => fill(i % W, (i / W) | 0));

test('a catchlight inside a dark iris is reserved; a pale area of the same size on paper is not', () => {
  // dark disc (iris) at (12,12) radius 5 with a 2x2 light at its centre; a 2x2 pale spot at (30,30) on paper
  const values = field((x, y) => {
    if (x >= 12 && x < 14 && y >= 12 && y < 14) return 0.02;
    if ((x - 12.5) ** 2 + (y - 12.5) ** 2 < 25) return 0.8;
    if (x >= 30 && x < 32 && y >= 30 && y < 32) return 0.05;
    return 0.01;
  });
  const none = new Uint8Array(W * H);
  const r = smallLandmarks({ values, smooth: values, shadowMask: none, protect: none, w: W, h: H, cellMm: CELL, maxCells: 288 });
  assert.equal(r.lights[12 * W + 12], 1, 'catchlight kept as paper');
  assert.equal(r.lights[30 * W + 30], 0, 'no glint invented on bare paper');
});

test('a small dark the shadow support left out becomes a mark; one inside the support or in an even field does not', () => {
  // a 4x4 dark (nostril) on mid skin; an even mid field elsewhere; a dark already in the shadow support
  const values = field((x, y) => (x >= 8 && x < 12 && y >= 8 && y < 12 ? 0.75 : x >= 25 && x < 29 && y >= 25 && y < 29 ? 0.75 : 0.3));
  const shadow = new Uint8Array(W * H);
  for (let y = 25; y < 29; y++) for (let x = 25; x < 29; x++) shadow[y * W + x] = 1;
  const r = smallLandmarks({ values, smooth: values, shadowMask: shadow, protect: null, w: W, h: H, cellMm: CELL, maxCells: 288 });
  assert.equal(r.darks[9 * W + 9], 1);
  assert.equal(r.darks[26 * W + 26], 0, 'the shadow glazes already carry it');
  assert.equal(r.darks[20 * W + 20], 0);
  assert.equal(r.darkCount, 1);
});

test('reserved lights are never re-marked and a large dark mass is left to the glazes', () => {
  const values = field((x, y) => (x < 30 ? 0.8 : 0.1));
  const protect = new Uint8Array(W * H); protect[5 * W + 5] = 1;
  const r = smallLandmarks({ values, smooth: values, shadowMask: new Uint8Array(W * H), protect, w: W, h: H, cellMm: CELL, maxCells: 288 });
  assert.equal(r.darks[5 * W + 5], 0);
  assert.equal(r.darkCount, 0, 'a 1200-cell mass is not a small mark');
});

test('isolation keeps a lone catchlight and leaves clustered coat glints to the wash', () => {
  // a dark coat with three glints 2 cells apart, and a lone glint in a dark eye far away
  const values = field((x, y) => ((x === 5 || x === 7 || x === 9) && y === 30 ? 0.02 : (x === 30 && y === 10) ? 0.02 : 0.8));
  const none = new Uint8Array(W * H);
  const r = smallLandmarks({ values, smooth: values, shadowMask: none, protect: none, w: W, h: H, cellMm: CELL, maxCells: 288, isolationMm: 1.5 });
  assert.equal(r.lights[10 * W + 30], 1, 'lone catchlight kept');
  assert.equal(r.lights[30 * W + 7], 0, 'clustered glints dropped');
  const all = smallLandmarks({ values, smooth: values, shadowMask: none, protect: none, w: W, h: H, cellMm: CELL, maxCells: 288 });
  assert.equal(all.lights[30 * W + 7], 1, 'without isolation the cluster is kept');
});
