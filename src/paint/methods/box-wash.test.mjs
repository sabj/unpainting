// Neutral test washes: the same wash laid in each paint, on the same paper, with the reference constants and with the
// paint's own physics. Real sheet physics, small sheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, step, dry, deposit, fix, layersOf, DEFAULTS } from '../../media/sheet.mjs';
import { createBrush, dip, stroke } from '../../media/brush.mjs';
import { BOX, boxPigment, physicalPigment } from '../../crop/box.mjs';

const W = 80, H = 60, STEPS = 1500;
const region = f => { for (let y = 10; y < 50; y++) for (let x = 10; x < 70; x++) f(y * W + x); };
const paint = key => BOX.find(p => p.key === key);
const O = { ...DEFAULTS }; // the painter's sheet: each pigment granulates by its own gamma, no scale

/** Lay 0.035 of the paint in 0.1 of water over a block, dry it, and read the grain (coefficient of variation of the
 *  dried mass inside the block) and how much of the dried layer new water takes up. */
function wash(pigment) {
  const sheet = createSheet(makePaper(W, H, { seed: 7, mmPerCell: 0.259 }), [pigment]);
  region(i => deposit(sheet, i, 0.1, [0.035]));
  for (let k = 0; k < STEPS; k++) step(sheet, O);
  const vals = []; let water = 0;
  for (let y = 20; y < 40; y++) for (let x = 20; x < 60; x++) { const i = y * W + x; vals.push(sheet.D[0][i] + sheet.G[0][i] + sheet.P[0][i]); water += sheet.W[i]; }
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const cv = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) / mean;
  let total = 0; for (let i = 0; i < W * H; i++) total += sheet.D[0][i] + sheet.G[0][i] + sheet.P[0][i];
  fix(sheet);
  let before = 0; region(i => { before += sheet.layers.at(-1)[0][i]; });
  region(i => deposit(sheet, i, 0.1, null));
  for (let k = 0; k < 40; k++) step(sheet, O);
  let after = 0; region(i => { after += sheet.layers.at(-1)[0][i]; });
  return { cv, mean, total, water, lifted: 1 - after / before };
}

const results = {};
const get = (key, phys) => (results[`${key}${phys}`] ??= wash((phys ? physicalPigment : boxPigment)(paint(key))));

test('with physics off every paint lays the same grain and takes up the same share on rewet', () => {
  const a = get('ultramarine', false), b = get('phthaloblue', false);
  assert.ok(a.cv < 1.5 * b.cv && b.cv < 1.5 * a.cv, `grain ${a.cv.toFixed(4)} vs ${b.cv.toFixed(4)}`);
  assert.ok(Math.abs(a.lifted - b.lifted) < 0.25 * Math.max(a.lifted, b.lifted) + 1e-5, `rewet ${a.lifted} vs ${b.lifted}`);
});

test('with physics on, ultramarine and cerulean granulate and phthalo lays a smooth wash', () => {
  const um = get('ultramarine', true), ce = get('cerulean', true), ph = get('phthaloblue', true), off = get('phthaloblue', false);
  assert.ok(um.cv > 2.5 * ph.cv, `ultramarine grain ${um.cv.toFixed(4)} vs phthalo ${ph.cv.toFixed(4)}`);
  assert.ok(ce.cv > 2.5 * ph.cv, `cerulean grain ${ce.cv.toFixed(4)} vs phthalo ${ph.cv.toFixed(4)}`);
  assert.ok(ph.cv <= off.cv * 1.05, `phthalo is no rougher than the reference wash (${ph.cv.toFixed(4)} vs ${off.cv.toFixed(4)})`);
});

test('with physics on, phthalo stays put under new water and the granulating blues lift', () => {
  const um = get('ultramarine', true), ce = get('cerulean', true), ph = get('phthaloblue', true), hz = get('hansa', true);
  assert.ok(ph.lifted < um.lifted / 4 && ph.lifted < ce.lifted / 4, `lifted: phthalo ${ph.lifted}, ultramarine ${um.lifted}, cerulean ${ce.lifted}`);
  assert.ok(hz.lifted < um.lifted / 4, `hansa stains too: ${hz.lifted}`);
});

test('physics changes the sheet and not the amount of paint laid', () => {
  for (const k of ['ultramarine', 'phthaloblue']) {
    const on = get(k, true), off = get(k, false);
    // granulation moves paint about the sheet (into hollows, away from the wash's rim), so the whole sheet is weighed
    assert.ok(Math.abs(on.total - off.total) / off.total < 1e-3, `${k} mass ${on.total} vs ${off.total}`);
    assert.ok(on.water < 1e-3 && off.water < 1e-3, 'both washes dried');
  }
});

/** Where a dried wash sits against the paper: the correlation of dried mass with paper height inside the block
 *  (negative: in the hollows). The same paint and water, dried at `evap` times the sheet's drying rate. */
function hollowShare(pigment, evap, water = 0.1) {
  const paper = makePaper(W, H, { seed: 7, mmPerCell: 0.259 }), sheet = createSheet(paper, [pigment]);
  const o = { ...O, evap: O.evap * evap, edgeEvap: O.edgeEvap * evap };
  region(i => deposit(sheet, i, water, [0.035]));
  dry(sheet, 40000, o);
  const ids = []; for (let y = 20; y < 40; y++) for (let x = 20; x < 60; x++) ids.push(y * W + x);
  const m = layersOf(sheet).reduce((a, l) => { for (const i of ids) a[i] = (a[i] ?? 0) + l[0][i]; return a; }, {});
  const mx = ids.reduce((s, i) => s + m[i], 0) / ids.length, my = ids.reduce((s, i) => s + paper.height[i], 0) / ids.length;
  let sxy = 0, sxx = 0, syy = 0; for (const i of ids) { sxy += (m[i] - mx) * (paper.height[i] - my); sxx += (m[i] - mx) ** 2; syy += (paper.height[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}

test('a granulating paint settles into the hollows more as the wash dries more slowly, and a staining one does not', () => {
  const um = physicalPigment(paint('ultramarine')), ph = physicalPigment(paint('phthaloblue'));
  const slow = hollowShare(um, 0.4), fast = hollowShare(um, 3);
  assert.ok(slow < 0 && slow < fast, `ultramarine against paper height: slow ${slow.toFixed(3)}, fast ${fast.toFixed(3)}`);
  assert.ok(hollowShare(ph, 0.4) > slow + 0.2, 'phthalo blue does not gather in the hollows as ultramarine does');
});

/** Share of a brushed ultramarine wash's cell-to-cell variation that is a one-cell checkerboard: three flat lanes of
 *  an 8 mm flat, each into the last one's bead, on cold-press at the painter's 0.233 mm a cell, dried. */
function checkerShare(slideCap) {
  const MM = 0.2333, w = 111, h = 111, cp = { seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: MM, coldPress: { mmPerCell: MM, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } };
  const o = { ...O, fixedBed: 1, edgeEvap: 0.0012, slideCap }, sheet = createSheet(makePaper(w, h, cp), [physicalPigment(paint('ultramarine'))]);
  for (let b = 0; b < 3; b++) {
    const brush = createBrush({ flat: true, radius: 4 / MM, bristles: 24, loadWater: 160 / MM ** 2, belly: 12, give: 0.9, feed: 0.4, free: 0.4, film: 0.25, wetMix: 0.85, splay: 0.03, stiffness: 13, bridge: 0.98, bridgeSoft: 3, seed: 101 + b });
    dip(brush, { water: 150 / 160, conc: [0.35] });
    const y = (7 + b * 6.2) / MM; let n = 0;
    stroke(brush, sheet, [{ x: 3 / MM, y, p: 0.85, r: 4 / MM }, { x: 23 / MM, y, p: 0.85, r: 4 / MM }], { between: () => { if (++n % 8 === 0) step(sheet, o); } });
  }
  dry(sheet, 30000, o, { levelMax: 140, dt: 14 });
  const layers = layersOf(sheet), t = (x, y) => layers.reduce((s, l) => s + l[0][y * w + x], 0);
  let c2 = 0, d2 = 0;
  for (let y = 26; y < 77; y++) for (let x = 26; x < 86; x++) {
    const a = t(x, y), b = t(x + 1, y), c = t(x, y + 1), d = t(x + 1, y + 1);
    c2 += ((a - b - c + d) / 4) ** 2; d2 += ((a - b) ** 2 + (a - c) ** 2) / 2;
  }
  return Math.sqrt(c2 / d2);
}

test('granulation follows the tooth, not a grid: grains stop rolling when the slope is gone (the painter sheet, slideCap 1)', () => {
  const free = checkerShare(0), capped = checkerShare(1);
  assert.ok(capped < 0.8 * free, `checkerboard share capped ${capped.toFixed(3)} vs uncapped ${free.toFixed(3)}`);
});
