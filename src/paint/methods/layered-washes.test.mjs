import test from 'node:test';
import assert from 'node:assert/strict';
import { planLayeredWashes, blur, roundMask, sideColour, kmeans } from './layered-washes.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { unmix, channelDensity } from '../../crop/pigments.mjs';
import { labOf } from '../../eval/colour.mjs';

const PAPER = [252, 251, 248], pigments = ['hansa', 'ultramarine', 'cadred', 'burntumber'].map(key => boxPigment(BOX.find(p => p.key === key) ?? BOX[0]));
// a 160 x 100 mm scene on 1 mm cells: a tan wall, its left third in shadow, a diagonal cast shadow, white paper round it,
// a dark doorway, and (with `speckle`) a fine pattern of 1.5 mm dots over the wall
function scene({ speckle = 0 } = {}) {
  const w = 160, h = 100, n = w * h, rgb = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0; let c = PAPER;
    if (x >= 20 && x < 140 && y >= 15 && y < 90) {
      c = [215, 185, 140];
      if (x < 55 || (x - 55 > (y - 15) * 0.8 && x - 55 < (y - 15) * 0.8 + 25)) c = [150, 125, 100];
      if (x >= 95 && x < 110 && y >= 55 && y < 90) c = [45, 40, 40];
      if (speckle) c = c.map(v => v + (((x >> 1) + (y >> 1)) % 2 ? speckle : -speckle));
    }
    rgb.set(c, i * 3);
  }
  return { w, h, n, rgb };
}
function plan(sc) {
  const { w, h, n, rgb } = sc, D = channelDensity(rgb, n, PAPER), demand = unmix(D, n, pigments.map(p => p.K.map(v => v / .55))), density = Float32Array.from({ length: n }, (_, i) => Math.max(0, (D[i * 3] + D[i * 3 + 1] + D[i * 3 + 2]) / 3));
  const log = console.log; console.log = () => {};
  try { return planLayeredWashes({ demand, k: pigments.length, density, w, h, rgb, paperRGB: PAPER, pigments, sheetWidthMm: w, washBrushMm: 5, washKitMm: [38, 25.4, 7, 5] }); } finally { console.log = log; }
}

test('three layers in order: a first wash, shadow glazes, darks; the paper round the wall is left bare', () => {
  const p = plan(scene()), stages = p.instructions.map(q => (q.stage === 2 ? 1 : q.stage));   // a charge goes into its wash
  assert.deepEqual(stages, [...stages].sort((a, b) => a - b), 'first wash, then shadows, then darks');
  assert.ok(p.summary.washesByStage[0] >= 1 && p.summary.washesByStage[2] >= 1 && p.summary.washesByStage[3] >= 1, JSON.stringify(p.summary.washesByStage));
  assert.ok(p.summary.reservedShare > 0.3, 'the paper round the wall');
  assert.ok(p.layers.every(l => l.shapes.every(s => s._valuePlan.strokes.every(st => st.points.every(q => Number.isFinite(q[0]) && Number.isFinite(q[1]))))));
});

test('the wall\'s first wash is its light side, not the mean of its lit and shadowed parts; one shadow glaze crosses the wall', () => {
  const p = plan(scene()), first = p.instructions.find(q => q.stage === 1), L = labOf(first.colour, 0, PAPER)[0];
  assert.ok(L > labOf([200, 170, 130], 0, PAPER)[0], `first wash L* ${L.toFixed(1)}`);
  assert.equal(p.summary.zones - p.instructions.filter(q => q.stage === 1).length >= 0, true);
  const shadows = p.instructions.filter(q => q.stage === 3);
  assert.ok(shadows.length >= 1 && shadows.length <= 3, `${shadows.length} shadow shapes`);
});

test('a fine pattern on the wall changes no shape: the plan reads the subject squinted', () => {
  // the shapes (first washes, shadows, darks; a charge is a touch dropped at a place and has no shape of its own)
  const shapes = p => p.instructions.filter(q => q.stage !== 2);
  const a = shapes(plan(scene())), b = shapes(plan(scene({ speckle: 6 })));   // about 3 L*, as the planted-pattern test
  assert.equal(a.length, b.length);
  a.forEach((q, i) => assert.ok(Math.abs(q.areaMm2 - b[i].areaMm2) <= 0.08 * q.areaMm2 + 20, `${q.id}: ${q.areaMm2} vs ${b[i].areaMm2}`));
});

test('helpers: blur keeps the mean, a brush-rounded mask loses its speck, the light side is the lighter part, k-means finds two groups', () => {
  const w = 40, h = 30, src = Float32Array.from({ length: w * h }, (_, i) => (i % 7 === 0 ? 10 : 0)), b = blur(src, w, h, 3);
  assert.ok(Math.abs(b.reduce((a, v) => a + v, 0) - src.reduce((a, v) => a + v, 0)) < 0.05 * src.reduce((a, v) => a + v, 0));
  const m = new Uint8Array(w * h); for (let y = 5; y < 25; y++) for (let x = 5; x < 25; x++) m[y * w + x] = 1; m[2 * w + 35] = 1;
  const r = roundMask(m, w, h, 2); assert.equal(r[2 * w + 35], 0); assert.equal(r[15 * w + 15], 1);
  const cols = [...Array(50).fill([200, 180, 150]), ...Array(50).fill([100, 90, 80])];
  assert.deepEqual(sideColour(cols.map((_, i) => i), i => cols[i], i => labOf(cols[i], 0, PAPER)[0], [0.6, 0.92]), [200, 180, 150]);
  const rows = Float32Array.from([0, 0, 0, 1, 1, 1, 10, 10, 10, 11, 11, 11]), c = kmeans(rows, 3, 2);
  assert.equal(c.length, 2); assert.ok(Math.abs(c[0][0] - c[1][0]) > 8);
});
