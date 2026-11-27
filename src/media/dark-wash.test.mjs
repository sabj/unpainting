import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, step, dry, layersOf, totals, DEFAULTS } from './sheet.mjs';
import * as B from './brush.mjs';
import { renderLayers } from './km.mjs';
import { BOX, physicalPigment } from '../crop/box.mjs';

// One wash of ultramarine and burnt sienna (1:1), laid in five overlapping sweeps of the 25 mm flat on rough paper, at
// a strong and a pale concentration. A painter gets a dark by loading the brush with strong paint: one heavy wash of
// a dark mix dries to about L* 25 to 35; a tenth of the paint to about 85.
const pigments = ['ultramarine', 'sienna'].map(k => physicalPigment(BOX.find(p => p.key === k)));
const O = { ...DEFAULTS, fixedBed: 1, granFill: 0, slideCap: 1 };
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
function wash(conc, CELL = 0.25) {
  const w = Math.round(60 / CELL), h = Math.round(40 / CELL), n = w * h;
  // a sheet without cockle (paper.mjs): what this measures is the lanes, the levelling or the grain, not the pooling
  // Select physical rough relief explicitly: tooth/bump knobs do not choose a physical surface.
  const paper = makePaper(w, h, { relief: 'rough', cockle: { rmsMm: 0 }, seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.7, proudBlur: 1, mmPerCell: CELL, coldPress: { mmPerCell: CELL, bumpMm: [0.8, 3], cover: 2.4, swell: 0.45, swellMm: [4, 8] } });
  const sheet = createSheet(paper, pigments), r = 12.5 / CELL;
  for (let y = 10, k = 0; y <= 30; y += 5, k++) {
    const b = B.createBrush({ model: 'section', radius: r, seed: 101 + k, flat: true, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, bridge: 0.9, bridgeSoft: 3 });
    // Saturation now controls bristle reach: a heavy continuous wash uses a full load.
    B.dip(b, { water: 1, conc: [conc / 2, conc / 2] });
    const [a, z] = k % 2 ? [55, 5] : [5, 55], per = 0.7 * CELL / 80; let t = 0;
    B.stroke(b, sheet, [{ x: a / CELL, y: y / CELL, p: 0.9 }, { x: z / CELL, y: y / CELL, p: 0.9 }], { upright: 'sweep', speed: 80, between: () => { for (t += per; t >= O.dt - 1e-12; t -= O.dt) step(sheet, O); } });
    for (let i = 0; i < 5; i++) step(sheet, O);
  }
  const laid = totals(sheet).pig.reduce((p, q) => p + q, 0);
  dry(sheet, 200000, O, { levelMax: 200, dt: 14, analyticTail: true });
  const kept = totals(sheet).pig.reduce((p, q) => p + q, 0) / laid;
  const rgb = renderLayers(layersOf(sheet), pigments, new Uint8Array(n * 3).fill(255), n);
  const Y = i => 0.2126 * lin(rgb[3 * i]) + 0.7152 * lin(rgb[3 * i + 1]) + 0.0722 * lin(rgb[3 * i + 2]);
  // the middle of the wash: mean L*, the row profile (2 mm windows) and the 0.5 to 1.5 mm grain of the density
  const xa = Math.round(12 / CELL), xb = Math.round(48 / CELL), ya = Math.round(12 / CELL), yb = Math.round(28 / CELL);
  let L = 0, c = 0; const od = new Float64Array(n), rows = [];
  for (let i = 0; i < n; i++) od[i] = -Math.log10(Math.max(1e-4, Y(i)));
  for (let y = ya; y < yb; y++) { let t = 0; for (let x = xa; x < xb; x++) { const i = y * w + x; L += 116 * Math.cbrt(Y(i)) - 16; c++; t += od[i]; } rows.push(t / (xb - xa)); }
  const rm = rows.reduce((p, q) => p + q) / rows.length, win = Math.round(1 / CELL);
  const bands = Math.max(...rows.map((_, i) => { let t = 0, k = 0; for (let j = Math.max(0, i - win); j <= Math.min(rows.length - 1, i + win); j++) { t += rows[j]; k++; } return Math.abs(t / k / rm - 1); }));
  const blur = s => { const R = Math.ceil(3 * s), kk = []; let ks = 0; for (let i = -R; i <= R; i++) { const v = Math.exp(-i * i / (2 * s * s)); kk.push(v); ks += v; } const a = new Float64Array(n), o = new Float64Array(n); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let t = 0; for (let j = -R; j <= R; j++) t += kk[j + R] * od[y * w + Math.min(w - 1, Math.max(0, x + j))]; a[y * w + x] = t / ks; } for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let t = 0; for (let j = -R; j <= R; j++) t += kk[j + R] * a[Math.min(h - 1, Math.max(0, y + j)) * w + x]; o[y * w + x] = t / ks; } return o; };
  const g1 = blur(0.19 * 0.5 / CELL), g2 = blur(0.19 * 1.5 / CELL); let s1 = 0, s2 = 0, m = 0, k = 0;
  for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { const i = y * w + x, d = g1[i] - g2[i]; s1 += d; s2 += d * d; m += od[i]; k++; }
  return { L: L / c, bands, grain: Math.sqrt(s2 / k - (s1 / k) ** 2) / (m / k), kept };
}

test('one heavy wash of ultramarine and burnt sienna dries to L* 30 or darker as one even, granulating film; a tenth of the paint to about L* 85', { timeout: 600000 }, () => {
  const dark = wash(12), pale = wash(1.2);
  console.log(`ultramarine + sienna: at 12 L* ${dark.L.toFixed(1)} bands ${dark.bands.toFixed(3)} grain ${dark.grain.toFixed(3)}; at 1.2 L* ${pale.L.toFixed(1)} grain ${pale.grain.toFixed(3)}`);
  assert.ok(dark.L <= 30, `dark L* ${dark.L}`);
  assert.ok(Math.abs(pale.L - 85) <= 4, `pale L* ${pale.L}`);
  assert.ok(dark.bands < 0.04, `dark wash bands ${dark.bands}`);
  // the fibre peaks stay lighter than the pits under a strong load (the dark Gulf Stream sky reads 0.12)
  assert.ok(dark.grain >= 0.08, `dark grain ${dark.grain}`);
  for (const r of [dark, pale]) assert.ok(Math.abs(r.kept - 1) < 1e-5, `pigment kept ${r.kept}`);
});

test('a mixed wash dries its edge in its own hue, a little darker: the edge flow does not sort the fine pigment into a line', { timeout: 600000 }, () => {
  // hansa yellow (0.2 um), cadmium red (0.5 um) and ultramarine (2 um): the mini piece's palette. Each settling alone,
  // the fine ones stayed suspended while ultramarine settled, and the edge flow drew only them into the outermost cell.
  const keys = ['hansa', 'cadred', 'ultramarine'], pig = keys.map(k => physicalPigment(BOX.find(p => p.key === k))), CELL = 0.25;
  const w = Math.round(50 / CELL), h = Math.round(40 / CELL), n = w * h;
  const sheet = createSheet(makePaper(w, h, { cockle: { rmsMm: 0 }, seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: CELL, coldPress: { mmPerCell: CELL, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } }), pig);
  for (let y = 12, k = 0; y <= 28; y += 8, k++) {
    const r = 6 / CELL, b = B.createBrush({ model: 'section', radius: r, seed: 101 + k, flat: true, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3 });
    B.dip(b, { water: 0.5, conc: [0.3, 0.15, 0.25] });
    const [a, z] = k % 2 ? [45, 5] : [5, 45], per = 0.7 * CELL / 80; let t = 0;
    B.stroke(b, sheet, [{ x: a / CELL, y: y / CELL, p: 0.9 }, { x: z / CELL, y: y / CELL, p: 0.9 }], { upright: 'sweep', speed: 80, between: () => { for (t += per; t >= O.dt - 1e-12; t -= O.dt) step(sheet, O); } });
  }
  dry(sheet, 200000, O, { levelMax: 200, dt: 14, analyticTail: true });
  const rgb = renderLayers(layersOf(sheet), pig, new Uint8Array(n * 3).fill(250), n);
  const lab = i => { const R = lin(rgb[3 * i]), G = lin(rgb[3 * i + 1]), Bv = lin(rgb[3 * i + 2]), f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116, X = f((0.4124 * R + 0.3576 * G + 0.1805 * Bv) / 0.95047), Y = f(0.2126 * R + 0.7152 * G + 0.0722 * Bv), Z = f((0.0193 * R + 0.1192 * G + 0.9505 * Bv) / 1.08883); return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
  const mass = new Float64Array(n); for (const L of layersOf(sheet)) for (const a of L) for (let i = 0; i < n; i++) mass[i] += a[i];
  const edge = [0, 0, 0], inner = [0, 0, 0]; let ne = 0, ni = 0;
  const add = (acc, i) => { const v = lab(i); for (let j = 0; j < 3; j++) acc[j] += v[j]; };
  // along the left and right sides: the first painted cell, and the band 2 to 4 mm in
  for (let y = Math.round(15 / CELL); y < Math.round(25 / CELL); y++) for (const dir of [1, -1]) {
    let x = dir > 0 ? 0 : w - 1; while (x >= 0 && x < w && !(mass[y * w + x] > 0.012)) x += dir;
    add(edge, y * w + x); ne++; for (let d = Math.round(2 / CELL); d < Math.round(4 / CELL); d++) { add(inner, y * w + x + dir * d); ni++; }
  }
  const E = edge.map(v => v / ne), I = inner.map(v => v / ni), shift = Math.hypot(E[1] - I[1], E[2] - I[2]);
  console.log(`mixed wash edge L*a*b* ${E.map(v => v.toFixed(1))} against ${I.map(v => v.toFixed(1))}: a*b* shift ${shift.toFixed(1)}`);
  assert.ok(shift < 3, `edge hue shift ${shift}`);
  assert.ok(E[0] < I[0] - 0.5, 'the edge still dries a little darker');
});
