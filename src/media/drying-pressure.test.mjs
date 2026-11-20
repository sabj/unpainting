import test from 'node:test';
import assert from 'node:assert/strict';
import { dryingPressure } from './drying-pressure.mjs';

function solve(w, h, wet, rate) {
  const n = w * h, index = Uint8Array.from({ length: n }, (_, i) => +wet(i % w, (i / w) | 0));
  const order = Int32Array.from(Array.from({ length: n }, (_, i) => i).filter(i => index[i]));
  const sink = Float64Array.from(index, (m, i) => m ? rate(i % w, (i / w) | 0) : 0);
  const fx = new Float64Array(n), fy = new Float64Array(n), pressure = new Float64Array(n);
  const result = dryingPressure(order, order.length, index, w, sink, fx, fy, pressure);
  const div = i => fx[i] + fy[i] - (i % w ? fx[i - 1] : 0) - (i >= w ? fy[i - w] : 0);
  assert.ok(result.relativeResidual < 1e-7, JSON.stringify(result));
  return { sink, fx, fy, div, index };
}

test('pressure supplies a pinned sink from the whole film, without a donor band', () => {
  const w = 61, a = solve(w, w, () => true, (x, y) => x === 0 || y === 0 || x === w - 1 || y === w - 1 ? 1 : 0);
  const mean = a.sink.reduce((s, v) => s + v, 0) / (w * w);
  for (let i = 0; i < w * w; i++) assert.ok(Math.abs(a.div(i) + a.sink[i] - mean) < 1e-7);
  assert.ok(a.fx[30 * w + 40] > 0, 'pigment-bearing liquid flows outwards more than 4 mm behind a rim');
  assert.ok(Math.abs(a.fx[30 * w + 40] - a.fy[40 * w + 30]) < 1e-9, 'quarter-turn symmetry');
});

test('disconnected puddles satisfy their own volume balance', () => {
  const a = solve(30, 12, x => x < 10 || x >= 20, x => x === 0 ? 1 : x === 29 ? 2 : 0);
  for (let i = 0; i < a.index.length; i++) if (a.index[i]) assert.ok(Math.abs(a.div(i) + a.sink[i] - (i % 30 < 10 ? .1 : .2)) < 1e-7);
  assert.equal(a.fx[9], 0); assert.equal(a.fx[19], 0);
});

test('a single-cell puddle and a sink-free component have no face flux', () => {
  const a = solve(10, 10, (x, y) => x === 1 && y === 1 || x > 5 && y > 5, (x, y) => x === 1 && y === 1 ? 1 : 0);
  assert.ok(a.fx.every(v => v === 0)); assert.ok(a.fy.every(v => v === 0));
});

test('uniform nonbinary evaporation has no roundoff-driven pressure failure', () => {
  const a = solve(31, 17, () => true, () => .00123456789);
  assert.ok(a.fx.every(v => Math.abs(v) < 1e-12));
  assert.ok(a.fy.every(v => Math.abs(v) < 1e-12));
});
