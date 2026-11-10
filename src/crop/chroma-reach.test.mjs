// The chroma reach of a named box, on sheets whose answer is known.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleSource } from './boxpick.mjs';
import { localColours, widePalette } from './palettewide.mjs';
import { pickPalette } from './palettepick.mjs';
import { BOX } from './box.mjs';
import { chromaReach, coverChroma, chromaNote, clusterColour } from './chroma-reach.mjs';

const W = 60, H = 48, N = W * H, PAPER = [252, 251, 248];
const box = keys => keys.map(k => BOX.find(p => p.key === k));
/** A third of the sheet one flat colour, the rest bare paper. */
function sheet(rgb) {
  const px = new Uint8ClampedArray(N * 3);
  for (let i = 0; i < N; i++) px.set(i % W < 20 ? rgb : [250, 249, 246], i * 3);
  return px;
}
const sampled = rgb => { const sample = sampleSource(sheet(rgb), W, H, PAPER); return { sample, colours: localColours(sample) }; };
const SHARE = { minShare: 0.02 };
const CLEAR_ORANGE = [240, 130, 30], FUR_ORANGE = [204, 141, 81];

test('earths point at a clear orange but cannot mix it; the box gains a bright pan with the reason', () => {
  const { sample, colours } = sampled(CLEAR_ORANGE), earths = box(['rawsienna', 'sienna', 'sepia']);
  const before = chromaReach(sample, colours, earths, SHARE);
  assert.ok(before.loss > 0, 'the nearest earth mix is duller than 0.8 of the orange');
  const big = before.colours.reduce((p, q) => (q.share > p.share ? q : p));
  assert.ok(big.mixed < 0.8 * big.wanted && big.mixed > 0.3 * big.wanted, `${big.mixed} of ${big.wanted}`);
  const fixed = coverChroma(sample, colours, earths, SHARE);
  assert.equal(fixed.reach.loss, 0);
  assert.deepEqual(fixed.paints.slice(0, 3), earths, 'the named pans stay, first');
  assert.ok(fixed.added.length >= 1 && fixed.added.length <= 2);
  assert.ok(fixed.added.every(a => ['hansa', 'cadyellow', 'cadred', 'rose'].includes(a.key)), `a bright warm pan: ${fixed.added.map(a => a.key)}`);
  assert.ok(fixed.added[0].after > fixed.added[0].before && fixed.added[0].after >= 0.8 * fixed.added[0].wanted);
  assert.match(chromaNote(fixed, ['rawsienna', 'sienna', 'sepia']), /added \w+ for chroma: the colour at hue \d+, L \d+ .* has chroma \d+, the nearest mix of rawsienna, sienna, sepia reaches \d+, with \w+ \d+/);
});

test('a dull orange that ochre and burnt sienna do mix is left alone', () => {
  const { sample, colours } = sampled(FUR_ORANGE), earths = box(['ochre', 'sienna', 'sepia', 'paynes']);
  const r = chromaReach(sample, colours, earths, SHARE);
  assert.equal(r.loss, 0);
  assert.ok(r.colours.length && r.colours.every(c => c.ratio >= 0.8));
  const c = coverChroma(sample, colours, earths, SHARE);
  assert.deepEqual(c.paints, earths);
  assert.deepEqual(c.added, []);
  assert.equal(chromaNote(c, []), '');
});

test('the mix is judged at the colour\'s own lightness: the same pans reach a pale tint of a colour they cannot reach full strength', () => {
  const earths = box(['rawsienna', 'sienna', 'sepia']);
  const pale = sampled([247, 205, 170]), full = sampled(CLEAR_ORANGE);
  const p = chromaReach(pale.sample, pale.colours, earths, SHARE), f = chromaReach(full.sample, full.colours, earths, SHARE);
  assert.ok(Math.max(...p.colours.map(c => c.L)) > Math.max(...f.colours.map(c => c.L)));
  assert.ok(Math.min(...p.colours.map(c => c.ratio)) > Math.min(...f.colours.map(c => c.ratio)));
});

test('small colours, greys and the cap', () => {
  const { sample, colours } = sampled(CLEAR_ORANGE), earths = box(['rawsienna', 'sienna', 'sepia']);
  assert.equal(chromaReach(sample, colours, earths, { minShare: 0.9 }).loss, 0, 'a colour under the share is not significant');
  assert.equal(chromaReach(sample, colours.map(c => ({ ...c, grey: true })), earths, SHARE).colours.length, 0);
  const capped = coverChroma(sample, colours, earths, { ...SHARE, max: 3 });
  assert.deepEqual(capped.paints, earths);
  assert.ok(capped.reach.loss > 0);
  assert.match(chromaNote(capped, ['rawsienna']), /chroma still short by [\d.]+ at the palette limit/);
  assert.throws(() => chromaReach(sample, colours, []), /at least one paint/);
  const mean = clusterColour(sample, colours.find(c => !c.grey));
  assert.ok(mean[0] > mean[1] && mean[1] > mean[2]);
});

test('a named --paints box is checked for chroma after hue; --paintsextend 0 keeps it', () => {
  const px = sheet(CLEAR_ORANGE), lean = pickPalette(px, W, H, PAPER, { boxpick: false }).palette, keys = ['rawsienna', 'sienna', 'sepia'];
  const { palette, note } = widePalette(px, W, H, PAPER, lean, { keys });
  assert.deepEqual(palette.box.keys.slice(0, 3), keys);
  assert.ok(palette.box.keys.length > 3 && palette.box.keys.length <= 7, String(palette.box.keys));
  assert.equal(palette.chromaReach.loss, 0, note);
  assert.match(note, /for chroma|chroma reached by the named pans/);
  const kept = widePalette(px, W, H, PAPER, lean, { keys, extend: false });
  assert.deepEqual(kept.palette.box.keys, keys);
  assert.equal(kept.palette.chromaReach, undefined);
  assert.doesNotMatch(kept.note, /chroma/);
  const fine = widePalette(sheet(FUR_ORANGE), W, H, PAPER, pickPalette(sheet(FUR_ORANGE), W, H, PAPER, { boxpick: false }).palette, { keys: ['ochre', 'sienna', 'sepia'] });
  assert.deepEqual(fine.palette.box.keys, ['ochre', 'sienna', 'sepia']);
  assert.deepEqual(fine.palette.chromaReach.added, []);
  assert.match(fine.note, /chroma reached by the named pans/);
});

test('the chroma check has its own two pans when the hue extension has spent its two', () => {
  // four equal bands: a clear orange, a clear blue, a clear green and bare paper, with a box of two dark neutrals
  const bands = [[240, 130, 30], [60, 110, 220], [90, 170, 80], [250, 249, 246]];
  const px = new Uint8ClampedArray(N * 3);
  for (let i = 0; i < N; i++) px.set(bands[Math.floor((i % W) / (W / bands.length))], i * 3);
  const keys = ['sepia', 'paynes'], lean = pickPalette(px, W, H, PAPER, { boxpick: false }).palette;
  const { palette, note } = widePalette(px, W, H, PAPER, lean, { keys });
  const chroma = palette.chromaReach.added.map(a => a.key);
  assert.deepEqual(palette.box.keys.slice(0, 2), keys);
  assert.equal(palette.box.keys.length - chroma.length, 4, 'the hue extension added its two');
  assert.ok(chroma.length >= 1 && chroma.length <= 2, String(chroma));
  assert.deepEqual(palette.box.keys.slice(4), chroma, 'chroma pans come last');
  for (const a of palette.chromaReach.added) assert.ok(a.after > a.before, `${a.key}: ${a.before} to ${a.after}`);
  assert.match(note, /added [a-z]+ for chroma/);
  const hueOnly = widePalette(px, W, H, PAPER, lean, { keys, chroma: false });
  assert.deepEqual(hueOnly.palette.box.keys, palette.box.keys.slice(0, 4));
  assert.equal(hueOnly.palette.chromaReach, undefined);
});
