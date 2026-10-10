import test from 'node:test';
import assert from 'node:assert/strict';
import { inkLines, tracePaths, simplify, majorityLabel } from './ink-lines.mjs';

const PAPER = [245, 235, 215];
const W = 120, H = 80;
// a sheet with one long thin pen line across it and one broad wash block
function sheet() {
  const b = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) b.set(PAPER, i * 3);
  const put = (x, y, rgb) => b.set(rgb, (y * W + x) * 3);
  for (let x = 15; x < 105; x++) { put(x, 30, [90, 60, 40]); put(x, 31, [120, 90, 65]); }
  for (let y = 50; y < 75; y++) for (let x = 60; x < 100; x++) put(x, y, [170, 140, 110]);
  return b;
}

test('the pen line becomes one candidate line; the wash does not', () => {
  const labels = new Uint8Array(W * H); for (let i = 0; i < W * H / 2; i++) labels[i] = 1;
  const r = inkLines(sheet(), W, H, PAPER, { labels, legend: { 0: 'background', 1: 'head' }, subject: ['head'], margin: 0.05 });
  const long = r.lines.filter(g => g.length > 40);
  assert.equal(long.length, 1);
  assert.equal(long[0].region, 'head');
  assert.equal(long[0].role, 'subject');
  assert.ok(long[0].points.every(([, y]) => y >= 28 && y <= 33));
  assert.ok(!r.lines.some(g => g.points.every(([x, y]) => x >= 60 && y >= 50)), 'no line inside the wash block');
});

test('a staircase skeleton traces as one path', () => {
  const w = 20, h = 20, skel = new Uint8Array(w * h);
  for (let k = 2; k < 16; k++) { skel[k * w + k] = 1; skel[k * w + k + 1] = 1; }
  const paths = tracePaths(skel, w, h);
  assert.equal(paths.length, 1);
  assert.equal(paths[0].length, 28);
});

test('simplify keeps the corners and majorityLabel votes', () => {
  assert.deepEqual(simplify([[0, 0], [5, 0.1], [10, 0], [10, 10]], 0.5), [[0, 0], [10, 0], [10, 10]]);
  const labels = Uint8Array.from({ length: 100 }, (_, i) => (i % 10 < 3 ? 2 : 1));
  assert.equal(majorityLabel([[0, 0], [1, 0], [5, 0]], labels, 10, 10), 2);
});
