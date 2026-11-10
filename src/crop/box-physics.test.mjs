// Physical pigment properties on the box: one shared table with a source for each paint, reference constants for
// picking, and the physical values applied only on the sheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX, boxPigment, physicalPigment } from './box.mjs';
import { PHYSICAL_KEYS, physicalOf, labKeyOf } from '../../demos/lab/media/pigment-physical.js';
import { PIGMENTS } from '../../demos/lab/media/pigments.js';

const byKey = Object.fromEntries(BOX.map(p => [p.key, p]));
const REFERENCE = { rho: 0.05, omega: 1.4, gamma: 0.25 };

test('picking constants are the uniform reference for every paint, so a pick cannot depend on physics', () => {
  for (const p of BOX) {
    const q = boxPigment(p);
    assert.equal(q.rho, REFERENCE.rho, p.key); assert.equal(q.omega, REFERENCE.omega, p.key); assert.equal(q.gamma, REFERENCE.gamma, p.key);
    assert.deepEqual(q.S, [0.02, 0.02, 0.02], p.key);
    assert.equal('floc' in q, false, `${p.key} carries no floc on the picking path`);
    assert.equal('key' in q, false, 'the picking pigment keeps the v0.3.0 shape');
  }
});

test('every paint has a physical row with a source, and anything estimated is marked', () => {
  for (const p of BOX) {
    const row = physicalOf(p.key);
    assert.ok(row, `${p.key} has a physical row`);
    for (const f of ['rho', 'omega', 'gamma']) assert.ok(Number.isFinite(row[f]) && row[f] >= 0, `${p.key} ${f}`);
    assert.ok(row.scatter.length === 3 && row.scatter.every(v => v > 0), `${p.key} scatter`);
    assert.ok(typeof row.source === 'string' && row.source.length > 20, `${p.key} names its source`);
    assert.ok(Array.isArray(row.estimated), `${p.key} lists its estimated fields`);
    assert.ok(p.physics && p.physics.gamma === row.gamma, `${p.key} is on the BOX entry`);
  }
  for (const key of ['rawsienna', 'lampblack', 'sepia']) assert.ok(physicalOf(key).estimated.length > 0, `${key} is marked estimated`);
  assert.ok(PHYSICAL_KEYS.includes('ultramarine'));
});

test('physicalPigment keeps the colour of the reference pigment and swaps in the paint\'s own physics', () => {
  for (const p of BOX) {
    const ref = boxPigment(p), phys = physicalPigment(p);
    assert.deepEqual(phys.K, ref.K, `${p.key} colour is untouched`);
    assert.equal(phys.name, ref.name); assert.equal(phys.key, p.key);
    const row = physicalOf(p.key);
    assert.equal(phys.gamma, row.gamma); assert.equal(phys.omega, row.omega); assert.equal(phys.rho, row.rho);
    assert.deepEqual(phys.S, row.scatter);
    if (row.floc > 0) assert.equal(phys.floc, row.floc); else assert.equal('floc' in phys, false);
  }
});

test('published character shows in the numbers: blues granulate and flocculate, phthalo and quinacridone stain and do not granulate', () => {
  const g = k => physicalOf(k);
  for (const k of ['ultramarine', 'cerulean']) { assert.ok(g(k).gamma >= 0.8, `${k} granulates`); assert.ok(g(k).floc > 0, `${k} flocculates`); assert.ok(g(k).omega < 5, `${k} lifts`); }
  for (const k of ['phthaloblue', 'phthalogreen', 'rose', 'hansa']) { assert.equal(g(k).gamma, 0, `${k} does not granulate`); assert.ok(g(k).omega >= 5, `${k} stains`); }
  for (const k of ['cadyellow', 'cadred', 'cerulean']) assert.ok(g(k).scatter[0] > g('phthaloblue').scatter[0] * 4, `${k} is more opaque than phthalo`);
  for (const k of ['ochre', 'sienna', 'rawsienna']) assert.ok(g(k).gamma >= 0.5 && g(k).gamma < 0.8, `${k} granulates moderately`);
});

test('mixed paints take the share-weighted physics of their parents', () => {
  const sap = physicalOf('sapgreen'), pg = physicalOf('phthalogreen'), hy = physicalOf('hansa');
  assert.ok(Math.abs(sap.rho - (0.48 * pg.rho + 0.52 * hy.rho)) < 1e-9);
  assert.ok(Math.abs(sap.omega - (0.48 * pg.omega + 0.52 * hy.omega)) < 1e-9);
  assert.ok(physicalOf('sapgreen').estimated.includes('mixed'));
});

test('Paint Lab and the painter read one table: every lab pigment carries the table\'s physics', () => {
  for (const p of PIGMENTS) {
    const row = physicalOf(labKeyOf(p.key));
    assert.ok(row, `${p.key} is in the table`);
    assert.equal(p.rho, row.rho, `${p.key} rho`); assert.equal(p.omega, row.omega, `${p.key} omega`); assert.equal(p.gamma, row.gamma, `${p.key} gamma`);
    assert.equal(p.floc ?? 0, row.floc, `${p.key} floc`);
  }
});

test('the earlier per-paint values are not carried on the picking path', () => {
  assert.equal(byKey.cerulean.dir.length, 3);
  assert.deepEqual(boxPigment(byKey.cerulean).S, [0.02, 0.02, 0.02]);
});

// Hills: the picking test. A fifth of the target's size keeps it quick; the pick is on the reference constants.
import { createRequire } from 'node:module';
import { sampleSource, chooseBox, renderedUnique } from './boxpick.mjs';
import { localColours } from './palettewide.mjs';
import { paperOf } from './palettepick.mjs';
import { unmix } from './pigments.mjs';
import { renderLayers } from '../media/km.mjs';
import { labPlanes, deltaE2000 } from '../eval/colour.mjs';

const hills = async () => {
  const sharp = createRequire(import.meta.url)('sharp');
  const { data, info } = await sharp(new URL('../../bench/v2/targets/hills.png', import.meta.url).pathname).removeAlpha().resize(102, 81, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  const px = new Uint8ClampedArray(data);
  return { px, w: info.width, h: info.height, paperRGB: paperOf(px, info.width, info.height).paperRGB };
};
const wideScoreWith = (sample, colours, pigmentOf) => {
  renderedUnique(sample, [BOX[0]]);
  const U = sample._u;
  return paints => {
    const pigs = paints.map(pigmentOf), k = pigs.length, u = U.u;
    const A = unmix(U.Du, u, pigs.map(q => q.K.map(v => v / 0.55)));
    const layer = pigs.map((_, j) => Float32Array.from({ length: u }, (_, s) => A[s * k + j]));
    const L2 = labPlanes(renderLayers([layer], pigs, U.flat, u, 1), u, sample.paperRGB);
    const de = new Float64Array(u), he = new Float64Array(u);
    for (let j = 0; j < u; j++) { const s = U.first[j], { L, a, b } = { L: sample.lab.L[s], a: sample.lab.a[s], b: sample.lab.b[s] }; de[j] = deltaE2000([L, a, b], [L2.L[j], L2.a[j], L2.b[j]]); he[j] = deltaE2000([L, a, b], [L, L2.a[j], L2.b[j]]); }
    let e = 0; for (let s = 0; s < sample.m; s++) e += de[U.ids[s]]; e /= sample.m;
    let loc = 0; for (const r of colours) { let q = 0; for (const s of r.cells) q += he[U.ids[s]]; loc += q / Math.max(1, r.cells.length); }
    return e + loc / Math.max(1, colours.length);
  };
};

test('Hills keeps its four paints, sap green among them, on the reference constants', async () => {
  const { px, w, h, paperRGB } = await hills();
  const sample = sampleSource(px, w, h, paperRGB, { stride: 3 }), colours = localColours(sample, {});
  const picked = chooseBox(px, w, h, paperRGB, { min: 3, max: 6, gain: 0.5, score: wideScoreWith(sample, colours, p => boxPigment(p)) }).paints.map(p => p.key).sort();
  assert.equal(picked.length, 4, picked.join());
  assert.ok(picked.includes('sapgreen'), picked.join());
});

test('scoring the same pick with the physical values changes the pick on Hills: the reason picking stays on reference constants', async () => {
  const { px, w, h, paperRGB } = await hills();
  const sample = sampleSource(px, w, h, paperRGB, { stride: 3 }), colours = localColours(sample, {});
  const pick = pigmentOf => chooseBox(px, w, h, paperRGB, { min: 3, max: 6, gain: 0.5, score: wideScoreWith(sample, colours, pigmentOf) }).paints.map(p => p.key).sort().join();
  const reference = pick(p => boxPigment(p)), physical = pick(p => physicalPigment(p));
  assert.notEqual(physical, reference, `reference ${reference}; physical ${physical}`);
});
