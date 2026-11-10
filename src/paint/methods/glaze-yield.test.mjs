// A dried base wash, then one, two and three glazes over it on cold-press scrap, laid and charged the way
// tools/paint-plate.mjs lays a value plan's shadow glaze at 1200 cells across a 280 mm sheet: one flat-brush gesture
// clipped to the shape, the plan's own brush load and pass count, the charge factor from the instrument calibration.
// Each layer is its own pigment index, so every glaze's pigment is followed from the brush to the dried sheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, step, dry, thickness, setClip, DEFAULTS } from '../../media/sheet.mjs';
import { createBrush, dip, stroke } from '../../media/brush.mjs';
import { washPaths, openEdgeShare } from '../../media/wash.mjs';
import { scaleBrushForDensity } from '../../media/brush-density.mjs';
import { shapedPlanePaths } from '../techniques/shaped-marks.mjs';
import { passageMaterial } from '../techniques/passage-plan.mjs';
import { valueTechnique } from './light-to-dark.mjs';
import { SWATCH, swatchMask, scrapDelivery, chargeFactor } from './scrap-swatch.mjs';
import { createInstrumentCal } from './instrument-cal.mjs';

const WIDTH = 1200, MM = 280 / WIDTH, STRENGTH = 2.2, CHUNK = Math.round(Math.max(6, 24 * WIDTH / 1086));
const PIGMENT = { K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 };
const PHYSICS = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, gran: 0.25, granFill: 0 };
// the wash brush of paint-plate's lay loop and of its swatch, under --loadedcontact 1 (a loaded brush reaches every pit)
const washBrush = (r, T, seed = 31) => createBrush(scaleBrushForDensity({ flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: T.wetMix, bridge: 0, bridgeSoft: T.bridgeSoft, seed }, { renderWidth: WIDTH }));
const waterBrush = r => createBrush(scaleBrushForDensity({ flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, seed: 5 }, { renderWidth: WIDTH }));

const STOCK = [
  { name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, passes: 1 },
  { name: 'glazed', water: 0.58, wetMix: 0.3, bridge: 0.82, bridgeSoft: 2.4, intoWet: false, passes: 2 },
];
function calibration() {
  const mask = swatchMask(), paths = washPaths(mask, SWATCH.width, SWATCH.height, { pad: 1.5, minRadius: 1, minLength: 3 });
  const lay = T => scrapDelivery(T, { mask, paths, pigment: PIGMENT, physics: PHYSICS, paperOptions: { seed: 5, scale: 1, toothScale: 0.2, proudBlur: 1 }, charge: SWATCH.want * STRENGTH, upright: 'sweep', water: t => t.water, paintBrush: (r, t) => washBrush(r, t, 11), waterBrush, dip, stroke, step, dry });
  const reading = T => { const graded = lay({ ...T, chunk: CHUNK }); return { cal: chargeFactor(lay(T).delivered), graded: { all: graded.all, escape: graded.escape, edge: graded.edge } }; };
  return createInstrumentCal({ stock: Object.fromEntries(STOCK.map(T => [T.name, { technique: T, ...reading(T) }])), measure: reading });
}

/** Lays the base and the glazes; returns per layer what was booked, left the brush, landed and stayed, over the booking. */
function stack(cal, { glazes = 3, baseAmount = 0.1, glazeAmount = 0.2 } = {}) {
  const W = 200, H = 110, n = W * H, mask = new Uint8Array(n), box = { x0: 40, y0: 35, x1: 159, y1: 74 };
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) mask[y * W + x] = 1;
  const cells = (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1), K = glazes + 1;
  const sheet = createSheet(makePaper(W, H, { mmPerCell: MM, seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, coldPress: { mmPerCell: MM, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } }), Array.from({ length: K }, () => PIGMENT));
  const [pts] = shapedPlanePaths(mask, W, H, { scale: 1, box, mmPerCell: MM, maxBrushMm: 38 });
  const open = openEdgeShare(mask, W, H, box);
  // paint-plate's charge for a value-plan passage: the recharged swatch over its whole scrap, less the passage's open edge
  const factor = c => (c.graded ? 1 / Math.max(0.02, c.graded.all * (1 - Math.min(0.6, c.graded.escape * open / Math.max(1e-6, c.graded.edge)))) : c.cal);
  const held = () => thickness(sheet).map(a => { let inside = 0, outside = 0; for (let i = 0; i < n; i++) if (mask[i]) inside += a[i]; else outside += a[i]; return { inside, outside }; });
  const carried = b => Array.from({ length: K }, (_, k) => b.resP[k] + b.hairs.reduce((a, hr) => a + hr.pig[k], 0));
  const rows = [];
  const lay = (k, T, amount) => {
    dry(sheet, 30000, PHYSICS, { levelMax: 140, dt: 2 });
    const before = held(), booked = amount * cells, conc = new Array(K).fill(0);
    conc[k] = amount * STRENGTH * factor(cal.of(T));
    const b = washBrush(Math.max(1, ...pts.map(p => p.r)), T);
    let released = 0, lifted = 0, st = 0;
    setClip(sheet, mask);
    for (let pass = 0; pass < T.passes; pass++) {
      dip(b, { water: T.water, conc });
      const p0 = carried(b);
      stroke(b, sheet, pts, { upright: 'sweep', spacing: 1.4, lift: true, between: () => { if (++st % 12 === 0) step(sheet, PHYSICS); } });
      const p1 = carried(b);
      released += p0[k] - p1[k];
      for (let j = 0; j < K; j++) if (j !== k) lifted += p1[j] - p0[j];
    }
    setClip(sheet, null);
    const wet = held();
    dry(sheet, 30000, PHYSICS, { levelMax: 140, dt: 2 });
    const dried = held();
    rows.push({ released: released / booked, landedWet: (wet[k].inside + wet[k].outside) / booked, inside: dried[k].inside / booked, outside: dried[k].outside / booked, lifted: lifted / booked,
      below: before.slice(0, k).map((s, j) => (dried[j].inside - s.inside) / s.inside) });
  };
  lay(0, valueTechnique({ phase: 'mid', move: 'wet on dry', load: { water: passageMaterial({ phase: 'mid', fallbackMove: 'wet on dry' }).water } }), baseAmount);
  const glaze = valueTechnique({ phase: 'shadow', move: 'wet on dry', load: { water: passageMaterial({ phase: 'shadow', fallbackMove: 'wet on dry' }).water } });
  for (let g = 1; g <= glazes; g++) lay(g, glaze, glazeAmount);
  return { rows, glaze };
}

test('stacked plan glazes land what the ledger books for them, as the base wash does', () => {
  const { rows, glaze } = stack(calibration());
  assert.equal(glaze.name, 'glazed');
  assert.equal(glaze.passes, 1);
  const [base, ...glazes] = rows;
  for (const [g, row] of glazes.entries()) {
    const label = `glaze ${g + 1}: ${JSON.stringify(row)}`;
    // conservation: all the pigment that left the brush is on the sheet wet, and still inside the shape dry
    assert.ok(Math.abs(row.landedWet - row.released) < 1e-3, `lost in deposition, ${label}`);
    assert.ok(Math.abs(row.inside + row.outside - row.released) < 1e-3, `lost in drying, ${label}`);
    assert.ok(Math.abs(row.outside) < 1e-3, `pushed outside the shape, ${label}`);
    assert.ok(Math.abs(row.lifted) < 1e-3, `lifted from the layers below, ${label}`);
    for (const change of row.below) assert.ok(Math.abs(change) < 1e-3, `a layer below moved, ${label}`);
    // delivery: a glaze keeps the same share of its booking as the wet-on-dry base laid by the same gesture
    assert.ok(Math.abs(row.inside / base.inside - 1) < 0.1, `a glaze holds ${row.inside.toFixed(3)} of its booking, the base wash ${base.inside.toFixed(3)}`);
  }
});
