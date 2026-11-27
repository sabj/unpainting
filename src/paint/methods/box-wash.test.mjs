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
  // Isolate pigment grain from centimetre-scale pooling in a buckled sheet.
  const sheet = createSheet(makePaper(W, H, { seed: 7, cockle: { rmsMm: 0 }, mmPerCell: 0.259 }), [pigment]);
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
  // With residence-dependent grain sorting on unbuckled paper: ultramarine 0.156, cerulean 0.155,
  // phthalo 0.107, reference 0.108. The same bound holds without counting cockle's pooling as grain.
  assert.ok(um.cv > 1.15 * ph.cv, `ultramarine grain ${um.cv.toFixed(4)} vs phthalo ${ph.cv.toFixed(4)}`);
  assert.ok(ce.cv > 1.15 * ph.cv, `cerulean grain ${ce.cv.toFixed(4)} vs phthalo ${ph.cv.toFixed(4)}`);
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

/** Where a dried wash sits against the paper: the dried mass's change per standard deviation of paper height, as a
 *  share of its mean, inside the block (negative: in the hollows). The same paint and water, dried at `evap` times the
 *  sheet's drying rate. It was the correlation, which is blind to how much: a level film stands deeper over a hollow
 *  (the slope term in the flow), so even a staining paint's faint variation follows the height (-0.90 for phthalo
 *  against -0.86 for ultramarine), while its amount is a fifth of ultramarine's (-0.07 against -0.37). */
function hollowShare(pigment, evap, water) {
  const paper = makePaper(W, H, { seed: 7, cockle: { rmsMm: 0 }, mmPerCell: 0.259 }), sheet = createSheet(paper, [pigment]);
  const o = { ...O, evap: O.evap * evap, edgeEvap: O.edgeEvap * evap };
  region(i => deposit(sheet, i, water, [0.035]));
  dry(sheet, 40000, o);
  const ids = []; for (let y = 20; y < 40; y++) for (let x = 20; x < 60; x++) ids.push(y * W + x);
  const m = layersOf(sheet).reduce((a, l) => { for (const i of ids) a[i] = (a[i] ?? 0) + l[0][i]; return a; }, {});
  // against the surface granulating pigment settles and rolls on (paper.grainH, src/media/grain-field.mjs)
  const z = paper.grainH, mx = ids.reduce((s, i) => s + m[i], 0) / ids.length, my = ids.reduce((s, i) => s + z[i], 0) / ids.length;
  let sxy = 0, sxx = 0, syy = 0; for (const i of ids) { sxy += (m[i] - mx) * (z[i] - my); sxx += (m[i] - mx) ** 2; syy += (z[i] - my) ** 2; }
  return sxy / syy / mx * Math.sqrt(syy / ids.length);
}

test('a pooled granulating paint gathers in the hollows more than a thin pass, slow or fast; a staining one far less', () => {
  // A 0.3 mm pool supports grain sorting while it stands; a 0.04 mm pass soon disconnects among the fibres.
  // Equal pigment loading rules out dilution. At both drying rates the pool must retain a strong hollow bias,
  // and more than the thin pass. Before the residence fix the two were nearly alike.
  const um = physicalPigment(paint('ultramarine')), ph = physicalPigment(paint('phthaloblue'));
  const slow = hollowShare(um, 0.4, 0.3), fast = hollowShare(um, 3, 0.3);
  assert.ok(slow < -0.15 && fast < -0.15, `ultramarine against the grain field: slow ${slow.toFixed(3)}, fast ${fast.toFixed(3)}`);
  for (const [evap, pooled] of [[0.4, slow], [3, fast]]) {
    const thin = hollowShare(um, evap, 0.04), stain = hollowShare(ph, evap, 0.3);
    assert.ok(Math.abs(pooled) > 2 * Math.abs(thin), `drying ${evap}: pooled ${pooled.toFixed(3)} vs thin ${thin.toFixed(3)}`);
    assert.ok(Math.abs(stain) < Math.abs(pooled) / 2, `drying ${evap}: phthalo ${stain.toFixed(3)} against ultramarine ${pooled.toFixed(3)}`);
  }
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

// Uncorrelated cell noise has a checkerboard share of sqrt(1/8) = 0.354; a grid artefact sits above it. The test used to
// require the cap to cut the uncapped sheet's share by a fifth, but since the drying flow (69ad01f1 and on) and the
// cell-averaged relief neither sheet makes a grid: both read 0.30 (capped 0.297, uncapped 0.296). What is held now is
// the property itself, on both: no checkerboard beyond noise.
test('granulation follows the tooth, not a grid: no one-cell checkerboard beyond uncorrelated noise, with or without the slide cap', () => {
  const free = checkerShare(0), capped = checkerShare(1), noise = Math.sqrt(1 / 8);
  assert.ok(capped < 0.9 * noise && free < 0.9 * noise, `checkerboard share capped ${capped.toFixed(3)}, uncapped ${free.toFixed(3)}, noise ${noise.toFixed(3)}`);
});
