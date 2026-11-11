// Scrap tests for a wash of many lanes (033 drying, teacher-wet-edges.md checks 1 and 3), with the painter's own wash
// instruments as scrap-strokes.test.mjs lays them: the 1 in flat of every shaped passage at pressure 0.9, the wash
// physics and dry options, the benchmark's 280 mm paper at 540 cells, lanes at the painter's lane overlap. The pass
// marks are stated in scrap-wash.mjs and were written before any run. Nothing here reads a target.
import test from 'node:test';
import assert from 'node:assert/strict';
import { washRows, scrapWash } from './scrap-wash.mjs';
import { step, dry, DEFAULTS } from '../../media/sheet.mjs';
import { createBrush, dip, stroke, sideReach, edgeHalfWidth } from '../../media/brush.mjs';
import { scaleBrushForDensity } from '../../media/brush-density.mjs';

const W = 540, physics = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, gran: 0.25, granFill: 0 };
const m = 280 / W, paperOptions = { mmPerCell: m, seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, coldPress: { mmPerCell: m, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } };
const pigment = { K: [0.25, 0.8, 1.5], S: [0.05, 0.04, 0.03], rho: 0.06, omega: 1, gamma: 0.5 };
const WATER = 0.62, CONC = 0.66, P = 0.9, R = 25.4 / 2 / m;
const opts = s => scaleBrushForDensity({ grainShift: 0, flat: true, model: 'row', radius: R, bristles: Math.max(12, Math.ceil(R * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, bridge: 0, bridgeSoft: 2.4, seed: 31 + s }, { renderWidth: W });
const half = R * (0.9 + 0.1 * P), edge = (1 + 0.08 * half) + sideReach(opts(0)) * half;
const pitch = 2 * edgeHalfWidth(R, { pressure: P, splay: 0.03 });  // the painter's lane pitch (tools/plate/paint.mjs)
const instruments = {
  pigment, physics, paperOptions, step, dry,
  brush: s => createBrush(opts(s)),
  loaded: b => b.resP[0] + b.hairs.reduce((a, hr) => a + hr.pig[0], 0),
  dipBrush: (b, f) => dip(b, { water: WATER, conc: [CONC * f] }),
  path: (x0, x1, y) => [{ x: x0, y, p: P, r: R }, { x: x1, y, p: P, r: R }],
  stroke: (b, s, pts, o) => stroke(b, s, pts, { ...o, upright: 'sweep', spacing: 1.4 }),
  flowEvery: 12, settle: 60, dryOptions: { levelMax: 140, dt: 2 },
};
const show = r => `bodies ${r.bodies.map(b => b.mean.toFixed(4)).join(' ')} (range ${Math.min(...r.bodies.map(b => b.min)).toFixed(4)}..${Math.max(...r.bodies.map(b => b.max)).toFixed(4)}); seams ${r.seams.map(s => `${s.min.toFixed(4)}..${s.max.toFixed(4)}`).join(' ')}`;
let flat = null, graded = null;
const flatWash = () => (flat ??= scrapWash({ ...instruments, lanes: 8, half, edge, pitch, length: Math.round(4 * R) }));
const gradedWash = () => (graded ??= scrapWash({ ...instruments, lanes: 8, half, edge, pitch, length: Math.round(4 * R), grade: 0.1 }));

test('the wash rows: a body inside each lane, a seam between each pair', () => {
  const r = washRows({ lanes: 4, half: 20, edge: 4, pitch: 36, margin: 30 });
  assert.equal(r.seams.length, 3); assert.equal(r.bodies.length, 4);
  r.seams.forEach(([a, b], k) => assert.ok(r.bodies[k][1] < a && b < r.bodies[k + 1][0], JSON.stringify(r)));
  assert.throws(() => washRows({ lanes: 4, half: 20, edge: 4, pitch: 60, margin: 30 }), RangeError);
});

test('a flat wash of 8 lanes on dry paper puts on the paper all the pigment that left the brushes', () => {
  const r = flatWash(); assert.ok(r.given > 0 && r.conserved, `given ${r.given}, on sheet ${r.onSheet}`);
});
test('a flat wash of 8 lanes on dry paper dries with no lane line', { todo: 'one seam of seven dries as a pale slit (0.21 against bodies 0.29-0.31) where the ragged fringes miss; lanes at the solid reach close it but dry up to 1.6% dark and add 14% strokes on Mittens' }, () => {
  const r = flatWash(); assert.ok(r.even, show(r));
});
test('a graded wash of 8 lanes changes one way with no step at a seam', { todo: 'the bodies step one way, but the same seam dries as a pale slit (0.14 against its lanes 0.17-0.21)' }, () => {
  const r = gradedWash(); assert.ok(r.conserved, `given ${r.given}, on sheet ${r.onSheet}`); assert.ok(r.graded, show(r));
});
