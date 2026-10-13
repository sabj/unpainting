import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeEvidence } from './line-evidence.mjs';
import { joinThenPrune, gapSupported } from './line-join.mjs';

const W = 160, H = 100, MM = 152.4 / 540;
// a dark block (y 40 to 99) under white paper: one long horizontal edge at y 40, light above it
const rgb = new Uint8Array(W * H * 3).fill(240);
for (let y = 40; y < H; y++) for (let x = 0; x < W; x++) rgb.set([60, 60, 60], 3 * (y * W + x));
const ev = edgeEvidence(rgb, W, H), L = ev.smooth[0];
const seg = (x0, y0, x1, y1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0))); return { points: Array.from({ length: n + 1 }, (_, k) => ({ x: x0 + (x1 - x0) * k / n, y: y0 + (y1 - y0) * k / n, width: 1, weight: 0.8 })) }; };

test('two pieces of one edge with a small gap become one line', () => {
  const r = joinThenPrune([seg(10, 40, 60, 40), seg(64, 40, 120, 40)], ev, L, { mmPerCell: MM });
  assert.equal(r.stats.joined, 1);
  assert.equal(r.lines.length, 1);
  assert.ok(r.lines[0].points.length > 100);
  assert.ok(r.lines[0].points.every(q => q.width === 1 && q.weight === 0.8), 'the gap takes the ends\' width and weight');
});

test('pieces that do not continue each other, or meet across a corner, stay apart', () => {
  const across = joinThenPrune([seg(10, 40, 60, 40), seg(63, 43, 63, 90)], ev, L, { mmPerCell: MM });
  assert.equal(across.stats.joined, 0);
  const parallel = joinThenPrune([seg(10, 40, 60, 40), seg(62, 45, 110, 45)], ev, L, { mmPerCell: MM });
  assert.equal(parallel.stats.joined, 0);
});

test('a gap over blank paper is a deliberate break and stays', () => {
  // two pieces in line, but the gap lies in plain paper with no edge under it
  const r = joinThenPrune([seg(10, 15, 60, 15), seg(64, 15, 120, 15)], ev, L, { mmPerCell: MM });
  assert.equal(r.stats.joined, 0);
  assert.equal(gapSupported({ x: 60, y: 15 }, { x: 64, y: 15 }, ev, L), false);
  assert.equal(gapSupported({ x: 60, y: 40 }, { x: 64, y: 40 }, ev, L), true);
});

test('a gap that would run through another line is not bridged', () => {
  const r = joinThenPrune([seg(10, 40, 60, 40), seg(66, 40, 120, 40), seg(63, 20, 63, 60)], ev, L, { mmPerCell: MM });
  assert.equal(r.stats.joined, 0);
});

test('only isolated marks off every edge are deleted', () => {
  const r = joinThenPrune([seg(10, 40, 60, 40), seg(30, 15, 32, 15), seg(80, 40, 82, 40)], ev, L, { mmPerCell: MM });
  assert.equal(r.stats.deleted, 1);
  assert.equal(r.lines.length, 2);
});
