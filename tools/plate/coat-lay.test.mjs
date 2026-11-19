// The brush's load for a coat stroke: paste and tint for a light; for a dark, the strand's own paint at the load a swatch of
// the dry brush says adds the step the subject's strands show, over the sheet as it stands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lightLoad, strandLoad, measureDryDark, LOAD, SWATCH_PRESSURE } from './coat-lay.mjs';
import { FIRST_PASS, tolerance } from './thin-darks-lay.mjs';
import { measurePoint } from '../../src/paint/methods/point-swatch.mjs';
import { BRUSH_SETTINGS } from '../../src/paint/methods/brush-swatch.mjs';
import { GOUACHE_FILM, tintedGouache } from '../../src/media/gouache.mjs';

const palette = [{ K: [1.6, 1.5, 1.2] }, { K: [0.4, 0.8, 2.2] }, { K: [0.2, 0.7, 1.9] }];
const PAPER = [252, 251, 248];

test('a light stroke is loaded with white paste and the pot of tint in the share its colour asks for', () => {
  const pot = tintedGouache([170, 175, 190], PAPER);
  const mid = lightLoad({ rgb: [170, 175, 190] }, PAPER, pot, 3, 4, 5).conc;
  assert.equal(mid.length, 5); assert.ok(Math.abs(mid[3] + mid[4] - GOUACHE_FILM * LOAD) < 1e-6, 'one paste in all');
  assert.ok(mid[4] > 0.9 * GOUACHE_FILM * LOAD, 'the pot as it is for the colour it was made for');
  const lighter = lightLoad({ rgb: [235, 235, 238] }, PAPER, pot, 3, 4, 5).conc;
  assert.ok(lighter[3] > lighter[4], 'a lighter strand takes more white');
  const white = lightLoad({ rgb: [250, 250, 247] }, PAPER, pot, 3, 4, 5).conc;
  assert.ok(white[4] < 0.05 * GOUACHE_FILM * LOAD, 'a true white takes none of the tint');
  assert.equal(lightLoad({ rgb: null }, PAPER, pot, 3, 4, 5).conc[4], 0);
});

const MM = 0.2333, RADIUS = 2, WHITE = [252, 252, 252];
// the swatch's own paint as the whole palette, so a load can be laid again on a scrap and read
const dark = [{ name: 'dark', K: [1.2, 1.1, 0.9], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0.1 }];
const swatch = measureDryDark({ mmPerCell: MM, radiusCells: RADIUS });
const strand = { step: 14, L: 55, rgb: [120, 110, 100] };

test('the dry brush is tried with dark paint on a scrap: it breaks on the tooth and every load that leaves paint counts', () => {
  assert.ok(swatch.rows.every(r => r.holds && r.drop > 0), JSON.stringify(swatch.rows));
  assert.ok(swatch.rows.some(r => r.held < 0.9), 'a dry brush does not hold an unbroken line');
  for (let k = 1; k < swatch.rows.length; k++) assert.ok(swatch.rows[k].thickness >= swatch.rows[k - 1].thickness);
  assert.equal(swatch.settings.radiusCells, RADIUS); assert.equal(swatch.settings.pressure, SWATCH_PRESSURE);
});

test('a dark stroke is laid for the step the strands show, less what the sheet shows, and never past the strand itself', () => {
  const on = { swatch, palette: dark, paperRGB: WHITE }, ground = [225, 222, 215];
  const full = strandLoad(strand, { drop: 0, on: 88, groundRGB: ground }, on);
  assert.ok(full.lay && full.need === 14 && full.conc > 0, JSON.stringify(full));
  assert.ok(Math.abs(full.predicted - FIRST_PASS * 14) < 0.2, `the first pass is laid for ${FIRST_PASS} of the step: ${full.predicted}`);
  assert.deepEqual(full.shares, [1]);
  const part = strandLoad(strand, { drop: 6, on: 88, groundRGB: ground }, on);
  assert.ok(part.lay && part.need === 8 && part.conc < full.conc, 'a sheet that shows part of the step takes the rest');
  const stated = strandLoad(strand, { drop: 12, on: 88, groundRGB: ground }, on);
  assert.ok(!stated.lay && /already shows/.test(stated.why), JSON.stringify(stated));
  const near = strandLoad(strand, { drop: 0, on: 63, groundRGB: [150, 148, 140] }, on);
  assert.ok(near.lay && near.need === 8, 'a ground 8 L* lighter than the strand takes 8, not the strands\' 14');
  const darkGround = strandLoad(strand, { drop: 0, on: 57, groundRGB: [135, 133, 126] }, on);
  assert.ok(!darkGround.lay && /as dark as the strand/.test(darkGround.why), JSON.stringify(darkGround));
  assert.ok(tolerance(14) >= 3);
  assert.equal(strandLoad({ ...strand, step: undefined }, { drop: 0, on: 88, groundRGB: ground }, on).lay, false, 'no step planned, no stroke');
});

test('the load asked for a step leaves that step when the brush lays it: twice the film is not laid, nor a third of it', () => {
  // the step over white paper, both passes at once, laid again by the same brush on a fresh scrap and read as the sheet is
  for (const step of [6, 12, 24]) {
    const r = strandLoad({ step: step / FIRST_PASS, L: 20, rgb: strand.rgb }, { drop: 0, on: 96, groundRGB: WHITE }, { swatch, palette: dark, paperRGB: WHITE });
    assert.ok(r.lay, JSON.stringify(r));
    const { water, ...brush } = BRUSH_SETTINGS, again = measurePoint({ mmPerCell: MM, seed: 5, loads: [r.conc], point: { radiusMm: RADIUS * MM, water, pressure: SWATCH_PRESSURE, brush }, hold: 0 });
    assert.ok(Math.abs(again.rows[0].drop - step) <= tolerance(step), `planned ${step} L*, the brush laid ${again.rows[0].drop} on another scrap`);
  }
});
