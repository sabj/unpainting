// --palettewide on sheets whose answer is known.
import test from 'node:test';
import assert from 'node:assert/strict';
import { paperOf, pickPalette } from './palettepick.mjs';
import { paletteOf } from './palette.mjs';
import { widePalette, localColours, kmeans, splitByPuddle, puddleLabels, coverKeyHues, keyHueCoverage } from './palettewide.mjs';
import { sampleSource } from './boxpick.mjs';
import { BOX } from './box.mjs';

const W = 60, H = 48, N = W * H;

/** A white sheet, a clear blue sky above, a red shirt below, a strip of green hills, and a brown figure most of it. */
function overlook() {
  const px = new Uint8ClampedArray(N * 3).fill(250);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const rgb = y < 12 ? [110, 150, 215] : y < 16 ? [120, 150, 70] : x > 40 ? [200, 60, 50] : [150, 115, 85];
    for (let c = 0; c < 3; c++) px[i + c] = rgb[c];
  }
  return px;
}

test('the wide palette carries a red and a blue that the lean pick greys', () => {
  const px = overlook(), { paperRGB } = paperOf(px, W, H), lean = pickPalette(px, W, H, paperRGB, { boxpick: false }).palette;
  const { palette, note } = widePalette(px, W, H, paperRGB, lean);
  const names = palette.pigments.map(p => p.name);
  assert.ok(palette.pigments.length >= 3, note);
  assert.ok(names.some(n => /rose|cadmium red|sienna/.test(n)), `a red in ${names}`);
  assert.ok(names.some(n => /ultramarine|phthalo blue|cerulean/.test(n)), `a blue in ${names}`);
});

test('a one-fluid sheet keeps its one fluid', () => {
  const px = new Uint8ClampedArray(N * 3);
  for (let i = 0; i < N; i++) { const t = (i % W) / W; px.set([250 - 150 * t, 240 - 170 * t, 225 - 190 * t], i * 3); }
  const { paperRGB } = paperOf(px, W, H), lean = paletteOf(px, N, paperRGB);
  assert.equal(lean.monochrome, true);
  const { palette } = widePalette(px, W, H, paperRGB, lean);
  assert.equal(palette, lean);
});

test('local colours find the small saturated shirt as its own colour', () => {
  const px = overlook(), { paperRGB } = paperOf(px, W, H), colours = localColours(sampleSource(px, W, H, paperRGB));
  assert.ok(colours.some(c => c.h < 50 && c.C > 30), JSON.stringify(colours.map(c => [c.h | 0, c.C | 0])));
  assert.ok(colours.some(c => c.h > 250 && c.h < 300), 'the sky');
});

test('a small orange passage gets optical hue coverage despite a mostly grey sheet', () => {
  const px = new Uint8ClampedArray(N * 3);
  for (let i = 0; i < N; i++) px.set(i % W < 8 ? [225, 130, 35] : [165, 165, 165], i * 3);
  const paper = [252, 251, 248], sample = sampleSource(px, W, H, paper), colours = localColours(sample);
  const deficient = ['ultramarine', 'lampblack'].map(key => BOX.find(p => p.key === key));
  const before = keyHueCoverage(sample, colours, deficient);
  const fixed = coverKeyHues(sample, colours, deficient, { max: 4 });
  assert.ok(before.loss > 10, 'cool and black pans cannot cover the orange');
  assert.equal(fixed.coverage.loss, 0, JSON.stringify(fixed.coverage));
  assert.ok(fixed.paints.length <= 4);
  assert.ok(fixed.added.every(key => !['lampblack', 'paynes', 'sepia'].includes(key)), 'a missing chromatic passage gets chromatic paint');
  const capped = coverKeyHues(sample, colours, deficient, { max: 2 });
  assert.deepEqual(capped.paints, deficient);
  assert.ok(capped.coverage.loss > 0, 'an explicit cap reports the remaining gap');
});

test('kmeans separates two clouds', () => {
  const P = Float32Array.from([0, 0, 0.1, 0, 0, 0.1, 5, 5, 5.1, 5, 5, 5.1]);
  const { labels } = kmeans(P, 6, 2, 2);
  assert.equal(new Set([labels[0], labels[1], labels[2]]).size, 1);
  assert.notEqual(labels[0], labels[3]);
});

test('splitByPuddle cuts a component by colour and folds slivers into a neighbour', () => {
  const w = 10, h = 4, labels = new Int32Array(w * h).fill(1), puddles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 5; x < w; x++) puddles[y * w + x] = 1;
  puddles[0] = 2; // a one-cell sliver
  const r = splitByPuddle(labels, puddles, w, h, 3);
  assert.equal(r.count, 2);
  assert.equal(r.areas[1] + r.areas[2], w * h);
  assert.equal(r.labels[0], r.labels[1]);
  assert.notEqual(r.labels[0], r.labels[9]);
});

test('puddle labels follow the amounts', () => {
  const w = 12, h = 6, k = 2, A = new Float32Array(w * h * k);
  for (let i = 0; i < w * h; i++) A[i * k + ((i % w) < 6 ? 0 : 1)] = 0.5;
  const { labels } = puddleLabels(A, k, w, h, { K: 2, radius: 1 });
  assert.notEqual(labels[0], labels[w - 1]);
  assert.equal(labels[0], labels[w * 3 + 2]);
});
