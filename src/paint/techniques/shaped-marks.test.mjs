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

test('non-rectangular thin diagonal mask keeps a single PCA spine inside the mask', () => {
  const w = 200, h = 200, m = new Uint8Array(w * h);
  for (let y = 20; y < 180; y++) {
    for (let x = 20; x < 180; x++) {
      if (Math.abs(x - y) <= 10) m[y * w + x] = 1;
    }
  }
  const lanes = shapedPlanePaths(m, w, h, { mmPerCell: 0.5, maxBrushMm: 38 });
  assert.equal(lanes.length, 1, 'Thin 45-degree diagonal strip emits 1 PCA lane, not multiple horizontal lanes');
  const pts = lanes[0];
  let inside = 0;
  for (const p of pts) {
    const ix = Math.round(p.x - 0.5), iy = Math.round(p.y - 0.5);
    if (ix >= 0 && ix < w && iy >= 0 && iy < h && m[iy * w + ix]) inside++;
  }
  assert.ok(inside / pts.length >= 0.95, `Expected >= 95% of spine points inside mask, got ${(100 * inside / pts.length).toFixed(1)}%`);
});

test('multi-lane splits keep uniform lane-boundary density without double-coated seams or bottom-edge cutouts', async () => {
  const { makePaper } = await import('../../media/paper.mjs');
  const { createSheet } = await import('../../media/sheet.mjs');
  const { createBrush, dip, stroke } = await import('../../media/brush.mjs');
  const w = 240, h = 180, m = new Uint8Array(w * h).fill(1);
  // Carve a bottom-edge reserve cutout (x = 100..130, y = 150..179) to verify envelope bridging
  for (let y = 150; y < h; y++) for (let x = 100; x < 130; x++) m[y * w + x] = 0;
  const lanes = shapedPlanePaths(m, w, h, { mmPerCell: 0.5, maxBrushMm: 38 });
  assert.equal(lanes.length, 3, 'Expected 3 mop lanes');
  // All lanes sweep in the same direction (left to right)
  for (const l of lanes) assert.ok(l[0].x < l[l.length - 1].x, 'Each lane sweeps in the same direction');
  const paper = makePaper(w, h, { seed: 1, mmPerCell: 0.5 });
  const sheet = createSheet(paper, [{ K: [1, 1, 1], S: [0.1, 0.1, 0.1] }]);
  for (let k = 0; k < lanes.length; k++) {
    const pts = lanes[k];
    const r = Math.max(...pts.map(p => p.r));
    const b = createBrush({ flat: true, radius: r, bristles: Math.ceil(r * 2), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, bridge: 0, bridgeSoft: 2.4, seed: 31 + k });
    dip(b, { water: 0.62, conc: [0.5] });
    stroke(b, sheet, pts, { upright: 'sweep' });
  }
  const rowT = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 30; x < 210; x++) s += sheet.D[0][y * w + x] + sheet.G[0][y * w + x];
    rowT[y] = s / 180;
  }
  const body = (rowT[30] + rowT[90] + rowT[140]) / 3;
  const seam1Max = Math.max(...rowT.slice(50, 71));
  const seam1Min = Math.min(...rowT.slice(50, 71));
  // Measured 1.44 with these seeds (1.36 to 1.44 over paper seeds 1 to 3) at the 1.035 lane overlap; the bound is that plus a small margin.
  assert.ok(seam1Max / body <= 1.50, `Lane boundary max density ratio ${(seam1Max / body).toFixed(2)} <= 1.50 (measured 1.44; a 1.80x dark stripe fails)`);
  assert.ok(seam1Min / body >= 0.95, `Lane boundary min density ratio ${(seam1Min / body).toFixed(2)} >= 0.95 (no unbrushed white gap)`);
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


test('multi-lane paths leave no uncovered cell on a wide curved plane', () => {
 const w = 700, h = 500, mm = 0.65, m = new Uint8Array(w * h);
 for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const r = Math.hypot(x - 350, y - 500); if (r > 250 && r < 400 && y < 450) m[y * w + x] = 1; }
 for (const maxBrushMm of [38, 25]) {
  const lanes = shapedPlanePaths(m, w, h, { mmPerCell: mm, maxBrushMm });
  assert.ok(lanes.length > 1);
  const covered = new Uint8Array(w * h);
  for (const lane of lanes) for (let j = 0; j < lane.length; j++) {
   const b = lane[j], a = lane[j - 1] ?? b, n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
   for (let s = 0; s <= n; s++) {
    const t = s / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, r = a.r + (b.r - a.r) * t;
    for (let q = Math.max(0, Math.floor(y - r)); q < Math.min(h, Math.ceil(y + r + 1)); q++) for (let k = Math.max(0, Math.floor(x - r)); k < Math.min(w, Math.ceil(x + r + 1)); k++) if ((k + .5 - x) ** 2 + (q + .5 - y) ** 2 <= r * r) covered[q * w + k] = 1;
   }
  }
  let holes = 0, cells = 0;
  for (let i = 0; i < m.length; i++) if (m[i]) { cells++; if (!covered[i]) holes++; }
  assert.ok(holes / cells < 0.001, `${maxBrushMm} mm brush left ${holes} of ${cells} cells uncovered`);
 }
});

// A flat wash laid in lanes leaves a thin bare seam where two lanes meet (measured: about 8 cells of paper on a 1200 px
// plate). Each pigment is its own coat over the same plane, so if every coat splits at the same place the seams stack
// into one white slash. A painter shifts the stroke boundaries from coat to coat; the coat option does the same.
test("successive coats on one plane split their lanes at different seams", () => {
 const w = 700, h = 500, mm = 0.4, m = new Uint8Array(w * h);
 for (let y = 100; y < 300; y++) for (let x = 60; x < 640; x++) m[y * w + x] = 1;
 const seam = coat => { const lanes = shapedPlanePaths(m, w, h, { mmPerCell: mm, maxBrushMm: 38, coat }), i = lanes[0].length >> 1; return { n: lanes.length, at: (lanes[0][i].y + lanes[0][i].r + lanes[1][i].y - lanes[1][i].r) / 2, lanes }; };
 const first = seam(0), plain = shapedPlanePaths(m, w, h, { mmPerCell: mm, maxBrushMm: 38 });
 assert.deepEqual(first.lanes, plain, "the first coat keeps the established lane layout");
 const at = [0, 1, 2, 3, 4, 5].map(c => seam(c).at);
 for (let a = 0; a < at.length; a++) for (let b = a + 1; b < at.length; b++) assert.ok(Math.abs(at[a] - at[b]) >= 3, `coats ${a} and ${b} share a seam: ${at[a].toFixed(1)} and ${at[b].toFixed(1)}`);
 for (let c = 0; c < 6; c++) {
  const { n, lanes } = seam(c); assert.equal(n, first.n, "the lane count does not change");
  for (const l of lanes) for (const p of l) assert.ok(p.r <= 38 / (2 * mm) + 1e-6, "a lane never exceeds the brush");
  const covered = new Uint8Array(w * h);
  for (const lane of lanes) for (const b of lane) for (let q = Math.floor(b.y - b.r); q <= Math.ceil(b.y + b.r); q++) for (let k = Math.floor(b.x - b.r); k <= Math.ceil(b.x + b.r); k++) if (q >= 0 && q < h && k >= 0 && k < w && (k + .5 - b.x) ** 2 + (q + .5 - b.y) ** 2 <= b.r * b.r) covered[q * w + k] = 1;
  let holes = 0, cells = 0; for (let i = 0; i < m.length; i++) if (m[i]) { cells++; if (!covered[i]) holes++; }
  assert.ok(holes / cells < 0.002, `coat ${c} left ${holes} of ${cells} cells uncovered`);
 }
});

// The joins between lanes meet in solid paint: each lane is wide enough that the brush's solid reach (its half-width
// less the wander of its sides and the fringe of outer hairs, brush.mjs solidHalfWidth) covers half the lane pitch,
// for every coat however its joins are moved, and no lane is wider than the brush.
test("lanes are spaced by the brush's solid reach, so neighbouring lanes meet in solid paint", () => {
 const w = 700, h = 500, mm = 0.4, m = new Uint8Array(w * h);
 for (let y = 100; y < 300; y++) for (let x = 60; x < 640; x++) m[y * w + x] = 1;
 const solidHalf = (r, p) => 0.8 * r * (0.9 + 0.1 * p) - 1; // a brush whose solid paint stops well inside its radius
 const brushR = 38 / (2 * mm);
 for (let coat = 0; coat < 6; coat++) {
  const lanes = shapedPlanePaths(m, w, h, { mmPerCell: mm, maxBrushMm: 38, coat, solidHalf });
  assert.ok(lanes.length > 1, 'a plane wider than the brush is laid in lanes');
  const mid = lanes[0].length >> 1;
  for (let k = 0; k + 1 < lanes.length; k++) {
   const a = lanes[k][mid], b = lanes[k + 1][mid], gap = Math.hypot(b.x - a.x, b.y - a.y);
   assert.ok(solidHalf(a.r, a.p) + solidHalf(b.r, b.p) >= gap - 1e-6, `coat ${coat}, lanes ${k} and ${k + 1}: solid reach ${(solidHalf(a.r, a.p) + solidHalf(b.r, b.p)).toFixed(1)} short of the pitch ${gap.toFixed(1)}`);
  }
  for (const l of lanes) for (const p of l) assert.ok(p.r <= brushR + 1e-6, 'a lane never exceeds the brush');
 }
});
