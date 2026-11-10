// Neutral test washes: the same wash laid in each paint, on the same paper, with the reference constants and with the
// paint's own physics. Real sheet physics, small sheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, step, deposit, fix, DEFAULTS } from '../../media/sheet.mjs';
import { BOX, boxPigment, physicalPigment } from '../../crop/box.mjs';

const W = 80, H = 60, STEPS = 1500;
const region = f => { for (let y = 10; y < 50; y++) for (let x = 10; x < 70; x++) f(y * W + x); };
const paint = key => BOX.find(p => p.key === key);
const O = { ...DEFAULTS, gran: 0.25 };

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
  fix(sheet);
  let before = 0; region(i => { before += sheet.layers.at(-1)[0][i]; });
  region(i => deposit(sheet, i, 0.1, null));
  for (let k = 0; k < 40; k++) step(sheet, O);
  let after = 0; region(i => { after += sheet.layers.at(-1)[0][i]; });
  return { cv, mean, water, lifted: 1 - after / before };
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
    assert.ok(Math.abs(on.mean - off.mean) / off.mean < 0.05, `${k} mass ${on.mean} vs ${off.mean}`);
    assert.ok(on.water < 1e-3 && off.water < 1e-3, 'both washes dried');
  }
});
