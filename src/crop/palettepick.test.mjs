// The paper rule and the palette pick, on sheets whose failure is known.
import test from 'node:test';
import assert from 'node:assert/strict';
import { paperOf, pickPalette, WHITE_PAPER } from './palettepick.mjs';

const W = 72, H = 60, N = W * H;

/** A photograph's kind of sheet: a blue sky over green hills, a pink house on them. */
function hills() {
  const px = new Uint8ClampedArray(N * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, sky = y < H * 0.45, house = !sky && x > W * 0.6 && x < W * 0.8 && y < H * 0.7;
    const rgb = sky ? [120 + y, 170 + y, 235] : house ? [226, 150, 160] : [90 + (x % 7), 140 - y / 2, 60];
    for (let c = 0; c < 3; c++) px[i + c] = rgb[c];
  }
  return px;
}

test('a cool lightest tenth is a sky, painted on white paper; a warm one is the sheet the drawing was made on', () => {
  const sky = paperOf(hills(), W, H);
  assert.equal(sky.white, true);
  assert.deepEqual(sky.paperRGB, [...WHITE_PAPER]);
  assert.ok(sky.lightest[2] > sky.lightest[0] + 6, `lightest ${sky.lightest}`);
  assert.equal(paperOf(hills(), W, H, { mode: 'source' }).white, false);

  const toned = new Uint8ClampedArray(N * 3);   // a toned paper (Turner's 234/213/171) darkening across the sheet
  for (let i = 0; i < N; i++) { const t = (i % W) / W; toned[i * 3] = 234 - 60 * t; toned[i * 3 + 1] = 213 - 70 * t; toned[i * 3 + 2] = 171 - 80 * t; }
  const warm = paperOf(toned, W, H);
  assert.equal(warm.white, false);
  assert.ok(warm.paperRGB[0] > warm.paperRGB[2], `the paper stays warm: ${warm.paperRGB}`);
  assert.equal(paperOf(toned, W, H, { mode: 'white' }).white, true);
});

test('the box is taken when it beats the recovered palettes by the margin, and never with the flag off', () => {
  const px = hills(), { paperRGB } = paperOf(px, W, H);
  const off = pickPalette(px, W, H, paperRGB, { boxpick: false });
  assert.doesNotMatch(off.note, /; box /);
  assert.notEqual(off.name, 'box');

  const on = pickPalette(px, W, H, paperRGB, { boxpick: true, boxmargin: 1 });
  assert.match(on.note, /; box \d \(.+\) at [\d.]+.*; kept \d \(box\)$/);
  assert.equal(on.name, 'box');
  assert.ok(on.e < off.e - 1, `the box plans at ${on.e.toFixed(2)} against ${off.e.toFixed(2)}`);
  assert.ok(on.palette.pigments.length > off.palette.pigments.length, 'the recovered palette had too few pigments for sky, hills and house');

  // a margin wider than the gain leaves the recovered pick in place, with the box still reported
  const strict = pickPalette(px, W, H, paperRGB, { boxpick: true, boxmargin: 10 });
  assert.equal(strict.name, off.name);
  assert.equal(strict.e, off.e);
  assert.match(strict.note, /; box \d /);
});
