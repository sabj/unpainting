// A wobbly edge becomes a line; a corner stays a corner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simplify, resample, drawAs } from './simplify.mjs';

const wobbly = (n = 60) => Array.from({ length: n }, (_, i) => ({ x: 50 + ((i % 3) - 1) * 0.8, y: 10 + i }));
const corner = () => [...Array.from({ length: 20 }, (_, i) => ({ x: 10 + i, y: 10 })), ...Array.from({ length: 20 }, (_, i) => ({ x: 30, y: 10 + i }))];

test('a wobble within the tolerance collapses to two points', () => {
  const out = simplify(wobbly(), 2);
  assert.equal(out.length, 2, `${out.length} points`);
});

test('a corner survives', () => {
  const out = simplify(corner(), 2);
  assert.ok(out.length >= 3 && out.length <= 4, `${out.length} points`);
  const mid = out[1];
  assert.ok(Math.abs(mid.x - 30) < 2 && Math.abs(mid.y - 10) < 2, `corner at ${mid.x},${mid.y}`);
});

test('resample puts points back evenly along the line', () => {
  const out = resample([{ x: 0, y: 0 }, { x: 0, y: 10 }], 2);
  assert.equal(out.length, 6);
  for (let i = 1; i < out.length; i++) assert.ok(Math.abs(Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y) - 2) < 0.51);
});

test('drawAs keeps the ends where the edge starts and stops', () => {
  const pts = wobbly(40), out = drawAs(pts, { tolerance: 2, step: 3 });
  assert.ok(Math.hypot(out[0].x - pts[0].x, out[0].y - pts[0].y) < 1.5);
  assert.ok(Math.hypot(out[out.length - 1].x - pts[pts.length - 1].x, out[out.length - 1].y - pts[pts.length - 1].y) < 3);
});


test('a collinear reversal survives even when it lies on the endpoint line', () => {
  const points = [{x:0,y:0},{x:20,y:0},{x:10,y:0}];
  assert.deepEqual(simplify(points, 1), points);
});
