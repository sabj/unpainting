import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothPath, turning, pathSupport, supportedRuns, holdLinesToTarget, inkCapFactor, resample } from './ink-lines.mjs';

// a 60 x 40 L* plane: paper at 90 with a dark horizontal line (L* 40) one pixel wide along row 10, and a step edge
// at x = 30 below row 20 (left 30, right 90)
function plane() {
  const w = 60, h = 40, L = new Float32Array(w * h).fill(90);
  for (let x = 0; x < w; x++) L[10 * w + x] = 40;
  for (let y = 21; y < h; y++) for (let x = 0; x < 30; x++) L[y * w + x] = 30;
  return { L, w, h };
}
const line = (pts, extra = {}) => ({ points: pts.map(p => [p.x, p.y]), ...extra });
const straight = (y, x0 = 5, x1 = 55) => Array.from({ length: 11 }, (_, k) => ({ x: x0 + (x1 - x0) * k / 10, y }));

test('a path along a dark line has support near its contrast; flat paper and a light line have none', () => {
  const { L, w, h } = plane();
  const on = pathSupport(resample(straight(10.5), 0.5), L, w, h).support, off = pathSupport(resample(straight(5.5), 0.5), L, w, h).support;
  const mid = a => Array.from(a).sort((p, q) => p - q)[a.length >> 1];
  assert.ok(mid(on) > 30, `on the line ${mid(on)}`);
  assert.ok(Math.abs(mid(off)) < 1, `on blank paper ${mid(off)}`);
  // a white line on a dark ground scores below zero
  const dark = new Float32Array(w * h).fill(30); for (let x = 0; x < w; x++) dark[10 * w + x] = 90;
  assert.ok(mid(pathSupport(resample(straight(10.5), 0.5), dark, w, h).support) < -20);
});

test('a path along a tonal edge with no line is not supported', () => {
  const { L, w, h } = plane();
  const edge = Array.from({ length: 11 }, (_, k) => ({ x: 30, y: 22 + k * 1.6 }));
  const s = pathSupport(resample(edge, 0.5), L, w, h).support, m = Array.from(s).sort((a, b) => a - b)[s.length >> 1];
  assert.ok(m < 3, `edge support ${m}`);
});

test('the filter keeps the supported part of a line and drops the rest', () => {
  const { L, w, h } = plane();
  // half on the dark line, then a bend away over blank paper
  const pts = [{ x: 5, y: 10.5 }, { x: 30, y: 10.5 }, { x: 30, y: 18 }, { x: 55, y: 18 }];
  const r = holdLinesToTarget([line(pts), line(straight(5.5))], L, w, h, { threshold: 6 });
  assert.equal(r.stats.lines, 2);
  assert.equal(r.stats.kept, 1);
  assert.equal(r.lines.length, 1);
  const xs = r.lines[0].points.map(p => p[0]), ys = r.lines[0].points.map(p => p[1]);
  assert.ok(Math.min(...xs) <= 6 && Math.max(...xs) >= 28 && Math.max(...xs) <= 32, `kept span ${Math.min(...xs)}..${Math.max(...xs)}`);
  assert.ok(Math.max(...ys) < 13, `kept down to y ${Math.max(...ys)}`);
  assert.ok(r.stats.keptPx / r.stats.lengthPx < 0.5);
});

test('threshold 0 measures without cutting, and widths and weights follow the kept points', () => {
  const { L, w, h } = plane();
  const g = line(straight(10.5), { widths: Array(11).fill(0.4), weights: Array(11).fill(0.7), role: 'subject' });
  const all = holdLinesToTarget([g, line(straight(5.5))], L, w, h, { threshold: 0 });
  assert.equal(all.lines.length, 2);
  assert.equal(all.lines[0], g, 'unchanged lines pass through as they are');
  assert.ok(all.stats.lineL < 55 && all.stats.sideL > 80, `line ${all.stats.lineL} beside ${all.stats.sideL}`);
  assert.ok(all.stats.absorbance > 0.5);
  const cut = holdLinesToTarget([g], L, w, h, { threshold: 6, sigma: 1 });
  assert.equal(cut.lines[0].role, 'subject');
  assert.equal(cut.lines[0].widths.length, cut.lines[0].points.length);
  assert.ok(cut.lines[0].weights.every(v => Math.abs(v - 0.7) < 1e-6));
});

test('smoothing takes the steps out of a pixel staircase and keeps its ends', () => {
  const stairs = []; for (let k = 0; k < 20; k++) stairs.push({ x: k, y: k }, { x: k + 1, y: k });
  const s = smoothPath(stairs, { sigma: 1.5, cornerDeg: 50 });
  assert.ok(turning(s) < 0.25 * turning(stairs), `turning ${turning(stairs).toFixed(1)} to ${turning(s).toFixed(1)}`);
  assert.deepEqual([s[0].x, s[0].y], [0, 0]);
  assert.deepEqual([s.at(-1).x, s.at(-1).y], [20, 19]);
  for (const p of s) assert.ok(Math.abs(p.x - p.y - 0.5) < 1.2, `off the diagonal at ${p.x}, ${p.y}`);
  assert.equal(stairs[1].x, 1, 'input not changed');
});

test('smoothing keeps a right-angle corner', () => {
  const pts = [...Array.from({ length: 21 }, (_, k) => ({ x: k, y: 0 })), ...Array.from({ length: 20 }, (_, k) => ({ x: 20, y: k + 1 }))];
  const s = smoothPath(pts, { sigma: 2, cornerDeg: 50 });
  const corner = s.reduce((b, p) => (Math.hypot(p.x - 20, p.y) < Math.hypot(b.x - 20, b.y) ? p : b));
  assert.ok(Math.hypot(corner.x - 20, corner.y) < 1e-6, `corner moved to ${corner.x}, ${corner.y}`);
  const rounded = smoothPath(pts, { sigma: 2, cornerDeg: 181 });
  const near = rounded.reduce((b, p) => Math.min(b, Math.hypot(p.x - 20, p.y)), Infinity);
  assert.ok(near > 0.5, 'with no corner limit the corner rounds off');
});

test('supported runs join short gaps and drop short runs', () => {
  const s = Float32Array.from([0, 0, 10, 10, 10, 10, 10, 10, 0, 10, 10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 0, 10, 10, 0, 0, 0, 0]);
  const { runs } = supportedRuns(s, { threshold: 6, window: 0.5, gap: 2, minRun: 4 });
  assert.deepEqual(runs, [[2, 14]]);
});

test('the dark cap only thins the ink', () => {
  assert.equal(inkCapFactor(4, 0.8, 1), 0.2);
  assert.equal(inkCapFactor(0.5, 0.8, 1), 1);
  assert.equal(inkCapFactor(4, 0.8, 0), 1);
  assert.equal(inkCapFactor(4, 0, 1), 1);
});
