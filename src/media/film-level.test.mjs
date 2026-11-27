import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, step, dry, layersOf, totals, setTilt, DEFAULTS } from './sheet.mjs';
import { levelFilm } from './film-level.mjs';
import * as B from './brush.mjs';
import { renderLayers } from './km.mjs';
import { luminance, densityOf } from '../../tools/lab/wash-measure.mjs';
import { sweptSquare } from '../../tools/lab/wash-acceptance.mjs';

const ultramarine = { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85, floc: 0.3 };
const phthalo = { K: [0.4861, 0.2344, 0.1063], S: [0.02, 0.02, 0.02], rho: 0.032, omega: 20, gamma: 0 };
const O = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1 };
// a sheet without cockle (paper.mjs): what this measures is the lanes, the levelling or the grain, not the pooling
const flatPaper = (w, h, mm) => { const p = makePaper(w, h, { cockle: { rmsMm: 0 }, seed: 9, mmPerCell: mm }); for (const f of ['height', 'valley', 'tooth']) p[f].fill(0.5); return p; };

test('a film standing deeper in one half levels across 20 mm in seconds, keeping its water and pigment', () => {
  const mm = 0.25, w = 60, s = createSheet(flatPaper(w, 40, mm), [ultramarine]);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 50; x++) deposit(s, y * w + x, x < 30 ? 0.25 : 0.15, [x < 30 ? 0.1 : 0.03]);
  const water = () => { let t = 0; for (const v of s.W) t += v; return t; }, pig = () => { let t = 0; for (const v of s.G[0]) t += v; return t; };
  // Isolate the free-film calibration here. The paper-held layer is covered by
  // film-mobility.test.mjs and the ordinary floor stays on in every wash below.
  const w0 = water(), g0 = pig(), o = { ...O, levelFloor: 0, slope: 0, fibreFlow: 0, dt: 0.1 };
  for (let t = 0; t < 30; t++) levelFilm(s, o, [0, 0, w - 1, 39], mm);
  const a = s.W[20 * w + 15], b = s.W[20 * w + 45];
  assert.ok(Math.abs(a - b) < 0.01, `three seconds over 20 mm: ${a} against ${b}`);
  assert.ok(Math.abs(water() - w0) < 1e-6 * w0 && Math.abs(pig() - g0) < 1e-6 * g0, `conserved (float32 cells): water ${water() / w0 - 1}, pigment ${pig() / g0 - 1}`);
  // the deeper half's darker paint was carried across with its water: the concentration is no longer a step
  assert.ok(s.G[0][20 * w + 32] / s.W[20 * w + 32] > 0.25, 'pigment moves with the water');
  // a level film is left alone
  const before = Float32Array.from(s.W); for (let t = 0; t < 200; t++) levelFilm(s, o, [0, 0, w - 1, 39], mm);
  const flat = createSheet(flatPaper(w, 40, mm), [ultramarine]); for (let i = 400; i < 800; i++) deposit(flat, i, 0.2, [0.05]);
  assert.equal(levelFilm(flat, o, [0, 0, w - 1, 39], mm), null);
  assert.ok(before.every((v, i) => Math.abs(v - s.W[i]) < 0.002));
});

test('on a tilted board the film runs downhill and stands as a bead at its lower edge', () => {
  const mm = 0.25, w = 80, h = 120, s = createSheet(flatPaper(w, h, mm), [ultramarine]);
  for (let y = 20; y < 100; y++) for (let x = 20; x < 60; x++) deposit(s, y * w + x, 0.2, [0.05]);
  setTilt(s, 5, 'bottom'); assert.ok(Math.abs(s.tilt.y - Math.sin(5 * Math.PI / 180)) < 1e-12 && Math.abs(s.tilt.x) < 1e-12);
  const o = { ...O, slope: 0, fibreFlow: 0, dt: 0.1 };
  for (let t = 0; t < 50; t++) levelFilm(s, o, [0, 0, w - 1, h - 1], mm);
  const top = s.W[25 * w + 40], bottom = s.W[97 * w + 40];
  assert.ok(bottom > 1.5 * top, `after 5 s: top ${top} bottom ${bottom}`);
  setTilt(s, 0); assert.equal(s.tilt, null);
  assert.throws(() => setTilt(s, 5, 'sideways'));
});

// Five sweeps of the painter's 12 mm flat, 8 mm apart, laid on the hand's clock (tools/lab/wash-cases.mjs `sweeps`).
function fiveSweeps(mm, dryOpts) {
  const w = Math.round(50 / mm), n = w * w, pigments = [ultramarine, phthalo];
  const s = createSheet(makePaper(w, w, { cockle: { rmsMm: 0 }, seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: mm, coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } }), pigments);
  const before = { ...totals(s) };
  for (let k = 0; k < 5; k++) {
    const r = 6 / mm, b = B.createBrush({ model: 'section', flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, seed: 60 + k });
    B.dip(b, { water: 1, conc: [0.6, 0] });
    const y = 9 + 8 * k, [a, z] = k % 2 ? [45, 5] : [5, 45], per = 0.7 * mm / 60; let t = 0;
    B.stroke(b, s, [{ x: a / mm, y: y / mm, p: 0.9 }, { x: z / mm, y: y / mm, p: 0.9 }], { upright: 'sweep', between: () => { for (t += per; t >= O.dt; t -= O.dt) step(s, O); } });
  }
  dry(s, 200000, O, dryOpts);
  const base = new Uint8Array(n * 3); for (let i = 0; i < n; i++) base.set([246, 245, 239], i * 3);
  const od = densityOf(luminance(renderLayers(layersOf(s), pigments, base, n), n), luminance([246, 245, 239], 1)[0]);
  return { ...sweptSquare(od, w, w, mm, { centres: [9, 17, 25, 33, 41], half: 6 }), before };
}
// The control: the same paint poured flat over the same 40 mm square at the sweeps' density (OD 0.07), dried, read by
// the same measure. It has no sweeps, so whatever bands and seams it shows are the paint's own grain in the rows.
function pouredSquare(mm, dryOpts) {
  const w = Math.round(50 / mm), n = w * w, pigments = [ultramarine, phthalo];
  const s = createSheet(makePaper(w, w, { cockle: { rmsMm: 0 }, seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: mm, coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } }), pigments);
  for (let y = Math.round(5 / mm); y < Math.round(45 / mm); y++) for (let x = Math.round(5 / mm); x < Math.round(45 / mm); x++) deposit(s, y * w + x, 0.3, [0.12, 0]);
  dry(s, 200000, O, dryOpts);
  const base = new Uint8Array(n * 3); for (let i = 0; i < n; i++) base.set([246, 245, 239], i * 3);
  const od = densityOf(luminance(renderLayers(layersOf(s), pigments, base, n), n), luminance([246, 245, 239], 1)[0]);
  return sweptSquare(od, w, w, mm, { centres: [9, 17, 25, 33, 41], half: 6 });
}
const squares = {};
for (const mm of [0.25, 0.1]) for (const [mode, dryOpts] of [['exact', { levelMax: 200 }], ['fast', { levelMax: 200, dt: 14, analyticTail: true }]]) {
  test(`a 40 mm square laid in five sweeps dries as one film at ${mm} mm cells (${mode}): no bands, no seams, a rim all round`, { timeout: 900000 }, () => {
    const r = fiveSweeps(mm, dryOpts), c = pouredSquare(mm, dryOpts); squares[`${mm} ${mode}`] = r;
    console.log(`five sweeps ${mm} mm ${mode}: bands ${r.bands.toFixed(4)}, seam ${r.seam.toFixed(4)} OD, rims ${r.rims.map(v => v.toFixed(3)).join(' ')}; poured flat: bands ${c.bands.toFixed(4)}, seam ${c.seam.toFixed(4)} OD, mean ${c.mean.toFixed(3)} against ${r.mean.toFixed(3)}`);
    // The sweeps leave no bands or seams beyond what the same paint poured flat shows. The row-mean density (outside the
    // rim, over 2 mm of rows) and a row's step at a sweep's edge carry the paint's own grain, and the seam, the largest
    // step over many rows, grows with it. At rc7, a pepper a cell across, the poured square read bands 0.024 and seam
    // 0.006 OD and the sweeps 0.026-0.028 and 0.008 (bounds were 0.03 and 0.01; sweeps over poured: bands 1.06-1.17,
    // seam 1.34-1.41). On the millimetre grain field (src/media/grain-field.mjs) the poured square reads 0.046-0.049 and
    // 0.009-0.010, the sweeps 0.033-0.037 and 0.013-0.015 (bands 0.72-0.77, seam 1.48-1.52). Held to 1.25 and 1.6.
    // With paint mixing out into the film less (sheet.mjs filmDiffuse 0.05) and damp paint not levelling (levelFloor), a
    // lap keeps a little more of its step: seam 0.0114-0.0130 against 0.0071-0.0075 (1.53-1.73), and the rims along the
    // sides read 1.19-1.57. Held to 1.8 and 1.05-1.6.
    assert.ok(Math.abs(c.mean / r.mean - 1) < 0.25, `the poured square's density ${c.mean} against the sweeps' ${r.mean}`);
    assert.ok(r.bands < 1.25 * c.bands, `bands ${r.bands} against the poured square's ${c.bands}`);
    assert.ok(r.seam < 1.8 * c.seam, `seam step ${r.seam} OD against the poured square's ${c.seam}`);
    for (const v of r.rims) assert.ok(v >= 1.05 && v <= 1.6, `rims ${r.rims}`);
  });
}

test('the five-sweep square dries the same rim at 0.25 and 0.1 mm cells, each side within 15%', () => {
  // (6% until the levelling floor: a rim dries where the film stops levelling, which falls a cell or two differently on
  // the two grids; the bottom and right sides now part by 11-13.4%)
  // (wash-measure rimContrast reads 1.21 at 0.25 mm and 1.05 at 0.1 mm on the same squares: it measures the outer 1 mm
  // from every unpainted cell, and the few tooth pits a sweep skips at 0.1 mm (0.4% of the square) each make a
  // millimetre of interior around them count as rim. Along the square's own sides the rims agree.)
  for (const mode of ['exact', 'fast']) {
    const a = squares[`0.25 ${mode}`], b = squares[`0.1 ${mode}`]; if (!a || !b) continue;
    a.rims.forEach((v, i) => assert.ok(Math.abs(b.rims[i] / v - 1) < 0.15, `${mode} side ${i}: ${v} at 0.25 mm, ${b.rims[i]} at 0.1 mm`));
  }
});
