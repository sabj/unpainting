import test from 'node:test';
import assert from 'node:assert/strict';
import { planStudyWashes, nestParents } from './study-washes.mjs';
import { laneFill } from './sweep-fill.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { labOf } from '../../eval/colour.mjs';

const PAPER = [252, 251, 248], pigments = ['hansa', 'ultramarine', 'cadred', 'umber'].map(key => boxPigment(BOX.find(p => p.key === key) ?? BOX[0]));
// a block-in study, 160 x 100 mm on 0.5 mm cells: a tan wall with a darker tan cast shadow on it, a dark blue door,
// white paper round it, and (with `rim`) a one-cell anti-aliased rim of an in-between colour round the door
function study({ rim = false } = {}) {
  const w = 320, h = 200, rgb = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const x = (i % w) / 2, y = ((i / w) | 0) / 2; let c = [255, 255, 255];
    if (x >= 20 && x < 140 && y >= 15 && y < 90) {
      c = [225, 200, 160];
      if (x - 30 > (y - 25) * 0.5 && x - 30 < (y - 25) * 0.5 + 25 && y >= 25 && y < 75) c = [170, 145, 110];
      if (x >= 95 && x < 110 && y >= 55 && y < 90) c = [45, 55, 75];
      if (rim && x >= 94.5 && x < 110.5 && y >= 54.5 && y < 55) c = [130, 120, 115];
    }
    rgb.set(c, i * 3);
  }
  return { w, h, rgb };
}
function plan(st) {
  const log = console.log; console.log = () => {};
  try { return planStudyWashes({ k: pigments.length, w: st.w, h: st.h, studies: [{ rgb: st.rgb, file: 'test' }], paperRGB: PAPER, pigments, sheetWidthMm: 160, washBrushMm: 5, washKitMm: [38, 25.4, 7, 5] }); } finally { console.log = log; }
}

test('the study\'s flat shapes: three painted, the white left as paper, each one mix', () => {
  // (the rim, 8 mm2, is under the study's least size of 12 mm2 and joins a neighbour)
  const p = planWith(study({ rim: true }), {}, null, 12);
  assert.equal(p.summary.shapes - p.summary.paperShapes, 3, JSON.stringify(p.summary));
  assert.ok(p.summary.reservedShare > 0.35, 'the paper round the wall');
  // the wall one wash; the shadow and the door each built by two or more glazes
  const washes = p.instructions.filter(q => q.stage !== 2);
  assert.equal(washes.filter(q => !/glaze/.test(q.thing)).length, 1);
  assert.ok(washes.filter(q => /shadow, glaze/.test(q.thing)).length >= 2 && washes.filter(q => /glaze/.test(q.thing) && !/shadow/.test(q.thing)).length >= 2, washes.map(q => q.thing).join(' | '));
  assert.ok(p.mixes.every(m => m.mix.length === pigments.length));
});

test('wash within wash: the wall is laid first and carried under its shadow; the shadow goes over it dry; the door is last', () => {
  const p = plan(study()), washes = p.instructions.filter(q => q.stage !== 2);
  const L = washes.map(q => labOf(q.colour, 0, PAPER)[0]);
  // (the shadow and the door are glazed, each glaze darker than the last, every first glaze before any second; the later
  // studies' touches are the last value step)
  assert.deepEqual(washes.map(q => q.stage), [1, ...washes.slice(1).map(() => 3)]);
  const step = q => Number(/glaze (\d) of/.exec(q.thing)?.[1] ?? 0);
  for (let i = 2; i < washes.length; i++) assert.ok(step(washes[i]) >= step(washes[i - 1]), washes.map(q => q.thing).join(' | '));
  assert.ok(L.slice(1).every(v => v < L[0]), L.join(' '));
  // the wall's wash covers the shadow too: nearly the whole wall less the door
  assert.ok(washes[0].areaMm2 > 0.85 * (120 * 75 - 15 * 35), `${washes[0].areaMm2}`);
  assert.ok(p.layers.every(l => l.shapes.every(s => s._valuePlan.strokes.every(st => st.points.every(q => Number.isFinite(q[0]) && Number.isFinite(q[1]))))));
});

test('nesting: a darker shape of like hue nests on the lighter one it borders; a shape of another hue does not', () => {
  const shapes = [
    { lab: [85, 5, 25], chroma: 25, paper: false, rim: 100, border: new Map([[1, 40], [2, 20]]) },
    { lab: [65, 4, 19], chroma: 19, paper: false, rim: 80, border: new Map([[0, 40]]) },
    { lab: [30, 0, -25], chroma: 25, paper: false, rim: 60, border: new Map([[0, 20]]) },
  ];
  assert.deepEqual(nestParents(shapes), [-1, 0, -1]);
});

test('lanes: a wide band is laid in a few lanes along its length, back and forth without lifting, landing and lifting on the tip, nothing round its outline', () => {
  const band = { points: [[0, 0], [120, 10], [120, 40], [0, 30]] }, f = laneFill([band], { kitMm: [38, 25.4, 7, 5], spine: false });
  const big = f.strokes.filter(s => 2 * s.radiusMm === f.brushMm);
  // a lane is a long segment; the lanes of one stroke are joined by short turns at the outline
  const lanes = s => s.points.slice(1).map((q, j) => [q[0] - s.points[j][0], q[1] - s.points[j][1]]).filter(([dx, dy]) => Math.hypot(dx, dy) > 30);
  const n = big.reduce((a, s) => a + lanes(s).length, 0);
  assert.ok(n >= 2 && n <= 4, `${n} lanes of the ${f.brushMm} mm brush`);
  assert.equal(big.length, 1, 'one stroke: the brush turns at the outline instead of lifting');
  assert.ok(f.uncovered < 0.03, `${f.uncovered}`);
  for (const s of big) { assert.ok(s.points[0][2] < 0.5 && s.points[s.points.length - 1][2] < 0.5, 'tapered ends'); for (const [dx, dy] of lanes(s)) assert.ok(Math.abs(dy / dx) < 0.25, 'along the band'); }
});

test('a toned sheet: the study\'s buff paper and its white are both bare paper, measured against the sheet\'s colour', () => {
  const BUFF = [232, 218, 190], w = 200, h = 150, rgb = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < w * h; i++) { const x = (i % w) / 2, y = ((i / w) | 0) / 2; rgb.set(x >= 20 && x < 60 && y >= 20 && y < 50 ? [150, 120, 90] : x > 80 ? [255, 255, 255] : BUFF, i * 3); }
  const log = console.log; console.log = () => {};
  try {
    const p = planStudyWashes({ k: pigments.length, w, h, studies: [{ rgb, file: 'buff' }], paperRGB: BUFF, pigments, sheetWidthMm: 100, washBrushMm: 5, washKitMm: [25.4, 7, 5] });
    assert.ok(p.summary.reservedShare > 0.8, `${p.summary.reservedShare}`);
    assert.equal(p.instructions.filter(q => q.stage !== 2).length, 1);
  } finally { console.log = log; }
});

// a wall 120 x 75 mm with a window of another hue in it, a small white (a lit stone, 4 x 4 mm) and two cast-shadow bands
// of one colour 1 mm apart; white paper round it
function wallStudy() {
  const w = 320, h = 200, rgb = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const x = (i % w) / 2, y = ((i / w) | 0) / 2; let c = [255, 255, 255];
    if (x >= 20 && x < 140 && y >= 15 && y < 90) {
      c = [225, 200, 160];
      const u = x - (y - 15) * 0.6;
      if (y >= 20 && y < 85 && ((u >= 30 && u < 40) || (u >= 41 && u < 51))) c = [175, 150, 118];
      if (x >= 100 && x < 115 && y >= 25 && y < 50) c = [45, 55, 75];
      if (x >= 120 && x < 124 && y >= 70 && y < 74) c = [255, 255, 255];
    }
    rgb.set(c, i * 3);
  }
  return { w, h, rgb };
}

test('the under-wash: one connected wash over the wall, under its window and its small white, off the white round it', () => {
  const p = plan(wallStudy()), first = p.instructions[0];
  assert.match(first.thing, /under-wash/);
  // the wall less nothing: the window and the small white are under it; the paper round it is not
  assert.ok(first.areaMm2 > 0.97 * 120 * 75 && first.areaMm2 < 120 * 75 + 2 * 2 * (120 + 75) + 50, `${first.areaMm2}`);
  assert.equal(first.outline.length, 1, 'one outline, no holes');
});

test('cast-shadow pieces of one colour a millimetre apart are one wash, laid along the bands', () => {
  const p = plan(wallStudy()), shadows = p.instructions.filter(q => q.stage === 3 && /shadow, glaze 1 of/.test(q.thing));
  assert.equal(shadows.length, 1, shadows.map(q => q.thing).join(' | '));
  // its strokes run down the bands (a slant of about 59 degrees from level), not across them
  const long = shadows[0].strokes.filter(s => s.points.length >= 2).map(s => { const a = s.points[0], b = s.points.at(-1); return Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI); });
  // (most of them: the outline is cut first with a small round that follows it)
  assert.ok(long.filter(d => d > 40 && d < 80).length >= 0.6 * long.length, long.join(' '));
});

test('a mast narrower than the smallest brush is one pull down its length, not a row of dots', () => {
  const mast = { points: [[50, 10], [52, 10], [53, 70], [51, 70]] }, f = laneFill([mast], { kitMm: [38, 25.4, 7, 5] });
  assert.equal(f.strokes.length, 1, JSON.stringify(f.strokes.map(s => s.points.length)));
  assert.ok(f.spine);
});

test('a long thin brown shape of the study (a spar) is laid in a pull, not in dabs', () => {
  const w = 320, h = 200, rgb = new Uint8ClampedArray(w * h * 3).fill(255);
  for (let i = 0; i < w * h; i++) { const x = (i % w) / 2, y = ((i / w) | 0) / 2; if (Math.abs(x - 40 - (y - 20) * 0.5) < 1.6 + (y % 7 < 2 ? 0.8 : 0) && y > 20 && y < 90) rgb.set([140, 90, 50], i * 3); }
  const p = plan({ w, h, rgb }), q = p.instructions.filter(r => r.stage !== 2);
  assert.ok(q.length >= 1 && q.every(r => !/dabs/.test(r.thing)), q.map(r => r.thing).join(' | '));
});

test('a near-monochrome subject: every mix is its own paint, and one cluster of the study is laid in nested value steps', () => {
  // one shape of one colour cluster whose lightness runs from pale to mid across it (the coarse clusters hold it as one)
  const w = 320, h = 200, rgb = new Uint8ClampedArray(w * h * 3).fill(255);
  for (let i = 0; i < w * h; i++) { const x = (i % w) / 2, y = ((i / w) | 0) / 2; if (x >= 20 && x < 140 && y >= 15 && y < 90) { const t = (x - 20) / 120; rgb.set([215 - 40 * t, 195 - 40 * t, 170 - 40 * t].map(Math.round), i * 3); } }
  const mono = { mono: true, pigments: [3], k: pigments.length, fits: [], note: 'test' };
  const log = console.log; console.log = () => {};
  try {
    const p = planStudyWashes({ k: pigments.length, w, h, studies: [{ rgb, file: 'mono' }], paperRGB: PAPER, pigments, sheetWidthMm: 160, washBrushMm: 5, washKitMm: [38, 25.4, 7, 5], mono });
    const washes = p.instructions.filter(q => q.stage !== 2);
    assert.ok(washes.filter(q => /value step/.test(q.thing)).length >= 1, washes.map(q => q.thing).join(' | '));
    assert.ok(p.mixes.every(m => m.mix.every((v, j) => j === 3 || v === 0)), 'umber only');
    // the steps are smaller than the wash they go over (wash within wash)
    assert.ok(washes.slice(1).every(q => q.areaMm2 < washes[0].areaMm2));
  } finally { console.log = log; }
});

// --- named forms (a SAM id map of the source with each form's name and kind) ---
// the left half of the sheet a face, the right half sky; a strip at the bottom in no form
const halves = (w, h) => ({ width: w, height: h, ids: Uint8Array.from({ length: w * h }, (_, i) => (((i / w) | 0) >= 0.9 * h ? 0 : i % w < w / 2 ? 1 : 2)), names: ['a face', 'the sky'], kinds: ['face', 'sky'], provenance: { schema: 'named-sam-v1' } });
function planWith(st, extra = {}, read = null, minMm2 = null) {
  const log = console.log; console.log = () => {};
  try { return planStudyWashes({ k: pigments.length, w: st.w, h: st.h, studies: [{ rgb: st.rgb, file: 'test', ...(read ? { read } : {}), ...(minMm2 ? { minMm2 } : {}) }], paperRGB: PAPER, pigments, sheetWidthMm: 160, washBrushMm: 5, washKitMm: [38, 25.4, 7, 5], ...extra }); } finally { console.log = log; }
}

test('named forms: every wash records the forms it lies in, with their kinds; without masks the plan is exactly as before', () => {
  const st = wallStudy(), plain = planWith(st), named = planWith(st, { thingMasks: halves(st.w, st.h) });
  assert.ok(plain.instructions.every(q => !('forms' in q)) && !('namedForms' in plain.summary));
  assert.deepEqual(JSON.parse(JSON.stringify(planWith(st, { thingMasks: null }).instructions)), JSON.parse(JSON.stringify(plain.instructions)));
  // the same washes and strokes with masks; each also names its forms
  assert.deepEqual(JSON.parse(JSON.stringify(named.instructions.map(({ forms, ...q }) => q))), JSON.parse(JSON.stringify(plain.instructions)));
  assert.deepEqual(named.summary.namedForms.forms.map(f => [f.id, f.name, f.kind]), [[1, 'a face', 'face'], [2, 'the sky', 'sky']]);
  // the under-wash of the wall spans both halves; the window (x 100 to 115 of 160 mm) lies in the sky half only
  assert.deepEqual(named.instructions[0].forms.map(f => f.kind).sort(), ['face', 'sky']);
  const windowWash = named.instructions.find(q => q.forms.length === 1 && q.forms[0].share > 0.95 && q.areaMm2 < 600);
  assert.equal(windowWash.forms[0].name, 'the sky');
});

// --- the limits are settings (READ; a wash plan changes one with @name=value after a study) ---
// a 300 x 200 mm sheet at 0.5 mm cells: a tan field with a 4 x 4 mm square of a slightly darker tan in it (16 mm2:
// neither dark nor of another hue, so only its size keeps it), and twelve patches of
// twelve slightly different tans
function fieldStudy() {
  const w = 600, h = 400, rgb = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const x = (i % w) / 2, y = ((i / w) | 0) / 2; let c = [225, 200, 160];
    const px = Math.floor((x - 20) / 22), py = Math.floor((y - 100) / 40);
    if (x >= 20 && px < 12 && py >= 0 && py < 1 && (x - 20) % 22 < 16 && (y - 100) % 40 < 30) c = [215 - 9 * px, 180 - 7 * px, 150 - 8 * px];
    if (x >= 150 && x < 154 && y >= 40 && y < 44) c = [196, 172, 134];
    rgb.set(c, i * 3);
  }
  return { w, h, rgb };
}
const planField = (read, minMm2 = 6) => { const st = fieldStudy(), log = console.log; console.log = () => {}; try { return planStudyWashes({ k: pigments.length, w: st.w, h: st.h, studies: [{ rgb: st.rgb, file: 'field', minMm2, ...(read ? { read } : {}) }], paperRGB: PAPER, pigments, sheetWidthMm: 300, washBrushMm: 5, washKitMm: [38, 25.4, 7, 5] }); } finally { console.log = log; } };

test('the least shape is the wash plan\'s mm2 and does not grow with the sheet: a 16 mm2 shape is kept on a 300 mm sheet', () => {
  // (0.08% of this sheet is 48 mm2: the square was a sliver under the old sheet-relative floor)
  const small = p => p.instructions.filter(q => q.areaMm2 > 8 && q.areaMm2 < 40);
  assert.ok(small(planField(null, 6)).length >= 1, 'kept at a least size of 6 mm2');
  assert.equal(small(planField(null, 40)).length, 0, 'joined to the field at a least size of 40 mm2');
});

test('the block-in shape count, the colour groups and their join distance are settings with defaults', async () => {
  const { READ } = await import('./study-washes.mjs');
  assert.deepEqual([READ.shapes, READ.clusters, READ.join, READ.leastMm2], [160, 16, 10, 6]);
  const dflt = planField({ clusters: 32, join: 6 }), few = planField({ clusters: 32, join: 6, shapes: 4 }), coarse = planField({ clusters: 4, join: 30 });
  assert.ok(dflt.summary.shapes >= 8, `${dflt.summary.shapes} shapes at @clusters=32@join=6`);
  assert.ok(few.summary.shapes < dflt.summary.shapes, `${few.summary.shapes} with @shapes=4`);
  assert.ok(coarse.summary.clusters < dflt.summary.clusters && coarse.summary.shapes < dflt.summary.shapes, `${coarse.summary.clusters} colours, ${coarse.summary.shapes} shapes with @clusters=4@join=30`);
});

// --- no dabs ---
// the wall of wallStudy with a pink patch (14 x 12 mm) of the wall's own value in it
function patchStudy() {
  const st = wallStudy();
  for (let i = 0; i < st.w * st.h; i++) { const x = (i % st.w) / 2, y = ((i / st.w) | 0) / 2; if (x >= 56 && x < 70 && y >= 58 && y < 70) st.rgb.set([232, 185, 175], i * 3); }
  return st;
}

test('no dabs: nothing is dropped into a wash that the study does not show; a small shape of another hue in a family is laid as its own shape', () => {
  const p = planWith(patchStudy());
  assert.equal(p.summary.charges, 0);
  assert.equal(p.instructions.filter(q => q.stage === 2).length, 0, p.instructions.filter(q => q.stage === 2).map(q => q.thing).join(' | '));
  assert.ok(p.instructions.every(q => !/dropped in|dropped into/.test(q.thing)));
  // the patch: one wash of its own, over the dry under-wash, about its own size, pinker than the wall
  const patch = p.instructions.filter(q => /over the under-wash/.test(q.thing) && q.areaMm2 > 120 && q.areaMm2 < 260 && q.colour[0] - q.colour[2] > 40 && q.colour[1] < 195);
  assert.equal(patch.length, 1, p.instructions.map(q => `${q.thing} ${q.areaMm2} ${q.colour}`).join(' | '));
  assert.equal(patch[0].move, 'wet on dry');
  assert.ok(patch[0].strokes.length >= 1 && patch[0].outline.length >= 1);
});
