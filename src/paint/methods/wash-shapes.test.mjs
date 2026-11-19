import test from 'node:test';
import assert from 'node:assert/strict';
import { washShapes, leastAreas, isPaper, LEAST_WASH_TOUCHES } from './wash-shapes.mjs';

const PAPER = [252, 251, 248];
// a picture of flat rectangles: [x0, y0, x1, y1, [r, g, b]] painted in order over a ground
function picture(w, h, ground, rects) {
  const rgb = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < w * h; i++) rgb.set(ground, i * 3);
  for (const [x0, y0, x1, y1, c] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) rgb.set(c, (y * w + x) * 3);
  return rgb;
}

test('the least wash is four touches of the brush and the least reserve is one, in mm2', () => {
  const least = leastAreas(3);
  assert.ok(Math.abs(least.reserveMm2 - Math.PI * 1.5 * 1.5) < 1e-9);
  assert.ok(Math.abs(least.washMm2 - LEAST_WASH_TOUCHES * Math.PI * 1.5 * 1.5) < 1e-9);
});

test('a shape under the least wash joins the neighbour nearest it in colour, and the shapes partition the sheet', () => {
  // 1 mm cells, 3 mm brush: least wash 28.3 mm2. A 4 x 4 mm dark red patch (16 mm2) sits on the seam of a red and a blue field.
  const w = 60, h = 40, rgb = picture(w, h, [200, 90, 80], [[30, 0, 60, 40, [70, 100, 190]], [26, 16, 30, 20, [150, 60, 55]]]);
  const { labels, shapes, least } = washShapes({ rgb, w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3 });
  assert.equal(shapes.length, 2);
  for (const s of shapes) assert.ok(s.areaMm2 >= least.washMm2);
  assert.equal(shapes.reduce((a, s) => a + s.area, 0), w * h);
  assert.ok(labels.every(v => v >= 1 && v <= shapes.length));
  assert.equal(labels[18 * w + 28], labels[18 * w + 5], 'the dark red patch is part of the red field');
  assert.notEqual(labels[18 * w + 28], labels[18 * w + 50]);
});

test('a large enough patch is its own shape, at any cell size', () => {
  for (const cellMm of [1, 0.5]) {
    const k = 1 / cellMm, w = 60 * k, h = 40 * k, rgb = picture(w, h, [200, 90, 80], [[10 * k, 10 * k, 18 * k, 18 * k, [70, 100, 190]]]);
    const { shapes } = washShapes({ rgb, w, h, paperRGB: PAPER, cellMm, brushMm: 3 });
    assert.equal(shapes.length, 2, `at ${cellMm} mm cells`);
    assert.ok(Math.abs(Math.min(...shapes.map(s => s.areaMm2)) - 64) < 16, 'the squint rounds its corners');
  }
});

test('paper a wash can go round is kept as a shape of its own, and a speck of paper is washed over', () => {
  // a 6 x 6 mm and a 2 x 2 mm patch of bare paper in a mid-tone field; the least wash is 28.3 mm2, the least reserve 7.1
  const w = 60, h = 40, rgb = picture(w, h, [150, 140, 120], [[10, 10, 16, 16, PAPER], [40, 20, 42, 22, PAPER]]);
  const { labels, shapes, least } = washShapes({ rgb, w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3 });
  assert.equal(shapes.length, 2);
  const light = shapes.find(s => s.paper);
  assert.ok(light.areaMm2 >= least.reserveMm2 && light.areaMm2 <= 36, `${light.areaMm2} mm2 of paper`);
  assert.equal(labels[13 * w + 13], light.id);
  assert.notEqual(labels[21 * w + 41], light.id, 'paper under one touch is washed over');
  assert.ok(isPaper(light.mean, PAPER) && !isPaper([150, 140, 120], PAPER));
});

test('a reserve may be smaller than a wash', () => {
  // 4 x 5 mm (20 mm2): kept as paper, joined to its neighbour as paint
  for (const [colour, count] of [[PAPER, 2], [[120, 110, 95], 1]]) {
    const w = 60, h = 40, rgb = picture(w, h, [150, 140, 120], [[10, 10, 14, 15, colour]]);
    assert.equal(washShapes({ rgb, w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3 }).shapes.length, count);
  }
});

test('faint grain inside a field (5 of 255 either way) does not cut it into shapes', () => {
  const w = 60, h = 40, rgb = picture(w, h, [200, 90, 80], [[30, 0, 60, 40, [70, 100, 190]]]);
  let s = 7; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5; };
  for (let i = 0; i < rgb.length; i++) rgb[i] = Math.max(0, Math.min(255, rgb[i] + 10 * rnd()));
  assert.equal(washShapes({ rgb, w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3 }).shapes.length, 2);
});
