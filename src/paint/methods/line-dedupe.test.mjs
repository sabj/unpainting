import test from 'node:test';
import assert from 'node:assert/strict';
import { onePerEdge, runsAlong } from './line-dedupe.mjs';

const line = (x0, y0, x1, y1, n = 11) => ({ points: Array.from({ length: n }, (_, k) => ({ x: x0 + (x1 - x0) * k / (n - 1), y: y0 + (y1 - y0) * k / (n - 1) })) });

test('a planner\'s fence line and the tracer\'s line along it are one edge: the longer is drawn, the other left out whole', () => {
  const hand = line(1, 214, 40, 214), traced = line(2, 215, 38, 214.5);
  const r = onePerEdge([traced, hand], { within: 3 });
  assert.equal(r.dropped, 1);
  assert.deepEqual(r.lines, [hand]);
});

test('two lines farther apart than the tracer resolves, or crossing, or running across, are two lines', () => {
  assert.equal(onePerEdge([line(0, 0, 50, 0), line(0, 5, 50, 5)], { within: 3 }).dropped, 0, 'a parallel line 5 apart');
  assert.equal(onePerEdge([line(0, 0, 50, 0), line(25, -20, 25, 20)], { within: 3 }).dropped, 0, 'a crossing line');
  assert.equal(runsAlong(line(0, 0, 10, 0), line(0, 0, 100, 0), { within: 3 }), true, 'a short piece on a long line');
  assert.equal(runsAlong(line(0, 0, 100, 0), line(0, 0, 10, 0), { within: 3 }), false, 'a long line is not a short piece\'s double');
  assert.throws(() => onePerEdge([], { within: 0 }), /positive/);
});
