import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness, step, dry, DEFAULTS } from '../../media/sheet.mjs';
import { createBrush, dip, stroke } from '../../media/brush.mjs';
import { sweepCover, footprintSpread } from '../../media/wash.mjs';
import { SWATCH, swatchMask, swatchLanes, sweepPressure, scrapDelivery, chargeFactor } from './scrap-swatch.mjs';
import { LANE_OVERLAP, FLAT_OVERLAP } from './wash-strokes.mjs';

// The 64-cell plan-optics piece: 2.3 mm cells on the sheet's cold-press paper.
const MM = 2.309, strength = 2.2;
const paperOptions = { mmPerCell: MM, seed: 5, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, coldPress: { mmPerCell: MM, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } };
const pigment = { name: 'p', K: [0.5, 0.3, 0.1], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0 };
const T = { name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, passes: 1 };
// the painter's wash brush (tools/plate/paint.mjs), as a section brush
const brushOf = (r, flat) => createBrush({ model: 'section', flat, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: T.wetMix, bridge: T.bridge, bridgeSoft: T.bridgeSoft, seed: 11 });
const flow = sheet => st => { if (st % 24 === 0) step(sheet, DEFAULTS); };
// charged as the painter charges a passage: for its sweeps' overlap and for all the paper they brush
const chargeOver = (paths, mask, w, h) => { const cover = sweepCover(paths, mask, w, h); return 1 / Math.max(0.4, Math.min(1, cover)) / Math.max(1, cover) / Math.max(1, footprintSpread(paths, mask, w, h)); };

for (const [name, R, flat] of [['a #12 round', 3.5 / MM, false], ['a 1 in flat', 12.7 / MM, true]]) {
  test(`the swatch predicts what a five-sweep wash of ${name} lays a unit area, to 10%`, () => {
    const overlap = flat ? FLAT_OVERLAP : LANE_OVERLAP, mask = swatchMask(), paths = swatchLanes(R, { overlap });
    const swatch = scrapDelivery(T, { mask, paths, pigment, physics: DEFAULTS, paperOptions, charge: SWATCH.want * strength * chargeOver(paths, mask, SWATCH.width, SWATCH.height), upright: 'sweep', water: t => t.water, dip, stroke, step, dry, paintBrush: r => brushOf(r, flat), waterBrush: r => brushOf(r, true) });
    const factor = chargeFactor(swatch.delivered);
    // five sweeps 120 mm long, side by side as the swatch's lanes lie (the plan's overlap, or a little more where the
    // square takes a whole number of lanes), charged by the swatch
    const L = Math.round(120 / MM), gap = paths[1][0].y - paths[0][0].y, x0 = 8, y0 = 8, W = L + 16, H = Math.ceil(2 * R + 4 * gap + 16);
    const lanes = Array.from({ length: 5 }, (_, q) => Array.from({ length: L + 1 }, (_, k) => ({ x: x0 + k, y: y0 + R + q * gap, r: R, p: sweepPressure(k / L) })));
    const wash = new Uint8Array(W * H); for (let y = y0; y < Math.round(y0 + 2 * R + 4 * gap); y++) for (let x = x0; x < x0 + L; x++) wash[y * W + x] = 1;
    const sheet = createSheet(makePaper(W, H, paperOptions), [pigment]), conc = SWATCH.want * strength * factor * chargeOver(lanes, wash, W, H);
    for (const pts of lanes) { const b = brushOf(R, flat); dip(b, { water: T.water, conc: [conc] }); stroke(b, sheet, pts, { upright: 'sweep', between: flow(sheet) }); }
    for (let q = 0; q < 60; q++) step(sheet, DEFAULTS);
    dry(sheet, 20000, DEFAULTS, { levelMax: 400, dt: 4 });
    const th = thickness(sheet)[0]; let got = 0, cells = 0; for (let i = 0; i < th.length; i++) if (wash[i]) { got += th[i]; cells++; }
    const laid = got / cells / SWATCH.want;
    assert.ok(Math.abs(laid - 1) < 0.1, `the wash lays ${laid.toFixed(3)} of what the swatch predicts`);
    assert.ok(swatch.escape < 0.1, `${(100 * swatch.escape).toFixed(0)}% of the swatch's paint lands past its edges`);
  });
}

test('the swatch is laid in lanes that cover its square edge to edge at the given overlap', () => {
  const R = 3, lanes = swatchLanes(R, { overlap: 1 / 3 }), ys = lanes.map(l => l[0].y);
  assert.equal(ys[0], SWATCH.y0 + R); assert.equal(ys.at(-1), SWATCH.y1 - R);
  for (let q = 1; q < ys.length; q++) assert.ok(ys[q] - ys[q - 1] <= 2 * R * (2 / 3) + 1e-9);
  for (const l of lanes) { assert.equal(l[0].x, SWATCH.x0); assert.equal(l.at(-1).x, SWATCH.x1); assert.ok(l[0].p < 0.3 && l.at(-1).p < 0.3 && l[Math.floor(l.length / 2)].p === 1); }
});
