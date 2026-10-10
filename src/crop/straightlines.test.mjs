import test from 'node:test';
import assert from 'node:assert/strict';
import { lineScore, straightSegments } from './straightlines.mjs';

const W = 120, H = 100;
const rnd = (seed => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff))(3);
/** A field of texture speckle at `noise`, with whatever the draw callback lays on it. A mark is three cells wide, the
 *  width of a ridge response through the pen's blur; a one-cell line falls between the filter's orientations. */
const field = (noise, draw) => {
  const F = new Float32Array(W * H);
  for (let i = 0; i < F.length; i++) F[i] = rnd() < 0.15 ? noise * rnd() : 0;
  draw((x, y, v) => { for (const d of [-1, 0, 1]) { const xx = Math.round(x), yy = Math.round(y) + d; if (xx >= 0 && yy >= 0 && xx < W && yy < H) F[yy * W + xx] = Math.max(F[yy * W + xx], v); } });
  return F;
};

test('a straight line across texture scores its full strength; the texture scores a fraction', () => {
  const F = field(0.3, put => { for (let t = 0; t < 60; t++) put(20 + t * Math.cos(0.4), 30 + t * Math.sin(0.4), 0.2); });
  const { score, angle } = lineScore(F, W, H, { len: 25, angles: 36 });
  const mid = Math.round(30 + 30 * Math.sin(0.4)) * W + Math.round(20 + 30 * Math.cos(0.4));
  assert.ok(score[mid] > 0.15, `on the line ${score[mid].toFixed(3)}`);
  assert.ok(Math.abs(angle[mid] - 0.4) < 0.1, `angle ${angle[mid].toFixed(2)}`);
  // texture: every lit cell more than six cells from the line
  const off = [], ux = Math.cos(0.4), uy = Math.sin(0.4);
  for (let i = 0; i < F.length; i++) { const dx = (i % W) - 20, dy = ((i / W) | 0) - 30; if (F[i] > 0 && Math.abs(dx * uy - dy * ux) > 6) off.push(score[i]); }
  off.sort((a, b) => a - b);
  // the best of 45 orientations through speckle is not nothing, but it is well under the line
  assert.ok(off[Math.floor(off.length * 0.95)] < 0.6 * score[mid], `texture q95 ${off[Math.floor(off.length * 0.95)].toFixed(3)} against the line's ${score[mid].toFixed(3)}`);
});

test('a whisker broken by fur is one segment, end to end', () => {
  // the line has three gaps of two cells, the way a wash crosses a whisker
  const F = field(0.3, put => { for (let t = 0; t < 70; t++) if (t % 20 > 1) put(15 + t, 50 - t * 0.3, 0.25); });
  const segs = straightSegments(F, W, H, { len: 21, top: 5, minLen: 30, hold: 0.35 });
  assert.ok(segs.length >= 1, 'found');
  const s = segs[0];
  assert.ok(s.len >= 60, `length ${s.len}`);
  assert.ok(Math.min(s.ax, s.bx) < 20 && Math.max(s.ax, s.bx) > 80, `runs ${s.ax.toFixed(0)} to ${s.bx.toFixed(0)}`);
});

test('a tight curve is not taken as a straight line', () => {
  const F = field(0, put => { for (let a = 0; a < Math.PI; a += 0.02) put(60 + 12 * Math.cos(a), 50 + 12 * Math.sin(a), 0.25); });
  const segs = straightSegments(F, W, H, { len: 25, top: 5, minLen: 20 });
  assert.equal(segs.length, 0, `${segs.length} segments on a 12-cell arc`);
});

test('two parallel lines are two segments, not one', () => {
  const F = field(0, put => { for (let t = 0; t < 50; t++) { put(30 + t, 40, 0.25); put(30 + t, 48, 0.25); } });
  const segs = straightSegments(F, W, H, { len: 25, top: 5, minLen: 30, clear: 3 });
  assert.equal(segs.length, 2);
  assert.ok(Math.abs(segs[0].ay - segs[1].ay) > 6);
});
