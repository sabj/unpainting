import test from 'node:test';
import assert from 'node:assert/strict';
import { filmOverGround, filmLight, colourLight, matchCellLight, createMassTone } from './mass-tone.mjs';
import { layerRT, renderLayers } from '../../media/km.mjs';

const absorber = { K: [1, 1, 1], S: [0, 0, 0] };
const WHITE = [255, 255, 255];

test('light crosses a film twice: a pure absorber of thickness x over paper has density 2 K x', () => {
  for (const x of [0.05, 0.4, 1.3]) assert.ok(Math.abs(-Math.log(filmOverGround(0.7 * x, 0, 0.9) / 0.9) - 2 * 0.7 * x) < 1e-12);
});

test('the film formula is the sheet optics: one layer of km.mjs over the same ground', () => {
  for (const [K, S, x, rp] of [[0.5, 0.02, 0.8, 0.98], [0.05, 0.3, 2, 0.6], [1.2, 0.02, 6, 0.9], [0, 0.4, 1, 0.5]]) {
    const [r, t] = layerRT(K, S, x);
    assert.ok(Math.abs(filmOverGround(K * x, S * x, rp) - (r + t * t * rp / (1 - r * rp))) < 1e-9, `K ${K} S ${S} x ${x}`);
  }
  assert.equal(filmOverGround(0, 0, 0.8), 0.8);
});

test('cell light: paint fitted as density = K x / 0.55 is 10/11 of that once light crosses the film twice', () => {
  const target = 128, amount = -0.55 * Math.log(target / 255);
  const fit = matchCellLight({ demand: Float32Array.of(amount), rgb: Uint8Array.of(target, target, target), pigments: [absorber], paperRGB: WHITE });
  assert.ok(Math.abs(fit.demand[0] / amount - 10 / 11) < 1e-4);
  assert.equal(fit.matched, 1);
  const painted = renderLayers([[Float32Array.of(fit.demand[0])]], [absorber], Uint8ClampedArray.from(WHITE), 1, 1);
  assert.equal(painted[0], target);
});

test('cell light: every cell is matched on its own, the mix is kept, reserves are left alone', () => {
  const pigs = [{ K: [0.5, 0.2, 0.05], S: [0.02, 0.02, 0.02] }, { K: [0.05, 0.25, 0.5], S: [0.02, 0.02, 0.02] }];
  const demand = Float32Array.of(0.3, 0.1, 1.2, 0.6, 0.4, 0.4), rgb = Uint8Array.of(190, 200, 205, 60, 70, 80, 120, 120, 120), paper = [252, 251, 248];
  const fit = matchCellLight({ demand, rgb, pigments: pigs, paperRGB: paper, protect: Uint8Array.of(0, 0, 1) });
  for (const i of [0, 1]) {
    assert.ok(Math.abs(fit.demand[i * 2] / fit.demand[i * 2 + 1] - demand[i * 2] / demand[i * 2 + 1]) < 1e-4);
    const kx = [0, 1, 2].map(c => fit.demand[i * 2] * pigs[0].K[c] + fit.demand[i * 2 + 1] * pigs[1].K[c]), sx = [0, 1, 2].map(c => fit.demand[i * 2] * pigs[0].S[c] + fit.demand[i * 2 + 1] * pigs[1].S[c]);
    assert.ok(Math.abs(filmLight(kx, sx, paper.map(v => v / 255)) - colourLight(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])) < 1e-5);
  }
  assert.equal(fit.demand[4], Math.fround(0.4));
  assert.equal(fit.matched, 2);
});

test('cell light: a cell no film can match keeps its fitted paint and is counted', () => {
  const opaque = { K: [0.01, 0.01, 0.01], S: [1, 1, 1] };
  const dark = matchCellLight({ demand: Float32Array.of(0.2), rgb: Uint8Array.of(1, 1, 1), pigments: [opaque], paperRGB: WHITE });
  assert.equal(dark.unmatched, 1); assert.equal(dark.demand[0], Math.fround(0.2));
  const light = matchCellLight({ demand: Float32Array.of(0.2), rgb: Uint8Array.of(250, 250, 250), pigments: [absorber], paperRGB: [240, 240, 240] });
  assert.equal(light.unmatched, 1); assert.equal(light.demand[0], Math.fround(0.2));
});

const meanLight = (amounts, paper = [1, 1, 1]) => amounts.reduce((s, a) => s + filmLight([a, a, a], [0, 0, 0], paper), 0) / amounts.length;

test('mass tone: a shape whose cells all ask the same is charged exactly that', () => {
  const tone = createMassTone({ n: 4, pigments: [absorber], paperRGB: WHITE });
  assert.ok(Math.abs(tone.strength([0, 1, 2, 3], [0.6], () => 0.6) - 1) < 1e-5);
});

test('mass tone: a flat wash over a varied shape is weaker than the mean paint and returns the same light', () => {
  const asks = [0.1, 0.3, 0.9, 1.5], mean = asks.reduce((a, b) => a + b) / asks.length;
  const tone = createMassTone({ n: 4, pigments: [absorber], paperRGB: WHITE });
  const f = tone.strength([0, 1, 2, 3], [mean], i => asks[i]);
  assert.ok(f < 0.95 && f > 0.3, `strength ${f}`);
  assert.ok(Math.abs(meanLight(asks.map(() => f * mean)) - meanLight(asks)) < 1e-6);
  // the mean paint itself is darker than the shape: this is the error the rule removes
  assert.ok(meanLight(asks.map(() => mean)) < meanLight(asks) - 0.01);
});

test('mass tone: a glaze is judged over what is already laid under it', () => {
  const tone = createMassTone({ n: 2, pigments: [absorber], paperRGB: WHITE });
  tone.lay([0], [1.0]);
  assert.ok(Math.abs(tone.light(0) - filmLight([1, 1, 1], [0, 0, 0], [1, 1, 1])) < 1e-9);
  assert.ok(Math.abs(tone.light(1) - 1) < 1e-9);
  const asks = [0.8, 0.2], f = tone.strength([0, 1], [0.5], i => asks[i]);
  const under = [1.0, 0], got = [0, 1].reduce((s, i) => s + filmLight(Array(3).fill(under[i] + f * 0.5), [0, 0, 0], [1, 1, 1]), 0);
  const want = [0, 1].reduce((s, i) => s + filmLight(Array(3).fill(under[i] + asks[i]), [0, 0, 0], [1, 1, 1]), 0);
  assert.ok(Math.abs(got - want) < 1e-6);
});

test('mass tone: a mixed charge keeps its proportions and nothing asked is nothing laid', () => {
  const pigs = [{ K: [0.5, 0.2, 0.05], S: [0.02, 0.02, 0.02] }, { K: [0.05, 0.25, 0.5], S: [0.02, 0.02, 0.02] }];
  const tone = createMassTone({ n: 3, pigments: pigs, paperRGB: [252, 251, 248] });
  assert.equal(tone.strength([0, 1, 2], [0.4, 0.2], () => 0), 0);
  assert.equal(tone.strength([0, 1, 2], [0, 0], () => 0.3), 1);
  const f = tone.strength([0, 1, 2], [0.4, 0.2], (i, j) => [0.1, 0.4, 0.7][i] * (j ? 0.5 : 1));
  assert.ok(f > 0 && f < 1);
});

test('mass tone: a large shape read at a stride gets the strength of the whole shape', () => {
  const n = 20000, list = Array.from({ length: n }, (_, i) => i), ask = i => 0.2 + 0.8 * ((i * 37) % 100) / 100;
  const all = createMassTone({ n, pigments: [absorber], paperRGB: WHITE, sample: n }).strength(list, [0.6], ask);
  const some = createMassTone({ n, pigments: [absorber], paperRGB: WHITE }).strength(list, [0.6], ask);
  assert.ok(Math.abs(all - some) < 0.01);
});
