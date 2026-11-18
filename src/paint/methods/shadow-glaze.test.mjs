import test from 'node:test';
import assert from 'node:assert/strict';
import { createShadowGlazes, lightnessOf, lightOfLightness, valueStepL, GAP_FLOOR_L, MAX_GLAZES } from './shadow-glaze.mjs';
import { filmLight } from './mass-tone.mjs';

const PAPER = [252, 251, 248], P = PAPER.map(v => v / 255);
const PIGS = [{ K: [0.5, 0.2, 0.05], S: [0.02, 0.02, 0.02] }, { K: [0.05, 0.25, 0.5], S: [0.02, 0.02, 0.02] }];
const paperLight = filmLight([0, 0, 0], [0, 0, 0], P);
const lightnessOfFilm = (a, b) => lightnessOf(filmLight([0, 1, 2].map(c => a * PIGS[0].K[c] + b * PIGS[1].K[c]), [0, 1, 2].map(c => a * PIGS[0].S[c] + b * PIGS[1].S[c]), P), paperLight);
// one dark cell asking 4 units of paint, one pale cell, and cells in between, so the picture has a value scale
const DEMAND = Float32Array.of(0, 0, 0.05, 0.02, 0.3, 0.2, 0.9, 0.5, 1.6, 1.2, 2.4, 1.6, 3.0, 2.0, 4.0, 2.5);
// the washes: a share of the fitted paint of the dark cell is down before any glaze
const washed = (ledger, share) => ledger.lay([DARK], [DEMAND[DARK * 2] * share, DEMAND[DARK * 2 + 1] * share]);
const N = DEMAND.length / 2, DARK = N - 1;
const make = (extra = {}) => createShadowGlazes({ n: N, k: 2, pigments: PIGS, paperRGB: PAPER, demand: DEMAND, eligible: () => true, ...extra });

test('lightness: the paper is 100, black is 0 and the two directions are inverses', () => {
  assert.ok(Math.abs(lightnessOf(paperLight, paperLight) - 100) < 1e-9);
  assert.equal(lightnessOf(0, paperLight), 0);
  for (const L of [3, 8, 20, 55, 90]) assert.ok(Math.abs(lightnessOf(lightOfLightness(L, paperLight), paperLight) - L) < 1e-9, `L ${L}`);
});

test('a value step is an eighth of the range from the 99th to the 0.1th percentile', () => {
  const L = Array.from({ length: 1000 }, (_, i) => i / 10);
  assert.ok(Math.abs(valueStepL(L) - (98.9 - 0) / 8) < 0.2);
  assert.throws(() => valueStepL([]), /value scale/);
});

test('nothing is laid yet: the dark cell is too light and asks paint, the paper cell asks none', () => {
  const g = make().glaze();
  assert.equal(g.wt[0], 0);
  assert.equal(g.wt[DARK], 1);
  assert.ok(g.cells >= 1 && g.gap95 > GAP_FLOOR_L);
  assert.ok(g.ask[DARK * 2] > 0 && g.ask[DARK * 2 + 1] > 0);
  assert.equal(g.ask[0] + g.ask[1], 0);
});

test('a glaze asks at most one value step, and never more paint than the cell is short of', () => {
  const ledger = make();
  washed(ledger, 0.25);
  const g = ledger.glaze(), d = [DEMAND[DARK * 2], DEMAND[DARK * 2 + 1]];
  const before = lightnessOfFilm(0.25 * d[0], 0.25 * d[1]), ideal = lightnessOfFilm(d[0], d[1]);
  assert.ok(before - ideal > ledger.step, `the gap ${(before - ideal).toFixed(1)} is more than one step ${ledger.step.toFixed(1)}`);
  const after = lightnessOfFilm(0.25 * d[0] + g.ask[DARK * 2], 0.25 * d[1] + g.ask[DARK * 2 + 1]);
  assert.ok(Math.abs(after - (before - ledger.step)) < 0.5, `moved to ${after.toFixed(1)}, wanted ${(before - ledger.step).toFixed(1)}`);
  for (let j = 0; j < 2; j++) assert.ok(g.ask[DARK * 2 + j] <= 0.75 * d[j] + 1e-6);
});

test('a gap under one step is closed in one glaze: the cell asks its whole shortfall', () => {
  // three quarters of the paint is down: the gap is under one value step but over the floor
  const ledger = make();
  washed(ledger, 0.75);
  const g = ledger.glaze();
  assert.equal(g.wt[DARK], 1);
  for (let j = 0; j < 2; j++) assert.ok(Math.abs(g.ask[DARK * 2 + j] - 0.25 * DEMAND[DARK * 2 + j]) < 1e-5);
});

test('the cell asks the mix it is short of: paint already laid is not asked again', () => {
  const ledger = make();
  ledger.lay([DARK], [DEMAND[DARK * 2], 0]); // all of the first pigment is down, none of the second
  const g = ledger.glaze();
  assert.equal(g.ask[DARK * 2], 0);
  assert.ok(g.ask[DARK * 2 + 1] > 0);
});

test('glazes laid one after another close the gap in a few steps and then leave the cell alone', () => {
  const ledger = make();
  washed(ledger, 0.5);
  let glazes = 0;
  for (; glazes < MAX_GLAZES + 3; glazes++) {
    const g = ledger.glaze();
    if (!g.wt[DARK]) break;
    ledger.lay([DARK], [g.ask[DARK * 2], g.ask[DARK * 2 + 1]]);
  }
  assert.ok(glazes >= 2 && glazes <= MAX_GLAZES, `${glazes} glazes`);
  assert.equal(ledger.glaze().wt[DARK], 0);
});

test('a cell laid its whole fitted paint, or more, is not glazed', () => {
  const ledger = make();
  ledger.lay([DARK], [DEMAND[DARK * 2] * 1.5, DEMAND[DARK * 2 + 1] * 1.5]);
  assert.equal(ledger.glaze().wt[DARK], 0);
});

test('eligibility is the caller\'s: a cell the caller keeps out is never covered, and the last glaze can differ', () => {
  const ledger = make({ eligible: (i, glaze) => i === DARK && glaze.last });
  assert.equal(ledger.glaze({ last: false }).wt[DARK], 0);
  assert.equal(ledger.glaze({ last: true }).wt[DARK], 1);
});

test('a bad grid fails loudly', () => {
  assert.throws(() => make({ n: N + 1 }), /grid/);
});

test('a glaze answers the squinted gap: a feature finer than the squint is not traced, a wide dark is', () => {
  // alternating dark and pale cells average to a middle value over the squint; a wide dark of the same cells does not
  const n = 24, dark = [2.4, 1.6], pale = [0.05, 0.02];
  const stripes = Float32Array.from({ length: n * 2 }, (_, q) => ((q >> 1) % 2 ? dark : pale)[q % 2]);
  const wide = Float32Array.from({ length: n * 2 }, (_, q) => ((q >> 1) < n / 2 ? pale : dark)[q % 2]);
  const box = field => Float32Array.from(field, (_, i) => { let s = 0, c = 0; for (let d = -1; d <= 1; d++) { const j = i + d; if (j >= 0 && j < n) { s += field[j]; c++; } } return s / c; });
  // the washes laid one flat charge, the mean of the cells' paint, over all of them
  const covered = demand => {
    const ledger = createShadowGlazes({ n, k: 2, pigments: PIGS, paperRGB: PAPER, demand, eligible: () => true, squint: box });
    const mean = [0, 1].map(j => Array.from({ length: n }, (_, i) => demand[i * 2 + j]).reduce((a, b) => a + b, 0) / n);
    ledger.lay(Array.from({ length: n }, (_, i) => i), mean);
    return Array.from(ledger.glaze().wt).reduce((a, b) => a + b, 0);
  };
  assert.equal(covered(stripes), 0);
  assert.ok(covered(wide) >= n / 2 - 2);
});

test('a glaze limits itself to one value step, unless the glazes left could not close the gap at that rate', () => {
  const ledger = make({ eligible: i => i === DARK });
  washed(ledger, 0.25);
  const d = [DEMAND[DARK * 2], DEMAND[DARK * 2 + 1]], before = lightnessOfFilm(0.25 * d[0], 0.25 * d[1]), ideal = lightnessOfFilm(d[0], d[1]);
  const gap = before - ideal, last = ledger.glaze({ remaining: 1 }), many = ledger.glaze({ remaining: 8 });
  assert.ok(gap > 2 * ledger.step, `the gap ${gap.toFixed(1)} is over two steps ${ledger.step.toFixed(1)}`);
  assert.ok(Math.abs(last.limit - gap) < 1e-6, 'the last glaze closes the whole gap');
  assert.ok(Math.abs(many.limit - ledger.step) < 1e-6, 'with glazes to spare a glaze is one step');
  const after = ask => lightnessOfFilm(0.25 * d[0] + ask[DARK * 2], 0.25 * d[1] + ask[DARK * 2 + 1]);
  assert.ok(Math.abs(after(last.ask) - ideal) < 0.2);
  assert.ok(Math.abs(after(many.ask) - (before - ledger.step)) < 0.5);
});

test('a small dark asks only for its own gap: read cell by cell it is covered, squinted it is blurred away', () => {
  const n = 24, pale = [0.05, 0.02], dark = [2.4, 1.6];
  const demand = Float32Array.from({ length: n * 2 }, (_, q) => ((q >> 1) === 12 ? dark : pale)[q % 2]);
  const box = field => Float32Array.from(field, (_, i) => { let s = 0, c = 0; for (let d = -12; d <= 12; d++) { const j = i + d; if (j >= 0 && j < n) { s += field[j]; c++; } } return s / c; });
  // the washes laid the pale paint everywhere but on the small dark
  const covered = kind => { const ledger = createShadowGlazes({ n, k: 2, pigments: PIGS, paperRGB: PAPER, demand, eligible: i => (i === 12 ? kind : false), squint: box }); ledger.lay(Array.from({ length: n }, (_, i) => i).filter(i => i !== 12), pale); return ledger.glaze(); };
  assert.equal(covered(true).wt[12], 0, 'a one-cell dark under the squint of the whole strip is no gap');
  const own = covered('fine');
  assert.equal(own.wt[12], 1);
  // nothing is laid on it, so its gap is the whole of its own paint: no more than its fitted paint is asked
  for (let j = 0; j < 2; j++) assert.ok(own.ask[12 * 2 + j] <= demand[12 * 2 + j] + 1e-6);
});

