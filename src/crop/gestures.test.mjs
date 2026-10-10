// Each picture has a known answer. The first is a long line with gaps, which should come back as one mark.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planGestures, longShare, flowAt } from './gestures.mjs';

const W = 200, H = 160, N = W * H;
const blank = () => new Float32Array(N);
const stamp = (D, x, y, v = 0.6, r = 1.4) => {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const d = Math.hypot(xx - x, yy - y); if (d > r) continue;
    D[yy * W + xx] = Math.max(D[yy * W + xx], v * (1 - d / (r + 0.5)));
  }
};
/** A curve drawn into the field, stepped by DISTANCE rather than by its parameter, so an arc comes out as a line
 *  and not as a row of dots. Gaps are given in the parameter, as stretches of it that are not drawn. */
const curve = (D, fn, t0, t1, { gaps = [], spacing = 0.3 } = {}) => {
  let prev = fn(t0), steps = 0;
  for (let t = t0; t <= t1; ) {
    const [x, y] = fn(t);
    if (!gaps.some(([a, b]) => t >= a && t <= b)) stamp(D, x, y);
    // advance by however much parameter moves `spacing` pixels, found by a short probe
    const dt = Math.max(1e-4, (t1 - t0) / 4000);
    const [nx, ny] = fn(t + dt);
    const speed = Math.max(1e-6, Math.hypot(nx - x, ny - y) / dt);
    t += spacing / speed;
    prev = [x, y];
    if (++steps > 20000) break;
  }
};
const longest = gs => gs.reduce((a, g) => Math.max(a, g.length), 0);

test('a long line broken by gaps comes back as one gesture, not as pieces', () => {
  const D = blank();
  // 150 px of line with two washes crossing it
  curve(D, t => [20 + t, 80 + 12 * Math.sin(t / 60)], 0, 150, { gaps: [[52, 60], [96, 105]] });
  const scales = [6, 2.5, 0];
  const { gestures } = planGestures(D, W, H, { seed: 3, tries: 40, scales });
  assert.ok(gestures.length > 0, 'something was drawn');
  assert.ok(longest(gestures) > 110, `one gesture carries most of the line: longest ${longest(gestures).toFixed(0)} of 150`);
  // Several passes over a line are expected; the total length laid is capped against the line itself.
  const laid = gestures.filter(g => g.length > 40).reduce((a, g) => a + g.length, 0);
  assert.ok(laid < 150 * (scales.length + 1), `the line is stated, not scribbled: ${laid.toFixed(0)} px laid over a 150 px line across ${scales.length} scales`);
});

test('the gap it will cross is bounded: two separate lines stay two gestures', () => {
  const D = blank();
  curve(D, t => [20 + t, 50], 0, 60);
  curve(D, t => [130 + t, 50], 0, 50);        // 50 px of clean paper between them
  const { gestures } = planGestures(D, W, H, { seed: 5, tries: 40, carry: 14 });
  const runs = gestures.filter(g => g.length > 30);
  assert.ok(runs.length >= 2, `both lines are drawn: ${runs.length} marks over 30 px`);
  assert.ok(longest(gestures) < 120, `and not joined into one across the paper: longest ${longest(gestures).toFixed(0)}`);
});

test('a curve is followed round, not cut at its bends', () => {
  const D = blank();
  curve(D, t => [100 + 55 * Math.cos(t), 80 + 55 * Math.sin(t)], 0, Math.PI * 1.4);   // an arc about 240 px long
  const { gestures } = planGestures(D, W, H, { seed: 11, tries: 40 });
  assert.ok(longest(gestures) > 150, `the arc is one gesture: longest ${longest(gestures).toFixed(0)}`);
});

test('a drawing of long lines scores a high long share; a field of crumbs does not', () => {
  const lines = blank();
  for (let k = 0; k < 4; k++) curve(lines, t => [15 + t, 25 + k * 35 + 6 * Math.sin(t / 40)], 0, 165);
  const crumbs = blank();
  for (let k = 0; k < 220; k++) {
    const cx = 15 + (k * 37) % 170, cy = 15 + (k * 53) % 130;
    for (let t = 0; t < 5; t += 0.25) stamp(crumbs, cx + t, cy + t * 0.3);
  }
  const a = planGestures(lines, W, H, { seed: 2, tries: 60 }).gestures;
  const c = planGestures(crumbs, W, H, { seed: 2, tries: 200 }).gestures;
  assert.ok(longShare(a, W) > 0.6, `lines carry their ink in long marks: ${(100 * longShare(a, W)).toFixed(0)}%`);
  // On unaligned crumbs the sampler must not join marks: measured by how much of each mark crosses paper.
  const wasteShare = g => g.reduce((s, x) => s + (x.waste || 0), 0) / Math.max(1, g.reduce((s, x) => s + x.length, 0));
  assert.ok(wasteShare(c) > 2 * wasteShare(a) && wasteShare(c) > 0.2,
    `a long mark over crumbs is largely paper: ${(100 * wasteShare(c)).toFixed(0)}% against ${(100 * wasteShare(a)).toFixed(0)}% over real lines`);
});

test('flow follows the line, not the gradient across it', () => {
  const D = blank();
  curve(D, t => [20 + t, 100], 0, 160);
  const f = flowAt(D, W, H, 100, 100, 2);
  assert.ok(Math.abs(f.x) > 0.9, `along a horizontal line: (${f.x.toFixed(2)}, ${f.y.toFixed(2)})`);
  assert.ok(f.coherence > 0.5, `and it knows it is a line: coherence ${f.coherence.toFixed(2)}`);
});

test('bare paper is left alone', () => {
  const { gestures } = planGestures(blank(), W, H, { tries: 30 });
  assert.equal(gestures.length, 0);
});
