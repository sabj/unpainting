import test from 'node:test';
import assert from 'node:assert/strict';
import { gaussian } from '../../keyframes/density.mjs';
import { labPlanes } from './line-evidence.mjs';
import { valueGroups, lineProfile, cleanLines, detailRegion } from './line-cleanup.mjs';

const W = 120, H = 80, MM = 152.4 / 540;
// the planes the stage reads, from an rgb image
const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const enc = v => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
const planes = rgb => {
  const { L, A, B } = labPlanes(rgb, W, H), s = F => gaussian(F, W, H, 1);
  return { w: W, h: H, L: s(L), A: s(A), B: s(B), rgb: [0, 1, 2].map(c => s(Float32Array.from({ length: W * H }, (_, i) => lin(rgb[3 * i + c])))) };
};
// a surface in shadow: the same light scaled down, every linear channel alike
const shadowOf = (rgb, k) => rgb.map(v => enc(k * lin(v)));
const paint = fill => { const rgb = new Uint8Array(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgb.set(fill(x, y), 3 * (y * W + x)); return rgb; };
const vline = (x, y0 = 10, y1 = 30) => ({ points: Array.from({ length: 21 }, (_, k) => ({ x, y: y0 + (y1 - y0) * k / 20 })) });

test('a step where a coloured surface goes into shadow reads as shadow; a change of colour does not', () => {
  // left: an orange wall in shadow (a quarter of the light); right: the same wall lit
  const wall = [222, 116, 44], shade = planes(paint(x => (x < 60 ? shadowOf(wall, 0.25) : wall)));
  assert.ok(lineProfile(vline(60), shade, { side: 2 }).shadow > 0.8);
  const material = planes(paint(x => (x < 60 ? [40, 60, 160] : [222, 116, 44])));
  assert.ok(lineProfile(vline(60), material, { side: 2 }).shadow < 0.2);
});

test('a thin dark line is a ridge, and a grey step is left undecided', () => {
  const ridge = planes(paint(x => (Math.abs(x - 60) < 1 ? [30, 30, 30] : [230, 220, 200])));
  assert.ok(lineProfile(vline(60), ridge, { side: 2 }).ridge > 0.8);
  const grey = planes(paint(x => (x < 60 ? [80, 80, 80] : [200, 200, 200])));
  assert.equal(lineProfile(vline(60), grey, { side: 2 }).shadow, 0);
});

test('cleanup drops specks and shadow outlines but keeps colour edges and long straight lines', () => {
  const t = planes(paint(x => (x < 60 ? shadowOf([222, 116, 44], 0.25) : x < 90 ? [222, 116, 44] : [40, 60, 160])));
  const speck = { points: [{ x: 20, y: 20 }, { x: 21, y: 20 }] };
  const longShadow = vline(60, 2, 78);
  const r = cleanLines([vline(60), vline(90), speck, longShadow], t, { mmPerCell: MM, kind: 'drawing' });
  assert.equal(r.stats.specks, 1);
  assert.equal(r.stats.shadow, 1);
  const xs = r.lines.map(g => Math.round(g.points[0].x)).sort();
  assert.deepEqual(xs, [60, 90]);
  assert.ok(r.lines.some(g => g.points.length === 21 && g.points[0].y === 2), 'the long straight shadow edge stays');
});

test('value groups split the sheet into light, mid and dark by share', () => {
  const L = Float32Array.from({ length: 100 }, (_, i) => i / 99);
  const g = valueGroups(L, { lightShare: 0.5, darkShare: 0.2 });
  const count = v => g.filter(x => x === v).length;
  assert.ok(Math.abs(count(0) - 50) <= 1 && Math.abs(count(2) - 20) <= 1);
});

test('detail regions need both a dense trace and local contrast', () => {
  const L = Float32Array.from({ length: W * H }, (_, i) => ((i % W) < 30 && ((i % W) + Math.floor(i / W)) % 2 ? 0.2 : 0.8));
  const dense = Array.from({ length: 12 }, (_, k) => ({ points: [{ x: 2 + 2 * k, y: 5 }, { x: 2 + 2 * k, y: 70 }] }));
  const d = detailRegion(dense, L, W, H, { radius: 3, quantile: 0.8 });
  let inside = 0, outside = 0;
  for (let i = 0; i < W * H; i++) if (d[i]) ((i % W) < 30 ? inside++ : outside++);
  assert.ok(inside > 0 && outside === 0);
});

test('a pen source keeps its small marks; a selective drawing prunes them in lit areas', () => {
  const t = planes(paint(() => [235, 230, 220]));
  const ticks = Array.from({ length: 40 }, (_, k) => ({ points: [{ x: 10 + 2.5 * k, y: 40 }, { x: 10 + 2.5 * k, y: 45 }] }));
  const pen = cleanLines(ticks, t, { mmPerCell: MM, kind: 'pen' }), drawing = cleanLines(ticks, t, { mmPerCell: MM, kind: 'drawing' });
  assert.equal(pen.lines.length, 40);
  assert.ok(drawing.lines.length < 40);
  assert.throws(() => cleanLines(ticks, t, { mmPerCell: MM, kind: 'tracing' }), /drawing, trace or pen/);
});
