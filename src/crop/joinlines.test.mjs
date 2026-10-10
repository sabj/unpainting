import test from 'node:test';
import assert from 'node:assert/strict';
import { joinLines } from './joinlines.mjs';

const line = (x0, y0, x1, y1, n = 10) =>
  Array.from({ length: n }, (_, i) => ({ x: x0 + (x1 - x0) * i / (n - 1), y: y0 + (y1 - y0) * i / (n - 1) }));

const arc = (cx, cy, r, a0, a1, n = 12) =>
  Array.from({ length: n }, (_, i) => { const a = a0 + (a1 - a0) * i / (n - 1); return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; });

test('two collinear fragments with a gap become one line', () => {
  const g = [line(0, 0, 20, 0), line(28, 0, 48, 0)];
  const { gestures, joined } = joinLines(g, { gap: 12 });
  assert.equal(joined, 1);
  assert.equal(gestures.length, 1);
  const pts = gestures[0].pts;
  assert.ok(pts[0].x === 0 && pts[pts.length - 1].x === 48, 'runs end to end');
  // the bridge fills the gap rather than leaping it
  const jumps = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  assert.ok(Math.max(...jumps) <= 3, `largest step ${Math.max(...jumps).toFixed(1)}`);
});

test('an arch broken into three arcs comes back as one', () => {
  const g = [arc(0, 0, 40, Math.PI, Math.PI * 1.3), arc(0, 0, 40, Math.PI * 1.35, Math.PI * 1.65), arc(0, 0, 40, Math.PI * 1.7, Math.PI * 2)];
  const { gestures, joined } = joinLines(g, { gap: 16, cos: 0.9, aim: 0.8 });
  assert.equal(joined, 2);
  assert.equal(gestures.length, 1);
});

test('lines lying side by side are not stitched end to end', () => {
  // two parallel verticals a few cells apart: their ends are close, their tangents agree, but the gap runs across them
  const g = [line(0, 0, 0, 30), line(6, 0, 6, 30)];
  const { joined } = joinLines(g, { gap: 12 });
  assert.equal(joined, 0);
});

test('a line meeting another at a corner is not joined to it', () => {
  const g = [line(0, 0, 20, 0), line(24, 2, 24, 30)];
  const { joined } = joinLines(g, { gap: 12 });
  assert.equal(joined, 0, 'a right angle is a corner, not a continuation');
});

test('a gap wider than the allowance is left alone', () => {
  const g = [line(0, 0, 20, 0), line(60, 0, 80, 0)];
  assert.equal(joinLines(g, { gap: 12 }).joined, 0);
});

test('each end is used once and no chain closes on itself', () => {
  const g = [line(0, 0, 20, 0), line(26, 0, 46, 0), line(52, 0, 72, 0)];
  const { gestures, joined } = joinLines(g, { gap: 12 });
  assert.equal(joined, 2);
  assert.equal(gestures.length, 1);
  assert.equal(gestures[0].pts.filter(p => p.x === 0).length, 1);
});

test('gestures keep their other fields', () => {
  const g = [{ pts: line(0, 0, 20, 0), weight: 3, outline: true }, { pts: line(28, 0, 48, 0), weight: 3 }];
  const { gestures } = joinLines(g, { gap: 12 });
  assert.equal(gestures[0].weight, 3);
  assert.equal(gestures[0].outline, true);
});

test('bare point arrays are accepted', () => {
  const { gestures, joined } = joinLines([line(0, 0, 20, 0), line(28, 0, 48, 0)], { gap: 12 });
  assert.equal(joined, 1);
  assert.ok(Array.isArray(gestures[0].pts));
});

test('maxJoins caps the work', () => {
  const g = [line(0, 0, 20, 0), line(26, 0, 46, 0), line(52, 0, 72, 0)];
  assert.equal(joinLines(g, { gap: 12, maxJoins: 1 }).joined, 1);
});

test('nothing to join returns the input', () => {
  const g = [line(0, 0, 20, 0)];
  const { gestures, joined } = joinLines(g, { gap: 12 });
  assert.equal(joined, 0);
  assert.equal(gestures.length, 1);
});
