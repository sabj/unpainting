// A dried base wash, then one, two and three glazes over it on cold-press scrap, laid and charged the way
// tools/paint-plate.mjs lays a value plan's shadow glaze at 1200 cells across a 280 mm sheet: one flat-brush gesture
// clipped to the shape, the plan's own brush load and pass count, the charge factor from the instrument calibration.
// Each layer is its own pigment index, so every glaze's pigment is followed from the brush to the dried sheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, step, dry, thickness, setClip, coherent, applyResist, liftResist, DEFAULTS } from '../../media/sheet.mjs';
import { createBrush, dip, stroke } from '../../media/brush.mjs';
import { washPaths, openEdgeShare } from '../../media/wash.mjs';
import { scaleBrushForDensity } from '../../media/brush-density.mjs';
import { shapedPlanePaths } from '../techniques/shaped-marks.mjs';
import { passageMaterial } from '../techniques/passage-plan.mjs';
import { valueTechnique, planLightToDark } from './light-to-dark.mjs';
import { narrowestMarkMm } from './brush-marks.mjs';
import { roleBrushPointMm } from './brush-footprint.mjs';
import { attachGpu, gpuStats } from '../../media/gpu/link.mjs';
import { fileURLToPath } from 'node:url';
import { SWATCH, swatchMask, scrapDelivery, chargeFactor } from './scrap-swatch.mjs';
import { createInstrumentCal } from './instrument-cal.mjs';

const WIDTH = 1200, MM = 280 / WIDTH, STRENGTH = 2.2, CHUNK = Math.round(Math.max(6, 24 * WIDTH / 1086));
const PIGMENT = { K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 };
const PHYSICS = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, gran: 0.25, granFill: 0 };
// the wash brush of paint-plate's lay loop and of its swatch, under --loadedcontact 1 (a loaded brush reaches every pit)
const washBrush = (r, T, seed = 31, renderWidth = WIDTH) => createBrush(scaleBrushForDensity({ flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: T.wetMix, bridge: 0, bridgeSoft: T.bridgeSoft, seed }, { renderWidth }));
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
    // a full brush's lifted end stands wet at the shape's edge, and a tenth of a percent creeps one cell past it as it
    // dries (033 drying2: free liquid goes by contact, 0.103%; the bound was 0.1%)
    assert.ok(Math.abs(row.outside) < 2e-3, `pushed outside the shape, ${label}`);
    assert.ok(Math.abs(row.lifted) < 1e-3, `lifted from the layers below, ${label}`);
    for (const change of row.below) assert.ok(Math.abs(change) < 1e-3, `a layer below moved, ${label}`);
    // delivery: a glaze keeps the same share of its booking as the wet-on-dry base laid by the same gesture
    assert.ok(Math.abs(row.inside / base.inside - 1) < 0.1, `a glaze holds ${row.inside.toFixed(3)} of its booking, the base wash ${base.inside.toFixed(3)}`);
  }
});

// The two coupons below hold the planner's brush floor on the physical sheet. The narrowest mark the detail brush lays is the
// larger of its point's laid width and four cells (brush-marks.mjs), so the forms here are that wide in whole cells: the
// planner asks for paint at that width, the fitted gesture lays it, and a light of that width is left.
const POINT_MM = roleBrushPointMm(fileURLToPath(new URL('../../..', import.meta.url)), 'detail');
const markCells = cellMm => Math.ceil(narrowestMarkMm(POINT_MM, cellMm) / cellMm - 1e-9);
const coldPress = (w, h, mm) => makePaper(w, h, { mmPerCell: mm, seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } });
const quiet = run => { const log = console.log; console.log = () => {}; try { return run(); } finally { console.log = log; } };
/** Lays one planned shape as paint-plate does: clipped to its mask, one fitted gesture per path, the brush as wide as the path. */
function layShape(sheet, sh, w, h, mm, hold, renderWidth) {
  const T = valueTechnique(sh._valuePlan), paths = shapedPlanePaths(sh.mask, w, h, { mmPerCell: mm, protect: hold });
  setClip(sheet, sh.mask);
  for (const pts of paths) {
    const b = washBrush(Math.max(1, ...pts.map(p => p.r)), T, 31, renderWidth);
    dip(b, { water: T.water, conc: [sh.amount] });
    stroke(b, sheet, pts, { upright: 'sweep', spacing: 1.4, lift: true });
  }
  return paths.length;
}

// A mid-value line `cells` wide on bare paper beside a dark block that sets the value scale, with a reserved gap across it,
// planned band by band. Its middle paint belongs to band 3, the detail brush's; band 2 is the floor brush's.
function thinLine(form, cells) {
  const w = 180, h = 240, n = w * h, density = new Float32Array(n), hold = new Uint8Array(n);
  const center = y => 110 + (form === 'diagonal' ? Math.round((y - 120) / 5) : form === 'curved' ? Math.round(14 * Math.sin((y - 20) / 200 * Math.PI)) : 0);
  for (let y = 20; y < 220; y++) for (let x = 20; x < 70; x++) density[y * w + x] = 0.8;
  for (let y = 20; y < 220; y++) {
    for (let x = center(y); x < center(y) + cells; x++) density[y * w + x] = 0.4;
    if (y >= 110 && y < 120) for (let x = center(y) - 3; x < center(y) + cells + 3; x++) hold[y * w + x] = 1;
  }
  const plan = quiet(() => planLightToDark({ w, h, k: 1, density, demand: density.slice(), hold, shaped: true, shadowThresh: 0.9, sheetWidthMm: w * MM }));
  const mid = plan.layers.filter(l => l._valuePhase === 'mid').flatMap(l => l.shapes);
  const onLine = sh => { for (let y = 20; y < 220; y++) for (let x = center(y); x < center(y) + cells; x++) if (sh.mask[y * w + x]) return true; return false; };
  return { w, h, hold, center, mid, onLine };
}

test('mid paint as wide as the narrowest mark deposits continuously on the physical sheet and keeps a reserved gap', { timeout: 120000 }, t => {
  const cells = markCells(MM);
  assert.equal(cells, 4, 'four cells govern at 0.233 mm a cell');
  // One cell under the narrowest mark the line is the pen's or the pencil's, and the planner holds no middle passage on it.
  // Stated for the straight line: the planner reads a shape's width from its second moments (minorWidth), which is the
  // width of a straight piece and more than the width of a bent one.
  const under = thinLine('straight', cells - 1);
  assert.equal(under.mid.filter(under.onLine).length, 0, 'a line one cell under the narrowest mark gets no middle passage');
  for (const backend of ['cpu', 'gpu']) {
    for (const form of ['straight', 'diagonal', 'curved']) {
      const { w, h, hold, center, mid, onLine } = thinLine(form, cells);
      const own = mid.filter(onLine);
      assert.ok(own.length > 0, `${form}: the plan holds a middle passage on the line`);
      assert.ok(own.every(sh => /^mid\/b3\//.test(sh._valuePlan.id)), `${form}: in the detail brush's band`);
      const sheet = createSheet(coldPress(w, h, MM), [PIGMENT]);
      if (backend === 'gpu') {
        const info = attachGpu(sheet, PHYSICS, { mode: 'auto', log: () => {} });
        if (info.backend !== 'gpu') { t.skip('no GPU for physical thin-plane coupon'); return; }
        assert.equal(info.fallback, false);
        t.diagnostic('physical coupon backend GPU, ' + form);
      }
      try {
        for (const sh of mid) assert.ok(layShape(sheet, sh, w, h, MM, hold, WIDTH) > 0, `${form}: a fitted gesture for ${sh._valuePlan.id}`);
        setClip(sheet, null);
        dry(sheet, 30000, PHYSICS, { levelMax: 140, dt: 2 });
        coherent(sheet);
        const pigment = thickness(sheet)[0];
        let rows = 0, minRow = Infinity;
        for (let y = 30; y < 210; y++) {
          if (y >= 106 && y < 124) continue;
          let total = 0;
          for (let x = center(y); x < center(y) + cells; x++) total += pigment[y * w + x];
          assert.ok(total > 0, `${backend} ${form} has deposited paint at row ${y}`);
          minRow = Math.min(minRow, total);
          rows++;
        }
        for (let y = 113; y < 117; y++) for (let x = center(y); x < center(y) + cells; x++) assert.equal(pigment[y * w + x], 0, 'reserved gap remains bare');
        t.diagnostic(JSON.stringify({ backend, form, cells, rows, minDepositedRow: minRow, gpu: backend === 'gpu' ? gpuStats(sheet) : null }));
      } finally { sheet._gpu?.close(); }
    }
  }
});

// The darks are the detail brush's work. On a mid-tone ground beside a dark block: a dark line as wide as the narrowest mark,
// with a reserved gap across it, and a light channel as wide as the narrowest mark inside the dark block. Every layer of the
// plan is laid and dried in order, as the painter does. The dark bands develop the line over the ground, both dark glazes go
// round the channel, and the pale layers under them still carry it. At 1200 cells across 280 mm the mark is four cells
// (0.93 mm); at 2448 the point governs and it is five (0.57 mm), so the finer sheet holds the finer form.
test('the dark bands physically develop a dark form and leave a light channel as wide as the narrowest mark, at two densities', { timeout: 240000 }, t => {
  for (const nativeWidth of [1200, 2448]) {
    const w = Math.round(70 * nativeWidth / 280), h = Math.round(42 * nativeWidth / 280), mm = 70 / w, n = w * h, cells = markCells(mm);
    const col = x => Math.round(x / mm), darkX = col(33), lightX = col(7);
    const density = new Float32Array(n).fill(0.4), hold = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, X = (x + 0.5) * mm, Y = (y + 0.5) * mm, tall = Y > 5 && Y < 37;
      if (X < 14) density[i] = 0.8;
      if (tall && x >= darkX && x < darkX + cells) { density[i] = 0.65; if (Y > 20 && Y < 22) hold[i] = 1; }
      if (tall && x >= lightX && x < lightX + cells) density[i] = 0.15;
    }
    const plan = quiet(() => planLightToDark({ w, h, k: 1, density, demand: density.slice(), hold, shaped: true, sheetWidthMm: 70,
      calibratedPlan: true, cellLight: false, massTone: false, layers: 4 }));
    const sheet = createSheet(coldPress(w, h, mm), [PIGMENT]);
    const info = attachGpu(sheet, PHYSICS, { mode: 'auto', log: () => {} });
    if (info.backend !== 'gpu') { t.skip('no GPU for physical multiscale coupon'); return; }
    assert.equal(info.fallback, false);
    try {
      applyResist(sheet, hold); // Explicit essential reserve, as in the production film lifecycle.
      for (const layer of plan.layers) {
        for (const sh of layer.shapes) layShape(sheet, sh, w, h, mm, hold, nativeWidth);
        setClip(sheet, null);
        dry(sheet, 30000, PHYSICS, { levelMax: 140, dt: 2 });
      }
      liftResist(sheet);
      coherent(sheet);
      const pigment = thickness(sheet)[0];
      // mean pigment over columns [x0, x1) and the rows whose centres lie between y0 and y1 mm
      const mean = (x0, x1, y0, y1) => {
        let sum = 0, count = 0;
        for (let y = 0; y < h; y++) { const Y = (y + 0.5) * mm; if (Y > y0 && Y < y1) for (let x = x0; x < x1; x++) { sum += pigment[y * w + x]; count++; } }
        return sum / count;
      };
      const dark = mean(darkX, darkX + cells, 8, 17), besideDark = mean(col(31), col(32), 8, 17);
      const light = mean(lightX, lightX + cells, 8, 17), besideLight = mean(col(5), col(6), 8, 17);
      const label = JSON.stringify({ nativeWidth, cells, dark, besideDark, light, besideLight });
      assert.ok(dark > besideDark, `the dark bands develop the dark form, ${label}`);
      assert.ok(light < besideLight, `the dark glazes leave the channel lighter, ${label}`);
      assert.ok(light > 0, `the channel keeps its pale foundation, ${label}`);
      assert.equal(mean(darkX, darkX + cells, 20.8, 21.2), 0, 'held gap stays bare');
      t.diagnostic(JSON.stringify({ nativeWidth, backend: info.backend, cells, dark, besideDark, light, besideLight, gpu: gpuStats(sheet) }));
    } finally { sheet._gpu?.close(); }
  }
});
