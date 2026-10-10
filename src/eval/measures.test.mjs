import test from 'node:test';
import assert from 'node:assert/strict';
import { markStats, inkPlacement, inkMask, paperShare } from './marks.mjs';
import { washShapes, flatness, rim, lineExclusion } from './wash.mjs';

const W = 128, H = 128, N = W * H;
const field = fn => { const D = new Float32Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) D[y * W + x] = fn(x, y); return D; };
const ridgeAt = (x0, amp = 0.6, s = 1.2) => (x, y) => amp * Math.exp(-(((x - x0) / s) ** 2));
const disc = (cx, cy, r) => (x, y) => (Math.hypot(x - cx, y - cy) <= r ? 1 : 0);

test('mark counting splits a drawing into separate marks and measures their length', () => {
  // five separate horizontal marks, forty pixels each
  const m = new Uint8Array(N);
  for (let k = 0; k < 5; k++) for (let x = 20; x < 60; x++) m[(20 + k * 12) * W + x] = 1;
  const s = markStats(m, W, H);
  assert.equal(s.count, 5);
  assert.equal(s.medianLength, 40);
  assert.equal(s.totalLength, 200);
  assert.equal(s.shortShare, 0);
});

test('crossing marks are cut at the junction, not counted as one', () => {
  const m = new Uint8Array(N);
  for (let x = 20; x < 100; x++) m[60 * W + x] = 1;
  for (let y = 20; y < 100; y++) m[y * W + 60] = 1;
  // one horizontal and one vertical mark crossing: four arms once the junction is removed
  assert.equal(markStats(m, W, H).count, 4);
});

test('a thousand crumbs and a few long marks are told apart', () => {
  const few = new Uint8Array(N), many = new Uint8Array(N);
  for (let k = 0; k < 8; k++) for (let x = 10; x < 110; x++) few[(10 + k * 14) * W + x] = 1;
  for (let k = 0; k < 8; k++) for (let x = 10; x < 110; x++) if (x % 6 < 4) many[(10 + k * 14) * W + x] = 1;
  const a = markStats(few, W, H), b = markStats(many, W, H);
  assert.equal(a.count, 8);
  assert.ok(b.count > 100, `crumbs should count in the hundreds, got ${b.count}`);
  assert.ok(a.medianLength > 10 * b.medianLength);
  assert.equal(a.shortShare, 0);
  assert.ok(b.shortShare > 0.9, `crumbs are nearly all short, got ${b.shortShare}`);
});

test('ink laid along a wash edge is charged as boundary ink, ink on a line is not', () => {
  const painted = field(ridgeAt(64));
  const step = inkPlacement(painted, field((x) => 0.7 / (1 + Math.exp(-(x - 64) / 2))), W, H);
  const line = inkPlacement(painted, field(ridgeAt(64)), W, H);
  assert.ok(step.ink > 50 && line.ink > 50, 'both cases must find the painted line');
  assert.ok(step.boundaryShare > 0.9, `a line drawn on a tone step should read as boundary ink, got ${step.boundaryShare}`);
  assert.ok(line.lineShare > 0.9, `a line drawn on a line should read as a line, got ${line.lineShare}`);
  assert.ok(line.boundaryShare < 0.05);
});

test('a line with a neighbour three pixels away is still a line, not a boundary', () => {
  // hatching: one probe out from a stroke lands on the next stroke, and a single sample would call the pair a step
  const hatched = field((x, y) => [56, 60, 64, 68, 72].reduce((s, c) => s + ridgeAt(c, 0.6, 1.0)(x, y), 0));
  const p = inkPlacement(hatched, hatched, W, H);
  assert.ok(p.lineShare > 0.85, `hatching drawn on hatching should read as lines, got ${p.lineShare}`);
});

test('ink on blank ground is charged as flat, neither line nor boundary', () => {
  const p = inkPlacement(field(ridgeAt(64)), new Float32Array(N), W, H);
  assert.ok(p.flatShare > 0.95, `a line over nothing should read as flat, got ${p.flatShare}`);
});

test('untouched paper is the share below three percent of paper', () => {
  const D = field((x) => (x < 32 ? 0.5 : 0.0));
  assert.ok(Math.abs(paperShare(D, N) - 0.75) < 1e-6);
});

test('a flat wash and a blotchy one of the same mean are told apart', () => {
  const shape = washShapes(field(disc(64, 64, 40)).map(v => v * 0.4), W, H);
  assert.equal(shape.length, 1);
  const none = new Uint8Array(N);
  const flat = flatness(field((x, y) => (disc(64, 64, 40)(x, y) ? 0.4 : 0)), shape[0], W, H, none);
  const blobby = flatness(field((x, y) => (disc(64, 64, 40)(x, y) ? 0.4 + 0.3 * Math.sin(x / 7) * Math.sin(y / 7) : 0)), shape[0], W, H, none);
  assert.ok(flat.blotch < 0.05, `an even film should be flat, got ${flat.blotch}`);
  assert.ok(blobby.blotch > 0.2, `puddles should read blotchy, got ${blobby.blotch}`);
  assert.ok(Math.abs(flat.mean - blobby.mean) < 0.05, 'the two washes must have the same mean tone, or the test proves nothing');
});

test('a rim on the whole perimeter, on half of it, and on none are told apart', () => {
  const R = 40, shape = washShapes(field(disc(64, 64, R)).map(v => v * 0.4), W, H)[0];
  const make = where => field((x, y) => {
    const d = Math.hypot(x - 64, y - 64); if (d > R) return 0;
    const inRim = d > R - 4 && where(Math.atan2(y - 64, x - 64));
    return 0.4 + (inRim ? 0.25 : 0);
  });
  const none = new Uint8Array(N);
  const all = rim(make(() => true), shape, W, H), half = rim(make(a => a > 0), shape, W, H), bare = rim(make(() => false), shape, W, H);
  assert.ok(all.rimShare > 0.9, `a rim all the way round should read near 1, got ${all.rimShare}`);
  assert.ok(bare.rimShare < 0.05, `no rim should read near 0, got ${bare.rimShare}`);
  assert.ok(Math.abs(half.rimShare - 0.5) < 0.12, `a rim on half the perimeter should read near 0.5, got ${half.rimShare}`);
  assert.ok(none.length === N);
});

test('linework inside a wash is excluded from its flatness, so a drawn line is not a blotch', () => {
  const D = field((x, y) => (disc(64, 64, 40)(x, y) ? 0.4 + (Math.abs(x - 64) < 1 ? 0.9 : 0) : 0));
  const shape = washShapes(field(disc(64, 64, 40)).map(v => v * 0.4), W, H)[0];
  const ink = inkMask(D, W, H).mask, exclude = lineExclusion(ink, new Uint8Array(N), W, H);
  const counted = flatness(D, shape, W, H, new Uint8Array(N)), ignored = flatness(D, shape, W, H, exclude);
  assert.ok(counted.blotch > 2 * ignored.blotch, `excluding the line should drop blotchiness: ${counted.blotch} vs ${ignored.blotch}`);
});
