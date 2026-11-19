import test from 'node:test';
import assert from 'node:assert/strict';
import { sheetColour, lightTolerance, paperLightTest, isPaperLight, paperLightReference, heldWhites, WHITE_SHEET, PAPER_RULE } from './paper-colour.mjs';

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

test('crops with no visible paper: lights are measured against the white sheet, whatever the lightest material', () => {
  const w = 60, h = 60;
  // A: a cloud crop whose lightest tenth is light cloud (L* ~94, neutral). It is a pale tone, not bare paper: the lights
  // reference is the white sheet, so the cloud takes its pale wash instead of being left blazing white.
  const cloudCrop = image(w, h, (x, y) => (y < 6 ? [236, 237, 233] : [180, 160, 130]));
  const refA = paperLightReference(cloudCrop, w, h);
  assert.equal(refA.detected, false, 'no paper sheet on border');
  assert.deepEqual(refA.sheet, [...WHITE_SHEET], 'painted on white paper');
  assert.deepEqual(refA.lightRef, [...WHITE_SHEET], 'lights against the white sheet');
  const cloudIsPaper = paperLightTest(refA.lightRef);
  assert.equal(cloudIsPaper(cloudCrop, 0), false, 'a cloud 5 L* or more under the sheet is not reserved');
  // B: pale cream sails (L* ~92, chroma ~13) are the same: toned, not bare
  const sailCrop = image(w, h, (x, y) => (y < 6 ? [236, 232, 215] : [90, 100, 120]));
  const refB = paperLightReference(sailCrop, w, h);
  assert.deepEqual(refB.lightRef, [...WHITE_SHEET]);
  assert.equal(paperLightTest(refB.lightRef)(sailCrop, 0), false);
  // C: a picture that does reach the sheet's own lightness keeps those cells as paper
  const paperCrop = image(w, h, (x, y) => (y < 6 ? [250, 249, 246] : [100, 120, 60]));
  assert.equal(paperLightTest(paperLightReference(paperCrop, w, h).lightRef)(paperCrop, 0), true);
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

test('the held whites are bare paper by the paper rule: a pale tint that asks little paint is a pale wash, not blazing white', () => {
  const paper = [252, 251, 248], k = 1;
  // four cells: the paper itself, a cell 3 L* under it, a pale yellow 9 L* under it, a pale yellow that asks almost no paint
  const rgb = Uint8Array.of(252, 251, 248, 244, 243, 240, 236, 232, 190, 238, 235, 205);
  const demand = Float32Array.of(0.01, 0.03, 0.05, 0.05);
  const { held, count } = heldWhites({ demand, k, rgb, paperRGB: paper, floor: 0.06 });
  assert.deepEqual(Array.from(held), [1, 1, 0, 0]);
  assert.equal(count, 2);
  // the old hold took every cell under the floor of paint whatever its colour
  assert.equal(Array.from(demand).filter(v => v < 0.06).length, 4);
});

