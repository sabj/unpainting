import test from 'node:test';
import assert from 'node:assert/strict';
import { planThingWashes, polygonsOf, trimmedMedian, assignThings, thingOrder, fillHoles } from './thing-washes.mjs';
import { cleanThings } from './thing-labels.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { unmix, channelDensity } from '../../crop/pigments.mjs';
import { labOf } from '../../eval/colour.mjs';

const PAPER = [252, 251, 248], pigments = ['hansa', 'ultramarine', 'cadred', 'burntumber'].map(key => boxPigment(BOX.find(p => p.key === key) ?? BOX[0]));
// a 160 x 100 mm scene on 1 mm cells: sky, a sea, a white boat (the light), a red buoy, a dark hull band in the boat's shadow
function scene({ noise = 0 } = {}) {
  const w = 160, h = 100, n = w * h, rgb = new Uint8ClampedArray(n * 3), seg = new Int32Array(n);
  let s = 3; const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 2 ** 32 - .5; };
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0; let c = y < 50 ? [150, 180, 220] : [70, 110, 120], r = y < 50 ? 1 : 2;
    if (x >= 40 && x < 100 && y >= 30 && y < 60) { c = [245, 244, 240]; r = 3; }
    if (x >= 40 && x < 100 && y >= 60 && y < 66) { c = [60, 60, 70]; r = 4; }
    if (x >= 120 && x < 140 && y >= 70 && y < 85) { c = [200, 40, 30]; r = 5; }
    rgb.set(c.map(v => Math.max(0, Math.min(255, v + noise * rnd()))), i * 3); seg[i] = r;
  }
  return { w, h, n, rgb, seg };
}
const NAMED = [{ name: 'sky', kind: 'sky', box: [0, 0, 1, .5] }, { name: 'sea', kind: 'water', box: [0, .5, 1, 1] }, { name: 'boat', kind: 'other', box: [.24, .28, .64, .68] }, { name: 'buoy', kind: 'other', box: [.74, .68, .89, .87] }];
function plan(sc, named = NAMED) {
  const { w, h, n, rgb, seg } = sc, D = channelDensity(rgb, n, PAPER), demand = unmix(D, n, pigments.map(p => p.K.map(v => v / .55))), density = Float32Array.from({ length: n }, (_, i) => Math.max(0, (D[i * 3] + D[i * 3 + 1] + D[i * 3 + 2]) / 3));
  const log = console.log; console.log = () => {};
  try { return planThingWashes({ demand, k: pigments.length, density, w, h, rgb, paperRGB: PAPER, pigments, sheetWidthMm: w, washBrushMm: 3, washKitMm: [38, 25.4, 7, 5, 3], pointBrushMm: 1.2, segments: seg, things: named }); } finally { console.log = log; }
}

test('a polygon is a few smooth vertices, its holes filled, and no fragment under the least wash survives', () => {
  const w = 72, h = 40, m = new Uint8Array(w * h);
  for (let y = 5; y < 35; y++) for (let x = 5; x < 55; x++) m[y * w + x] = 1;
  for (let y = 15; y < 25; y++) for (let x = 20; x < 30; x++) m[y * w + x] = 0;   // a hole: filled
  m[2 * w + 68] = 1;   // a speck: gone
  for (let y = 5; y < 35; y++) m[y * w + 64] = 1;  // a sliver one cell wide: opened away
  const loops = polygonsOf(m, w, h, { planMm: 1, brushMm: 3, tolMm: 2, leastMm2: 30 });
  assert.equal(loops.length, 1, 'one outline, no hole loop, no speck');
  assert.ok(loops[0].points.length < 60, `low-vertex (${loops[0].points.length})`);
  const xs = loops[0].points.map(p => p[0]); assert.ok(Math.max(...xs) < 56.5, 'the sliver is not part of it');
  assert.equal(fillHoles(m, w, h)[20 * w + 25], 1);
});

test('a polygon\'s colour is the trimmed median of the whole polygon: outliers inside it do not move it', () => {
  const cols = [...Array(90).fill([200, 150, 100]), ...Array(10).fill([10, 10, 10])], c = trimmedMedian(cols.map((_, i) => i), i => cols[i], i => labOf(cols[i], 0, PAPER)[0]);
  assert.deepEqual(c, [200, 150, 100]);
});

test('regions go to the most specific named box; shadows take none; boxes in thousandths are read as fractions', () => {
  const pw = 10, ph = 10, region = Int32Array.from({ length: 100 }, (_, i) => (i % 10 < 5 ? 1 : (i / 10 | 0) < 5 ? 2 : 3));
  const named = cleanThings([{ thing: 'wall', kind: 'wall', box: [0, 0, 1000, 1000] }, { thing: 'door', kind: 'door', box: [.5, .5, 1, 1] }, { thing: 'shade', kind: 'shadow', box: [0, 0, 1, 1] }, { thing: 'x', kind: 'nonsense', box: [0, 0, 0, 0] }]);
  assert.equal(named.length, 3); assert.deepEqual(named[0].box, [0, 0, 1, 1]);
  const { things, thingOf } = assignThings(region, pw, ph, [{ name: 'unused', kind: 'roof', box: [0, 0, .01, .01] }, ...named], 1), door = things.find(t => t.name === 'door'), wall = things.find(t => t.name === 'wall');
  assert.equal(door.cells.length, 25); assert.equal(wall.cells.length, 75); assert.ok(!things.some(t => t.kind === 'shadow'));
  assert.equal(things[thingOf[99]].name, 'door', 'cell to thing indices survive dropping a thing with no cells');
});

test('things are visited nearest next from the largest, and a thing with the things inside it light to dark', () => {
  const T = [{ cx: 0, cy: 0, L: 50, area: 100, parent: -1 }, { cx: 100, cy: 0, L: 60, area: 10, parent: -1 }, { cx: 10, cy: 0, L: 40, area: 10, parent: -1 }, { cx: 1, cy: 1, L: 80, area: 5, parent: 0 }, { cx: 1, cy: 2, L: 20, area: 5, parent: 0 }];
  assert.deepEqual(thingOrder(T), [3, 0, 4, 2, 1]);
});

test('the plan: bands first, then things, a light kept as paper, one mix a polygon judged over what is under it', () => {
  const p = plan(scene({ noise: 30 })), L = p.layers, q = L.map(l => l.shapes[0]._valuePlan);
  assert.deepEqual(L.map(l => l.value), [...L.map(l => l.value)].sort((a, b) => a - b), 'bands, things, shadows, accents in that order');
  assert.ok(q.filter(v => v.stage === 1).map(v => v.thing).includes('sky') && q.filter(v => v.stage === 1).map(v => v.thing).includes('sea'));
  assert.ok(p.summary.lights.includes('boat'), 'the white boat is reserved');
  assert.ok(q.filter(v => v.thing === 'boat').every(v => v.areaMm2 < 0.4 * 60 * 36), 'its wash, if any, goes round the light');
  assert.ok(q.some(v => v.thing === 'buoy' && v.stage === 2));
  assert.ok(p.summary.washes < 20, `tens of washes, not a mosaic (${p.summary.washes})`);
  assert.equal(new Set(L.map(l => l.mixId)).size, p.mixes.length, 'one mix a polygon');
  for (const v of q) { assert.ok(v.strokes.length > 0); assert.ok(v.outline.every(l => l.points.length < 400)); }
  assert.equal(p.protectedCells, null, 'no clip: the strokes go round the light');
  // no stroke of any wash lies on the white boat (x 40..100, y 30..60 mm), away from its edge
  for (const v of q) for (const st of v.strokes) for (const [x, y] of st.points) assert.ok(!(x > 46 + st.radiusMm && x < 94 - st.radiusMm && y > 34 + st.radiusMm && y < 56 - st.radiusMm), `${v.thing} strokes over the light at ${x},${y}`);
  // the buoy is red: its mix is mostly the red paint, though it is laid over the sea band
  const buoy = L.find(l => l.shapes[0]._valuePlan.thing === 'buoy'); assert.equal(pigments[buoy.pigment].key ?? buoy.pigment, pigments[2].key ?? 2);
});

test('noise in the subject does not change the shapes: polygons are things, not values', () => {
  const a = plan(scene()), b = plan(scene({ noise: 40 }));
  assert.deepEqual(a.layers.map(l => l.shapes[0]._valuePlan.thing), b.layers.map(l => l.shapes[0]._valuePlan.thing));
});

test('without named things each SAM region is a thing; without a segment map the sheet is one region', () => {
  const sc = scene(), p = plan(sc, []);
  assert.ok(p.summary.washes >= 3 && p.summary.washes < 15);
  const one = plan({ ...sc, seg: null }, []);
  assert.ok(one.summary.washes >= 1 && one.summary.washes <= 3, `one band and perhaps an accent (${one.summary.washes})`);
});

test('a named shadow is one glaze in the colour of its shade, laid after the things', () => {
  const sc = scene();
  for (let i = 0; i < sc.n; i++) { const x = i % sc.w, y = (i / sc.w) | 0; if (y >= 70 && y < 95 && x >= 10 && x < 90 && (x + y) % 6 < 3) sc.rgb.set([30, 60, 70], i * 3); }   // a dappled shade on the sea
  const p = plan(sc, [...NAMED, { name: 'boat shadow', kind: 'shadow', box: [.06, .7, .56, .95] }]), q = p.layers.map(l => l.shapes[0]._valuePlan), s = q.filter(v => v.stage === 3);
  assert.equal(s.length, 1, 'one glaze'); assert.equal(s[0].thing, 'boat shadow');
  assert.ok(q.indexOf(s[0]) > Math.max(...q.filter(v => v.stage === 2).map(v => q.indexOf(v))));
  assert.ok(s[0].outline.length === 1 && s[0].outline[0].points.length < 200, 'a loose shape, not the dapple');
});

test('a named thing\'s own SAM mask is its shape, whatever regions the automatic map cut', () => {
  const pw = 10, ph = 10, region = new Int32Array(100).fill(1), own = Uint8Array.from({ length: 100 }, (_, i) => (i % 10 >= 6 && (i / 10 | 0) >= 6 ? 2 : 0));
  const named = cleanThings([{ name: 'wall', kind: 'wall', box: [0, 0, 1, 1] }, { name: 'door', kind: 'door', box: [.5, .5, 1, 1] }]);
  const { things } = assignThings(region, pw, ph, named, 1, own);
  assert.equal(things.find(t => t.name === 'door').cells.length, 16); assert.equal(things.find(t => t.name === 'wall').cells.length, 84);
});
