import test from 'node:test';
import assert from 'node:assert/strict';
import { representativeMark, markKey, markLayout, readMark } from './mark-swatch.mjs';
import { SWATCH } from './scrap-swatch.mjs';

const touch = (x, y, len, r = 3) => ({ radiusMm: r, points: [[x, y, 0.2], [x + len / 2, y, 0.9], [x + len, y, 0.15]] });

test('the mark that stands for a passage is its stroke of median length, moved to the origin', () => {
  const m = representativeMark([touch(10, 10, 4), touch(50, 20, 8), touch(30, 30, 20)]);
  assert.equal(m.lengthMm, 8); assert.deepEqual(m.points[0].slice(0, 2), [0, 0]); assert.equal(m.radiusMm, 3);
  assert.ok(Math.abs(m.pressure - (0.2 + 0.9 + 0.15) / 3) < 1e-9);
  assert.equal(representativeMark([]), null);
});

test('marks of one brush, about one length and pressure share a reading; a different brush or length does not', () => {
  const a = representativeMark([touch(0, 0, 8)]), b = representativeMark([touch(5, 5, 8.4)]);
  assert.equal(markKey(a), markKey(b));
  assert.notEqual(markKey(a), markKey(representativeMark([touch(0, 0, 8, 1)])));
  assert.notEqual(markKey(a), markKey(representativeMark([touch(0, 0, 20)])));
});

test('the swatch sets the mark out apart from its copies, inside the scrap, at the sheet\'s cell size when it fits', () => {
  const L = markLayout(representativeMark([touch(0, 0, 8, 1.5)]), 0.23);
  assert.equal(L.mm, 0.23); assert.ok(L.copies >= 2 && L.copies <= 4);
  for (const p of L.paths.flat()) assert.ok(p.x > SWATCH.x0 - 1 && p.x < SWATCH.x1 + 1 && p.y > SWATCH.y0 - 1 && p.y < SWATCH.y1 + 1);
  assert.ok(Math.abs(L.paths[1][0].y - L.paths[0][0].y) >= 2 * 1.5 / 0.23, 'copies do not touch');
  assert.ok(L.mask.reduce((a, v) => a + v, 0) > 50);
  // a mark longer than the scrap: the scrap's cells grow to hold it
  const big = markLayout(representativeMark([touch(0, 0, 60, 6)]), 0.23);
  assert.ok(big.mm > 0.23); assert.ok(big.copies >= 1);
});

test('a swatch is read at its core: a narrow track at full film reads full, with its coverage beside it', () => {
  const mask = new Uint8Array(100).fill(1), th = new Float32Array(100);
  for (let i = 0; i < 60; i++) th[i] = 0.3;
  const r = readMark(th, mask, 0.3);
  assert.ok(Math.abs(r.delivered - 1) < 1e-6); assert.ok(Math.abs(r.whole - 0.6) < 1e-6); assert.ok(Math.abs(r.coverage - 0.6) < 1e-6);
});
