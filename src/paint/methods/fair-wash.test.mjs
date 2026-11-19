import test from 'node:test';
import assert from 'node:assert/strict';
import { planFairWashes } from './fair-wash.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { unmix, channelDensity } from '../../crop/pigments.mjs';

const PAPER = [252, 251, 248], pigments = ['hansa', 'ultramarine', 'cadred'].map(key => boxPigment(BOX.find(p => p.key === key)));
function plan(w, h, ground, rects, { noise = 0, sheetMm = w, pattern = 0, things = null } = {}) {
  const n = w * h, rgb = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) rgb.set(ground, i * 3);
  for (const [x0, y0, x1, y1, c] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) rgb.set(c, (y * w + x) * 3);
  if (noise) { let s = 7; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5; }; for (let i = 0; i < rgb.length; i++) rgb[i] = Math.max(0, Math.min(255, rgb[i] + noise * rnd())); }
  // a faint smooth pattern, `pattern` of 255 at its peaks (16 is about 3 L* rms)
  if (pattern) for (let i = 0; i < n; i++) { const d = pattern * Math.sin((i % w) * 1.9 * 80 / w + 1) * Math.sin(((i / w) | 0) * 1.7 * 80 / w + 2); for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.max(0, Math.min(255, rgb[i * 3 + c] + d)); }
  const D = channelDensity(rgb, n, PAPER), demand = unmix(D, n, pigments.map(p => p.K.map(v => v / .55))), density = Float32Array.from({ length: n }, (_, i) => Math.max(0, (D[i * 3] + D[i * 3 + 1] + D[i * 3 + 2]) / 3));
  const log = console.log; console.log = () => {};
  try { return planFairWashes({ demand, k: pigments.length, density, w, h, rgb, paperRGB: PAPER, pigments, sheetWidthMm: sheetMm, washBrushMm: 3, washKitMm: [38, 25.4, 7, 5, 3], pointBrushMm: 1.2, segments: things ? Uint8Array.from({ length: n }, (_, i) => things(i % w, (i / w) | 0)) : null }); } finally { console.log = log; }
}
// a sky, a wall in two values, a large sheet of bare paper and a dark window
const SCENE = [[0, 0, 80, 20, [150, 175, 215]], [0, 20, 40, 60, [205, 170, 125]], [40, 20, 80, 60, [150, 124, 92]], [4, 26, 30, 50, PAPER], [52, 32, 66, 46, [50, 45, 50]]];
const washesOf = p => p.layers.flatMap(l => l.shapes);

test('every wash is charged with a mix judged for its shape: its own, a mix of paints, never fitted to its cells', () => {
  const p = plan(80, 60, [205, 170, 125], SCENE), washes = washesOf(p);
  assert.ok(washes.length > 0 && p.mixes.length >= 3);
  for (const sh of washes) {
    const q = sh._valuePlan, m = p.mixes[q.mixId];
    assert.ok(Math.abs(m.mix.reduce((a, v) => a + v, 0) - 1) < 1e-9 && m.strength > 0 && m.stage === q.stage);
    sh.mix.forEach((v, j) => assert.ok(Math.abs(v - m.mix[j] * m.strength) < 1e-9, 'the charge is the mix at its strength'));
    assert.equal(sh._rampVec, undefined); assert.equal(sh.graded, null);
  }
  assert.equal(new Set(p.layers.map(l => l.mixId)).size, p.mixes.length, 'one mix a shape');
  assert.ok(washes.some(sh => sh.mix.filter(v => v > 1e-6).length > 1), 'a wash carries a mix, not one pigment');
  assert.ok(Math.max(...p.layers.map(l => l.value)) <= 3);
  const stages = p.layers.map(l => l.value); assert.deepEqual(stages, [...stages].sort((a, b) => a - b), 'light to dark');
});

test('a picture of many colours gets as many mixes: there is no cap and no shape takes another shape\'s mix', () => {
  // forty 20 x 20 mm fields, each its own colour
  const hsv = (hDeg, s, v) => { const f = k => { const q = (k + hDeg / 60) % 6; return 255 * (v - v * s * Math.max(0, Math.min(q, 4 - q, 1))); }; return [f(5), f(3), f(1)]; };
  const rects = []; for (let q = 0; q < 40; q++) rects.push([(q % 8) * 20, ((q / 8) | 0) * 20, (q % 8) * 20 + 20, ((q / 8) | 0) * 20 + 20, hsv(q * 9 * 7 % 360, .3 + .4 * (q % 3) / 2, .55 + .3 * (q % 4) / 3)]);
  const p = plan(160, 100, [200, 200, 200], rects), first = p.mixes.filter(m => m.stage === 1);
  assert.ok(first.length >= 36, `${first.length} mixes for forty fields`);
  assert.ok(new Set(first.map(m => m.mix.map(v => v.toFixed(2)).join())).size >= 30, 'the mixes differ');
});

test('the first wash covers all the unreserved paper, each shape in its own colour, and paper is reserved whole', () => {
  const p = plan(80, 60, [205, 170, 125], SCENE), w = 80, n = 80 * 60, covered = new Uint8Array(n);
  for (const sh of washesOf(p)) if (sh._valuePlan.stage === 1) for (let i = 0; i < n; i++) if (sh.mask[i]) covered[i] = 1;
  for (let i = 0; i < n; i++) assert.equal(covered[i] | p.protectedCells[i], 1, 'no unreserved cell is left out of the first wash');
  assert.ok(p.summary.firstWashCover > .97, `the first wash's strokes reach ${p.summary.firstWashCover} of it`);
  assert.equal(p.protectedCells[38 * w + 17], 1, 'the sheet of bare paper is reserved');
  const first = washesOf(p).filter(sh => sh._valuePlan.stage === 1), at = (x, y) => first.find(sh => sh.mask[y * w + x]);
  assert.ok(at(40, 10).mix[1] > at(20, 55).mix[1], 'the sky is bluer than the wall');
  assert.notEqual(at(40, 10)._valuePlan.mixId, at(20, 55)._valuePlan.mixId);
});

test('a light is reserved before the first wash: a cream hull on a grey scan stays paper and the washes go round it', () => {
  // nothing here is paper white; the hull is the lightest thing and clearly lighter than the sky round it
  const hull = [20, 15, 50, 45], p = plan(80, 60, [150, 150, 195], [[...hull, [226, 220, 200]], [0, 50, 80, 60, [110, 140, 150]]]), w = 80;
  assert.ok(p.summary.lights >= 1 && p.summary.reservedShare > .1 && p.summary.reservedShare < .2, `${p.summary.reservedShare} of the sheet reserved`);
  assert.equal(p.protectedCells[30 * w + 35], 1);
  for (const sh of washesOf(p)) {
    assert.equal(sh.mask[30 * w + 35], 0, 'no wash is laid on the hull');
    // no stroke's footprint reaches more than the outline tolerance into it
    // (a lane's band ends square where the brush stops; a round reaches its radius all round)
    for (const st of sh._valuePlan.strokes) for (const [x, y] of st.points) {
      const dx = Math.max(hull[0] - x, 0, x - hull[2]), dy = Math.max(hull[1] - y, 0, y - hull[3]), level = st.kind === 'lane' && st.points[0][1] === st.points[1][1];
      const clear = st.kind !== 'lane' ? Math.hypot(dx, dy) - st.radiusMm : level ? Math.max(dx, dy - st.radiusMm) : Math.max(dy, dx - st.radiusMm);
      assert.ok(clear > -1.6, `a ${2 * st.radiusMm} mm brush at ${x}, ${y}`);
    }
  }
  assert.ok(p.lightShapes.length >= 1);
});

test('a later wash is laid only where a shape must be darker than what is under it, and is mixed for what is under it', () => {
  const flat = plan(80, 60, [205, 170, 125], [[0, 0, 80, 20, [150, 175, 215]]]);
  assert.ok(washesOf(flat).every(sh => sh._valuePlan.stage === 1), 'two flat fields are finished by the first wash');
  const p = plan(80, 60, [205, 170, 125], SCENE), w = 80, later = washesOf(p).filter(sh => sh._valuePlan.stage > 1), first = washesOf(p).filter(sh => sh._valuePlan.stage === 1);
  const window = later.filter(sh => sh.mask[39 * w + 59] === 1);
  assert.ok(window.length >= 1, 'the dark window takes a wash over the first');
  assert.ok(later.every(sh => sh.mask[10 * w + 40] === 0), 'the sky takes none');
  // what is under the window and what is laid over it together hold no more of any paint than the window's own colour
  const under = first.find(sh => sh.mask[39 * w + 59] === 1);
  if (under) window[0].mix.forEach((v, j) => assert.ok(v >= 0 && v + under.mix[j] > under.mix[j] - 1e-9));
  assert.ok(window[0].amount > 0);
});

test('a faint pattern over the subject (3 L* rms) does not change which washes are laid', () => {
  const clean = plan(80, 60, [205, 170, 125], SCENE), planted = plan(80, 60, [205, 170, 125], SCENE, { pattern: 16 });
  assert.deepEqual(washesOf(planted).map(sh => sh._valuePlan.stage), washesOf(clean).map(sh => sh._valuePlan.stage));
  assert.deepEqual(planted.summary.washesByStage, clean.summary.washesByStage);
  let moved = 0; const n = 80 * 60, a = washesOf(clean), b = washesOf(planted);
  a.forEach((sh, q) => { for (let i = 0; i < n; i++) if (sh.mask[i] !== b[q].mask[i]) moved++; b[q].mix.forEach((v, j) => assert.ok(Math.abs(v - sh.mix[j]) < .04 + .08 * sh.mix[j], `mix ${v} for ${sh.mix[j]}`)); });
  assert.ok(moved < .02 * n * a.length, `${moved} cells changed wash`);
  assert.deepEqual(planted.protectedCells, clean.protectedCells);
});

test('grain in the subject does not multiply the washes or the mixes', () => {
  const clean = plan(80, 60, [205, 170, 125], SCENE), grainy = plan(80, 60, [205, 170, 125], SCENE, { noise: 16 });
  assert.ok(washesOf(grainy).length <= washesOf(clean).length + 3, `${washesOf(grainy).length} washes with grain, ${washesOf(clean).length} without`);
  assert.ok(grainy.summary.mixes <= clean.summary.mixes + 3);
});

test('the first wash of a wall or a sky is swept with a flat or a mop, and small washes take the rounds', () => {
  // a 200 x 150 mm sheet: a sky over a wall with a window
  const p = plan(200, 150, [205, 170, 125], [[0, 0, 200, 60, [150, 175, 215]], [120, 90, 136, 110, [50, 45, 50]]]), first = washesOf(p).filter(sh => sh._valuePlan.stage === 1 && sh._valuePlan.areaMm2 > 5000);
  assert.equal(first.length, 2);
  for (const sh of first) {
    assert.ok(sh._valuePlan.brush.widthMm >= 25.4, `a ${sh._valuePlan.brush.widthMm} mm brush for ${sh._valuePlan.areaMm2} mm2`);
    assert.ok(sh._valuePlan.strokes.filter(st => st.kind === 'lane').length >= 2);
  }
  assert.ok(p.summary.widestBrushMm >= 25.4);
  const window = washesOf(p).find(sh => sh._valuePlan.areaMm2 < 500);
  assert.ok(window && window._valuePlan.brush.widthMm <= 7, 'the window takes a round');
});

test('the plan is set in millimetres: the same picture on finer cells gets the same mixes, washes and strokes', () => {
  const fine = SCENE.map(([x0, y0, x1, y1, c]) => [x0 * 4, y0 * 4, x1 * 4, y1 * 4, c]);
  const a = plan(80, 60, [205, 170, 125], SCENE), b = plan(320, 240, [205, 170, 125], fine, { sheetMm: 80 });
  assert.equal(b.summary.planCellMm, 1); assert.equal(a.summary.planCellMm, 1);
  assert.deepEqual(b.mixes, a.mixes);
  assert.deepEqual(washesOf(b).map(sh => [sh._valuePlan.id, sh._valuePlan.outline, sh._valuePlan.strokes]), washesOf(a).map(sh => [sh._valuePlan.id, sh._valuePlan.outline, sh._valuePlan.strokes]));
});

test('a wash reaches the brush as an outline and strokes in millimetres, with no edge cells', () => {
  const p = plan(80, 60, [205, 170, 125], SCENE);
  for (const sh of washesOf(p)) {
    const q = sh._valuePlan;
    assert.deepEqual(q.edges.hardCells, []); assert.deepEqual(q.edges.softCells, []);
    assert.ok(q.outline.length >= 1 && q.outline.every(l => l.points.length >= 3 && l.soft.length === l.points.length));
    assert.ok(q.strokes.length >= 1 && q.strokes.length <= 16, `${q.strokes.length} strokes for a wash of ${q.areaMm2} mm2`);
  }
});

const chromaOf = c => { const D = channelDensity(Uint8ClampedArray.from(c), 1, PAPER); return Math.max(...D) - Math.min(...D); };

test('the first shapes are the picture\'s things: a textured thing is one wash, and two things of one colour are one', () => {
  // a wall of varied stone that the run found as one thing, under a sky it found as two
  const blocks = []; for (let q = 0; q < 12; q++) blocks.push([(q % 4) * 20, 30 + ((q / 4) | 0) * 10, (q % 4) * 20 + 20, 40 + ((q / 4) | 0) * 10, q % 2 ? [205, 170, 125] : [178, 146, 104]]);
  const scene = [[0, 0, 80, 30, [150, 175, 215]], ...blocks], things = (x, y) => (y >= 30 ? 3 : x < 40 ? 1 : 2);
  const held = plan(80, 60, [205, 170, 125], scene, { things }), first = washesOf(held).filter(sh => sh._valuePlan.stage === 1), w = 80;
  assert.equal(first.length, 2, 'the wall is one wash and the two halves of the sky are one');
  assert.ok(first.some(sh => sh.mask[10 * w + 10] && sh.mask[10 * w + 70]) && first.some(sh => sh.mask[35 * w + 10] && sh.mask[55 * w + 70]));
});

test('a thing that spans two hues is cut by hue before it gets a mix, a thing with a light and a shadow side in two, and no thing in more than three', () => {
  // one thing over the whole sheet: lavender strips and warm strips of one value, whose mean is a grey
  const strips = []; for (let q = 0; q < 4; q++) strips.push([q * 20, 0, q * 20 + 20, 60, q % 2 ? [205, 170, 125] : [170, 168, 222]]);
  const p = plan(80, 60, [200, 200, 200], strips, { things: () => 1 }), first = washesOf(p).filter(sh => sh._valuePlan.stage === 1), w = 80;
  assert.equal(first.length, 4, 'each strip is its own wash');
  const mixAt = x => first.find(sh => sh.mask[30 * w + x]).mix;
  assert.ok(mixAt(10)[1] > 3 * mixAt(10)[0], 'the lavender strip is a blue mix'); assert.ok(mixAt(30)[0] > 1.5 * mixAt(30)[1], 'the warm strip holds more yellow than blue');
  assert.ok(chromaOf([188, 169, 174]) < .5 * chromaOf([170, 168, 222]), 'their mean would have been mud');
  // a lit and a shadowed side of one hue
  const sides = plan(80, 60, [205, 170, 125], [[40, 0, 80, 60, [150, 124, 92]]], { things: () => 1 });
  assert.equal(washesOf(sides).filter(sh => sh._valuePlan.stage === 1).length, 2);
  // six bands of one thing: three parts at most
  const bands = []; for (let q = 0; q < 6; q++) bands.push([0, q * 10, 80, q * 10 + 10, [205 - 22 * q, 170 - 18 * q, 125 - 13 * q]]);
  const many = plan(80, 60, [205, 170, 125], bands, { things: () => 1 });
  assert.ok(washesOf(many).filter(sh => sh._valuePlan.stage === 1).length <= 3);
});
