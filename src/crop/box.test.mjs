// The box of paints: the colour model inverts, the paints lean the way their names say, and the numbers match a
// second source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fromJCh, toJCh, xyzOfLinear, linearOfXYZ } from './ciecam.mjs';
import { BOX, MEASURED, tintOf, directionOf, appearance, boxPigment } from './box.mjs';

const byKey = Object.fromEntries(BOX.map(p => [p.key, p]));
const unit = v => { const m = Math.hypot(...v); return v.map(x => x / m); };
const degrees = (a, b) => (Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI;

test('CIECAM02 goes there and back: JCh to XYZ to JCh, and XYZ to JCh to XYZ', () => {
  for (const jch of [[21, 70, 254], [85, 80, 91], [44, 73, 10], [60, 5, 180]]) {
    const back = toJCh(fromJCh(...jch));
    assert.ok(Math.abs(back[0] - jch[0]) < 1e-6 && Math.abs(back[1] - jch[1]) < 1e-6 && Math.abs(back[2] - jch[2]) < 1e-6, `${jch} -> ${back}`);
  }
  const xyz = xyzOfLinear([0.2, 0.4, 0.6]), again = linearOfXYZ(fromJCh(...toJCh(xyz)));
  assert.ok(again.every((v, c) => Math.abs(v - [0.2, 0.4, 0.6][c]) < 1e-9), `${again}`);
  // the reference white is J 100 (its chroma is not quite 0: adaptation at these conditions is incomplete)
  const [J] = toJCh(xyzOfLinear([1, 1, 1]));
  assert.ok(Math.abs(J - 100) < 0.01, `white at J ${J}`);
});

test('the box holds the paints a watercolourist would reach for, each a unit direction that adds no light', () => {
  for (const key of ['ultramarine', 'cerulean', 'phthaloblue', 'sapgreen', 'phthalogreen', 'ochre', 'hansa', 'cadyellow', 'sienna', 'umber', 'rose', 'cadred', 'paynes', 'sepia']) {
    assert.ok(byKey[key], `missing ${key}`);
  }
  assert.equal(new Set(BOX.map(p => p.key)).size, BOX.length, 'keys are unique');
  for (const p of BOX) {
    assert.ok(Math.abs(Math.hypot(...p.dir) - 1) < 1e-9, `${p.key} is a unit direction`);
    assert.ok(p.dir.every(v => v >= 0), `${p.key} absorbs, it does not emit: ${p.dir}`);
  }
});

test('each paint absorbs the light its colour says it does', () => {
  const [R, G, B] = [0, 1, 2], most = (key, c) => byKey[key].dir.indexOf(Math.max(...byKey[key].dir)) === c;
  const least = (key, c) => byKey[key].dir.indexOf(Math.min(...byKey[key].dir)) === c;
  for (const blue of ['ultramarine', 'cerulean', 'phthaloblue']) assert.ok(most(blue, R) && least(blue, B), `${blue} ${byKey[blue].dir}`);
  for (const warm of ['hansa', 'cadyellow', 'ochre', 'sienna', 'umber', 'cadred', 'sepia']) assert.ok(most(warm, B) && least(warm, R), `${warm} ${byKey[warm].dir}`);
  for (const green of ['phthalogreen', 'sapgreen']) assert.ok(least(green, G), `${green} passes green: ${byKey[green].dir}`);
  assert.ok(most('rose', G), `a rose absorbs green: ${byKey.rose.dir}`);
  // ultramarine leans violet next to cerulean: it lets more red through for the green it takes
  assert.ok(byKey.ultramarine.dir[G] / byKey.ultramarine.dir[R] > byKey.cerulean.dir[G] / byKey.cerulean.dir[R]);
  // a yellow is cleaner than an ochre: it barely touches green
  assert.ok(byKey.hansa.dir[G] < byKey.ochre.dir[G]);
});

test('the measured paints agree with Curtis et al. (1997, Figure 5) to within 20 degrees', () => {
  const CURTIS = {
    rose: [0.22, 1.47, 0.57], cadyellow: [0.10, 0.36, 3.45], cerulean: [1.52, 0.32, 0.25], umber: [0.74, 1.54, 2.10],
    cadred: [0.14, 1.08, 1.68], hansa: [0.06, 0.21, 1.78], phthalogreen: [1.55, 0.47, 0.63], ultramarine: [0.86, 0.86, 0.06],
  };
  for (const [key, K] of Object.entries(CURTIS)) {
    const d = degrees(unit(K), byKey[key].dir);
    assert.ok(d < 20, `${key} sits ${d.toFixed(1)} degrees from Curtis`);
  }
});

test('a paint keeps its direction from a pale wash to a strong one', () => {
  for (const p of MEASURED) {
    const d = degrees(directionOf(tintOf(p.jch, 0.8)), directionOf(tintOf(p.jch, 0.3)));
    assert.ok(d < 8, `${p.key} turns ${d.toFixed(1)} degrees between an 80% and a 30% wash`);
  }
});

test('the mixed paints land where the makers measured theirs', () => {
  const sap = appearance(byKey.sapgreen.dir), paynes = appearance(byKey.paynes.dir);
  assert.ok(sap.h >= 119 && sap.h <= 132, `sap green masstone hue ${sap.h.toFixed(0)} (makers 119 to 132)`);
  assert.ok(paynes.h >= 265 && paynes.h <= 275, `Payne's grey masstone hue ${paynes.h.toFixed(0)} (makers 265 and 275)`);
  assert.ok(paynes.C < 10, `Payne's grey is a blue-black, not a blue: chroma ${paynes.C.toFixed(1)}`);
});

test('a box paint is a sheet pigment in the palette format', () => {
  const p = boxPigment(byKey.sienna);
  assert.deepEqual(Object.keys(p).sort(), ['K', 'S', 'gamma', 'name', 'omega', 'rho']);
  assert.ok(p.K.every((v, c) => Math.abs(v - 0.55 * byKey.sienna.dir[c]) < 1e-12));
  assert.deepEqual(p.S, [0.02, 0.02, 0.02]);
  assert.equal(p.name, 'burnt sienna');
});
