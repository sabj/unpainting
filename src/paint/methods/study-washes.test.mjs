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
  const p = plan(study({ rim: true }));
  assert.equal(p.summary.shapes - p.summary.paperShapes, 3, JSON.stringify(p.summary));
  assert.ok(p.summary.reservedShare > 0.35, 'the paper round the wall');
  const washes = p.instructions.filter(q => q.stage !== 2);
  assert.equal(washes.length, 3);
  assert.ok(p.mixes.every(m => m.mix.length === pigments.length));
});

test('wash within wash: the wall is laid first and carried under its shadow; the shadow goes over it dry; the door is last', () => {
  const p = plan(study()), washes = p.instructions.filter(q => q.stage !== 2);
  const L = washes.map(q => labOf(q.colour, 0, PAPER)[0]);
  assert.deepEqual(washes.map(q => q.stage), [1, 3, 4]);
  assert.ok(L[0] > L[1] && L[1] > L[2], L.join(' '));
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

test('lanes: a wide band is laid in a few lanes along its length, landing and lifting on the tip, nothing round its outline', () => {
  const band = { points: [[0, 0], [120, 10], [120, 40], [0, 30]] }, f = laneFill([band], { kitMm: [38, 25.4, 7, 5], spine: false });
  const big = f.strokes.filter(s => 2 * s.radiusMm === f.brushMm);
  assert.ok(big.length >= 2 && big.length <= 4, `${big.length} lanes of the ${f.brushMm} mm brush`);
  assert.ok(f.uncovered < 0.03, `${f.uncovered}`);
  for (const s of big) { assert.ok(s.points[0][2] < 0.5 && s.points[s.points.length - 1][2] < 0.5, 'tapered ends'); const dx = s.points.at(-1)[0] - s.points[0][0], dy = s.points.at(-1)[1] - s.points[0][1]; assert.ok(Math.abs(dy / dx) < 0.25, 'along the band'); }
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
  const p = plan(wallStudy()), shadows = p.instructions.filter(q => q.stage === 3);
  assert.equal(shadows.length, 1, shadows.map(q => q.thing).join(' | '));
  // its strokes run down the bands (a slant of about 59 degrees from level), not across them
  const long = shadows[0].strokes.filter(s => s.points.length >= 2).map(s => { const a = s.points[0], b = s.points.at(-1); return Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI); });
  assert.ok(long.every(d => d > 40 && d < 80), long.join(' '));
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
