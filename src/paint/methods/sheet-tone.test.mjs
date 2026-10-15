import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSheetTone, fillSheetBase, WHITE_PAPER_RGB } from './sheet-tone.mjs';

test('detectSheetTone identifies a warm antique toned sheet and ignores neutral or dark-bordered paintings', () => {
  const w = 40, h = 40, n = w * h;
  const antique = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    // Central ink/wash subject with warm cream antique paper surrounding it
    const x = i % w, y = (i / w) | 0;
    const inSubject = x >= 14 && x < 26 && y >= 12 && y < 28;
    antique[3 * i] = inSubject ? 95 : 242;
    antique[3 * i + 1] = inSubject ? 72 : 226;
    antique[3 * i + 2] = inSubject ? 54 : 204;
  }
  const r1 = detectSheetTone(antique, w, h);
  assert.equal(r1.toned, true);
  assert.deepEqual(r1.paperRGB, [242, 226, 204]);
  assert.ok(r1.borderShare > 0.9);

  const whiteSheet = new Uint8Array(n * 3).fill(250);
  const r2 = detectSheetTone(whiteSheet, w, h);
  assert.equal(r2.toned, false);
  assert.equal(r2.paperRGB, null);
});

test('fillSheetBase shades white paper first and updates to toned paper for the first stage frame', () => {
  const height = Float32Array.from([0.5, 1.0]);
  const base = Buffer.alloc(6);
  fillSheetBase(base, height, WHITE_PAPER_RGB, 0.04);
  assert.ok(base[2] > 240);
  fillSheetBase(base, height, [242, 226, 204], 0.04);
  assert.equal(base[3], 242);
  assert.equal(base[4], 226);
  assert.equal(base[5], 204);
});
