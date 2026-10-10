// Pictures with a known palette, painted into a buffer, so the recovery can be checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { paletteOf, chromaOf } from './palette.mjs';
import { channelDensity } from './pigments.mjs';

const W = 64, H = 64, N = W * H, PAPER = [250, 248, 242];
const fill = rgb => { const b = Buffer.alloc(N * 3); for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) b[i * 3 + c] = rgb[c]; return b; };
const rect = (b, x0, y0, x1, y1, rgb) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 3; for (let c = 0; c < 3; c++) b[i + c] = rgb[c]; } };

test('a sheet washed in one brown is monochrome, and the pigment absorbs blue most', () => {
  const b = fill(PAPER);
  rect(b, 4, 4, 60, 60, [210, 186, 148]);
  rect(b, 12, 12, 40, 40, [170, 138, 92]);      // the same stain, twice over
  const p = paletteOf(b, N, PAPER);
  assert.equal(p.monochrome, true, `chroma ${p.chroma.toFixed(3)}`);
  assert.equal(p.pigments.length, 1);
  const K = p.pigments[0].K;
  assert.ok(K[2] > K[0], `a warm stain absorbs blue most: ${K.map(v => v.toFixed(2)).join(',')}`);
});

test('a sheet with a blue sky and warm sand is not monochrome and recovers both', () => {
  const b = fill(PAPER);
  rect(b, 0, 0, 64, 30, [150, 178, 214]);      // sky
  rect(b, 0, 30, 64, 64, [216, 190, 140]);     // sand
  const p = paletteOf(b, N, PAPER, { paints: 2 });
  assert.equal(p.monochrome, false, `chroma ${p.chroma.toFixed(3)}`);
  // one pigment must absorb red more than blue (it looks blue) and another the other way round
  const K = p.pigments.map(q => q.K);
  assert.ok(K.some(k => k[0] > k[2] * 1.15), `a blue paint absorbs red: ${K.map(k => k.map(v => v.toFixed(2)).join('/')).join(' ')}`);
  assert.ok(K.some(k => k[2] > k[0] * 1.15), `a warm paint absorbs blue: ${K.map(k => k.map(v => v.toFixed(2)).join('/')).join(' ')}`);
});

test('the ink is kept out of the paints when a mask says where it is', () => {
  const b = fill(PAPER);
  rect(b, 0, 0, 64, 64, [150, 178, 214]);         // a blue wash over everything
  const inkMask = new Uint8Array(N);
  for (let y = 10; y < 54; y++) for (let x = 30; x < 33; x++) { const i = y * W + x; inkMask[i] = 1; const j = i * 3; b[j] = 36; b[j + 1] = 30; b[j + 2] = 26; }
  const p = paletteOf(b, N, PAPER, { paints: 1, inkMask });
  assert.equal(p.pigments.length, 2, `one paint plus the ink; ink sits ${p.inkApart.toFixed(2)} rad off the paint`);
  const paint = p.pigments[0].K, ink = p.pigments[p.ink].K;
  assert.ok(paint[0] > paint[2], `the paint stays blue: ${paint.map(v => v.toFixed(2)).join(',')}`);
  const flat = Math.abs(ink[0] - ink[2]) / Math.max(...ink);
  assert.ok(flat < 0.25, `the ink is near neutral: ${ink.map(v => v.toFixed(2)).join(',')}`);
});

// Beer-Lambert: a stronger version of a colour keeps its density direction, so it is computed, never picked by eye.
const stronger = (rgb, times) => rgb.map((v, c) => Math.round(PAPER[c] * Math.exp(times * Math.log(Math.max(1, v) / PAPER[c]))));

test('a brown line over a brown wash stays one fluid, not two', () => {
  const wash = [208, 184, 146], line = stronger(wash, 5);
  const b = fill(PAPER);
  rect(b, 4, 4, 60, 60, wash);
  const inkMask = new Uint8Array(N);
  for (let y = 10; y < 54; y++) for (let x = 30; x < 33; x++) { const i = y * W + x; inkMask[i] = 1; const j = i * 3; for (let c = 0; c < 3; c++) b[j + c] = line[c]; }
  const p = paletteOf(b, N, PAPER, { inkMask });
  assert.equal(p.pigments.length, 1, `walnut line and walnut wash are one pigment; apart ${p.inkApart.toFixed(3)} rad`);
});

test('a carbon line over that same brown wash is two fluids', () => {
  const b = fill(PAPER);
  rect(b, 4, 4, 60, 60, [208, 184, 146]);
  const inkMask = new Uint8Array(N);
  for (let y = 10; y < 54; y++) for (let x = 30; x < 33; x++) { const i = y * W + x; inkMask[i] = 1; const j = i * 3; b[j] = 32; b[j + 1] = 30; b[j + 2] = 29; }
  const p = paletteOf(b, N, PAPER, { inkMask });
  assert.equal(p.pigments.length, 2, `a neutral black is not walnut; apart ${p.inkApart.toFixed(3)} rad`);
});

test('chroma separates a one-fluid sheet from a many-colour one', () => {
  const mono = fill(PAPER); rect(mono, 4, 4, 60, 60, [200, 176, 140]);
  const many = fill(PAPER); rect(many, 0, 0, 64, 32, [140, 170, 210]); rect(many, 0, 32, 64, 64, [220, 160, 120]);
  const a = chromaOf(channelDensity(mono, N, PAPER), N), c = chromaOf(channelDensity(many, N, PAPER), N);
  assert.ok(c > a * 2, `mono ${a.toFixed(3)} vs many ${c.toFixed(3)}`);
});
