import test from 'node:test';
import assert from 'node:assert/strict';
import { planAccents, accentStroke, accentLack, planAccentPasses } from './accents.mjs';

const W = 40, H = 40, OPTS = { mmPerCell: 0.5, tipMm: 1.2, maxCells: 144, bands: 5 };
const field = v => new Float32Array(W * H).fill(v);
const put = (a, x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a[y * W + x] = v; };

test('a pupil on a light field is one accent and its catchlight is kept as paper', () => {
  const lum = field(0.9);
  put(lum, 18, 18, 21, 21, 0.05);
  lum[19 * W + 19] = 0.97;
  const r = planAccents(lum, W, H, OPTS);
  assert.equal(r.darks.length, 1);
  assert.equal(r.darks[0].cells.length, 15);
  assert.equal(r.lightCount, 1);
  assert.equal(r.lights[19 * W + 19], 1);
});

test('a flat subject has no accents', () => {
  const r = planAccents(field(0.6), W, H, OPTS);
  assert.equal(r.darks.length, 0);
  assert.equal(r.lightCount, 0);
});

test('a dark gap beside a lit streak in a dark coat is part of the coat, not an accent', () => {
  const lum = field(0.12);
  put(lum, 20, 0, 22, 39, 0.9);
  put(lum, 23, 10, 24, 13, 0.02);
  assert.equal(planAccents(lum, W, H, OPTS).darks.length, 0);
});

test('a dark the ladder can carry (its minimum shape or larger) and one under a tip touch are not accents', () => {
  const big = field(0.9); put(big, 10, 10, 22, 22, 0.05);
  assert.equal(planAccents(big, W, H, OPTS).darks.length, 0);
  const speck = field(0.9); put(speck, 20, 20, 21, 20, 0.05); speck[0] = 0.05; speck[1] = 0.05;
  assert.equal(planAccents(speck, W, H, OPTS).darks.length, 0);
});

test('cells the pen draws are left to the pen', () => {
  const lum = field(0.9); put(lum, 18, 18, 21, 21, 0.05);
  const pen = new Uint8Array(W * H); put(pen, 0, 0, 39, 39, 1);
  assert.equal(planAccents(lum, W, H, { ...OPTS, pen }).darks.length, 0);
});

test('the lack is the subject less what the plan books, never below zero', () => {
  const s = Float32Array.from([1, 1, 1, 2, 2, 2]), l = Float32Array.from([0.5, 2, 0, 0.5, 2, 0]);
  assert.deepEqual(accentLack(s, l, [0, 1]), [1, 0, 1.5]);
});

test('planned accent passages: strength from the subject less the ledger, catchlights cut from every passage', () => {
  const n = W * H, px = new Uint8ClampedArray(n * 3).fill(235);
  for (let y = 18; y <= 21; y++) for (let x = 18; x <= 21; x++) px.fill(15, 3 * (y * W + x), 3 * (y * W + x) + 3);
  px.fill(250, 3 * (19 * W + 19), 3 * (19 * W + 19) + 3);
  const pigments = [{ K: [0.9, 0.9, 0.9], S: [0.01, 0.01, 0.01] }];
  const wash = { mask: new Uint8Array(n).fill(1), area: n, amount: 0.02, mix: [0.02] };
  const plan = { layers: [{ shapes: [wash] }], protectedCells: new Uint8Array(n) };
  const r = planAccentPasses({ px, plan, pigments, paperRGB: [250, 250, 250], w: W, h: H, ...OPTS });
  assert.equal(r.passages.length, 1);
  assert.ok(r.passages[0].amount > 0);
  assert.equal(plan.protectedCells[19 * W + 19], 1);
  assert.equal(wash.mask[19 * W + 19], 0);
  assert.equal(wash.area, n - 1);
});

test('darks closer than the ladder\'s minimum shape are one group and only the darkest leads', () => {
  const lum = field(0.9);
  put(lum, 10, 10, 12, 12, 0.10);
  put(lum, 15, 10, 17, 12, 0.03);
  const r = planAccents(lum, W, H, OPTS);
  assert.equal(r.found, 2);
  assert.equal(r.darks.length, 1);
  assert.ok(r.darks[0].lum < 0.05);
});

test('darks a minimum shape apart are each an accent (two eyes)', () => {
  const lum = field(0.9);
  put(lum, 4, 20, 6, 22, 0.05);
  put(lum, 30, 20, 32, 22, 0.05);
  assert.equal(planAccents(lum, W, H, OPTS).darks.length, 2);
});

test('a compact accent (a pupil) is one round touch as wide as the piece, not a bar', () => {
  const lum = field(0.9); put(lum, 18, 18, 21, 21, 0.05);
  const [d] = planAccents(lum, W, H, OPTS).darks;
  const p = accentStroke(d, W, { SC: 2, tipR: 1 });
  const span = Math.hypot(p.at(-1).x - p[0].x, p.at(-1).y - p[0].y);
  assert.ok(span < 1, `a touch, not a stroke: span ${span}`);
  assert.ok(p[0].r >= 3 && p[0].r <= 5, `as wide as the piece: r ${p[0].r}`);
  assert.ok(Math.abs(p[0].x - 40) < 2 && Math.abs(p[0].y - 40) < 2);
});

test('a curved accent (a lid line) is one stroke along its own curve, every point inside the piece', () => {
  const lum = field(0.9), arc = [];
  for (let x = 8; x <= 30; x++) { const y = Math.round(20 + ((x - 19) ** 2) / 12); lum[y * W + x] = 0.05; lum[(y + 1) * W + x] = 0.05; arc.push(y * W + x, (y + 1) * W + x); }
  const [d] = planAccents(lum, W, H, OPTS).darks;
  const p = accentStroke(d, W, { SC: 1, tipR: 0.5 });
  assert.ok(p.length >= 4);
  const inPiece = new Set(d.cells);
  for (const q of p) assert.ok(inPiece.has(Math.floor(q.y) * W + Math.floor(q.x)), `point ${q.x},${q.y} off the piece`);
  const ends = Math.hypot(p.at(-1).x - p[0].x, p.at(-1).y - p[0].y);
  assert.ok(ends > 15, `runs the length of the curve: ${ends}`);
});
