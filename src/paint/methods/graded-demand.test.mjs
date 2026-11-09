import test from 'node:test';
import assert from 'node:assert/strict';
import { fitGradedPlane, planeAt, planeAtCell, gradeLoadPressure, softClipMask, GRADED_RANGE } from './graded-demand.mjs';

const grid = (w, h, f) => { const G = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) G[y * w + x] = f(x, y); return G; };
const all = (w, h) => Array.from({ length: w * h }, (_, i) => i);
const meanFactor = (plane, list, w) => list.reduce((s, i) => s + planeAtCell(plane, i, w), 0) / list.length;

test('a linear ramp fits a plane along its gradient and the factor range follows the ramp, mean kept at 1', () => {
  const w = 40, h = 20, list = all(w, h);
  // demand doubles from left to right: 0.5x to 1.5x of the mean
  const G = grid(w, h, x => 0.2 * (0.5 + x / (w - 1)));
  const plane = fitGradedPlane(list, G, w);
  assert.ok(plane, 'a plane is fitted');
  assert.ok(Math.abs(plane.gy) < 1e-6, `no vertical slope, got ${plane.gy}`);
  assert.ok(plane.gx > 0, 'the slope rises to the right');
  assert.ok(Math.abs(meanFactor(plane, list, w) - 1) < 1e-3, 'mean factor over the shape is 1');
  const left = planeAtCell(plane, 10 * w + 0, w), right = planeAtCell(plane, 10 * w + w - 1, w);
  assert.ok(Math.abs(left - 0.5) < 0.03 && Math.abs(right - 1.5) < 0.03, `ends at 0.5 and 1.5, got ${left} and ${right}`);
  assert.ok(Math.abs(plane.range[0] - 0.5) < 0.03 && Math.abs(plane.range[1] - 1.5) < 0.03, 'range reported');
});

test('a uniform shape has no slope and a factor of 1 everywhere', () => {
  const w = 30, h = 30, list = all(w, h), G = new Float32Array(w * h).fill(0.4);
  const plane = fitGradedPlane(list, G, w);
  assert.ok(plane);
  assert.equal(plane.gx, 0); assert.equal(plane.gy, 0);
  for (const i of [0, 455, 899]) assert.equal(planeAtCell(plane, i, w), 1);
  assert.deepEqual(plane.range, [1, 1]);
});

test('a steep ramp is clamped to the graded range and the mean still comes to 1', () => {
  const w = 60, h = 10, list = all(w, h);
  // 10x across the shape: far more than one wash carries
  const G = grid(w, h, x => 0.05 + 0.45 * x / (w - 1));
  const plane = fitGradedPlane(list, G, w);
  let lo = Infinity, hi = -Infinity;
  for (const i of list) { const f = planeAtCell(plane, i, w); lo = Math.min(lo, f); hi = Math.max(hi, f); }
  assert.ok(lo >= GRADED_RANGE.lo - 1e-9 && hi <= GRADED_RANGE.hi + 1e-9, `within [${GRADED_RANGE.lo}, ${GRADED_RANGE.hi}], got ${lo}..${hi}`);
  assert.equal(lo, GRADED_RANGE.lo); assert.equal(hi, GRADED_RANGE.hi);
  assert.ok(Math.abs(meanFactor(plane, list, w) - 1) < 2e-3, `mean factor 1, got ${meanFactor(plane, list, w)}`);
});

test('a vertical gradient on an irregular shape fits a vertical plane only over the shape cells', () => {
  const w = 30, h = 30, list = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - 15) ** 2 + (y - 15) ** 2 < 14 * 14) list.push(y * w + x);
  const G = grid(w, h, (x, y) => 0.1 + 0.2 * y / (h - 1));
  const plane = fitGradedPlane(list, G, w);
  assert.ok(Math.abs(plane.gx) < 1e-6 && plane.gy > 0, 'vertical slope only');
  assert.ok(Math.abs(meanFactor(plane, list, w) - 1) < 1e-3);
  assert.ok(planeAtCell(plane, 2 * w + 15, w) < planeAtCell(plane, 27 * w + 15, w), 'darker at the bottom');
});

test('the plane is low order: fine structure in the demand does not reach the factors', () => {
  const w = 40, h = 40, list = all(w, h);
  // a left-to-right ramp with a 2-cell checkerboard on top; the checker has no place in a plane
  const G = grid(w, h, (x, y) => 0.2 * (0.7 + 0.6 * x / (w - 1)) * (((x >> 1) + (y >> 1)) % 2 ? 1.4 : 0.6));
  const plane = fitGradedPlane(list, G, w);
  const smooth = grid(w, h, x => 0.2 * (0.7 + 0.6 * x / (w - 1)));
  const planeSmooth = fitGradedPlane(list, smooth, w);
  assert.ok(Math.abs(plane.gx - planeSmooth.gx) < 0.02 * Math.abs(planeSmooth.gx), 'the checker leaves the slope alone');
  // the factors of two neighbouring cells never differ by more than the plane's own slope
  let maxStep = 0;
  for (const i of list) if (i % w < w - 1) maxStep = Math.max(maxStep, Math.abs(planeAtCell(plane, i + 1, w) - planeAtCell(plane, i, w)));
  assert.ok(maxStep <= Math.abs(plane.gx) + 1e-9, `no cell-to-cell step beyond the slope, got ${maxStep}`);
});

test('too few cells or no demand give no plane', () => {
  const w = 10, G = new Float32Array(100).fill(0.3);
  assert.equal(fitGradedPlane([0, 1, 2], G, w), null);
  assert.equal(fitGradedPlane(all(10, 10), new Float32Array(100), w), null);
});

test('planeAt reads continuous sheet coordinates and planeAtCell the cell centre', () => {
  const w = 20, h = 20, list = all(w, h), G = grid(w, h, x => 0.1 + 0.1 * x / (w - 1));
  const plane = fitGradedPlane(list, G, w);
  assert.ok(Math.abs(planeAt(plane, 5.5, 3.5) - planeAtCell(plane, 3 * w + 5, w)) < 1e-9);
});

test('gradeLoadPressure shapes one load so factor times pressure follows the plane at every point', () => {
  const w = 40, h = 10, list = all(w, h), G = grid(w, h, x => 0.2 * (0.6 + 0.8 * x / (w - 1)));
  const plane = fitGradedPlane(list, G, w), SC = 2;
  const load = Array.from({ length: 9 }, (_, k) => ({ x: (4 + k * 4) * SC, y: 5 * SC, r: 3, p: 0.9 }));
  const factor = load.reduce((s, q) => s + planeAt(plane, q.x / SC, q.y / SC), 0) / load.length;
  const shaped = gradeLoadPressure(load, plane, factor, SC);
  assert.equal(shaped.length, load.length);
  for (let k = 0; k < load.length; k++) {
    const want = planeAt(plane, load[k].x / SC, load[k].y / SC);
    assert.ok(Math.abs(shaped[k].p * factor - 0.9 * want) < 1e-6, `point ${k}: pressure times load factor follows the plane`);
    assert.equal(shaped[k].x, load[k].x); assert.equal(shaped[k].r, load[k].r);
  }
  assert.ok(shaped[0].p < shaped[8].p, 'the pale end presses lighter than the dark end');
  // the pressure stays inside the sweep's own bounds
  const extreme = gradeLoadPressure([{ x: 0, y: 5 * SC, r: 3, p: 1.2 }, { x: (w - 1) * SC, y: 5 * SC, r: 3, p: 1.2 }], plane, 0.6, SC);
  assert.ok(extreme.every(q => q.p >= 0.18 && q.p <= 1.2));
  assert.deepEqual(gradeLoadPressure(load, null, 1, SC), load, 'no plane, no change');
});

test('softClipMask opens the clip past soft boundary cells only, never past hard ones or into reserved lights', () => {
  const W = 30, H = 30, mask = new Uint8Array(W * H);
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) mask[y * W + x] = 1;
  // top edge soft, bottom edge hard, the sides unlabelled
  const soft = [], hard = [];
  for (let x = 10; x < 20; x++) { soft.push(10 * W + x); hard.push(19 * W + x); }
  const protect = new Uint8Array(W * H); protect[8 * W + 15] = 1;
  const { clip, ring } = softClipMask(mask, { softCells: soft, hardCells: hard }, W, H, 3, protect);
  assert.ok(ring > 0, 'some ring cells were added');
  for (let i = 0; i < W * H; i++) if (mask[i]) assert.equal(clip[i], 1, 'the passage itself stays in the clip');
  assert.equal(clip[8 * W + 12], 1, 'two cells above the soft edge is open');
  assert.equal(clip[7 * W + 12], 1, 'three cells above the soft edge is open');
  assert.equal(clip[6 * W + 12], 0, 'four cells above is beyond the reach');
  assert.equal(clip[21 * W + 12], 0, 'below the hard edge stays clipped');
  assert.equal(clip[8 * W + 15], 0, 'a reserved light stays clipped');
  assert.equal(clip[15 * W + 22], 0, 'an unlabelled side stays clipped');
  const none = softClipMask(mask, { softCells: [], hardCells: hard }, W, H, 3, protect);
  assert.equal(none.ring, 0); assert.equal(none.clip, mask, 'no soft cells: the mask itself is the clip');
});
