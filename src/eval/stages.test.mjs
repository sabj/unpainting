// Stage measures when the source's line is known and the style draws first (pen and wash).
import test from 'node:test';
import assert from 'node:assert/strict';
import { stageMeasures, stageFlags } from './stages.mjs';

const W = 60, H = 60, N = W * H;
const box = (r = 0) => (F, w, h) => { if (!r) return F; const o = new Float32Array(F.length); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, k = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && xx >= 0 && yy < h && xx < w) { s += F[yy * w + xx]; k++; } } o[y * w + x] = s / k; } return o; };
// a box blur whose radius follows the sigma asked for, as a gaussian's reach would
const blur = (F, w, h, sigma = 2) => box(Math.max(1, Math.round(sigma)))(F, w, h);
// the source: a pale wash over the left half, and thin vertical lines every 8 cells
const line = new Uint8Array(N), wash = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (x % 8 === 4) line[i] = 1; if (x < 30) wash[i] = 0.4; }
const source = { D: Float32Array.from({ length: N }, (_, i) => wash[i] + (line[i] ? 1 : 0)), line };
// drawn first: paper, then the lines alone over the first third, then the wash (which also lies over the lines, so the
// line cells' final density is more than the pen's)
const drawnFirst = [0, 0.1, 0.25, 0.3, 0.45, 0.6, 0.8, 1].map(p => ({
  position: p,
  D: Float32Array.from({ length: N }, (_, i) => (line[i] ? Math.min(1, p / 0.3) : 0) + wash[i] * Math.max(0, (p - 0.3) / 0.7)),
}));
// washed first: the wash over the first half, the lines last
const washedFirst = [0, 0.1, 0.25, 0.3, 0.45, 0.6, 0.8, 1].map(p => ({
  position: p,
  D: Float32Array.from({ length: N }, (_, i) => wash[i] * Math.min(1, p / 0.5) + (line[i] ? Math.max(0, (p - 0.6) / 0.4) : 0)),
}));

test('without the source line, a drawing made first reads as specks before depth', () => {
  const m = stageMeasures(drawnFirst, { D: source.D }, W, H, blur);
  assert.ok(m.speckle > 2, `speckle ${m.speckle}`);
});

test('with the source line known, lines on it are not specks', () => {
  const m = stageMeasures(drawnFirst, source, W, H, blur);
  assert.ok(m.speckle < 0.5, `speckle ${m.speckle}`);
});

test('line and wash are reached separately: drawn first has its line down early and its wash late', () => {
  const a = stageMeasures(drawnFirst, source, W, H, blur), b = stageMeasures(washedFirst, source, W, H, blur);
  assert.ok(a.lineReached[0] > 0.6, `drawn first line@25 ${a.lineReached[0]}`);
  assert.ok(a.washReached[0] < 0.1, `drawn first wash@25 ${a.washReached[0]}`);
  assert.ok(b.lineReached[0] < 0.1, `washed first line@25 ${b.lineReached[0]}`);
  assert.ok(b.washReached[0] > 0.4, `washed first wash@25 ${b.washReached[0]}`);
});

test('a style that draws first is flagged when its drawing is not down, and not for tone held back', () => {
  const a = stageFlags(stageMeasures(drawnFirst, source, W, H, blur), { order: 'line first' });
  const b = stageFlags(stageMeasures(washedFirst, source, W, H, blur), { order: 'line first' });
  assert.ok(!a.some(f => /drawing/.test(f)), a.join('; '));
  assert.ok(!a.some(f => /big shapes/.test(f)), a.join('; '));
  assert.ok(b.some(f => /drawing/.test(f)), b.join('; '));
});

test('a style with no order named keeps the watercolour flags', () => {
  const m = stageMeasures(drawnFirst, source, W, H, blur);
  const flags = stageFlags({ ...m, earlyShapes: 0.1, endShapes: 0.9 });
  assert.ok(flags.some(f => /big shapes/.test(f)));
});
