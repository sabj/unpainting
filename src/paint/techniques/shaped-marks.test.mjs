import test from 'node:test';
import assert from 'node:assert/strict';
import { shapedPlanePaths, mergePlaneFragments } from './shaped-marks.mjs';

test('a wide physical plane uses the same mop lanes at different native densities', () => {
 const plan = d => {
   const w = 120 * d, h = 100 * d, m = new Uint8Array(w * h).fill(1);
   return shapedPlanePaths(m, w, h, { mmPerCell: .5 / d, maxBrushMm: 38 });
 };
 const a = plan(1), b = plan(2);
 assert.ok(a.length > 1);
 assert.equal(a.length, b.length);
 for (const paths of [a, b]) for (const p of paths) assert.ok(p.length > 1);
});

test('texture marks retain their single broken-contact gesture when shortMm is zero', () => {
 const m = new Uint8Array(120 * 100).fill(1);
 assert.equal(shapedPlanePaths(m, 120, 100, { texture: true, mmPerCell: .5, maxBrushMm: 38 }).length, 1);
});

test('Directive (a): continuous boustrophedon sweep order in skyLanes across row transitions with gaps', () => {
  const w = 100, h = 40, m = new Uint8Array(w * h);
  for (let y = 5; y <= 35; y++) {
    for (let x = 10; x <= 40; x++) m[y * w + x] = 1;
    for (let x = 60; x <= 90; x++) m[y * w + x] = 1;
  }
  const lanes = shapedPlanePaths(m, w, h, { lanesR: 6, laneStep: 2.0 });
  assert.ok(lanes.length >= 4, `Expected at least 4 stroke segments, got ${lanes.length}`);
  const s0 = lanes[0], s1 = lanes[1];
  assert.ok(s0[0].x < s0[s0.length - 1].x, 'Row 0 seg 0 sweeps left to right');
  assert.ok(s1[0].x < s1[s1.length - 1].x, 'Row 0 seg 1 sweeps left to right');
  assert.ok(s0[0].x < s1[0].x, 'Row 0 seg 0 is left of seg 1');

  // Row 1 (dir < 0) must reverse joined order and sweep right to left
  const s2 = lanes[2], s3 = lanes[3];
  assert.ok(s2[0].x > s2[s2.length - 1].x, 'Row 1 seg 0 sweeps right to left');
  assert.ok(s3[0].x > s3[s3.length - 1].x, 'Row 1 seg 1 sweeps right to left');
  assert.ok(s2[0].x > s3[0].x, 'Row 1 seg 0 is on the right, seg 1 on the left (reversed joined order)');

  // Boustrophedon continuity: end of row 0 is adjacent to start of row 1
  const dBetweenRows = Math.hypot(s1[s1.length - 1].x - s2[0].x, s1[s1.length - 1].y - s2[0].y);
  const dAcrossCanvas = Math.hypot(s1[s1.length - 1].x - s3[0].x, s1[s1.length - 1].y - s3[0].y);
  assert.ok(dBetweenRows < dAcrossCanvas, `Row transition is continuous (${dBetweenRows.toFixed(1)} < ${dAcrossCanvas.toFixed(1)})`);
});

test('Directive (b): short sky regions (< 0.6r) emit at least one centerline lane', () => {
  const w = 60, h = 30, m = new Uint8Array(w * h);
  for (let y = 10; y <= 12; y++) for (let x = 10; x <= 50; x++) m[y * w + x] = 1;
  const lanes = shapedPlanePaths(m, w, h, { lanesR: 10 });
  assert.ok(lanes.length >= 1, 'Emits at least one lane for short sky');
  assert.equal(lanes[0][0].y, 11.5, 'Centerline lane at y = 11.5');
});

test('Directive (b): bottom strips up to y1 are covered by final lane', () => {
  const w = 60, h = 50, m = new Uint8Array(w * h);
  for (let y = 0; y <= 35; y++) for (let x = 5; x <= 55; x++) m[y * w + x] = 1;
  const lanes = shapedPlanePaths(m, w, h, { lanesR: 6, laneStep: 1.5 });
  const maxY = Math.max(...lanes.flatMap(l => l.map(p => p.y)));
  assert.ok(maxY >= 31, `Bottom strip covered, maxY = ${maxY} >= 31`);
});

test('Directive (c): multi-lane splits alternate lane direction on odd k', () => {
  const w = 100, h = 100, m = new Uint8Array(w * h).fill(1);
  const lanes = shapedPlanePaths(m, w, h, { mmPerCell: 0.8, maxBrushMm: 38 });
  assert.ok(lanes.length >= 2, `Split into ${lanes.length} lanes`);
  const l0 = lanes[0], l1 = lanes[1];
  const distEnd0ToStart1 = Math.hypot(l0[l0.length - 1].x - l1[0].x, l0[l0.length - 1].y - l1[0].y);
  const distEnd0ToEnd1 = Math.hypot(l0[l0.length - 1].x - l1[l1.length - 1].x, l0[l0.length - 1].y - l1[l1.length - 1].y);
  assert.ok(distEnd0ToStart1 < distEnd0ToEnd1, `Lane 1 alternates direction: ${distEnd0ToStart1.toFixed(1)} < ${distEnd0ToEnd1.toFixed(1)}`);

  if (lanes.length >= 3) {
    const l2 = lanes[2];
    const distEnd1ToStart2 = Math.hypot(l1[l1.length - 1].x - l2[0].x, l1[l1.length - 1].y - l2[0].y);
    const distEnd1ToEnd2 = Math.hypot(l1[l1.length - 1].x - l2[l2.length - 1].x, l1[l1.length - 1].y - l2[l2.length - 1].y);
    assert.ok(distEnd1ToStart2 < distEnd1ToEnd2, `Lane 2 alternates direction: ${distEnd1ToStart2.toFixed(1)} < ${distEnd1ToEnd2.toFixed(1)}`);
  }
});

test('Directive (d): shortTextureMarks receives mmPerCell in parameter slot', () => {
  const w = 100, h = 100, m = new Uint8Array(w * h).fill(1);
  const marks = shapedPlanePaths(m, w, h, { texture: true, shortMm: 1.6, mmPerCell: 0.25 });
  assert.ok(marks.length > 10, `Expected many short texture marks, got ${marks.length}`);
  const p0 = marks[0];
  const len = Math.hypot(p0[p0.length - 1].x - p0[0].x, p0[p0.length - 1].y - p0[0].y);
  assert.ok(len > 5 && len < 20, `Mark length ${len.toFixed(1)} cells matches physical 2.6mm at 0.25mm/cell`);
});

test('Directive (e): mergePlaneFragments never merges protected highlight labels into darker planes', () => {
  const w = 20, h = 20, n = w * h;
  const labels = new Uint16Array(n).fill(2);
  const rgb = new Uint8Array(n * 3).fill(100);
  const protect = new Uint8Array(n);

  for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) {
    const i = y * w + x;
    labels[i] = 1;
    rgb[i * 3] = 108; rgb[i * 3 + 1] = 108; rgb[i * 3 + 2] = 108;
    protect[i] = 1;
  }

  const unprotected = mergePlaneFragments(labels, w, h, rgb, 50, null);
  assert.equal(unprotected[8 * w + 8], 2, 'Unprotected fragment merged into label 2');

  const protectedResult = mergePlaneFragments(labels, w, h, rgb, 50, protect);
  for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) {
    assert.equal(protectedResult[y * w + x], 1, `Cell (${x}, ${y}) retained label 1`);
  }
});

test('Consult #3: skyLanes never bridges across gaps containing protected catchlights', () => {
  const w = 60, h = 20, m = new Uint8Array(w * h);
  const protect = new Uint8Array(w * h);
  for (let x = 5; x < 20; x++) m[10 * w + x] = 1;
  for (let x = 24; x < 40; x++) m[10 * w + x] = 1;

  const bridged = shapedPlanePaths(m, w, h, { lanesR: 5, protect: null });
  assert.equal(bridged.length, 1, 'Without protect, gap <= 2*R is bridged into 1 sweep');

  protect[10 * w + 21] = 1;
  const unbridged = shapedPlanePaths(m, w, h, { lanesR: 5, protect });
  assert.equal(unbridged.length, 2, 'With protect, gap containing catchlight is NEVER bridged');
});

