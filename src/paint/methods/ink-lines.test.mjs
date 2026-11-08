import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothPath, simplify, turning, pathSupport, supportedRuns, holdLinesToTarget, inkCapFactor, resample, getWidth, getDark } from './ink-lines.mjs';

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

test('closed-loop simplify does not collapse to 2 points and preserves geometric bounds', () => {
  const N = 40, R = 10;
  const loop = Array.from({ length: N + 1 }, (_, i) => {
    const th = (2 * Math.PI * (i % N)) / N;
    return { x: 50 + R * Math.cos(th), y: 50 + R * Math.sin(th) };
  });
  const smoothed = smoothPath(loop, { tol: 0.5, sigma: 0.1 });
  assert.ok(smoothed.length >= 8, `loop retained ${smoothed.length} vertices`);
  const minX = Math.min(...smoothed.map(p => p.x));
  const maxX = Math.max(...smoothed.map(p => p.x));
  assert.ok(minX < 42 && maxX > 58, 'bounding box preserved');
});

test('calligraphic width and darkness variations (r, d) are preserved along straight lines during direct simplification', () => {
  const pts = Array.from({ length: 41 }, (_, i) => ({
    x: i * 2, y: 10,
    r: i === 20 ? 1.5 : 0.2,
    d: i === 20 ? 0.9 : 0.3,
  }));
  const res = simplify(pts, 0.1);
  assert.ok(res.length < 41, `simplification occurred: length ${res.length} < 41`);
  assert.ok(res.length > 2, `interior swell points retained: length ${res.length} > 2`);
  const midPoint = res.find(p => p.x === 40);
  assert.ok(midPoint != null, 'interior width swell point retained');
  assert.equal(midPoint.r, 1.5);
  assert.equal(midPoint.d, 0.9);
});

test('width and weight variations are preserved along straight lines during direct simplification', () => {
  const pts = Array.from({ length: 41 }, (_, i) => ({
    x: i * 2, y: 10,
    width: i === 20 ? 1.5 : 0.2,
    weight: i === 20 ? 0.9 : 0.3,
  }));
  const res = simplify(pts, 0.1);
  assert.ok(res.length < 41, `simplification occurred: length ${res.length} < 41`);
  assert.ok(res.length > 2, `interior swell points retained: length ${res.length} > 2`);
  const midPoint = res.find(p => p.x === 40);
  assert.ok(midPoint != null, 'interior width swell point retained');
  assert.equal(midPoint.width, 1.5);
  assert.equal(midPoint.weight, 0.9);
});

test('calligraphic swell is preserved under active smoothing in smoothPath', () => {
  const pts = Array.from({ length: 41 }, (_, i) => ({
    x: i * 2, y: 10,
    r: i === 20 ? 1.5 : 0.2,
    d: i === 20 ? 0.9 : 0.3,
  }));
  const res = smoothPath(pts, { tol: 0.1, sigma: 1.0 });
  assert.ok(res.length > 2, `interior swell retained under active smoothing: length ${res.length} > 2`);
  const midPoint = res.find(p => Math.abs(p.x - 40) < 0.5);
  assert.ok(midPoint != null, 'interior width swell point retained near x=40');
  assert.ok(midPoint.r > 1.0, `swell radius preserved: ${midPoint.r}`);
  assert.ok(midPoint.d > 0.7, `swell darkness preserved: ${midPoint.d}`);
});

test('resample, turning, and simplify accept both [x, y] and {x, y} point representations', () => {
  const arr = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const obj = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
  const rArr = resample(arr, 1);
  const rObj = resample(obj, 1);
  assert.equal(rArr.length, rObj.length);
  assert.ok(Math.abs(turning(arr) - turning(obj)) < 1e-6);
  const sArr = simplify(arr, 0.1);
  const sObj = simplify(obj, 0.1);
  assert.equal(sArr.length, 5, 'simplify preserves array polygon vertices');
  assert.equal(sObj.length, 5, 'simplify preserves object polygon vertices');
  for (let k = 0; k < sArr.length; k++) {
    assert.ok(Array.isArray(sArr[k]));
    assert.equal(sArr[k][0], sObj[k].x);
    assert.equal(sArr[k][1], sObj[k].y);
  }
});

test('getWidth and getDark accessors support width/r and weight/absorb/d aliases', () => {
  assert.equal(getWidth({ width: 2.5 }), 2.5);
  assert.equal(getWidth({ r: 1.8 }), 1.8);
  assert.equal(getWidth({ width: 2.5, r: 1.8 }), 2.5);
  assert.ok(Number.isNaN(getWidth({})));
  assert.ok(Number.isNaN(getWidth(null)));

  assert.equal(getDark({ weight: 0.7 }), 0.7);
  assert.equal(getDark({ absorb: 0.8 }), 0.8);
  assert.equal(getDark({ d: 0.9 }), 0.9);
  assert.equal(getDark({ weight: 0.7, d: 0.9 }), 0.7);
  assert.ok(Number.isNaN(getDark({})));
  assert.ok(Number.isNaN(getDark(null)));
});
