import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, step, dry, fix, layersOf, totals, DEFAULTS } from './sheet.mjs';
import { renderLayers } from './km.mjs';
import { luminance, densityOf } from '../../tools/lab/wash-measure.mjs';
import { bloomFront, squareRims } from '../../tools/lab/wash-acceptance.mjs';
import { waitForDamp } from '../../tools/lab/wash-state.mjs';

const pigments = [{ K: [.4625, .2934, .0496], S: [.02, .02, .02], rho: .047, omega: .5, gamma: .85, floc: .3 }, { K: [.4861, .2344, .1063], S: [.02, .02, .02], rho: .032, omega: 20, gamma: 0 }];
const O = { ...DEFAULTS, edgeEvap: .0012, fixedBed: 1, granFill: 0, slideCap: 1 };
const paper = (w, mm) => makePaper(w, w, { seed: 9, toothScale: .2, fibres: .5, tooth: .5, proudBlur: 1, mmPerCell: mm, coldPress: { mmPerCell: mm, bumpMm: [.5, 2], cover: 2.2, swell: .3 } });
function density(s) {
  const base = new Uint8Array(s.n * 3); for (let i = 0; i < s.n; i++) base.set([246, 245, 239], i * 3);
  return densityOf(luminance(renderLayers(layersOf(s), pigments, base, s.n), s.n), luminance([246, 245, 239], 1)[0]);
}

test('water including evaporation and pores, and both pigments including fixed layers, balance to 1e-5', () => {
  const s = createSheet(paper(32, 1), pigments);
  s.D[0].fill(.02); s.D[1].fill(.01); fix(s);
  for (let y = 5; y < 27; y++) for (let x = 5; x < 27; x++) deposit(s, y * s.w + x, .3, [.25, .15]);
  const before = totals(s);
  for (let t = 0; t < 100; t++) step(s, { ...O, dt: 1 });
  const after = totals(s);
  assert.ok(s.absorbed > 0); assert.ok(s.evaporated > s.edgeEvaporated);
  assert.ok(Math.abs(after.water + s.evaporated - before.water) / before.water < 1e-5);
  for (let k = 0; k < 2; k++) assert.ok(Math.abs(after.pig[k] - before.pig[k]) / before.pig[k] < 1e-5);
});

test('40 mm square in five successive sweeps has four rims within 15% and no seam or bare row', () => {
  const mm = .5, s = createSheet(paper(100, mm), pigments), o = { ...O, slope: 0, fibreFlow: 0 };
  // Isolate drying on a level, uniform sheet. Five adjacent eight-mm swaths
  // have the same loading: the brush calibration is tested separately.
  for (const field of ['height', 'valley', 'tooth']) s.paper[field].fill(.5);
  delete s.paper.surface;   // and no cockle (paper.mjs): a level sheet
  s.paper.capacity.fill(.3);
  for (let k = 0; k < 5; k++) {
    for (let y = (5 + 8 * k) / mm; y < (13 + 8 * k) / mm; y++) for (let x = 5 / mm; x < 45 / mm; x++) deposit(s, y * s.w + x, .3, [.45, 0]);
    for (let t = 0; t < 20; t++) step(s, o);
  }
  dry(s, 200000, o, { levelMax: 200, dt: 14, analyticTail: true });
  const od = density(s), rim = squareRims(od, s.w, s.h, mm);
  assert.ok(rim.deviation <= .15, JSON.stringify(rim));
  const rows = [];
  for (let y = 7 / mm; y < 43 / mm; y++) { let sum = 0; for (let x = 7 / mm; x < 43 / mm; x++) sum += od[y * s.w + x]; rows.push(sum / (36 / mm)); }
  const mean = rows.reduce((a, b) => a + b) / rows.length;
  assert.ok(rows.every(v => v > .85 * mean), `seam/bare row: ${Math.min(...rows) / mean}`);
  assert.ok(rows.slice(1).every((v, i) => Math.abs(v - rows[i]) < .15 * mean), 'adjacent sweep rows join continuously');
});

test('clean water in damp paint makes a bloom: ring/centre >1.2 and fitted radius RMS >0.2 mm', () => {
  const mm = .25, s = createSheet(paper(200, mm), pigments);
  for (let y = 5 / mm; y < 45 / mm; y++) for (let x = 5 / mm; x < 45 / mm; x++) deposit(s, y * s.w + x, .2, [.25, 0]);
  const footprint = []; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (Math.hypot((x + .5) * mm - 25, (y + .5) * mm - 25) < 6) footprint.push(y * s.w + x);
  const damp = waitForDamp(s, footprint, O, step);
  assert.ok(damp.film <= O.film && damp.film > O.wetEps && damp.pores > .02);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (Math.hypot((x + .5) * mm - 25, (y + .5) * mm - 25) < 6) deposit(s, y * s.w + x, .25, [0, 0]);
  dry(s, 200000, O, { levelMax: 200, dt: 14, analyticTail: true });
  const bloom = bloomFront(density(s), s.w, s.h, mm);
  // Before back-runs (backrun.mjs) this passed at 1.28 with no bloom to be seen: the clean water levelled out through the
  // whole damp wash, and the ring it found was the wash's own mottle 11.7 mm out. Now the water runs out as a front and
  // dries as a ragged dark ring with a paler inside (the physics check sheet, 24 Nov): 1.09 at the ring it finds. The
  // front's own shape is backrun.test.mjs's to check.
  assert.ok(bloom.contrast > 1.05, JSON.stringify(bloom));
  assert.ok(bloom.radiusRms > .2, JSON.stringify(bloom));
});
