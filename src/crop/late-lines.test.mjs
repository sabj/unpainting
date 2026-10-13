import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLateLines, straightness, tilt } from './late-lines.mjs';

const line = (x0, y0, x1, y1, n = 10) => Array.from({ length: n + 1 }, (_, k) => [x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
const zigzag = (x0, y0, len) => Array.from({ length: len + 1 }, (_, k) => [x0 + k, y0 + (k % 2) * 3]);

test('straightness is 1 for a segment and low for a zigzag', () => {
  assert.equal(straightness(line(0, 0, 20, 0)), 1);
  assert.ok(straightness(zigzag(0, 0, 20)) < 0.5);
});

test('late lines keep long straight detail and drop fragments, scribbles and lines the opening already draws', () => {
  const candidates = [
    line(10, 10, 40, 10),   // 0: long straight coursing line, kept
    line(10, 20, 14, 20),   // 1: short crack fragment, dropped
    zigzag(10, 30, 30),     // 2: foliage scribble, dropped
    line(10, 41, 40, 41),   // 3: duplicates an opening line 1 cell away, dropped
    line(50, 10, 50, 60),   // 4: longer straight mullion, kept first
  ];
  const opening = [line(10, 40, 40, 40)];
  assert.deepEqual(selectLateLines(candidates, opening, { w: 80, h: 80 }), [4, 0]);
  assert.deepEqual(selectLateLines(candidates, opening, { w: 80, h: 80, maxLines: 1 }), [4]);
});

test('late lines need a sheet size', () => {
  assert.throws(() => selectLateLines([], [], {}), /w and h/);
});

test('maxTilt keeps square coursing and joints and drops diagonal shadow edges', () => {
  assert.equal(tilt(line(0, 0, 20, 0)), 0);
  assert.equal(tilt(line(0, 0, 0, 20)), 0);
  assert.ok(Math.abs(tilt(line(0, 0, 20, 20)) - 45) < 1e-9);
  const candidates = [line(10, 10, 40, 10), line(10, 20, 40, 45), line(60, 10, 61, 40)];
  assert.deepEqual(selectLateLines(candidates, [], { w: 80, h: 80, maxTilt: 15 }), [2, 0]);
});
