import test from 'node:test';
import assert from 'node:assert/strict';
import { planFairWashes } from './fair-wash.mjs';
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
// a sky, a wall in two values, a large sheet of bare paper and a dark window
const SCENE = [[0, 0, 80, 20, [150, 175, 215]], [0, 20, 40, 60, [205, 170, 125]], [40, 20, 80, 60, [150, 124, 92]], [4, 26, 30, 50, PAPER], [52, 32, 66, 46, [50, 45, 50]]];
const washesOf = p => p.layers.flatMap(l => l.shapes);

test('every wash is charged from a puddle at one of its strengths: a mix, never fitted to its cells', () => {
  const p = plan(80, 60, [205, 170, 125], SCENE), washes = washesOf(p);
  assert.ok(washes.length > 0 && p.puddles.length >= 3 && p.puddles.length <= 25);
  for (const sh of washes) {
    const q = sh._valuePlan, puddle = p.puddles[q.puddle], dilution = puddle.dilutions.find(d => d.name === q.dilution);
    assert.ok(dilution, 'the strength is one of the puddle\'s');
    sh.mix.forEach((v, j) => assert.ok(Math.abs(v - puddle.mix[j] * dilution.strength) < 1e-9, 'the charge is the puddle\'s'));
    assert.equal(sh._rampVec, undefined); assert.equal(sh.graded, null);
  }
  assert.ok(p.puddles.every(q => q.dilutions.length >= 1 && q.dilutions.length <= 3));
  assert.ok(p.puddles.filter(q => q.stage === 1).length <= 6, 'at most six hue families');
  assert.ok(washes.some(sh => sh.mix.filter(v => v > 1e-6).length > 1), 'a wash carries a mix, not one pigment');
  assert.ok(Math.max(...p.layers.map(l => l.value)) <= 3);
  const stages = p.layers.map(l => l.value); assert.deepEqual(stages, [...stages].sort((a, b) => a - b), 'light to dark');
});

test('the first wash covers all the unreserved paper, each hue family at one strength, and paper is reserved whole', () => {
  const p = plan(80, 60, [205, 170, 125], SCENE), w = 80, n = 80 * 60, covered = new Uint8Array(n);
  for (const sh of washesOf(p)) if (sh._valuePlan.stage === 1) for (let i = 0; i < n; i++) if (sh.mask[i]) covered[i] = 1;
  for (let i = 0; i < n; i++) assert.equal(covered[i] | p.protectedCells[i], 1, 'no unreserved cell is left out of the first wash');
  assert.ok(p.summary.firstWashCover > .97, `the first wash's strokes reach ${p.summary.firstWashCover} of it`);
  assert.equal(p.protectedCells[38 * w + 17], 1, 'the sheet of bare paper is reserved');
  const first = washesOf(p).filter(sh => sh._valuePlan.stage === 1);
  for (const sh of first) assert.equal(sh._valuePlan.dilution, 'pale');
  assert.equal(new Set(first.map(sh => sh._valuePlan.puddle + '/' + sh.amount.toFixed(6))).size, new Set(first.map(sh => sh._valuePlan.puddle)).size);
});

test('a later wash is laid only where a shape must be darker than what is under it', () => {
  const flat = plan(80, 60, [205, 170, 125], [[0, 0, 80, 20, [150, 175, 215]]]);
  assert.ok(washesOf(flat).every(sh => sh._valuePlan.stage === 1), 'two flat fields are finished by the first wash');
  const p = plan(80, 60, [205, 170, 125], SCENE), w = 80, later = washesOf(p).filter(sh => sh._valuePlan.stage > 1);
  assert.ok(later.some(sh => sh.mask[39 * w + 59] === 1), 'the dark window takes a wash over the first');
  assert.ok(later.every(sh => sh.mask[10 * w + 40] === 0), 'the sky takes none');
});

test('grain in the subject does not multiply the washes or the charges', () => {
  const clean = plan(80, 60, [205, 170, 125], SCENE), grainy = plan(80, 60, [205, 170, 125], SCENE, { noise: 16 });
  assert.ok(washesOf(grainy).length <= washesOf(clean).length + 3, `${washesOf(grainy).length} washes with grain, ${washesOf(clean).length} without`);
  assert.ok(grainy.summary.charges <= clean.summary.charges + 3);
});

test('the plan is set in millimetres: the same picture on finer cells gets the same puddles, washes and strokes', () => {
  const fine = SCENE.map(([x0, y0, x1, y1, c]) => [x0 * 4, y0 * 4, x1 * 4, y1 * 4, c]);
  const a = plan(80, 60, [205, 170, 125], SCENE), b = plan(320, 240, [205, 170, 125], fine, { sheetMm: 80 });
  assert.equal(b.summary.planCellMm, 1); assert.equal(a.summary.planCellMm, 1);
  assert.deepEqual(b.puddles, a.puddles);
  assert.deepEqual(washesOf(b).map(sh => [sh._valuePlan.id, sh._valuePlan.outline, sh._valuePlan.strokes]), washesOf(a).map(sh => [sh._valuePlan.id, sh._valuePlan.outline, sh._valuePlan.strokes]));
});

test('a wash reaches the brush as an outline and strokes in millimetres, with no edge cells', () => {
  const p = plan(80, 60, [205, 170, 125], SCENE);
  for (const sh of washesOf(p)) {
    const q = sh._valuePlan;
    assert.deepEqual(q.edges.hardCells, []); assert.deepEqual(q.edges.softCells, []);
    assert.ok(q.outline.length >= 1 && q.outline.every(l => l.points.length >= 3 && l.soft.length === l.points.length));
    assert.ok(q.strokes.length >= 1 && q.strokes.length <= 12, `${q.strokes.length} strokes for a wash of ${q.areaMm2} mm2`);
  }
});
