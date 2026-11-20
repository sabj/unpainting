import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, deposit, step } from '../../media/sheet.mjs';
import { createBrush, dip, stroke, thirsty } from '../../media/brush.mjs';
import { softenPaths } from './soften-lift.mjs';

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

test('a damp clean brush along a wet edge carries paint out past it (soft edge)', () => {
  const W = 64, wash = box(W, W, 8, 8, 40, 56);
  const lay = () => { const s = createSheet(makePaper(W, W, { seed: 4 }), pigments); for (let i = 0; i < W * W; i++) if (wash[i]) deposit(s, i, 0.8, [0.05]); step(s); return s; };
  const damp = () => { const b = createBrush({ flat: false, radius: 3, capacity: 60, splay: 0 }); dip(b, { water: 1, conc: [0] }); return thirsty(b); };
  const outside = s => { let t = 0; for (let y = 12; y < 52; y++) for (let x = 41; x < 44; x++) t += pig(s, y * W + x); return t; };
  const plain = lay(), soft = lay();
  for (const path of softenPaths(wash, W, W, { r: 3, where: box(W, W, 36, 0, 64, 64) })) stroke(damp(), soft, path, { upright: true });
  for (let k = 0; k < 20; k++) { step(plain); step(soft); }
  assert.ok(outside(soft) > outside(plain), `paint past the edge ${outside(soft)} vs ${outside(plain)}`);
});
