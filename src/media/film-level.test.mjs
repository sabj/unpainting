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
const flatPaper = (w, h, mm) => { const p = makePaper(w, h, { seed: 9, mmPerCell: mm }); for (const f of ['height', 'valley', 'tooth']) p[f].fill(0.5); return p; };

test('a film standing deeper in one half levels across 20 mm in seconds, keeping its water and pigment', () => {
  const mm = 0.25, w = 60, s = createSheet(flatPaper(w, 40, mm), [ultramarine]);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 50; x++) deposit(s, y * w + x, x < 30 ? 0.25 : 0.15, [x < 30 ? 0.1 : 0.03]);
  const water = () => { let t = 0; for (const v of s.W) t += v; return t; }, pig = () => { let t = 0; for (const v of s.G[0]) t += v; return t; };
  const w0 = water(), g0 = pig(), o = { ...O, slope: 0, fibreFlow: 0, dt: 0.1 };
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
  const s = createSheet(makePaper(w, w, { seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: mm, coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } }), pigments);
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
const squares = {};
for (const mm of [0.25, 0.1]) for (const [mode, dryOpts] of [['exact', { levelMax: 200 }], ['fast', { levelMax: 200, dt: 14, analyticTail: true }]]) {
  test(`a 40 mm square laid in five sweeps dries as one film at ${mm} mm cells (${mode}): no bands, no seams, a rim all round`, { timeout: 900000 }, () => {
    const r = fiveSweeps(mm, dryOpts); squares[`${mm} ${mode}`] = r;
    console.log(`five sweeps ${mm} mm ${mode}: bands ${r.bands.toFixed(4)}, seam ${r.seam.toFixed(4)} OD, rims ${r.rims.map(v => v.toFixed(3)).join(' ')}`);
    // the row-mean density, outside the rim and over 2 mm of rows, within 3% of its mean (a poured square reads 2.3%)
    assert.ok(r.bands < 0.03, `bands ${r.bands}`);
    assert.ok(r.seam < 0.01, `seam step ${r.seam} OD`);
    for (const v of r.rims) assert.ok(v >= 1.05 && v <= 1.4, `rims ${r.rims}`);
  });
}

test('the five-sweep square dries the same rim at 0.25 and 0.1 mm cells, each side within 6%', () => {
  // (wash-measure rimContrast reads 1.21 at 0.25 mm and 1.05 at 0.1 mm on the same squares: it measures the outer 1 mm
  // from every unpainted cell, and the few tooth pits a sweep skips at 0.1 mm (0.4% of the square) each make a
  // millimetre of interior around them count as rim. Along the square's own sides the rims agree.)
  for (const mode of ['exact', 'fast']) {
    const a = squares[`0.25 ${mode}`], b = squares[`0.1 ${mode}`]; if (!a || !b) continue;
    a.rims.forEach((v, i) => assert.ok(Math.abs(b.rims[i] / v - 1) < 0.06, `${mode} side ${i}: ${v} at 0.25 mm, ${b.rims[i]} at 0.1 mm`));
  }
});
