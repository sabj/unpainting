import test from 'node:test';
import assert from 'node:assert/strict';
import { densityDirections, planPuddles } from './puddles.mjs';
import { planLightToDark } from './light-to-dark.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';

test('a local colour is a direction of density: more of one mixture is the same puddle, another hue is not', () => {
  const D = Float32Array.from([0.1, 0.3, 0.6, 0.3, 0.9, 1.8, 0.05, 0.15, 0.3, 0.8, 0.4, 0.1, 0.4, 0.2, 0.05, 0, 0, 0]);
  const { labels, count } = densityDirections(D, 6, 4);
  assert.equal(labels[0], labels[1]); assert.equal(labels[0], labels[2]);
  assert.equal(labels[3], labels[4]); assert.notEqual(labels[0], labels[3]);
  assert.equal(labels[5], -1, 'a cell with no density has no puddle');
  assert.ok(count <= 4 && count >= 2);
});

test('each cell takes paint only from its own puddle\'s pans', () => {
  const pigs = ['hansa', 'sienna', 'ultramarine', 'paynes'].map(k => boxPigment(BOX.find(p => p.key === k)));
  const w = 20, h = 10, n = w * h, D = new Float32Array(n * 3), paper = [252, 251, 248];
  // left: an orange from yellow and sienna; right: a blue-grey
  for (let i = 0; i < n; i++) { const t = 0.3 + 0.7 * ((i / w | 0) / h); if (i % w < w / 2) D.set([0.15 * t, 0.6 * t, 1.2 * t], i * 3); else D.set([0.8 * t, 0.7 * t, 0.5 * t], i * 3); }
  const P = planPuddles(D, w, h, pigs, paper, { count: 4 });
  const left = P.labels[0], right = P.labels[w - 1];
  assert.notEqual(left, right);
  const pansOf = q => new Set(P.colours[q].pans);
  for (let i = 0; i < n; i++) for (let j = 0; j < pigs.length; j++) if (P.A[i * pigs.length + j] > 1e-6) assert.ok(pansOf(P.labels[i]).has(j), `cell ${i} pan ${j}`);
});

test('laid by puddles, the grey\'s blue never crosses the orange, and a passage carries its puddle\'s mixed pans', () => {
  // the light-to-dark-mud sheet: orange left (with a trace of blue from the unmix), grey right, darker downwards
  const w = 120, h = 80, n = w * h, k = 3, TOP = 12;
  const rgb = new Uint8ClampedArray(n * 3), demand = new Float32Array(n * k), density = new Float32Array(n), labels = new Int32Array(n).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, t = y / h;
    if (y < TOP) { rgb.set([252, 251, 248], i * 3); continue; }
    if (x < w / 2) { rgb.set([235, 140 - 60 * t, 40], i * 3); demand[i * k] = 0.6 + t; demand[i * k + 1] = 0.3 + 0.5 * t; demand[i * k + 2] = 0.04; labels[i] = 0; }
    else { rgb.set([130 - 40 * t, 124 - 40 * t, 118 - 40 * t], i * 3); demand[i * k] = 0.4 + 0.4 * t; demand[i * k + 1] = 0.3 + 0.3 * t; demand[i * k + 2] = 0.5 + 0.5 * t; labels[i] = 1; }
    density[i] = demand[i * k] + demand[i * k + 1] + demand[i * k + 2];
  }
  const pigments = [{ name: 'hansa yellow', K: [0, 0.06, 0.55] }, { name: 'quinacridone rose', K: [0, 0.45, 0.32] }, { name: 'French ultramarine', K: [0.46, 0.29, 0.05] }];
  const base = { demand, k, density, w, h, rgb, pigments, shaped: true, sheetWidthMm: 120, paperRel: true, paperLights: true, layerHue: true, layers: 4 };
  const orange = i => i % w < w / 2 && Math.floor(i / w) >= TOP;
  const blueOnOrange = p => { let s = 0; for (const L of p.layers) for (const sh of L.shapes) { const blue = sh.mix[2]; if (!(blue > 0)) continue; for (let i = 0; i < n; i++) if (sh.mask[i] && orange(i)) s += blue; } return s; };
  const perPan = planLightToDark(base), byPuddle = planLightToDark({ ...base, puddles: { labels, count: 2 } });
  // per pan, the blue pass spans the orange at the grey's strength; by puddle the orange carries only its own trace
  const greyOnOrange = p => { let c = 0; for (const L of p.layers) if (L.puddle === 1) for (const sh of L.shapes) for (let i = 0; i < n; i++) if (sh.mask[i] && orange(i) && i % w < w / 2 - 1) c++; return c; }; // the later grey wash laps the seam cell only
  assert.equal(greyOnOrange(byPuddle), 0);
  assert.ok(blueOnOrange(byPuddle) < blueOnOrange(perPan) / 4, `blue on orange ${blueOnOrange(byPuddle)} vs ${blueOnOrange(perPan)}`);
  for (const L of byPuddle.layers) for (const sh of L.shapes) {
    assert.ok(Math.abs(sh.mix.reduce((a, v) => a + v, 0) - sh.amount) < 1e-6 * Math.max(1, sh.amount));
    if (L.puddle === 0) assert.ok(sh.mix[0] > 0 && sh.mix[1] > 0, 'the orange puddle holds its yellow and rose together');
  }
});

test('a greyed puddle is one paint: each of its cells holds its pans in the puddle\'s own shares', () => {
  const pigs = ['sienna', 'cerulean', 'hansa'].map(k => boxPigment(BOX.find(p => p.key === k)));
  const w = 16, h = 8, n = w * h, D = new Float32Array(n * 3);
  // a dark neutral brown that sienna alone cannot reach and cerulean greys, varied in strength and a little in hue
  for (let i = 0; i < n; i++) { const t = 0.5 + (i % w) / w, u = (i / w | 0) / h; D.set([0.55 * t * (1 + 0.2 * u), 0.7 * t, 0.85 * t * (1 - 0.2 * u)], i * 3); }
  const P = planPuddles(D, w, h, pigs, [252, 251, 248], { count: 1 }), c = P.colours[0];
  assert.equal(c.side, 'across');
  for (let i = 0; i < n; i++) {
    const a = pigs.map((_, j) => P.A[i * 3 + j]), t = a.reduce((x, v) => x + v, 0);
    if (!(t > 1e-6)) continue;
    c.pans.forEach((j, y) => assert.ok(Math.abs(a[j] / t - c.shares[y]) < 1e-5, `cell ${i} pan ${j}`));
  }
});

test('a small piece of another colour inside a wall is laid with the wall\'s wash, its paint in that charge, never bare', () => {
  const w = 40, h = 40, n = w * h, k = 2, labels = new Int32Array(n), rgb = new Uint8ClampedArray(n * 3), demand = new Float32Array(n * k), density = new Float32Array(n);
  const win = i => { const x = i % w, y = i / w | 0; return x >= 16 && x < 22 && y >= 14 && y < 24; }; // 60 cells, under the 144-cell minimum shape
  for (let i = 0; i < n; i++) {
    if (win(i)) { labels[i] = 1; demand[i * k + 1] = 2.0; rgb.set([40, 42, 50], i * 3); }
    else { labels[i] = 0; demand[i * k] = 0.5; rgb.set([215, 190, 120], i * 3); }
    density[i] = demand[i * k] + demand[i * k + 1];
  }
  const pigments = [{ name: 'yellow ochre', K: [0.03, 0.23, 0.5] }, { name: "Payne's grey", K: [0.34, 0.32, 0.29] }];
  const p = planLightToDark({ demand, k, density, w, h, rgb, pigments, shaped: true, sheetWidthMm: 40, nestedBands: true, puddles: { labels, count: 2 } });
  const laid = new Uint8Array(n); let greyOnWindow = 0;
  for (const L of p.layers) for (const sh of L.shapes) for (let i = 0; i < n; i++) if (sh.mask[i]) { laid[i] = 1; if (win(i)) greyOnWindow += sh.mix[1]; }
  for (let i = 0; i < n; i++) if (win(i)) assert.equal(laid[i], 1, `window cell ${i} left as paper`);
  assert.ok(greyOnWindow > 0, 'the window\'s grey goes into the wash laid over it');
  assert.ok(!p.layers.some(L => L.puddle === 1), 'no lone dot of the window\'s puddle');
});

