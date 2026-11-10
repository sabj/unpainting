import test from 'node:test';
import assert from 'node:assert/strict';
import { sheetColour, lightTolerance, paperLightTest, isPaperLight, lightestTenth, paperLightReference, WHITE_SHEET, PAPER_RULE } from './paper-colour.mjs';

const image = (w, h, at) => { const rgb = new Uint8Array(w * h * 3); for (let i = 0; i < w * h; i++) rgb.set(at(i % w, (i / w) | 0), 3 * i); return rgb; };

test('a cream sheet is the paper even when a frame line cuts the lightest region off the border', () => {
  const w = 120, h = 120;
  const rgb = image(w, h, (x, y) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? [40, 35, 30] : x >= 40 && x < 80 && y >= 36 && y < 84 ? [90, 70, 50] : [248, 245, 216]));
  const s = sheetColour(rgb, w, h);
  assert.equal(s.detected, true, s.reason);
  assert.deepEqual(s.rgb, [248, 245, 216]);
  assert.ok(s.candidate.borderShare > 0.7, `border share ${s.candidate.borderShare}`);
  const ref = paperLightReference(rgb, w, h);
  assert.equal(ref.detected, true);
  assert.deepEqual(ref.sheet, [248, 245, 216]);
  assert.deepEqual(ref.lightRef, [248, 245, 216]);
});

test('a white sheet reads as white and a cool grey sheet is paper too: no hue test', () => {
  const w = 40, h = 40, subject = (x, y) => x >= 10 && x < 30 && y >= 10 && y < 30;
  const white = sheetColour(image(w, h, (x, y) => (subject(x, y) ? [120, 100, 80] : [250, 250, 250])), w, h);
  assert.equal(white.detected, true, white.reason);
  assert.deepEqual(white.rgb, [250, 250, 250]);
  const grey = sheetColour(image(w, h, (x, y) => (subject(x, y) ? [120, 100, 80] : [228, 232, 236])), w, h);
  assert.equal(grey.detected, true, grey.reason);
  assert.deepEqual(grey.rgb, [228, 232, 236]);
});

test('a bright saturated band along one edge of a photograph is not paper: the sheet is white', () => {
  const w = 40, h = 40;
  const s = sheetColour(image(w, h, (x, y) => (y < 3 ? [252, 204, 174] : [140, 120, 100])), w, h);
  assert.equal(s.detected, false);
  assert.deepEqual(s.rgb, [...WHITE_SHEET]);
  assert.match(s.reason, /chroma/);
  assert.match(s.reason, /border/);
});

test('a pale region along one edge only (a crop with no margin) is not the sheet', () => {
  const w = 60, h = 60;
  const s = sheetColour(image(w, h, (x, y) => (y < 3 ? [232, 238, 246] : [180, 160, 130])), w, h);
  assert.equal(s.detected, false);
  assert.deepEqual(s.candidate.rgb, [232, 238, 246]);
  assert.match(s.reason, /border/);
  assert.doesNotMatch(s.reason, /L\*|chroma/, 'a pale near-neutral region fails on the border alone');
  assert.deepEqual(s.rgb, [...WHITE_SHEET]);
});

test('crops with no visible paper: light neutral highlights fall back to lightest tenth, saturated/dark ones do not', () => {
  const w = 60, h = 60;
  // Case A: Trumbull-like crop. No margin paper, but lightest tenth is light cloud/facade (L* ~94, neutral).
  // 10% clouds [236, 237, 233], rest building/sky [180, 160, 130].
  const cloudCrop = image(w, h, (x, y) => (y < 6 ? [236, 237, 233] : [180, 160, 130]));
  const refA = paperLightReference(cloudCrop, w, h);
  assert.equal(refA.detected, false, 'no paper sheet on border');
  assert.equal(refA.fallback, true, 'falls back to lightest tenth highlights');
  assert.deepEqual(refA.sheet, [...WHITE_SHEET], 'painted on white paper');
  assert.deepEqual(refA.lightRef, [236, 237, 233]);

  // Case B: Overlook photo-like. Lightest material is dark mountain haze (L* 81 < 90).
  const hazeCrop = image(w, h, (x, y) => (y < 6 ? [221, 198, 181] : [140, 120, 100]));
  const refB = paperLightReference(hazeCrop, w, h);
  assert.equal(refB.detected, false);
  assert.equal(refB.fallback, false, 'dark haze does not become white paper highlights');
  assert.deepEqual(refB.lightRef, [...WHITE_SHEET]);

  // Case C: Hills-like. Lightest material is saturated yellow grass (chroma > 24).
  const grassCrop = image(w, h, (x, y) => (y < 6 ? [227, 221, 149] : [100, 120, 60]));
  const refC = paperLightReference(grassCrop, w, h);
  assert.equal(refC.detected, false);
  assert.equal(refC.fallback, false, 'saturated grass does not become white paper highlights');
  assert.deepEqual(refC.lightRef, [...WHITE_SHEET]);
});

test('a low-key picture whose lightest region is mid grey shows no paper', () => {
  const w = 24, h = 24;
  const s = sheetColour(image(w, h, (x, y) => (x < 10 && y < 10 ? [110, 110, 110] : [70, 70, 70])), w, h);
  assert.equal(s.detected, false);
  assert.match(s.reason, /L\*/);
});

test('the light tolerance is 5 L* on a sheet at L* 85 or more and shrinks to nothing by L* 72; chroma stays at 6', () => {
  assert.deepEqual(lightTolerance([252, 251, 248]), { L: PAPER_RULE.toleranceL, C: PAPER_RULE.toleranceC });
  assert.equal(lightTolerance([248, 245, 216]).L, PAPER_RULE.toleranceL);
  assert.equal(lightTolerance([110, 110, 110]).L, 0);
  const mid = lightTolerance([200, 196, 190]).L;
  assert.ok(mid > 0 && mid < PAPER_RULE.toleranceL, `mid-light sheet tolerance ${mid}`);
});

test('bare paper is within the tolerance of the sheet in L* and chroma; lighter is always paper', () => {
  const white = paperLightTest([252, 251, 248]);
  assert.equal(white([240, 239, 236], 0), true, '4 L* below white paper is paper');
  assert.equal(white([230, 229, 226], 0), false, '8 L* below white paper is a wash');
  assert.equal(white([235, 195, 130], 0), false, 'a sunlit ochre wall is paint');
  assert.equal(white([250, 245, 150], 0), false, 'a pale lemon wash is paint, however light');
  assert.equal(white([248, 245, 216], 0), false, 'cream on a white sheet is a pale wash');
  const cream = paperLightTest([248, 245, 216]);
  assert.equal(cream([248, 245, 216], 0), true);
  assert.equal(cream([240, 233, 200], 0), true, 'the mottle of a toned sheet is paper');
  assert.equal(cream([255, 255, 255], 0), true, 'a white highlight on toned paper is paper');
  assert.equal(cream([90, 70, 50], 0), false);
  const dark = paperLightTest([110, 110, 110]);
  assert.equal(dark([110, 110, 110], 0), true, 'the paper colour itself');
  assert.equal(dark([105, 105, 105], 0), false, 'a sheet at L* 46 reserves nothing below itself');
  assert.equal(isPaperLight([240, 239, 236], 0, [252, 251, 248], 12), true);
  assert.equal(isPaperLight([239, 239, 236], 0, [252, 251, 248], 12), false);
});
