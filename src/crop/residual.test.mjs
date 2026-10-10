// A picture a brush could make keeps no ink; a picture only a pen could make keeps almost all of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitInkFromWash, washable } from './residual.mjs';

const W = 120, H = 100, N = W * H;
const blank = () => new Float32Array(N);
const disc = (D, cx, cy, r, v) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) D[y * W + x] = Math.max(D[y * W + x], v); };
const line = (D, x0, y0, x1, y1, v, wide) => {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3);
  for (let s = 0; s <= steps; s++) {
    const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
    for (let dy = -wide; dy <= wide; dy++) for (let dx = -wide; dx <= wide; dx++) {
      const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (Math.hypot(xx - x, yy - y) > wide) continue;
      D[yy * W + xx] = Math.max(D[yy * W + xx], v);
    }
  }
};

test('a broad flat wash needs no ink at all', () => {
  const D = blank(); disc(D, 60, 50, 30, 0.35);
  const s = splitInkFromWash(D, W, H, { radius: 6 });
  assert.ok(s.inkShare < 0.02, `a brush made all of this: ink share ${(100 * s.inkShare).toFixed(1)}%`);
});

test('a hairline is all ink, because no brush that wide could have laid it', () => {
  const D = blank(); line(D, 15, 50, 105, 50, 0.9, 1);
  const s = splitInkFromWash(D, W, H, { radius: 6 });
  assert.ok(s.inkShare > 0.8, `the pen made this: ink share ${(100 * s.inkShare).toFixed(1)}%`);
});

test('a line over a wash keeps the line and gives the wash away', () => {
  const D = blank();
  disc(D, 60, 50, 30, 0.3);
  line(D, 20, 50, 100, 50, 0.95, 1);
  const s = splitInkFromWash(D, W, H, { radius: 6 });
  // the ink that survives sits on the line and nowhere else
  let onLine = 0, offLine = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) (Math.abs(y - 50) <= 2 ? (onLine += s.ink[y * W + x]) : (offLine += s.ink[y * W + x]));
  assert.ok(onLine > 6 * offLine, `the residual is the line: ${onLine.toFixed(1)} on it against ${offLine.toFixed(1)} off it`);
  assert.ok(s.washShare > 0.55, `and the wash is left to the brush: ${(100 * s.washShare).toFixed(0)}%`);
});

test('what counts as ink depends on the brush: a wide brush leaves more of it', () => {
  const D = blank(); line(D, 15, 50, 105, 50, 0.7, 4);      // an 8 cell band
  const narrow = splitInkFromWash(D, W, H, { radius: 3 });
  const wide = splitInkFromWash(D, W, H, { radius: 12 });
  assert.ok(narrow.inkShare < 0.05, `a small brush could lay an 8 cell band: ${(100 * narrow.inkShare).toFixed(1)}%`);
  assert.ok(wide.inkShare > 5 * narrow.inkShare + 0.1, `a mop could not: ${(100 * wide.inkShare).toFixed(0)}%`);
});

test('the washable part never exceeds the target', () => {
  const D = blank();
  disc(D, 40, 40, 20, 0.4); disc(D, 80, 60, 15, 0.7); line(D, 10, 80, 110, 85, 0.9, 1);
  const wash = washable(D, W, H, 6);
  for (let i = 0; i < N; i++) assert.ok(wash[i] <= D[i] + 1e-6, 'a wash is never asked to overshoot');
});
