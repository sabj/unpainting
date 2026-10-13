// The subject field's rules on synthetic pictures: where a wash may cross a subject boundary, which clusters inside a
// subject share a wash, how shadows group, and which cells are a subject's own lights.
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentsBy, confinedMean, describeField, snapToEdges, subjectField } from './subject-clusters.mjs';

const W = 60, H = 40, N = W * H;
// subject 1 is the left half, subject 2 the right
const halves = () => ({ width: W, height: H, labels: Uint8Array.from({ length: N }, (_, i) => (i % W < W / 2 ? 1 : 2)) });
const paint = colourAt => { const px = new Uint8Array(N * 3); for (let i = 0; i < N; i++) px.set(colourAt(i % W, Math.floor(i / W)), i * 3); return px; };
const field = (px, seg = halves(), options = {}) => subjectField({ seg, px, w: W, h: H, minShape: 12, options: { lights: 0, ...options } });
const groupsOn = (f, cells) => new Set(cells.map(i => f.wash[i]));
const at = (x, y) => y * W + x;

test('a wash crosses between subjects where colour and value run on, and stops at a hard edge', () => {
  const smooth = field(paint(() => [190, 120, 70]));
  assert.equal(groupsOn(smooth, [at(5, 5), at(55, 5)]).size, 1, 'one colour over both subjects: one wash group');
  const hard = field(paint(x => (x < W / 2 ? [190, 120, 70] : [60, 90, 170])));
  assert.equal(groupsOn(hard, [at(5, 5), at(55, 5)]).size, 2, 'orange against blue: two wash groups');
  assert.equal(hard.summary.washCrossings, 0);
});

test('inside a subject, one local colour at two values is one wash; two local colours are two', () => {
  const sameHue = field(paint((x, y) => (x >= W / 2 ? [60, 90, 170] : y < H / 2 ? [200, 140, 90] : [120, 70, 30])));
  assert.equal(groupsOn(sameHue, [at(5, 5), at(5, 35)]).size, 1, 'light and dark orange share the first wash');
  const twoHues = field(paint((x, y) => (x >= W / 2 ? [60, 90, 170] : y < H / 2 ? [200, 140, 90] : [120, 125, 128])));
  assert.equal(groupsOn(twoHues, [at(5, 5), at(5, 35)]).size, 2, 'orange and grey are washed apart');
  assert.equal(twoHues.shadow[at(5, 5)], twoHues.shadow[at(5, 35)], 'a shadow glaze runs over its whole subject');
});

test('a shadow crosses between subjects where value runs on, even when the colour changes', () => {
  // the boundary is a soft colour change at one value: a glaze may cross, the local washes may not
  const f = field(paint(x => { const t = Math.min(1, Math.max(0, (x - 20) / 20)); return [Math.round(150 - 60 * t), 120, Math.round(90 + 60 * t)]; }), halves(), { mean: 4, edge: 6 });
  assert.equal(f.shadow[at(2, 5)], f.shadow[at(57, 5)]);
});

test('bare paper is never a bridge between two subjects', () => {
  // three subjects in a row: orange, paper, a slightly different orange; the paper touches both smoothly
  const seg = { width: W, height: H, labels: Uint8Array.from({ length: N }, (_, i) => 1 + Math.min(2, Math.floor((i % W) / 20))) };
  const f = field(paint(x => (x < 20 ? [230, 200, 170] : x < 40 ? [252, 252, 252] : [228, 196, 172])), seg);
  assert.notEqual(f.wash[at(5, 5)], f.wash[at(55, 5)]);
});

test("a subject's lights are its own lightest planes, well over its median", () => {
  const px = paint((x, y) => (x < W / 2 && x > 8 && x < 16 && y > 10 && y < 18 ? [235, 210, 190] : x < W / 2 ? [150, 100, 70] : [80, 80, 80]));
  const f = subjectField({ seg: halves(), px, w: W, h: H, minShape: 12, options: { lights: 0.1, lightGap: 6 } });
  assert.equal(f.lights[at(12, 14)], 1);
  assert.equal(f.lights[at(3, 30)], 0);
  assert.equal(f.lights[at(45, 20)], 0, 'a flat subject has no lights of its own');
  assert.match(describeField(f), /^subject washes: 2 SAM regions \([\d.]+% of cells moved onto the picture's edges\) cut into \d+ colour and value clusters/);
});

test('the group table lists each wash group with its subjects', () => {
  const f = field(paint(x => (x < W / 2 ? [190, 120, 70] : [60, 90, 170])));
  assert.equal(f.summary.groups.length, 2);
  assert.deepEqual(Object.keys(f.summary.groups[0].subjects).length, 1);
});

test('confinedMean never smooths across a label', () => {
  const labels = Uint8Array.from({ length: 10 }, (_, i) => (i < 5 ? 1 : 2)), v = Float32Array.from({ length: 10 }, (_, i) => (i < 5 ? 0.2 : 0.9));
  const m = confinedMean(v, labels, 10, 1, 3);
  assert.ok(Math.abs(m[4] - 0.2) < 1e-6 && Math.abs(m[5] - 0.9) < 1e-6);
});

test('componentsBy cuts one connected mask at a group boundary', () => {
  const mask = new Uint8Array(20).fill(1), groups = Uint8Array.from({ length: 20 }, (_, i) => (i % 10 < 5 ? 1 : 2));
  const c = componentsBy(mask, groups, 10, 2);
  assert.equal(c.count, 2);
  assert.notEqual(c.labels[0], c.labels[9]);
});

test('a field on a mismatched grid is refused', () => {
  assert.throws(() => subjectField({ seg: { width: 10, height: 10, labels: new Uint8Array(100) }, px: new Uint8Array(N * 3), w: W, h: H, minShape: 4 }), /segments are 10x10/);
});

test("SAM's boundary settles onto the picture's own edge", () => {
  // the colour edge is at x = 30; SAM put the boundary at x = 27
  const px = paint(x => (x < 30 ? [200, 120, 60] : [40, 70, 160]));
  const seg = Uint16Array.from({ length: N }, (_, i) => (i % W < 27 ? 1 : 2));
  const lab = subjectField({ seg: { width: W, height: H, labels: Uint8Array.from(seg) }, px, w: W, h: H, minShape: 12, options: { lights: 0 } });
  assert.equal(lab.subject[at(28, 20)], 1, 'the orange cells SAM gave to the blue side come back');
  assert.equal(lab.subject[at(31, 20)], 2);
  const flat = snapToEdges(seg, [new Float32Array(N).fill(50), new Float32Array(N), new Float32Array(N)], W, H);
  assert.equal(flat.moved, 0, 'with no edge in the picture nothing moves');
});
