import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, deposit, step } from '../../media/sheet.mjs';
import { createBrush, dip, stroke, thirsty } from '../../media/brush.mjs';
import { softenPaths, liftPaths, validateSoftenLift } from './soften-lift.mjs';

const pigments = [{ K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 }];
const box = (w, h, x0, y0, x1, y1) => Uint8Array.from({ length: w * h }, (_, i) => (i % w >= x0 && i % w < x1 && ((i / w) | 0) >= y0 && ((i / w) | 0) < y1 ? 1 : 0));
const pig = (sheet, i) => sheet.G[0][i] + sheet.P[0][i] + sheet.D[0][i];

test('soften paths follow the edge of the shape, and only inside the polygon when one is given', () => {
  const w = 40, h = 40, mask = box(w, h, 10, 10, 30, 30);
  const all = softenPaths(mask, w, h, { r: 2 });
  assert.ok(all.length >= 1);
  for (const path of all) for (const q of path) assert.ok(Math.abs(q.x - 10.5) < 1.5 || Math.abs(q.x - 29.5) < 1.5 || Math.abs(q.y - 10.5) < 1.5 || Math.abs(q.y - 29.5) < 1.5, `point ${q.x},${q.y} is off the edge`);
  const left = softenPaths(mask, w, h, { r: 2, where: box(w, h, 0, 0, 15, 40) });
  for (const path of left) for (const q of path) assert.ok(q.x < 15);
  assert.throws(() => softenPaths(mask, w, h, { r: 0 }));
});

test('lift lanes are one brush width apart and cover the light', () => {
  const w = 40, h = 40, light = box(w, h, 12, 12, 24, 20), lanes = liftPaths(light, w, h, { r: 2 });
  const ys = [...new Set(lanes.map(l => l[0].y))].sort((a, b) => a - b);
  for (let k = 1; k < ys.length; k++) assert.equal(ys[k] - ys[k - 1], 4);
  for (const l of lanes) for (const q of l) assert.ok(q.x >= 12 && q.x <= 24.5 && q.y >= 12 && q.y < 20);
});

test('a damp clean brush along a wet edge carries paint out past it (soft edge); over a wet light it lifts paint', () => {
  const W = 64, wash = box(W, W, 8, 8, 40, 56);
  const lay = () => { const s = createSheet(makePaper(W, W, { seed: 4 }), pigments); for (let i = 0; i < W * W; i++) if (wash[i]) deposit(s, i, 0.8, [0.05]); step(s); return s; };
  const damp = () => { const b = createBrush({ flat: false, radius: 3, capacity: 60, splay: 0 }); dip(b, { water: 1, conc: [0] }); return thirsty(b); };
  const outside = s => { let t = 0; for (let y = 12; y < 52; y++) for (let x = 41; x < 44; x++) t += pig(s, y * W + x); return t; };
  const plain = lay(), soft = lay();
  for (const path of softenPaths(wash, W, W, { r: 3, where: box(W, W, 36, 0, 64, 64) })) stroke(damp(), soft, path, { upright: true });
  for (let k = 0; k < 20; k++) { step(plain); step(soft); }
  assert.ok(outside(soft) > outside(plain), `paint past the edge ${outside(soft)} vs ${outside(plain)}`);
  const lifted = lay(), light = box(W, W, 16, 20, 30, 34), under = s => { let t = 0; for (let i = 0; i < W * W; i++) if (light[i]) t += pig(s, i); return t; };
  const before = under(lifted), b = damp();
  for (const path of liftPaths(light, W, W, { r: 3 })) stroke(b, lifted, path, { upright: true });
  assert.ok(under(lifted) < before, `the light holds ${under(lifted)} of ${before}`);
});

test('the validator takes soften and lift only on wet washes laid by the plan, with reasons', () => {
  const poly = () => {}, ok = { move: 'wet on wet', lights: { mode: 'lift', reason: 'cloud', polygon: [[0, 0], [1, 0], [1, 1]] }, soften: { reason: 'cheek turns' } };
  validateSoftenLift(ok, 'a/p', poly);
  validateSoftenLift({ move: 'dry brush', lights: { mode: 'none' } }, 'a/p', poly);
  assert.throws(() => validateSoftenLift({ ...ok, move: 'dry brush' }, 'a/p', poly), /wet on wet or wet on dry/);
  assert.throws(() => validateSoftenLift({ ...ok, source: 'authored' }, 'a/p', poly), /authored/);
  assert.throws(() => validateSoftenLift({ ...ok, soften: {} }, 'a/p', poly), /reason/);
  assert.throws(() => validateSoftenLift({ ...ok, soften: { reason: 'x', strength: 2 } }, 'a/p', poly), /unknown field/);
});
