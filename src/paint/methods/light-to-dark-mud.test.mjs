import test from 'node:test';
import assert from 'node:assert/strict';
import { planLightToDark } from './light-to-dark.mjs';

// A synthetic sheet: a paper band on top, a saturated orange half on the left and a grey-brown half on the right, both
// darker downwards. The orange carries a trace of ultramarine demand, as a per-cell unmix leaves one.
const w = 120, h = 80, n = w * h, k = 3, TOP = 12;
// A pale plane at the top of the grey half.
const pale = i => i % w >= w / 2 && Math.floor(i / w) >= TOP && Math.floor(i / w) < TOP + 14;
const rgb = new Uint8ClampedArray(n * 3), demand = new Float32Array(n * k), density = new Float32Array(n);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = y * w + x, t = y / h;
  if (y < TOP) { rgb.set([252, 251, 248], i * 3); continue; }
  if (pale(i)) { rgb.set([236, 232, 226], i * 3); demand[i * k] = demand[i * k + 1] = demand[i * k + 2] = 0.05; density[i] = 0.15; continue; }
  if (x < w / 2) { rgb.set([235, 140 - 60 * t, 40], i * 3); demand[i * k] = 0.6 + t; demand[i * k + 1] = 0.3 + 0.5 * t; demand[i * k + 2] = 0.04; }
  else { rgb.set([130 - 40 * t, 124 - 40 * t, 118 - 40 * t], i * 3); demand[i * k] = 0.4 + 0.4 * t; demand[i * k + 1] = 0.3 + 0.3 * t; demand[i * k + 2] = 0.5 + 0.5 * t; }
  density[i] = demand[i * k] + demand[i * k + 1] + demand[i * k + 2];
}
const pigments = [{ name: 'hansa yellow', K: [0, 0.06, 0.55] }, { name: 'quinacridone rose', K: [0, 0.45, 0.32] }, { name: 'French ultramarine', K: [0.46, 0.29, 0.05] }];
const BASE = { demand, k, density, w, h, rgb, pigments, shaped: true, sheetWidthMm: 120, paperRel: true, paperLights: true, layerHue: true, layers: 4 };
const plan = o => planLightToDark({ ...BASE, ...o });
const orange = i => i % w < w / 2 && Math.floor(i / w) >= TOP;

// Ultramarine charged onto the orange half, by value phase.
function blueOnOrange(p) {
  const by = { light: 0, mid: 0, shadow: 0 };
  for (const L of p.layers) if (L.pigment === 2) for (const sh of L.shapes) for (let i = 0; i < n; i++) if (sh.mask[i] && orange(i)) by[L._valuePhase] += sh.amount;
  return by;
}

// Charge laid per cell and pigment, summed over every passage.
function laidPerCell(p) {
  const per = new Float32Array(n * k);
  for (const L of p.layers) for (const sh of L.shapes) for (let i = 0; i < n; i++) if (sh.mask[i]) per[i * k + L.pigment] += sh.amount;
  return per;
}

test('lightFamilies: the first light wash is mixed per colour family, so the blue of the grey does not cross the orange', () => {
  const mixed = blueOnOrange(plan({})).light, split = blueOnOrange(plan({ lightFamilies: true, hueChroma: 30 })).light;
  assert.ok(split < mixed / 4, `blue light wash on orange ${split} vs ${mixed}`);
});

test('hueChroma: saturated and muted regions of one hue family take separate middle washes', () => {
  const mixed = blueOnOrange(plan({})).mid, split = blueOnOrange(plan({ hueChroma: 30 })).mid;
  assert.ok(split < mixed / 4, `blue on orange in the middle layers ${split} vs ${mixed}`);
});

test('muted brown with a wide RGB range cannot share the saturated orange wash', () => {
  const brown = rgb.slice();
  for (let i = 0; i < n; i++) if (i % w >= w / 2 && Math.floor(i / w) >= TOP && !pale(i)) brown.set([130, 100, 80], i * 3);
  const before = blueOnOrange(plan({ rgb: brown })).mid;
  const after = blueOnOrange(plan({ rgb: brown, hueChroma: 30, lightFamilies: true })).mid;
  assert.ok(after < before / 4, `muted-brown blue entering orange ${after} vs ${before}`);
});

test('passCap: a passage charged at its median over-charges fewer cells and still lays the planned mass', () => {
  const over = p => { const per = laidPerCell(p); let o = 0, t = 0; for (let i = 0; i < n * k; i++) { t += demand[i]; if (demand[i] > 0) o += Math.max(0, per[i] - demand[i]); } return o / t; };
  const mass = p => { const per = laidPerCell(p); let a = 0, b = 0; for (let i = 0; i < n * k; i++) { a += per[i]; b += demand[i]; } return a / b; };
  const mean = plan({}), capped = plan({ passCap: 0.5 });
  assert.ok(over(capped) < 0.7 * over(mean), `over-charge ${over(capped)} vs ${over(mean)}`);
  assert.ok(Math.abs(mass(capped) - 1) < 0.15, `mass ${mass(capped)}`);
});

test('paleLights: a pale plane gets only the first wash, away from its smoothed edge', () => {
  const inside = i => pale(i) && i % w >= w / 2 + 3 && Math.floor(i / w) < TOP + 11;
  const later = p => { let c = 0; for (const L of p.layers) if (L._valuePhase !== 'light') for (const sh of L.shapes) for (let i = 0; i < n; i++) if (sh.mask[i] && inside(i)) c++; return c; };
  assert.ok(later(plan({ passCap: 0.5, maskMm: 2 })) > 0);
  assert.equal(later(plan({ paleLights: 0.16, passCap: 0.5, maskMm: 2 })), 0);
});
