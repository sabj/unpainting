import test from 'node:test';
import assert from 'node:assert/strict';
import { washShapes, reservedLights, leastAreas, isPaper, LEAST_WASH_TOUCHES, LEAST_CONTRAST } from './wash-shapes.mjs';
import { labOf } from '../../eval/colour.mjs';

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

test('two fields are two shapes only when their colours differ by the least contrast', () => {
  const w = 60, h = 40, apart = c => { const a = labOf([200, 90, 80], 0, PAPER), b = labOf(c, 0, PAPER); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
  const near = [188, 84, 76], far = [150, 62, 55];
  assert.ok(apart(near) < LEAST_CONTRAST - 2 && apart(far) > LEAST_CONTRAST + 2, `${apart(near)}, ${apart(far)}`);
  assert.equal(washShapes({ rgb: picture(w, h, [200, 90, 80], [[30, 0, 60, 40, near]]), w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3 }).shapes.length, 1);
  assert.equal(washShapes({ rgb: picture(w, h, [200, 90, 80], [[30, 0, 60, 40, far]]), w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3 }).shapes.length, 2);
});

test('a blurred edge between two fields leaves no shape of its own, and a stripe narrower than the brush is no wash', () => {
  // a ramp 8 mm wide from red to blue: its cells go to the field nearer them in colour
  const w = 60, h = 40, rgb = picture(w, h, [200, 90, 80], [[34, 0, 60, 40, [70, 100, 190]]]);
  for (let y = 0; y < h; y++) for (let x = 26; x < 34; x++) { const t = (x - 25.5) / 8; rgb.set([200 + t * (70 - 200), 90 + t * 10, 80 + t * 110], (y * w + x) * 3); }
  const ramp = washShapes({ rgb, w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3 });
  assert.equal(ramp.shapes.length, 2);
  assert.notEqual(ramp.labels[20 * w + 27], ramp.labels[20 * w + 32], 'the ramp is shared between the two fields');
  // a 2 mm dark stripe 40 mm long (80 mm2, over the least wash) on a 7 mm brush's sheet: a stroke, not a wash
  const stripe = washShapes({ rgb: picture(w, h, [200, 190, 160], [[10, 19, 50, 21, [60, 50, 45]]]), w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3 });
  assert.equal(stripe.shapes.length, 1);
  const band = washShapes({ rgb: picture(w, h, [200, 190, 160], [[10, 16, 50, 24, [60, 50, 45]]]), w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3 });
  assert.equal(band.shapes.length, 2, 'an 8 mm band is a wash');
});

test('a chain of small steps does not run two different colours into one shape', () => {
  // six bands, each within the least contrast of the next, from a cream to a violet
  const w = 60, h = 40, rgb = new Uint8ClampedArray(w * h * 3), a = [230, 215, 180], b = [120, 120, 190];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const t = Math.floor(x / 10) / 5; rgb.set(a.map((v, c) => v + t * (b[c] - v)), (y * w + x) * 3); }
  const { shapes, labels } = washShapes({ rgb, w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3, contrast: 16 });
  assert.ok(shapes.length >= 2 && shapes.length <= 6, `${shapes.length} shapes`);
  assert.notEqual(labels[20 * w + 2], labels[20 * w + 57]);
});

test('cells behind the barrier belong to no shape', () => {
  const w = 60, h = 40, barrier = new Uint8Array(w * h); for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) barrier[y * w + x] = 1;
  const { labels, shapes } = washShapes({ rgb: picture(w, h, [200, 90, 80], [[10, 10, 20, 20, PAPER]]), w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3, barrier });
  assert.equal(shapes.length, 1); assert.equal(labels[15 * w + 15], 0); assert.equal(shapes[0].area, w * h - 100);
});

test('a light is reserved when it is near the picture\'s lightest tone and clearly lighter than what is round it', () => {
  // a grey scan: nothing is paper white. A cream hull (the lightest thing) on a violet sky, beside a pale blue field.
  const w = 80, h = 50, rgb = picture(w, h, [150, 150, 195], [[10, 10, 34, 34, [226, 220, 200]], [44, 0, 80, 50, [196, 208, 226]], [50, 20, 53, 23, [226, 220, 200]]]);
  const r = reservedLights({ rgb, w, h, paperRGB: PAPER, cellMm: 1, brushMm: 7, thinMm: 3 });
  assert.equal(r.lights, 1);
  assert.equal(r.mask[20 * w + 20], 1, 'the hull stays paper');
  assert.equal(r.mask[25 * w + 60], 0, 'a pale blue field is a wash, not a light');
  assert.equal(r.mask[5 * w + 5], 0);
  assert.equal(r.mask[21 * w + 51], 0, 'a fleck under one touch of the brush is not reserved');
  assert.ok(Math.abs(r.lightest - labOf([226, 220, 200], 0, PAPER)[0]) < 2);
  // the same cream as the whole of a sheet with one dark mark is not lighter than its surroundings, but paper is paper
  assert.equal(reservedLights({ rgb: picture(w, h, [226, 220, 200], [[30, 20, 50, 30, [60, 50, 45]]]), w, h, paperRGB: PAPER, cellMm: 1, brushMm: 7, thinMm: 3 }).lights, 1);
  const bare = reservedLights({ rgb: picture(w, h, [150, 140, 120], [[10, 10, 30, 30, PAPER]]), w, h, paperRGB: PAPER, cellMm: 1, brushMm: 7, thinMm: 3 });
  assert.equal(bare.mask[20 * w + 20], 1); assert.ok(isPaper(PAPER, PAPER) && !isPaper([150, 140, 120], PAPER));
});

test('a faint pattern over the picture (3 L* rms) moves no shape and no light', () => {
  const w = 80, h = 50, base = picture(w, h, [150, 150, 195], [[10, 10, 34, 34, [226, 220, 200]], [44, 0, 80, 50, [205, 170, 125]], [50, 14, 70, 40, [150, 124, 92]]]);
  const planted = Uint8ClampedArray.from(base, (v, q) => { const i = (q / 3) | 0, x = i % w, y = (i / w) | 0; return v + 16 * Math.sin(x * 1.9 + 1) * Math.sin(y * 1.7 + 2); });
  const a = washShapes({ rgb: base, w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3 }), b = washShapes({ rgb: planted, w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3 });
  assert.equal(a.shapes.length, 4); assert.deepEqual(b.labels, a.labels);
  b.shapes.forEach((s, q) => assert.ok(Math.hypot(...s.lab.map((v, c) => v - a.shapes[q].lab[c])) < 1.5));
  assert.deepEqual(reservedLights({ rgb: planted, w, h, paperRGB: PAPER, cellMm: 1, brushMm: 7, thinMm: 3 }).mask, reservedLights({ rgb: base, w, h, paperRGB: PAPER, cellMm: 1, brushMm: 7, thinMm: 3 }).mask);
});

test('faint grain inside a field (5 of 255 either way) does not cut it into shapes', () => {
  const w = 60, h = 40, rgb = picture(w, h, [200, 90, 80], [[30, 0, 60, 40, [70, 100, 190]]]);
  let s = 7; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5; };
  for (let i = 0; i < rgb.length; i++) rgb[i] = Math.max(0, Math.min(255, rgb[i] + 10 * rnd()));
  assert.equal(washShapes({ rgb, w, h, paperRGB: PAPER, cellMm: 1, brushMm: 3 }).shapes.length, 2);
});
