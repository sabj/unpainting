import test from 'node:test';
import assert from 'node:assert/strict';
import { planFairWashes } from './fair-wash.mjs';
import { leastAreas } from './wash-shapes.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { unmix, channelDensity } from '../../crop/pigments.mjs';

const PAPER = [252, 251, 248], pigments = ['hansa', 'ultramarine', 'cadred'].map(key => boxPigment(BOX.find(p => p.key === key)));
function plan(w, h, ground, rects, { noise = 0, sheetMm = w } = {}) {
  const n = w * h, rgb = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) rgb.set(ground, i * 3);
  for (const [x0, y0, x1, y1, c] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) rgb.set(c, (y * w + x) * 3);
  if (noise) { let s = 7; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5; }; for (let i = 0; i < rgb.length; i++) rgb[i] = Math.max(0, Math.min(255, rgb[i] + noise * rnd())); }
  const D = channelDensity(rgb, n, PAPER), demand = unmix(D, n, pigments.map(p => p.K.map(v => v / .55))), density = Float32Array.from({ length: n }, (_, i) => Math.max(0, (D[i * 3] + D[i * 3 + 1] + D[i * 3 + 2]) / 3));
  const log = console.log; console.log = () => {};
  try { return planFairWashes({ demand, k: pigments.length, density, w, h, rgb, paperRGB: PAPER, pigments, sheetWidthMm: sheetMm, washBrushMm: 3, washKitMm: [38, 25.4, 7, 5, 3], pointBrushMm: 1.2 }); } finally { console.log = log; }
}
// a wall in three values of one colour, a sky, a sheet of bare paper and a small dark window
const SCENE = [[0, 0, 80, 20, [150, 175, 215]], [0, 20, 30, 60, [205, 170, 125]], [30, 20, 55, 60, [164, 136, 100]], [55, 20, 80, 60, [113, 94, 69]], [5, 30, 15, 40, PAPER], [60, 35, 70, 45, [50, 45, 50]]];
const washesOf = p => p.layers.flatMap(l => l.shapes);

test('every wash is a whole shape charged from a puddle at a named dilution', () => {
  const p = plan(80, 60, [205, 170, 125], SCENE), washes = washesOf(p), least = leastAreas(3);
  assert.ok(washes.length > 0 && p.puddles.length >= 3);
  const charges = new Set();
  for (const sh of washes) {
    const q = sh._valuePlan, puddle = p.puddles[q.puddle], dilution = puddle.dilutions.find(d => d.name === q.dilution);
    assert.ok(dilution, 'the dilution is one of the puddle\'s');
    sh.mix.forEach((v, j) => assert.ok(Math.abs(v - puddle.mix[j] * dilution.strength) < 1e-9, 'the charge is the puddle\'s'));
    assert.ok(Math.abs(sh.amount - dilution.strength) < 1e-9);
    assert.ok(q.areaMm2 >= least.washMm2, `a wash of ${q.areaMm2} mm2`);
    assert.equal(sh._rampVec, undefined); assert.equal(sh.graded, null);
    charges.add(q.puddle + '/' + q.dilution);
  }
  assert.ok(charges.size <= 3 * p.puddles.length);
  assert.ok(p.puddles.every(q => q.dilutions.length <= 3));
  assert.ok(washes.some(sh => sh.mix.filter(v => v > 1e-6).length > 1), 'a wash carries a mix, not one pigment');
  assert.ok(Math.max(...p.layers.map(l => l.value)) <= 5);
});

test('grain in the subject does not multiply the charges', () => {
  const clean = plan(80, 60, [205, 170, 125], SCENE), grainy = plan(80, 60, [205, 170, 125], SCENE, { noise: 10 });
  const kinds = p => new Set(washesOf(p).map(sh => sh.mix.map(v => v.toFixed(6)).join())).size;
  assert.ok(kinds(grainy) <= 3 * grainy.puddles.length && kinds(clean) <= 3 * clean.puddles.length);
  assert.ok(washesOf(grainy).length <= 2 * washesOf(clean).length, `${washesOf(grainy).length} washes with grain, ${washesOf(clean).length} without`);
});

test('the first wash of a puddle covers every shape the puddle paints, and the stages run light to dark', () => {
  const p = plan(80, 60, [205, 170, 125], SCENE), n = 80 * 60, first = new Map();
  for (const sh of washesOf(p)) if (sh._valuePlan.stage === 1) { const m = first.get(sh._valuePlan.puddle) ?? first.set(sh._valuePlan.puddle, new Uint8Array(n)).get(sh._valuePlan.puddle); for (let i = 0; i < n; i++) if (sh.mask[i]) m[i] = 1; }
  let later = 0;
  for (const sh of washesOf(p)) if (sh._valuePlan.stage > 1) { later++; const m = first.get(sh._valuePlan.puddle); for (let i = 0; i < n; i++) if (sh.mask[i]) assert.equal(m[i], 1); }
  assert.ok(later > 0);
  const stages = p.layers.map(l => l.value); assert.deepEqual(stages, [...stages].sort((a, b) => a - b));
  for (const l of p.layers) for (const sh of l.shapes) assert.equal(sh._valuePlan.dilution, ['pale', 'pale', 'middle', 'full', 'full'][l.value - 1]);
});

test('reserves are whole shapes', () => {
  const p = plan(80, 60, [205, 170, 125], SCENE), w = 80, held = p.protectedCells.reduce((a, v) => a + v, 0);
  assert.equal(p.protectedCells[35 * w + 10], 1, 'the sheet of bare paper is reserved');
  assert.ok(held >= 80 && held <= 100, `${held} cells reserved`);
  for (const sh of washesOf(p)) assert.equal(sh.mask[35 * w + 10], 0);
});

test('the plan is set in millimetres: the same picture on finer cells gets the same puddles, washes and strokes', () => {
  const fine = SCENE.map(([x0, y0, x1, y1, c]) => [x0 * 4, y0 * 4, x1 * 4, y1 * 4, c]);
  const a = plan(80, 60, [205, 170, 125], SCENE), b = plan(320, 240, [205, 170, 125], fine, { sheetMm: 80 });
  assert.equal(b.summary.planCellMm, 1); assert.equal(a.summary.planCellMm, 1);
  assert.deepEqual(b.puddles, a.puddles);
  assert.deepEqual(washesOf(b).map(sh => [sh._valuePlan.id, sh._valuePlan.outline, sh._valuePlan.strokes]), washesOf(a).map(sh => [sh._valuePlan.id, sh._valuePlan.outline, sh._valuePlan.strokes]));
  assert.equal(washesOf(b)[0].area, 16 * washesOf(a)[0].area, 'only the record of covered cells is finer');
});

test('touching shapes that take one puddle to one value step are one shape', () => {
  const p = plan(80, 60, [205, 170, 125], [[40, 0, 80, 60, [197, 164, 121]]]);
  assert.ok(p.summary.shapes <= p.summary.shapesCut);
  assert.equal(washesOf(p).filter(sh => sh._valuePlan.stage === 1).length, 1, 'two fields a hair apart are one first wash');
});

test('a wash reaches the brush as an outline and strokes in millimetres, with no edge cells', () => {
  const p = plan(80, 60, [205, 170, 125], SCENE), w = 80;
  for (const sh of washesOf(p)) {
    const q = sh._valuePlan;
    assert.deepEqual(q.edges.hardCells, []); assert.deepEqual(q.edges.softCells, []);
    assert.ok(q.outline.length >= 1 && q.outline.every(l => l.points.length >= 3 && l.soft.length === l.points.length));
    assert.ok(q.strokes.length >= 1);
    const xs = q.outline.flatMap(l => l.points.map(v => v[0])), ys = q.outline.flatMap(l => l.points.map(v => v[1]));
    for (const st of q.strokes) for (const [x, y] of st.points) assert.ok(x >= Math.min(...xs) && x <= Math.max(...xs) && y >= Math.min(...ys) && y <= Math.max(...ys), 'a stroke runs inside its outline');
  }
  // the dark window meets the wall at a hard edge all round; the sky meets the wall at a hard edge too
  const win = washesOf(p).filter(sh => sh.mask[40 * w + 65] && sh.area <= 120);
  assert.ok(win.length >= 1);
  for (const sh of win) assert.equal(sh._valuePlan.softEdges.length, 0);
});

test('two fields close in colour meet at a soft edge, made by a line for the damp brush', () => {
  const p = plan(80, 60, [200, 168, 124], [[40, 0, 80, 60, [180, 150, 110]]]), soft = washesOf(p).flatMap(sh => sh._valuePlan.softEdges);
  assert.ok(washesOf(p).length >= 2);
  assert.ok(soft.length >= 1, 'a soft boundary');
  for (const line of soft) for (const [x] of line) assert.ok(Math.abs(x - 40) <= 1.5, `the soft line runs along the seam (x ${x})`);
});
