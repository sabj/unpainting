// Scrap tests for two loads of one wash laid edge to edge (033 drying2), with scrap-wash.test.mjs's instruments: the
// 1 in flat at pressure 0.9, the wash physics and dry options, the benchmark's 280 mm paper at 540 cells. Each load is
// a stroke of its own (it lands and lifts), the second laid at once into the first's wet edge. A value step is twice
// the dip (scrap-charge.test.mjs). The pass mark is stated in scrap-seam.mjs and was written before any run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scrapSeam } from './scrap-seam.mjs';
import { step, dry, DEFAULTS } from '../../media/sheet.mjs';
import { createBrush, dip, stroke, edgeHalfWidth } from '../../media/brush.mjs';
import { scaleBrushForDensity } from '../../media/brush-density.mjs';

const W = 540, physics = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, gran: 0.25, granFill: 0 };
const m = 280 / W, paper = seed => ({ mmPerCell: m, seed, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, coldPress: { mmPerCell: m, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } });
const pigment = { K: [0.25, 0.8, 1.5], S: [0.05, 0.04, 0.03], rho: 0.06, omega: 1, gamma: 0.5 };
const WATER = 0.62, CONC = 0.66, P = 0.9, R = 25.4 / 2 / m;
const opts = s => scaleBrushForDensity({ grainShift: 0, flat: true, model: 'row', radius: R, bristles: Math.max(12, Math.ceil(R * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, bridge: 0, bridgeSoft: 2.4, seed: 31 + s }, { renderWidth: W });
const env = seed => ({
  pigment, physics, paperOptions: paper(seed), step, dry, r: R, half: R * (0.9 + 0.1 * P), pitch: 2 * edgeHalfWidth(R, { pressure: P, splay: 0.03 }), length: Math.round(6 * R),
  brush: s => createBrush(opts(s + 10 * seed)),
  loaded: b => b.resP[0] + b.hairs.reduce((a, hr) => a + hr.pig[0], 0),
  dipBrush: (b, f) => dip(b, { water: WATER, conc: [CONC * f] }),
  path: (x0, x1, y) => [{ x: x0, y, p: P, r: R }, { x: x1, y, p: P, r: R }],
  stroke: (b, s, pts, o) => stroke(b, s, pts, { ...o, upright: 'sweep', spacing: 1.4 }),
  flowEvery: 12, settle: 60,
});
const SEEDS = [9, 10, 11];
const runs = new Map();
const run = (layout, fA, fB, seed) => { const k = `${layout} ${fA} ${fB} ${seed}`; if (!runs.has(k)) runs.set(k, scrapSeam({ ...env(seed), layout, fA, fB })); return runs.get(k); };
const show = r => `bodies ${r.bodyA.mean.toFixed(4)} [${r.bodyA.min.toFixed(4)}..${r.bodyA.max.toFixed(4)}] / ${r.bodyB.mean.toFixed(4)} [${r.bodyB.min.toFixed(4)}..${r.bodyB.max.toFixed(4)}], seam zone ${r.zone.min.toFixed(4)}..${r.zone.max.toFixed(4)}, step ${r.step.toFixed(3)} of the change against the brush's edge ${r.edge.toFixed(3)}`;
const all = (layout, fA, fB) => SEEDS.map(s => run(layout, fA, fB, s));

test('the scrap refuses an unknown layout, an empty dip and lanes that do not touch', () => {
  assert.throws(() => scrapSeam({ ...env(9), layout: 'over', fA: 1, fB: 1 }), RangeError);
  assert.throws(() => scrapSeam({ ...env(9), layout: 'along', fA: 0, fB: 1 }), RangeError);
  assert.throws(() => scrapSeam({ ...env(9), layout: 'beside', fA: 1, fB: 1, pitch: 4 * R }), RangeError);
});

for (const layout of ['along', 'beside']) {
  test(`${layout}: two loads put on the paper the pigment that left the brushes`, () => {
    for (const r of [...all(layout, 1, 1), ...all(layout, 0.5, 1)]) assert.ok(r.conserved, `given ${r.given}, on sheet ${r.onSheet}`);
  });
  test(`${layout}: two equal loads laid into each other's wet edge dry with no line (the control)`, () => {
    for (const r of all(layout, 1, 1)) assert.ok(!r.line, show(r));
  });
  for (const [fA, fB] of [[0.5, 1], [1, 0.5]]) test(`${layout}: a load a value step ${fB > fA ? 'stronger' : 'weaker'} laid into the first's wet edge melts into it (no line, no step sharper than the brush's edge)`, () => {
    for (const r of all(layout, fA, fB)) assert.ok(r.pass, show(r));
  });
}
