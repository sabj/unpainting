// The paper rule and the palette pick, on sheets whose failure is known.
import test from 'node:test';
import assert from 'node:assert/strict';
import { paperOf, pickPalette, WHITE_PAPER } from './palettepick.mjs';
import { paletteOf } from './palette.mjs';
import { widePalette } from './palettewide.mjs';
import { BOX } from './box.mjs';
import { isDarkPan, isBluePan, isEarthPan, pictureShares, boxNeeds, NEEDS } from './palette-needs.mjs';
import { sampleSource } from './boxpick.mjs';
import { localColours } from './palettewide.mjs';

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

test('shared palette fitting preserves every candidate result', () => {
  const px = hills(), paper = paperOf(px, W, H).paperRGB, shared = new Map();
  for (const options of [
    { paints: 4, gainPerPigment: 0.02, neutralBelow: 0.18 },
    { paints: 6, gainPerPigment: 0.005, neutralBelow: 0.08 },
    { paints: 4, gainPerPigment: 0, neutralBelow: 0 },
  ]) {
    assert.deepEqual(paletteOf(px, N, paper, { ...options, shared }), paletteOf(px, N, paper, options));
  }
});

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

// ---- The paints a picture is given (palette-needs.mjs), on five sheets made from pictures whose pick is known. ----
// Each is a sheet of colour patches in the shares the picture holds them. The first three were picked wrongly before
// (the box each got is in its test); the last two were right and are pinned as they were.
const SW = 96, SH = 80, SN = SW * SH, WHITE = [252, 251, 248];
/** A sheet of colour patches: [[share of the sheet, [r, g, b]], ...] laid as bands down the sheet, each with a little grain. */
function patches(list) {
  const px = new Uint8ClampedArray(SN * 3), total = list.reduce((a, p) => a + p[0], 0);
  let row = 0;
  list.forEach(([share, rgb], q) => {
    const rows = q === list.length - 1 ? SH - row : Math.round(SH * share / total);
    for (let y = row; y < Math.min(SH, row + rows); y++) for (let x = 0; x < SW; x++) for (let c = 0; c < 3; c++) px[(y * SW + x) * 3 + c] = rgb[c] + ((x * 7 + y * 3 + c) % 5) - 2;
    row += rows;
  });
  return px;
}
const SHEETS = {
  // a pen-and-wash drawing in brown on a cream sheet, with a little grey wash (Guardi's colonnade)
  brownDrawing: { paper: WHITE, px: patches([[40, [236, 226, 206]], [20, [205, 188, 160]], [18, [160, 135, 100]], [8, [150, 146, 138]], [14, [70, 52, 36]]]) },
  // a black dog on a dune under a pale sky, in watercolour (Kasha)
  blackDog: { paper: [248, 244, 232], px: patches([[50, [248, 244, 232]], [8, [150, 180, 215]], [14, [38, 38, 42]], [6, [70, 70, 76]], [10, [214, 196, 160]], [9, [150, 150, 80]], [3, [200, 90, 100]]]) },
  // an orange cat on white paper (Mittens)
  orangeCat: { paper: WHITE, px: patches([[40, [252, 251, 248]], [15, [240, 200, 160]], [20, [228, 150, 80]], [15, [200, 110, 50]], [8, [170, 90, 50]], [2, [225, 220, 232]]]) },
  // an ink-and-wash view: grey washes, warm stone, foliage and a little blue (the Rosewalk)
  inkAndWash: { paper: WHITE, px: patches([[15, [252, 251, 248]], [6, [170, 185, 210]], [20, [150, 150, 150]], [8, [100, 100, 102]], [25, [200, 180, 150]], [12, [170, 140, 105]], [10, [120, 150, 95]], [4, [45, 45, 48]]]) },
  // a bright landscape: blue sky, green hills, a pink house
  landscape: { paper: WHITE, px: patches([[10, [252, 251, 248]], [35, [130, 180, 235]], [40, [95, 140, 60]], [15, [226, 150, 160]]]) },
};
/** The box a sheet is given: the palette pick and then the wide palette, as the plan makes them (tools/plate/plan.mjs). */
function boxOf({ px, paper }, wide = {}) {
  const log = console.log; console.log = () => {};
  try {
    const { palette } = pickPalette(px, SW, SH, paper, { boxpick: true, boxmargin: 0, box: { gain: 0.25, max: 4, min: 4 } });
    const got = widePalette(px, SW, SH, paper, palette, wide);
    return { keys: got.palette.box.keys, paints: got.palette.box.keys.map(k => BOX.find(p => p.key === k)), needs: got.palette.box.needs, note: got.note };
  } finally { console.log = log; }
}

test('box paints are told apart by their own colour: the darks, the blues and the earths', () => {
  const keys = f => BOX.filter(p => f(p)).map(p => p.key).sort();
  assert.deepEqual(keys(isDarkPan), ['lampblack', 'paynes', 'sepia', 'umber']);
  assert.deepEqual(keys(isBluePan), ['cerulean', 'phthaloblue', 'ultramarine']);
  assert.deepEqual(keys(isEarthPan), ['ochre', 'rawsienna', 'sienna', 'umber']);
  assert.deepEqual(keys(p => isDarkPan(p, { ...NEEDS, darkPanC: 8 })), ['lampblack', 'paynes'], 'the limits are settings');
});

test('a brown pen-and-wash drawing is given an earth and a dark and no blue (it was given ultramarine)', () => {
  const { keys, paints, needs } = boxOf(SHEETS.brownDrawing);
  assert.ok(paints.some(p => isEarthPan(p)), `an earth: ${keys}`);
  assert.ok(paints.some(p => isDarkPan(p)), `a dark: ${keys}`);
  assert.ok(!paints.some(p => isBluePan(p)), `no blue: ${keys}`);
  assert.ok(needs.cool < 0.01 && needs.earth > 0.5, JSON.stringify(needs));
  assert.deepEqual(needs.dropped, [], 'the fit chose no blue here; the earths are no longer given one');
});

test('a black dog is given a dark neutral (it was given ultramarine, rose and hansa yellow alone)', () => {
  const { keys, paints, needs } = boxOf(SHEETS.blackDog);
  assert.ok(keys.includes('lampblack') || keys.includes('paynes'), `a dark neutral: ${keys}`);
  assert.ok(needs.dark >= 0.15, `darks hold ${needs.dark} of the painted cells`);
  assert.ok(paints.some(p => isBluePan(p)), `its sky keeps a blue: ${keys}`);
  for (const k of ['ultramarine', 'rose', 'hansa']) assert.ok(keys.includes(k), `the fitted paints stay: ${keys}`);
});

test('an orange cat is given the earths and a dark to grey them, not a blue (it was given hansa yellow, cadmium red and ultramarine)', () => {
  const { keys, paints, needs } = boxOf(SHEETS.orangeCat);
  assert.deepEqual(needs.dropped, ['ultramarine'], 'the blue the fit chose to grey with');
  assert.ok(paints.some(p => isEarthPan(p)), `an earth: ${keys}`);
  assert.ok(paints.some(p => isDarkPan(p)), `a dark: ${keys}`);
  assert.ok(!paints.some(p => isBluePan(p)), `no blue: ${keys}`);
});

test('two pictures that were right keep their paints: an ink-and-wash view with a little blue, and a bright landscape', () => {
  assert.deepEqual(boxOf(SHEETS.inkAndWash).keys, ['hansa', 'rose', 'cerulean', 'rawsienna', 'sienna', 'ultramarine']);
  assert.deepEqual(boxOf(SHEETS.landscape).keys, ['sapgreen', 'cerulean', 'rose', 'ultramarine']);
});

test('shares are of the painted cells, not of the sheet, and every limit is a setting', () => {
  const { px, paper } = SHEETS.blackDog, sample = sampleSource(px, SW, SH, paper, { stride: 3 }), colours = localColours(sample);
  const sh = pictureShares(sample, colours);
  assert.ok(sh.painted > 0.4 && sh.painted < 0.6, `half the sheet is bare paper: ${sh.painted}`);
  assert.ok(sh.dark > 0.25 && sh.dark < 0.35, `the coat's darks are a seventh of the sheet and over a quarter of the paint: ${sh.dark}`);
  // with the bar for darks raised above what the picture holds, no dark is added
  const fitted = ['ultramarine', 'rose', 'hansa'].map(k => BOX.find(p => p.key === k));
  assert.deepEqual(boxNeeds(sample, colours, fitted, { darkShare: 0.9 }).added, []);
  assert.equal(boxNeeds(sample, colours, fitted).added.length, 1);
  // a named box (--paints) is left as it is
  const named = boxOf(SHEETS.blackDog, { keys: ['ultramarine', 'rose', 'hansa'], extend: false });
  assert.deepEqual(named.keys, ['ultramarine', 'rose', 'hansa']); assert.equal(named.needs, undefined);
});
