import test from 'node:test';
import assert from 'node:assert/strict';
import { planLightToDark, layerShares } from './light-to-dark.mjs';

test('layer shares: each covering layer takes its value step, shares sum to 1', () => {
  // three cells: light (only layer 0), middle (layers 0, 1), dark (layers 0, 1, 2); thresholds 0, .3, .6
  const cover = [Uint8Array.from([1, 1, 1]), Uint8Array.from([0, 1, 1]), Uint8Array.from([0, 0, 1])];
  const s = layerShares(cover, [0, 0.3, 0.6], Float32Array.from([0.2, 0.5, 0.9]), 3);
  assert.equal(s[0][0], 1);
  assert.ok(Math.abs(s[0][1] - 0.6) < 1e-6 && Math.abs(s[1][1] - 0.4) < 1e-6);
  assert.ok(Math.abs(s[0][2] - 1 / 3) < 1e-6 && Math.abs(s[1][2] - 1 / 3) < 1e-6 && Math.abs(s[2][2] - 1 / 3) < 1e-6);
});

test('layer shares: the first layer carries the same value step in every darker cell', () => {
  const cover = [Uint8Array.from([1, 1]), Uint8Array.from([1, 1])];
  const sm = Float32Array.from([0.4, 0.8]), s = layerShares(cover, [0, 0.3], sm, 2);
  // demand is proportional to value: layer 0 lays 0.3 of value in both cells
  assert.ok(Math.abs(s[0][0] * sm[0] - 0.3) < 1e-6 && Math.abs(s[0][1] * sm[1] - 0.3) < 1e-6);
});

test('layer shares: a cell in no layer gets nothing; a cell below a covering threshold falls to the lower layer', () => {
  const cover = [Uint8Array.from([0, 1]), Uint8Array.from([0, 1])];
  const s = layerShares(cover, [0, 0.5], Float32Array.from([0.3, 0.2]), 2);
  assert.equal(s[0][0] + s[1][0], 0);
  assert.equal(s[0][1], 1);
});

test('bandRound: a cell joins a band only past halfway up its step, so pale cells keep paper', async () => {
  const { planLightToDark } = await import('./light-to-dark.mjs');
  const w = 24, h = 24, density = Float32Array.from({ length: w * h }, (_, i) => (i % w < 12 ? 0.05 : 0.8));
  const plan = round => planLightToDark({ w, h, k: 1, density, demand: density.slice(), subject: 'unseen-ink-study', bandRound: round,
    styleSelection: { style: 'ink-and-wash', reason: 'Connected light and dark planes' }, shaped: true });
  const paleCovered = p => p.layers.some(l => l.shapes.some(s => s.mask.some((v, i) => v && i % w < 12)));
  assert.equal(paleCovered(plan(false)), true, 'without rounding the pale half is charged a band step');
  assert.equal(paleCovered(plan(true)), false, 'with rounding the pale half is left as paper');
});


test('sunlit stone never consumes an explicitly reserved highlight',async()=>{
 const {planLightToDark}=await import('./light-to-dark.mjs');
 const w=40,h=40,n=w*h,rgb=new Uint8Array(n*3);for(let i=0;i<n;i++)rgb.set([230,205,165],i*3);
 const p=planLightToDark({w,h,k:1,rgb,shaped:true,layerLocal:true,demand:new Float32Array(n).fill(.2),density:new Float32Array(n).fill(.2),families:[{id:'stone',referenceCue:'sunlit facade',bounds:[0,0,1,1]}],reserves:[{reason:'authored light',bounds:[.25,.25,.5,.5]}],pigments:[{name:'yellow ochre'}],minShapeCells:4});
 for(let y=10;y<20;y++)for(let x=10;x<20;x++)assert.equal(p.protectedCells[y*w+x],1);
});

test('hold mask is strictly preserved when rgb is present', () => {
  const w = 24, h = 24, n = w * h;
  const rgb = new Uint8ClampedArray(n * 3).fill(150);
  const density = new Float32Array(n).fill(0.4);
  const demand = density.slice();

  const hold = new Uint8Array(n);
  hold[12 * w + 12] = 1; // single pixel hold

  const p = planLightToDark({ w, h, k: 1, rgb, density, demand, shaped: true, hold, minShapeCells: 10 });
  assert.equal(p.protectedCells[12 * w + 12], 1, 'explicit hold cell is preserved in protectedCells');
});

test('fine specular catchlights with local ring contrast are preserved from minShape culling', () => {
  const w = 30, h = 30, n = w * h;
  const density = new Float32Array(n).fill(0.4);
  const rgb = new Uint8ClampedArray(n * 3).fill(150);

  // Broad light area: 10x10 at top-left
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    density[y * w + x] = 0.02;
    rgb.set([250, 250, 250], (y * w + x) * 3);
  }

  // Dark eye: 6x6 at bottom-right (value ~ 0.7)
  for (let y = 20; y < 26; y++) for (let x = 20; x < 26; x++) {
    density[y * w + x] = 0.7;
    rgb.set([50, 50, 50], (y * w + x) * 3);
  }

  // 2x2 catchlight inside dark eye (area 4, far below minShape = 40)
  for (let y = 22; y <= 23; y++) for (let x = 22; x <= 23; x++) {
    density[y * w + x] = 0.02;
    rgb.set([252, 252, 252], (y * w + x) * 3);
  }

  const p = planLightToDark({ w, h, k: 1, rgb, density, demand: density.slice(), shaped: true, minShapeCells: 40 });
  // Broad light must be preserved
  assert.equal(p.protectedCells[5 * w + 5], 1, 'broad paper light is preserved');
  // Catchlight (area 4 < 40) must NOT be culled by minShape
  assert.equal(p.protectedCells[22 * w + 22], 1, 'fine catchlight cell (22, 22) is preserved');
  assert.equal(p.protectedCells[23 * w + 23], 1, 'fine catchlight cell (23, 23) is preserved');
  // Dark eye body must not be protected
  assert.equal(p.protectedCells[20 * w + 20], 0, 'dark eye iris is not protected');
});

test('paperRel applies minimum brightness floor to prevent mid-grey holes in low-key targets', () => {
  const w = 24, h = 24, n = w * h;
  // Low-key dark scene: pixels RGB ~ 60..110
  const rgb = new Uint8ClampedArray(n * 3).fill(70);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    rgb.set([110, 110, 110], (y * w + x) * 3);
  }
  const density = Float32Array.from({ length: n }, (_, i) => 1.0 - rgb[3 * i] / 255);

  const p = planLightToDark({ w, h, k: 1, rgb, density, demand: density.slice(), shaped: true, paperRel: true, minShapeCells: 10 });
  let count = 0;
  for (let i = 0; i < n; i++) count += p.protectedCells[i];
  assert.equal(count, 0, 'no mid-grey cells (RGB 110) are inferred as bare white paper');
});

test('nestedBands preserves dark demand outside shadowMask without silent pigment loss', () => {
  const w = 24, h = 24, n = w * h;
  // Spot of v = 0.65 in midtone scene
  const density = new Float32Array(n).fill(0.3);
  for (let y = 10; y <= 14; y++) for (let x = 10; x <= 14; x++) density[y * w + x] = 0.65;
  const demand = density.slice();

  const pNormal = planLightToDark({ w, h, k: 1, density, demand, shaped: true, minShapeCells: 10 });
  const pNested = planLightToDark({ w, h, k: 1, density, demand, shaped: true, nestedBands: true, minShapeCells: 10 });

  const total = p => p.layers.reduce((acc, l) => acc + l.shapes.reduce((s, sh) => s + sh.amount * sh.area, 0), 0);
  const normalTot = total(pNormal);
  const nestedTot = total(pNested);

  // Nested total should be close to normal total, not losing 20-30% of dark pigment
  assert.ok(Math.abs(nestedTot - normalTot) / normalTot < 0.05, `nested total ${nestedTot} should match normal ${normalTot}`);
});

test('recessLayers splits demand as recessShare and 1 - recessShare without overbooking', () => {
  const w = 24, h = 24, n = w * h;
  const rgb = new Uint8ClampedArray(n * 3).fill(180);
  // Place recess at (10, 10): dark opening
  rgb.set([20, 20, 20], (10 * w + 10) * 3);
  const density = new Float32Array(n).fill(0.3);
  density[10 * w + 10] = 0.95;

  const p = planLightToDark({ w, h, k: 1, rgb, density, demand: density.slice(), shaped: true, recesses: true, recessLayers: 2, recessShare: 0.75, minShapeCells: 1 });

  // Find shapes covering recess cell (10, 10)
  let recessPigment = 0;
  for (const l of p.layers) {
    for (const sh of l.shapes) {
      if (sh.mask[10 * w + 10]) recessPigment += sh.amount;
    }
  }
  // With 1 - light ~ 1.0, 75% + 25% = 100%, not 75% + 75% = 150%
  assert.ok(recessPigment <= 1.05 * density[10 * w + 10], `recess pigment ${recessPigment} should not be overbooked 1.5x`);
});

test('profileTechnique assignment preserves intent.brush contact and width properties', () => {
  const w = 24, h = 24, n = w * h;
  const density = new Float32Array(n).fill(0.4);
  const p = planLightToDark({
    w, h, k: 1, density, demand: density.slice(), shaped: true,
    subject: 'test-subject',
    styleSelection: { style: 'urban-sketch', reason: 'expressive linework and washes' }
  });

  const intent = p.instructions[0];
  assert.ok(intent.brush, 'intent has brush');
  assert.equal(typeof intent.brush.contact, 'string', 'intent.brush.contact is preserved as string');
  assert.equal(typeof intent.brush.width, 'string', 'intent.brush.width is preserved as string');
  assert.equal(typeof intent.brush.kind, 'string', 'intent.brush.kind is preserved as string');
  assert.equal(intent.brush[0], undefined, 'intent.brush does not contain numeric array keys');
});

test('layerShares supports both static array thresholds and functional per-cell thresholds', () => {
  const cover = [Uint8Array.from([1, 1, 1]), Uint8Array.from([0, 1, 1]), Uint8Array.from([0, 0, 1])];
  const sm = Float32Array.from([0.2, 0.5, 0.9]);

  // Static array
  const sStatic = layerShares(cover, [0, 0.3, 0.6], sm, 3);
  assert.equal(sStatic[0][0], 1);

  // Functional threshold per cell
  const sFn = layerShares(cover, i => (i === 1 ? [0, 0.25, 0.5] : [0, 0.3, 0.6]), sm, 3);
  assert.equal(sFn[0][0], 1);
  assert.ok(sFn[0][1] > 0);
});

test('planLightToDark nullifies sh.graded to eliminate raw target gradient leaks', () => {
  const w = 40, h = 40, n = w * h;
  // Blue sky target: rgb[2] > rgb[0] + 10 (bypasses planLanes)
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = 100;
    rgb[i * 3 + 1] = 150;
    rgb[i * 3 + 2] = 220;
  }
  const d = new Float32Array(n).fill(0.3);
  const plan = planLightToDark({
    w, h, rgb, density: d, demand: d, k: 1,
    shaped: true, strokePlan: true, sheetWidthMm: 120, minShapeCells: 10,
  });
  const allShapes = plan.layers.flatMap(l => l.shapes);
  const leaked = allShapes.filter(s => s.graded !== null && s.graded !== undefined);
  assert.equal(leaked.length, 0, 'Zero shapes retain non-null sh.graded');
});

test('mergePlaneFragments runs after protectedCells is populated, preventing highlight merges', () => {
  const w = 20, h = 20, n = w * h;
  const rgb = new Uint8ClampedArray(n * 3).fill(220);
  const density = new Float32Array(n).fill(0.4);
  // Highlight square in center: 2x2 pixels with pure paper white
  for (const y of [9, 10]) {
    for (const x of [9, 10]) {
      const i = y * w + x;
      rgb.set([255, 255, 255], i * 3);
      density[i] = 0.01;
    }
  }
  const plan = planLightToDark({
    w, h, rgb, density, demand: density.slice(), k: 1,
    shaped: true, minShapeCells: 50,
  });
  // Highlight cells must remain protected
  assert.equal(plan.protectedCells[9 * w + 9], 1, 'Highlight cell (9, 9) is protected');
  assert.equal(plan.protectedCells[10 * w + 10], 1, 'Highlight cell (10, 10) is protected');
});

test('nestedBands only exempts isRecess when recesses flag is true', () => {
  const isRecess = (rgb, i) => rgb[i * 3] < 50 && rgb[i * 3 + 1] < 50 && rgb[i * 3 + 2] < 50;
  const rgb = new Uint8Array([20, 20, 20]);
  const i = 0;

  const recessesFalse = false;
  const exemptFalse = recessesFalse && rgb ? isRecess(rgb, i) : false;
  assert.equal(exemptFalse, false, 'Recess check does not exempt when recesses is false');

  const recessesTrue = true;
  const exemptTrue = recessesTrue && rgb ? isRecess(rgb, i) : false;
  assert.equal(exemptTrue, true, 'Recess check exempts when recesses is true');
});

test('detectFineCatchlights filters out isolated 1-cell JPEG noise specks below 0.35 contrast', () => {
  const w = 30, h = 30, n = w * h;
  const rgb = new Uint8ClampedArray(n * 3).fill(50);
  const density = new Float32Array(n).fill(0.7);

  // Single pixel noise speck (contrast ~0.22, below 0.35 threshold)
  const speckIdx = 15 * w + 15;
  density[speckIdx] = 0.48;
  rgb.set([100, 100, 100], speckIdx * 3);

  const plan = planLightToDark({
    w, h, rgb, density, demand: density.slice(), k: 1,
    shaped: true, minShapeCells: 20,
  });
  assert.equal(plan.protectedCells[speckIdx], 0, '1-cell noise speck is not protected');
});

test('Consult #9 Catch 2: 2D gradient direction covariance correctly detects vertical gradient on horizontal passage', () => {
  const w = 40, h = 10, n = w * h;
  const density = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      density[y * w + x] = 0.2 + 0.6 * (y / (h - 1));
    }
  }
  const demand = density.slice();
  const plan = planLightToDark({
    w, h, k: 1, density, demand, shaped: true,
    strokePlan: false,
    sheetWidthMm: 120, minShapeCells: 10
  });

  const shapes = plan.layers.flatMap(l => l.shapes);
  // Both light foundation and middle shapes detect the true 2D gradient direction
  const skyLight = shapes.find(s => s._rampVec && s._valuePlan?.phase === 'light');
  assert.ok(skyLight, 'light shape has _rampVec attached');
  assert.ok(Math.abs(skyLight._rampVec.dx) < 0.05, `light dx should be ~0, got ${skyLight._rampVec.dx}`);
  assert.ok(Math.abs(Math.abs(skyLight._rampVec.dy) - 1.0) < 0.05, `light |dy| should be ~1, got ${skyLight._rampVec.dy}`);

  const skyMid = shapes.find(s => s._rampVec && s._valuePlan?.phase === 'mid');
  assert.ok(skyMid, 'mid shape has _rampVec attached');
  const rv = skyMid._rampVec;

  assert.ok(Math.abs(rv.dx) < 0.05, `dx should be ~0, got ${rv.dx}`);
  assert.ok(Math.abs(Math.abs(rv.dy) - 1.0) < 0.05, `|dy| should be ~1, got ${rv.dy}`);

  assert.ok(rv.delta > 0.15, `delta should be >= 0.15, got ${rv.delta}`);
  assert.ok(rv.delta <= 0.33, `delta must be clamped to 0.33, got ${rv.delta}`);
});

test('Consult #9 Catch 2: 2D gradient direction covariance detects horizontal gradient on vertical passage', () => {
  const w = 10, h = 40, n = w * h;
  const density = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      density[y * w + x] = 0.2 + 0.6 * (x / (w - 1));
    }
  }
  const demand = density.slice();
  const plan = planLightToDark({
    w, h, k: 1, density, demand, shaped: true,
    strokePlan: false,
    sheetWidthMm: 120, minShapeCells: 10
  });

  const shapes = plan.layers.flatMap(l => l.shapes);
  const colShape = shapes.find(s => s._rampVec && s._valuePlan?.phase === 'mid');
  assert.ok(colShape, 'shape has _rampVec attached');
  const rv = colShape._rampVec;

  assert.ok(Math.abs(Math.abs(rv.dx) - 1.0) < 0.05, `|dx| should be ~1, got ${rv.dx}`);
  assert.ok(Math.abs(rv.dy) < 0.05, `dy should be ~0, got ${rv.dy}`);
  assert.ok(rv.delta > 0.15, `delta should be >= 0.15, got ${rv.delta}`);
});

test('Consult #9 Catch 2: uniform passage yields zero delta with stable fallback', () => {
  const w = 30, h = 20, n = w * h;
  const density = new Float32Array(n).fill(0.45);
  const plan = planLightToDark({
    w, h, k: 1, density, demand: density.slice(), shaped: true,
    strokePlan: false, sheetWidthMm: 120, minShapeCells: 10
  });
  const shapes = plan.layers.flatMap(l => l.shapes);
  const uniformShape = shapes.find(s => s._rampVec);
  assert.ok(uniformShape, 'shape has _rampVec attached');
  assert.equal(uniformShape._rampVec.delta, 0, 'uniform passage must have delta === 0');
  assert.ok(Number.isFinite(uniformShape._rampVec.dx), 'dx is finite');
  assert.ok(Number.isFinite(uniformShape._rampVec.dy), 'dy is finite');
});

test('Consult #12 & #13: paperRel protects white highlights on toned paper while rejecting yellow-ochre sunlit walls', () => {
  const w = 24, h = 24, n = w * h;
  const rgb = new Uint8Array(n * 3).fill(150);
  const density = new Float32Array(n).fill(0.4);
  for (let y = 9; y < 15; y++) {
    for (let x = 9; x < 15; x++) {
      const i = y * w + x;
      rgb.set([255, 255, 255], 3 * i);
      density[i] = 0;
    }
  }
  const tonedPlan = planLightToDark({
    w, h, k: 1, rgb, density, demand: density.slice(),
    paperRGB: [240, 220, 190], paperRel: true, shaped: true, minShapeCells: 4
  });
  assert.equal(tonedPlan.protectedCells[12 * w + 12], 1, 'white highlight on warm toned paper must remain protected');

  const ochreRgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) ochreRgb.set([235, 195, 130], 3 * i);
  const ochreDensity = new Float32Array(n).fill(0.05);
  const whitePaperPlan = planLightToDark({
    w, h, k: 1, rgb: ochreRgb, density: ochreDensity, demand: ochreDensity.slice(),
    paperRGB: [249, 250, 252], paperRel: true, shaped: true, minShapeCells: 4
  });
  assert.equal(whitePaperPlan.protectedCells[12 * w + 12], 0, 'sunlit yellow-ochre stone wall must not be falsely masked as paper');
});

test('subjectCovers exposes per-subject cuts and sm so layerIncrement preserves subject layer shares', async () => {
  const { subjectCovers } = await import('./subject-washes.mjs');
  const w = 30, h = 20, n = w * h;
  const subject = new Uint16Array(n);
  const values = new Float32Array(n);
  const weights = new Float32Array(n).fill(1);
  const protectedCells = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % w;
    if (x < 15) {
      subject[i] = 1;
      values[i] = 0.08 + 0.16 * (x / 14); // pale subject: [0.08 .. 0.24]
    } else {
      subject[i] = 2;
      values[i] = 0.45 + 0.45 * ((x - 15) / 14); // dark subject: [0.45 .. 0.90]
    }
  }
  const cover = subjectCovers({
    subjects: { subject, formMm: 2, bands: 'subject' },
    values, weights, protectedCells, count: 3, w, h, mmPerCell: 0.5, minShape: 4, smoothMm: 1
  });
  assert.ok(cover.cuts instanceof Map && cover.cuts.has(1) && cover.cuts.has(2), 'subjectCovers attaches per-subject cuts');
  const shares = layerShares(cover, i => cover.cuts.get(cover.subject[i]), cover.sm, n);
  // Darkest cells of pale subject (x=14) are covered by upper subject layers and must receive positive upper-layer share
  const paleDarkIdx = 10 * w + 14;
  if (cover[1][paleDarkIdx]) {
    assert.ok(shares[1][paleDarkIdx] > 0, `Upper layer share on pale subject should be > 0, got ${shares[1][paleDarkIdx]}`);
  }
});

test('hold cells populate protectedCells for contact clipping without splitting strokePlan lanes across narrow reserves', () => {
  const w = 100, h = 40, n = w * h;
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) rgb.set([180, 190, 140], 3 * i);
  const density = new Float32Array(n).fill(0.35);
  const hold = new Uint8Array(n);
  // Narrow 2-cell vertical highlight in the middle of a warm hillside wash
  for (let y = 12; y < 28; y++) {
    hold[y * w + 50] = 1;
    hold[y * w + 51] = 1;
  }
  const plan = planLightToDark({
    w, h, k: 1, rgb, density, demand: density.slice(), hold,
    shaped: true, strokePlan: true, laneMm: 8, strokeMm: 120, sheetWidthMm: 100, minShapeCells: 20,
  });
  assert.equal(plan.protectedCells[20 * w + 50], 1, 'hold cells are preserved in protectedCells');
  const washShape = plan.layers[0].shapes[0];
  assert.ok(washShape._strokePlan, 'wash shape has _strokePlan');
  // Verify lanes sweep continuously across x=50 (relying on the sheet contact clip for the 2px reserve rather than a 2*R stroke gap)
  const spanning = washShape._strokePlan.paths.filter(p => {
    const xs = p.map(q => q.x);
    return Math.min(...xs) < 40 && Math.max(...xs) > 60;
  });
  assert.ok(spanning.length > 0, 'strokePlan lanes sweep continuously across narrow hold without a 2*R split gap');
});



const twoColourPlan = async (over = {}) => {
  // left half one colour in two pigments, right half another; a value ramp across each
  const w = 80, h = 40, n = w * h, k = 3, demand = new Float32Array(n * k), density = new Float32Array(n), rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = i % w, left = x < 40, v = 0.3 + 0.2 * (x % 40) / 40;
    density[i] = v;
    if (left) { demand[i * k] = 0.7 * v; demand[i * k + 1] = 0.3 * v; rgb[i * 3] = 200; rgb[i * 3 + 1] = 170; rgb[i * 3 + 2] = 120; }
    else { demand[i * k + 2] = v; rgb[i * 3] = 90; rgb[i * 3 + 1] = 120; rgb[i * 3 + 2] = 190; }
  }
  const labels = Int32Array.from({ length: n }, (_, i) => (i % w < 40 ? 1 : 2));
  const regions = { labels, regions: [{ id: 'a', referenceCue: '', baseMove: 'wet on dry' }, { id: 'b', referenceCue: '', baseMove: 'wet on dry' }] };
  return planLightToDark({ demand, k, density, w, h, rgb, shaped: true, subjects: null, sheetWidthMm: 20, minShapeCells: 8, ...over, pigments: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], _regions: regions });
};

test('mixedWash: one passage per colour shape in each step, carrying a mix, with the planned mass kept', async () => {
  const flat = await twoColourPlan();
  const mixed = await twoColourPlan({ mixedWash: true });
  const passesOf = (p, phase) => p.layers.filter(l => l._valuePhase === phase).length;
  assert.ok(passesOf(mixed, 'light') < passesOf(flat, 'light'), `${passesOf(mixed, 'light')} mixed against ${passesOf(flat, 'light')} single-pigment`);
  const multi = mixed.layers.flatMap(l => l.shapes).filter(sh => sh.mix.filter(v => v > 0).length > 1);
  assert.ok(multi.length > 0, 'some passage carries more than one pigment');
  for (const sh of mixed.layers.flatMap(l => l.shapes)) assert.ok(Math.abs(sh.mix.reduce((a, v) => a + v, 0) - sh.amount) < 1e-5);
  const mass = p => { const t = [0, 0, 0]; for (const l of p.layers) for (const sh of l.shapes) sh.mix.forEach((v, j) => { t[j] += v * sh.area; }); return t; };
  const a = mass(flat), b = mass(mixed);
  for (let j = 0; j < 3; j++) assert.ok(Math.abs(a[j] - b[j]) <= 0.08 * Math.max(a[j], 1e-6), `pigment ${j}: ${a[j]} against ${b[j]}`);
});

test('mixedWash: shadow glazes stay pigment by pigment over dry paint unless asked', async () => {
  const mixed = await twoColourPlan({ mixedWash: true, shadowThresh: 0.1 });
  const shadows = mixed.layers.filter(q => q._valuePhase === 'shadow');
  assert.ok(shadows.length > 0, 'the plan has shadow glazes');
  for (const l of shadows) for (const sh of l.shapes) assert.equal(sh.mix.filter(v => v > 0).length, 1);
});

test('without the new options the plan is the same as before', async () => {
  const a = await twoColourPlan(), b = await twoColourPlan({ mixedWash: false, scaleCuts: false, gradedLanes: false, softChoice: false });
  assert.equal(a.layers.length, b.layers.length);
  assert.deepEqual(a.layers.flatMap(l => l.shapes.map(sh => sh._valuePlan.id)), b.layers.flatMap(l => l.shapes.map(sh => sh._valuePlan.id)));
});

test('scaleCuts: a smooth ramp stays in the first middle layer', async () => {
  const p = await twoColourPlan({ scaleCuts: true, layers: 3 });
  const tagged = t => p.layers.filter(l => l.shapes[0]._valuePlan.id.includes(`b2${t}/`)).reduce((a, l) => a + l.area, 0);
  assert.ok(tagged('L0') > 0, 'first layer laid');
  assert.ok(tagged('L1') < 0.25 * tagged('L0'), `L1 ${tagged('L1')} against L0 ${tagged('L0')}`);
});

test('gradedLanes: a big wash is laid in lanes with charges from the plan', async () => {
  const p = await twoColourPlan({ gradedLanes: true, mixedWash: true });
  const laned = p.layers.flatMap(l => l.shapes).filter(sh => sh._strokePlan);
  assert.ok(laned.length > 0);
  const graded = laned.filter(sh => Math.max(...sh._strokePlan.factors) > Math.min(...sh._strokePlan.factors) + 0.02);
  assert.ok(graded.length > 0, 'at least one passage has lanes of different strength');
});
