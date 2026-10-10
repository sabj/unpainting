import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness, DEFAULTS } from '../../media/sheet.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { layPassage, dryFully, calibrateYield, TECHNIQUES, chargeFor } from './lay.mjs';

const O = { ...DEFAULTS, edgeEvap: 0.0012, gran: 0.25 };
const sienna = boxPigment(BOX.find(p => p.key === 'sienna'));
const W = 64, H = 64, N = W * H;
const square = (x0, y0, x1, y1) => { const m = new Uint8Array(N); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1; return m; };
const fresh = () => createSheet(makePaper(W, H, { seed: 5, scale: 1, toothScale: 0.2 }), [sienna]);
const inside = (th, mask) => { let s = 0, c = 0; for (let i = 0; i < N; i++) if (mask[i]) { s += th[i]; c++; } return s / c; };

test('a passage laid wet on dry lands inside its mask, by the brush, and dries there', () => {
  const sheet = fresh(), mask = square(16, 16, 48, 48);
  const r = layPassage(sheet, mask, [1], { w: W, h: H, T: TECHNIQUES['wet on dry'], maxRadius: 8, seed: 3, O });
  assert.ok(r.sweeps >= 2 && r.dips >= r.sweeps, `${r.sweeps} sweeps, ${r.dips} dips`);
  dryFully(sheet, O);
  const th = thickness(sheet)[0], far = square(0, 0, W, 10);
  assert.ok(inside(th, mask) > 0.15, `inside ${inside(th, mask)}`);
  assert.ok(inside(th, far) < 0.01, `far ${inside(th, far)}`);
  assert.equal(sheet.layers.length, 1, 'one dried layer');
});

test('a dry brush leaves the tooth showing where a wet brush fills it', () => {
  const mask = square(12, 12, 52, 52);
  const bare = T => { const sheet = fresh(); layPassage(sheet, mask, [1], { w: W, h: H, T, maxRadius: 8, seed: 3, O }); dryFully(sheet, O); const th = thickness(sheet)[0]; let b = 0, c = 0; for (let i = 0; i < N; i++) if (mask[i]) { c++; if (th[i] < 0.01) b++; } return b / c; };
  const dry = bare(TECHNIQUES['dry brush']), wet = bare(TECHNIQUES['wet on dry']);
  assert.ok(dry > wet + 0.1, `dry ${dry.toFixed(2)} wet ${wet.toFixed(2)}`);
});

test('a passage too thin for the mop is still laid, with a small brush', () => {
  const sheet = fresh(), mask = square(10, 30, 54, 33);
  const r = layPassage(sheet, mask, [1], { w: W, h: H, T: TECHNIQUES['wet on dry'], maxRadius: 8, seed: 3, O });
  assert.ok(r.sweeps >= 1, 'rescued');
  dryFully(sheet, O);
  assert.ok(inside(thickness(sheet)[0], mask) > 0.05);
});

test('calibrateYield measures mass per unit charge for every technique', () => {
  const y = calibrateYield([sienna], O, { seed: 5 });
  for (const name of Object.keys(TECHNIQUES)) assert.ok(y[name] > 0.05 && y[name] < 2, `${name}: ${y[name]}`);
  assert.ok(y['dry brush'] < y['wet on dry'], 'a dry brush lays less');
});

test('chargeFor turns a mass along a well into a charge over the sheet pigments, padded and clamped', () => {
  const well = { recipe: Float64Array.from([0.75, 0.25]) };
  const conc = chargeFor(well, 0.4, 0.5, 4);
  assert.equal(conc.length, 4);
  assert.ok(Math.abs(conc[0] - 0.6) < 1e-9 && Math.abs(conc[1] - 0.2) < 1e-9 && conc[2] === 0 && conc[3] === 0);
  assert.ok(chargeFor(well, 100, 0.5, 2).reduce((a, b) => a + b, 0) <= 8.0001, 'clamped');
});

test('softenPassage loses the edge where the source fades and keeps it where the source steps', async () => {
  const { softenPassage } = await import('./lay.mjs');
  const { step } = await import('../../media/sheet.mjs');
  const sheet = fresh(), mask = square(16, 16, 48, 48);
  // the source: the square's tone runs out gently to the right, and stops dead on the left
  const tone = new Float32Array(N);
  for (let y = 16; y < 48; y++) for (let x = 16; x < W; x++) tone[y * W + x] = x < 48 ? 0.5 : Math.max(0, 0.5 - (x - 48) * 0.03);
  layPassage(sheet, mask, [1], { w: W, h: H, T: TECHNIQUES['wet on dry'], maxRadius: 8, seed: 3, O });
  const n = softenPassage(sheet, mask, tone, null, W, H, O, { share: 0.3, radius: 8 });
  assert.ok(n >= 1, 'some edge was softened');
  void step;
  dryFully(sheet, O);
  const th = thickness(sheet)[0];
  const band = (x0, x1) => { let s = 0, c = 0; for (let y = 20; y < 44; y++) for (let x = x0; x < x1; x++) { s += th[y * W + x]; c++; } return s / c; };
  const right = band(46, 50), left = band(12, 16);
  assert.ok(right > left * 3 + 0.002, `right ${right.toFixed(4)} left ${left.toFixed(4)}`);
});
