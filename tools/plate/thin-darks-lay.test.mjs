// The instrument for a thin dark: nothing where the sheet already shows the line, the point where it can lay the missing step, a pencil where it cannot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLine, lineShares, pencilFor, verdict, tolerance, STEP_TOLERANCE, RESTATING_PENCIL } from './thin-darks-lay.mjs';
import { stepOf, filmFor } from '../../src/paint/methods/point-swatch.mjs';
import { pencilScrapOver } from '../../src/paint/methods/pencil-scrap.mjs';

const PAPER = [252, 251, 248];
const palette = [{ name: 'dark', K: [1.6, 1.5, 1.2], S: [0.02, 0.02, 0.02] }, { name: 'blue', K: [1.4, 0.8, 0.2], S: [0.05, 0.05, 0.05] }];
// a point whose film is a tenth of its load, holding a line from load 0.2 to 8, 0.7 mm wide
const swatch = { widthMm: 0.7, lightest: { conc: 0.2, thickness: 0.02 }, heaviest: { conc: 8, thickness: 0.8 }, rows: [0.2, 0.5, 1, 2, 4, 8].map(conc => ({ conc, thickness: conc / 10, widthMm: 0.7, holds: true })) };
const env = { swatch, palette, paperRGB: PAPER };
const line = (over = {}) => ({ step: 24, halfMm: 0.6, rgb: [60, 55, 50], ...over });
const ground = [200, 170, 140];

test('the tolerance is three L*, or a quarter of the step where that is more', () => {
  assert.deepEqual({ ...STEP_TOLERANCE }, { lstar: 3, share: 0.25 });
  assert.equal(tolerance(8), 3); assert.equal(tolerance(24), 6);
  assert.equal(verdict(24, 24), 'within'); assert.equal(verdict(24, 29.9), 'within'); assert.equal(verdict(24, 31), 'over'); assert.equal(verdict(24, 17), 'under'); assert.equal(verdict(8, 4.9), 'under');
});

test('a line the sheet already shows is left alone', () => {
  const r = routeLine(line(), { drop: 19, groundRGB: ground }, env);
  assert.equal(r.route, 'stated'); assert.ok(Math.abs(r.need - 5) < 1e-9);
});

test('a line the point can lay takes the load whose film makes the missing step over this ground, in the line\'s own paints', () => {
  const r = routeLine(line(), { drop: 4, groundRGB: ground }, env);
  assert.equal(r.route, 'paint'); assert.equal(r.need, 20);
  assert.ok(Math.abs(r.predicted - 20) < 0.6, `the film is predicted to read ${r.predicted} L* over the ground`);
  assert.ok(Math.abs(r.shares.reduce((a, v) => a + v, 0) - 1) < 1e-9 && r.shares[0] > 0.5, `mostly the dark paint: ${r.shares}`);
  const film = filmFor(20, ground, palette, r.shares);
  assert.ok(Math.abs(r.conc - 10 * film) < 1e-6, `load ${r.conc} for a film of ${film}`);
  // over a darker ground the same step takes more paint
  const dark = routeLine(line({ step: 20 }), { drop: 0, groundRGB: [120, 100, 85] }, env);
  assert.ok(dark.route === 'paint' && dark.conc > r.conc, `${dark.conc} over the dark ground, ${r.conc} over the light`);
  assert.ok(Math.abs(stepOf(dark.conc / 10, [120, 100, 85], palette, dark.shares) - 20) < 0.6);
});

test('a line the point cannot lay goes to the pencil, with the reason', () => {
  const thin = routeLine(line({ halfMm: 0.4 }), { drop: 0, groundRGB: ground }, env);
  assert.equal(thin.route, 'pencil'); assert.match(thin.why, /too wide/);
  const faint = routeLine(line({ step: 4.5 }), { drop: 0, groundRGB: PAPER }, { ...env, swatch: { ...swatch, lightest: { conc: 2, thickness: 0.2 }, rows: swatch.rows.map(r => ({ ...r, holds: r.conc >= 2 })) } });
  assert.equal(faint.route, 'pencil'); assert.match(faint.why, /lighter than the lightest line/);
  const full = routeLine(line(), { drop: 0, groundRGB: ground }, { ...env, canPaint: false });
  assert.equal(full.route, 'pencil'); assert.match(full.why, /has its painted lines/);
  const none = routeLine(line(), { drop: 0, groundRGB: ground }, { ...env, swatch: { rows: [], lightest: null, widthMm: null } });
  assert.equal(none.route, 'pencil'); assert.match(none.why, /holds no line/);
  const black = routeLine(line({ step: 40 }), { drop: 0, groundRGB: [40, 38, 36] }, env);
  assert.equal(black.route, 'pencil'); assert.match(black.why, /cannot make the step/);
});

test('the line\'s paints are those of its colour over its ground: a blue line over a neutral ground takes the blue', () => {
  const s = lineShares([70, 110, 200], [200, 200, 200], PAPER, palette);
  assert.ok(s[1] > 0.6, `${s}`);
  assert.deepEqual(lineShares(PAPER, PAPER, PAPER, palette), [1, 0], 'a line of no colour takes the darkest paint');
});

test('the pencil presses by the table read over the ground, and a line beyond its firmest is drawn at the firmest and marked short', () => {
  const over = pencilScrapOver({ medium: RESTATING_PENCIL, mmPerCell: 0.26 }), white = over([255, 255, 255]), wash = over([120, 110, 100]);
  const a = pencilFor(8, 10, white), b = pencilFor(8, 10, wash);
  assert.ok(b.pressure > a.pressure, `${a.pressure} on paper, ${b.pressure} over the wash for the same step`);
  assert.ok(!a.short && !b.short && b.reach < a.reach);
  const far = pencilFor(30, 30, wash);
  assert.equal(far.pressure, 1); assert.ok(far.short, `the firmest line reads ${far.reach} L* over the wash`);
  const light = pencilFor(0.2, 5, white);
  assert.equal(light.pressure, white[0].pressure, 'never lighter than the lightest touch tried');
});

// A small painted sheet on the CPU: a dried wash, lines planned over it, the stage run as the painter runs it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, deposit, dry, layersOf, DEFAULTS } from '../../src/media/sheet.mjs';
import { createBrush, dip, stroke } from '../../src/media/brush.mjs';
import { renderLayers } from '../../src/media/km.mjs';
import { materialProfile } from '../../src/paint/methods/material-profiles.mjs';
import { layThinDarks } from './thin-darks-lay.mjs';

async function sheetWith(strokes, { graphite = true, wash = 0.25 } = {}) {
  const W = 200, H = 120, MM = 0.26, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thin-darks-lay-'));
  const PIGS = [{ name: 'umber', K: [0.9, 1.2, 1.7], S: [0.03, 0.03, 0.03], rho: 0.05, omega: 1.4, gamma: 0.1 }, { name: 'dark', K: [1.6, 1.5, 1.4], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0.1 }];
  const SHEET_PIGS = [...PIGS, ...(graphite ? [materialProfile('graphite-HB').pigment] : [])], paperOpts = { seed: 9, coldPress: { mmPerCell: MM }, mmPerCell: MM };
  const sheet = createSheet(makePaper(W, H, paperOpts), SHEET_PIGS), base = Buffer.alloc(W * H * 3, 250);
  for (let i = 0; i < W * H; i++) deposit(sheet, i, 0.5, [wash, 0, 0].slice(0, SHEET_PIGS.length));
  dry(sheet, 20000, DEFAULTS, { levelMax: 900 });
  const ctx = { sheet, THIN_DARKS_PLAN: { strokes, record: { paintedMax: 2 } }, PIGS, SHEET_PIGS, GRAPHITE: graphite ? SHEET_PIGS[2] : null, GRAPHITE_AT: 2, SC: 1, W2: W, H2: H, N2: W * H, out: dir,
    num: (name, d) => (name === 'sheetmm' ? W * MM : d), render: () => renderLayers(layersOf(sheet), SHEET_PIGS, base, W * H, 1), shoot: async () => {}, FILM_BY_PAINT: true, SEED: 0, paperRGB: [250, 250, 250],
    createBrush, dip, stroke, dry, O: DEFAULTS, PAPER_OPTS: paperOpts };
  const laid = await layThinDarks(ctx), record = JSON.parse(fs.readFileSync(path.join(dir, 'thin-darks.json'), 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  return { laid, lines: record.lines };
}
const planned = (y, over = {}) => ({ kind: 'dark-line', curve: Array.from({ length: 31 }, (_, k) => [25 + 5 * k, y + 0.04 * 5 * k]), measuredMm: 0.6, halfMm: 0.6, step: 20, sideL: 70, lengthMm: 39, od: 1, rgb: [70, 60, 55], fit: {}, ...over });

test('on a dried wash a wide line is painted and a hairline pencilled, each within the tolerance of its planned step', async () => {
  const { laid, lines } = await sheetWith([planned(30), planned(60, { step: 12, halfMm: 0.3 }), planned(90, { step: 9 })]);
  assert.equal(laid.found, 3); assert.equal(laid.stated, 0); assert.equal(laid.refused.lines, 0);
  assert.equal(laid.paint.lines, 2); assert.equal(laid.pencil.lines, 1);
  assert.equal(lines[1].route, 'pencil'); assert.match(lines[1].why, /too wide/);
  for (const l of lines) {
    const shown = l.drawn ?? l.painted;
    assert.ok(l.present < 2, `nothing along the line before: ${l.present} L*`);
    assert.ok(Math.abs(shown - l.step) <= tolerance(l.step), `${l.route}: planned ${l.step} L*, on the sheet ${shown}`);
    assert.equal(l.final, 'within');
  }
  assert.equal(laid.paint.within + laid.pencil.within, 3); assert.equal(laid.paint.over, 0);
});

test('the sheet takes its painted lines and no more, and without a pencil on it the rest are refused', async () => {
  const { laid, lines } = await sheetWith([planned(25), planned(50), planned(75), planned(100, { step: 1.5 })], { graphite: false });
  assert.equal(laid.paint.lines, 2); assert.equal(laid.pencil.lines, 0); assert.equal(laid.stated, 1);
  assert.equal(laid.refused.lines, 1); assert.equal(lines[2].refused, 'no pencil on this sheet'); assert.match(lines[2].why, /has its painted lines/);
});
