import test from 'node:test';
import assert from 'node:assert/strict';
import { planLightToDark, layerShares, valueTechnique } from './light-to-dark.mjs';

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


test('sunlit stone never consumes an explicitly reserved highlight, and the reserve is the target light, not its box',async()=>{
 const {planLightToDark}=await import('./light-to-dark.mjs');
 const w=40,h=40,n=w*h,rgb=new Uint8Array(n*3),density=new Float32Array(n).fill(.2);for(let i=0;i<n;i++)rgb.set([230,205,165],i*3);
 // a 4x4 paper-white glint at (13..16, 13..16) inside the reserve box [.25,.25,.5,.5] = cells 10..19
 for(let y=13;y<17;y++)for(let x=13;x<17;x++){rgb.set([255,255,255],(y*w+x)*3);density[y*w+x]=.01;}
 const p=planLightToDark({w,h,k:1,rgb,shaped:true,layerLocal:true,demand:density.slice(),density,families:[{id:'stone',referenceCue:'sunlit facade',bounds:[0,0,1,1]}],reserves:[{reason:'authored light',bounds:[.25,.25,.5,.5]}],pigments:[{name:'yellow ochre'}],minShapeCells:100});
 for(let y=13;y<17;y++)for(let x=13;x<17;x++)assert.equal(p.protectedCells[y*w+x],1,'the glint is reserved although it is under the minimum shape');
 assert.equal(p.protectedCells[10*w+10],0,'the stone inside the box is not reserved');
 assert.equal(p.protectedCells[19*w+19],0,'the stone inside the box is not reserved');
 assert.equal(p.protectedCells[11*w+15],0,'the stone beside the glint is not reserved');
});

test('a catchlight reserve protects the target glint only; a box over a dark eye with no glint reserves nothing', () => {
  const w = 60, h = 40, n = w * h, rgb = new Uint8ClampedArray(n * 3).fill(150), density = new Float32Array(n).fill(0.4);
  // dark eyes at (10..20, 15..25) and (40..50, 15..25); a 2x3 white glint in the first only
  for (let y = 15; y < 25; y++) for (const x0 of [10, 40]) for (let x = x0; x < x0 + 10; x++) { rgb.set([40, 40, 40], (y * w + x) * 3); density[y * w + x] = 0.8; }
  for (let y = 17; y < 19; y++) for (let x = 13; x < 16; x++) { rgb.set([252, 252, 252], (y * w + x) * 3); density[y * w + x] = 0.05; }
  // boxes as a planner draws them: roomier than the glint, the second on an eye the target shows with no glint
  const reserves = [{ reason: 'catchlight, left eye', bounds: [11 / w, 15 / h, 18 / w, 21 / h] }, { reason: 'catchlight, right eye', bounds: [41 / w, 15 / h, 48 / w, 21 / h] }];
  const p = planLightToDark({ w, h, k: 1, rgb, density, demand: density.slice(), shaped: true, reserves, minShapeCells: 50 });
  let inBox1 = 0, inBox2 = 0;
  for (let y = 15; y < 21; y++) { for (let x = 11; x < 18; x++) inBox1 += p.protectedCells[y * w + x]; for (let x = 41; x < 48; x++) inBox2 += p.protectedCells[y * w + x]; }
  assert.equal(inBox1, 6, 'only the six glint cells of the first box are reserved');
  for (let y = 17; y < 19; y++) for (let x = 13; x < 16; x++) assert.equal(p.protectedCells[y * w + x], 1);
  assert.equal(inBox2, 0, 'the second box reserves nothing: the target has no light there');
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



test('lights are reserved relative to the sheet the plate is painted on: cream cells on a cream sheet, none on white', () => {
  const w = 30, h = 30, n = w * h;
  const rgb = new Uint8Array(n * 3), density = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i % w, y = (i / w) | 0, subj = x >= 10 && x < 20 && y >= 10 && y < 20; rgb.set(subj ? [90, 70, 50] : [248, 245, 216], 3 * i); density[i] = subj ? 0.6 : 0.02; }
  const common = { w, h, k: 1, rgb, density, demand: density.slice(), shaped: true, paperRule: true, paperRel: true, paperLights: true, minShapeCells: 4 };
  const cream = planLightToDark({ ...common, paperRGB: [248, 245, 216] });
  assert.equal(cream.protectedCells[2 * w + 2], 1, 'cream paper is bare paper on a cream sheet');
  assert.equal(cream.protectedCells[15 * w + 15], 0, 'the subject is painted');
  assert.deepEqual(cream.paper.rgb, [248, 245, 216], 'the plan paper is the sheet, not a second estimate');
  assert.ok(Math.abs(cream.paper.density - 0.02) < 1e-6, `paper density is the mean over the paper cells (${cream.paper.density})`);
  const white = planLightToDark({ ...common, paperRGB: [252, 251, 248] });
  assert.equal(white.protectedCells[2 * w + 2], 0, 'on a white sheet the cream is a pale wash, not bare paper');
  assert.equal(white.protectedCells[15 * w + 15], 0);
});

test('without a declared sheet the planner reads the paper from the target itself, frame line and all', () => {
  const w = 40, h = 40, n = w * h;
  const rgb = new Uint8Array(n * 3), density = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0, frame = x === 0 || y === 0 || x === w - 1 || y === h - 1, subj = x >= 14 && x < 26 && y >= 12 && y < 28;
    rgb.set(frame ? [40, 35, 30] : subj ? [90, 70, 50] : [248, 245, 216], 3 * i); density[i] = frame ? 0.9 : subj ? 0.6 : 0.02;
  }
  const p = planLightToDark({ w, h, k: 1, rgb, density, demand: density.slice(), shaped: true, paperRule: true, paperRel: true, minShapeCells: 4 });
  assert.equal(p.protectedCells[3 * w + 3], 1, 'cream cells are reserved against the cream the target shows');
  assert.equal(p.protectedCells[0], 0, 'the frame line is not paper');
  assert.equal(p.protectedCells[20 * w + 20], 0, 'the subject is painted');
});

test('--paperdelta sets the light tolerance a plan asks for', () => {
  const w = 20, h = 20, n = w * h;
  const rgb = new Uint8Array(n * 3), density = new Float32Array(n).fill(0.05);
  for (let i = 0; i < n; i++) rgb.set(i % w < 10 ? [252, 251, 248] : [232, 231, 228], 3 * i);
  const tight = planLightToDark({ w, h, k: 1, rgb, density, demand: density.slice(), shaped: true, paperRule: true, paperRel: true, paperRGB: [252, 251, 248], paperDelta: 10, minShapeCells: 4 });
  assert.equal(tight.protectedCells[5 * w + 15], 0, '20 below the paper is paint at a tolerance of 10');
  const loose = planLightToDark({ w, h, k: 1, rgb, density, demand: density.slice(), shaped: true, paperRule: true, paperRel: true, paperRGB: [252, 251, 248], paperDelta: 30, minShapeCells: 4 });
  assert.equal(loose.protectedCells[5 * w + 15], 1, '20 below the paper is bare paper at a tolerance of 30');
});

test('a cropped target with no paper border reserves highlights from its lightest material if light and neutral, but not on dark/saturated crops', () => {
  const w = 40, h = 40, n = w * h;
  // Case A: a crop with bright neutral clouds. 10% clouds [236, 237, 233] along the top, rest dark/midtone building [120, 100, 80].
  const rgbCloud = new Uint8Array(n * 3), density = new Float32Array(n).fill(0.2);
  for (let i = 0; i < n; i++) {
    const y = (i / w) | 0;
    const isCloud = y < 4;
    rgbCloud.set(isCloud ? [236, 237, 233] : [120, 100, 80], 3 * i);
    density[i] = isCloud ? 0.03 : 0.4;
  }
  const planCloud = planLightToDark({ w, h, k: 1, rgb: rgbCloud, density, demand: density.slice(), shaped: true, paperRule: true, paperRel: true, paperRGB: [252, 251, 248], minShapeCells: 4 });
  assert.equal(planCloud.protectedCells[2 * w + 10], 1, 'cloud highlight is reserved as bare paper');
  assert.equal(planCloud.protectedCells[20 * w + 20], 0, 'building is not reserved');

  // Case B: Low-key photo crop. Lightest 10% is mid-grey haze [180, 160, 140] (L* ~66 < 90).
  const rgbDark = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = (i / w) | 0;
    rgbDark.set(y < 4 ? [180, 160, 140] : [60, 50, 40], 3 * i);
  }
  const planDark = planLightToDark({ w, h, k: 1, rgb: rgbDark, density, demand: density.slice(), shaped: true, paperRule: true, paperRel: true, paperRGB: [252, 251, 248], minShapeCells: 4 });
  assert.equal(planDark.protectedCells[2 * w + 10], 0, 'dark haze is not reserved as bare white paper');
});


// Cells the plan gives almost no paint (paleHold: under half a glaze) are inferred lights. Like every inferred light,
// a patch too small to paint around joins the wash around it instead of being masked into a hard white fleck; a
// large one stays reserved. Explicit holds (hold) are reserved whatever their size.
test('pale holds follow the size floor of inferred lights; explicit holds do not', () => {
  const w = 40, h = 40, n = w * h;
  const rgb = new Uint8ClampedArray(n * 3).fill(150);
  const density = new Float32Array(n).fill(0.4);
  const paleHold = new Uint8Array(n), hold = new Uint8Array(n);
  for (let y = 10; y < 12; y++) for (let x = 10; x < 12; x++) paleHold[y * w + x] = 1; // a 4-cell fleck
  for (let y = 20; y < 34; y++) for (let x = 20; x < 34; x++) paleHold[y * w + x] = 1; // a 196-cell light
  hold[5 * w + 30] = 1; // an explicit one-cell reserve
  const p = planLightToDark({ w, h, k: 1, rgb, density, demand: density.slice(), shaped: true, hold, paleHold, minShapeCells: 30 });
  assert.equal(p.protectedCells[10 * w + 10], 0, 'a pale fleck smaller than the minimum shape is painted with its surroundings');
  assert.equal(p.protectedCells[27 * w + 27], 1, 'a pale light larger than the minimum shape stays reserved');
  assert.equal(p.protectedCells[5 * w + 30], 1, 'an explicit hold is reserved whatever its size');
});

// A middle value, a half-dark and a full dark side by side: the half-dark sits inside the shadow shape but needs little glaze.
function threeValues() {
  const w = 48, h = 24, n = w * h, pigments = [{ K: [1, 1, 1], S: [0, 0, 0] }], paperRGB = [255, 255, 255];
  const value = i => (i % w < 16 ? 0.3 : i % w < 32 ? 0.6 : 1.0);
  const density = Float32Array.from({ length: n }, (_, i) => 1.6 * value(i));
  const rgb = Uint8ClampedArray.from({ length: n * 3 }, (_, q) => Math.round(255 * Math.exp(-density[(q / 3) | 0])));
  // light crosses the film twice, so the paint a cell needs is half its density
  const demand = Float32Array.from(density, d => d / 2);
  const run = options => { const log = console.log; console.log = () => {}; try { return planLightToDark({ w, h, k: 1, density, demand: demand.slice(), rgb, shaped: true, minShapeCells: 10, pigments, paperRGB, ...options }); } finally { console.log = log; } };
  const booked = plan => { const E = new Float32Array(n); for (const L of plan.layers) for (const sh of L.shapes) { const m = sh.mask; for (let i = 0; i < n; i++) if (m[i]) E[i] += sh.mix[0]; } return [8, 24, 40].map(x => E[12 * w + x] / demand[12 * w + x]); };
  return { run, booked, n, demand, rgb, w };
}

test('proportional bands lay the dark core\'s glaze on the half-dark: it gets over 1.25 of its paint', () => {
  const { run, booked } = threeValues();
  const [, half, dark] = booked(run({}));
  assert.ok(half > 1.25, `half-dark booked ${half}`);
  assert.ok(dark < 0.85, `dark booked ${dark}`);
});

test('calibratedPlan: value steps keep every value within an eighth of its own paint', () => {
  const { run, booked } = threeValues();
  for (const options of [{ calibratedPlan: true }, { calibratedPlan: true, layers: 3 }]) {
    const got = booked(run(options));
    for (const r of got) assert.ok(Math.abs(r - 1) < 0.125, `${JSON.stringify(options)} booked ${got.map(v => v.toFixed(3))}`);
  }
});

test('calibratedPlan: middle layers stay and carry the middle value steps', () => {
  const { run } = threeValues();
  const plan = run({ calibratedPlan: true, layers: 3 });
  const ids = plan.instructions.map(q => q.id.split('/')[1]);
  assert.ok(ids.includes('b2L0') && ids.includes('b2L1'), ids.join(' '));
  // the darkest third reaches the top of the middle range in the layers and takes both glazes
  assert.ok(ids.includes('b4') && ids.includes('b5'));
  // a layer whose threshold lies above the middle range has no step left to carry
  assert.ok(!ids.includes('b2L2'), ids.join(' '));
});

test('calibratedPlan: every wash is charged at or under the mean paint of its cells, and says so', () => {
  const { run } = threeValues();
  const plan = run({ calibratedPlan: true });
  const tones = plan.layers.flatMap(L => L.shapes.map(sh => sh._tone));
  assert.ok(tones.length > 0 && tones.every(f => f > 0 && f <= 1 + 1e-6), tones.join(' '));
  assert.ok(tones.some(f => f < 0.999), 'a wash over two values is weaker than their mean paint');
  for (const L of plan.layers) for (const sh of L.shapes) assert.ok(Math.abs(sh.mix.reduce((a, b) => a + b, 0) - sh.amount) < 1e-6);
  assert.equal(plan.opticsReport.rule, 'cell light');
});

test('there is no gain: dark, cool and middle gains passed to the planner change nothing', () => {
  const { run, booked } = threeValues();
  assert.deepEqual(booked(run({ calibratedPlan: true, darkGain: 2.2, coolGain: 1.6, midGain: 1.4 })), booked(run({ calibratedPlan: true })));
});

test('cell light and mass tone need the target colours and the pigments, and say so', () => {
  const w = 12, h = 12, density = new Float32Array(w * h).fill(0.5);
  assert.throws(() => planLightToDark({ w, h, k: 1, density, demand: density.slice(), calibratedPlan: true }), /cellLight needs/);
  assert.throws(() => planLightToDark({ w, h, k: 1, density, demand: density.slice(), massTone: true }), /massTone needs/);
});

test('mass tone carries nothing: a quantile charge with carry plans the same washes as no carry at all', () => {
  const { run, booked } = threeValues();
  assert.deepEqual(booked(run({ calibratedPlan: true, passCap: 0.5, carryMm: 2, maskMm: 2 })), booked(run({ calibratedPlan: true })));
  // without mass tone the carry is still there
  assert.notDeepEqual(booked(run({ nestedBands: true, passCap: 0.5 })), booked(run({ nestedBands: true })));
});

// A grey wall with a paper-coloured fleck and a field of one-cell stripes, for the gap and squint rules.
function wallWithFleck({ stripes = false } = {}) {
  const w = 48, h = 24, n = w * h, pigments = [{ K: [1, 1, 1], S: [0, 0, 0] }], paperRGB = [255, 255, 255];
  const value = i => { const x = i % w, y = (i / w) | 0; if (stripes) return x % 2 ? 0.9 : 0.225; return x >= 20 && x < 25 && y >= 10 && y < 14 ? 0 : 0.4; };
  const density = Float32Array.from({ length: n }, (_, i) => 1.6 * value(i));
  const rgb = Uint8ClampedArray.from({ length: n * 3 }, (_, q) => Math.round(255 * Math.exp(-density[(q / 3) | 0])));
  const demand = Float32Array.from(density, d => d / 2);
  const run = options => { const log = console.log; console.log = () => {}; try { return planLightToDark({ w, h, k: 1, density, demand: demand.slice(), rgb, shaped: true, minShapeCells: 30, sheetWidthMm: 48, pigments, paperRGB, ...options }); } finally { console.log = log; } };
  const covered = (plan, i) => plan.layers.some(L => L.shapes.some(sh => sh.mask[i]));
  return { run, covered, w };
}

test('calibratedPlan: a paper-coloured gap under the minimum shape is painted through, not left as a bare fleck', () => {
  const { run, covered, w } = wallWithFleck();
  const fleck = 10 * w + 20;
  const plan = run({ calibratedPlan: true });
  assert.equal(plan.protectedCells[fleck], 0, 'the fleck is too small to be a reserved light');
  assert.ok(covered(plan, fleck), 'the first wash covers the fleck');
  assert.ok(!covered(run({ calibratedPlan: true, stepHoles: false }), fleck), 'without the rule the fleck is bare paper');
});

test('calibratedPlan: value steps are cut from the squinted picture, so one-cell stripes are one wash and no glaze traces them', () => {
  const { run } = wallWithFleck({ stripes: true });
  const ids = plan => [...new Set(plan.instructions.map(q => q.id.split('/')[1]))];
  assert.ok(ids(run({ calibratedPlan: true, stepSquint: false })).includes('b5'), 'cut cell by cell, the dark stripes get the top glaze');
  assert.ok(!ids(run({ calibratedPlan: true })).includes('b5'), 'squinted, the stripes are one middle value');
});

test('ownSwatch: a calibrated plan keeps the glaze one damp pass; without it the glaze is laid as the stock swatch, once', () => {
  const { run } = threeValues();
  const glaze = plan => valueTechnique(plan.instructions.find(q => q.phase === 'shadow'));
  const own = glaze(run({ calibratedPlan: true, ownSwatch: true })), stock = glaze(run({ calibratedPlan: true }));
  assert.deepEqual([own.passes, own.water], [1, 0.45]);
  assert.deepEqual([stock.passes, stock.water], [1, 0.58]);
});

test('paintable thin mid planes keep their original bands, charge and protected gaps without ink', () => {
 for (const form of ['straight','diagonal','curved']) {
  const w=180,h=240,n=w*h,cellMm=280/1200,density=new Float32Array(n),hold=new Uint8Array(n),feature=new Uint8Array(n);
  for(let y=20;y<220;y++)for(let x=20;x<70;x++)density[y*w+x]=.8;
  for(let y=20;y<220;y++){
   const cx=110+(form==='diagonal'?Math.round((y-120)/5):form==='curved'?Math.round(14*Math.sin((y-20)/200*Math.PI)):0);
   for(let x=cx;x<cx+3;x++){density[y*w+x]=.4;feature[y*w+x]=1;}
   if(y>=110&&y<120)for(let x=cx-3;x<cx+6;x++)hold[y*w+x]=1;
  }
  // Isolated noise remains below the existing shape floor, not promoted as a stroke.
  density[10*w+160]=.4;
  const args={w,h,k:1,density,demand:density.slice(),hold,shadowThresh:.9,sheetWidthMm:w*cellMm};
  const control=density.slice();for(let i=0;i<n;i++)if(feature[i])control[i]=0;
  const actual=planLightToDark({...args,shaped:true}), reference=planLightToDark({...args,density:control,demand:control.slice(),shaped:true});
  for(const band of [2,3]){
   const shapes=actual.layers.filter(l=>l.value===band).flatMap(l=>l.shapes);
   const retained=shapes.filter(s=>s.mask.some((v,i)=>v&&feature[i]));
   assert.ok(retained.length>=2,form+' retains the two sides of the protected gap in original mid band '+band);

   for(const s of retained)for(let i=0;i<n;i++)assert.ok(!hold[i]||!s.mask[i],'protected gap stays clear');
   const broad=shapes.find(s=>s.mask[50*w+40]),refBroad=reference.layers.find(l=>l.value===band).shapes.find(s=>s.mask[50*w+40]);
   assert.equal(broad.amount,refBroad.amount,'broad foundation charge unchanged');
   assert.ok(!shapes.some(s=>s.mask[10*w+160]),'isolated noise stays rejected');
  }
  for(let y=30;y<210;y++){if(y>=108&&y<122)continue;const cx=110+(form==='diagonal'?Math.round((y-120)/5):form==='curved'?Math.round(14*Math.sin((y-20)/200*Math.PI)):0),i=y*w+cx+1;
   const charge=actual.layers.flatMap(l=>l.shapes).reduce((sum,s)=>sum+(s.mask[i]?s.amount:0),0);
   assert.ok(Math.abs(charge-density[i])<1e-7,form+' full original charge exactly once across original bands');
  }
  assert.ok(!actual.layers.some(l=>l.value>=4&&l.shapes.some(s=>s.mask.some((v,i)=>v&&feature[i]))),'no appended terminal repair');
 }
});

test('fine layered forms retain original later ownership at two physical densities', () => {
 for(const nativeWidth of [1200,2448]){
  const w=Math.round(70*nativeWidth/280),h=Math.round(42*nativeWidth/280),mm=70/w,n=w*h;
  const density=new Float32Array(n).fill(.4),hold=new Uint8Array(n),dark=new Uint8Array(n),channel=new Uint8Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,X=(x+.5)*mm,Y=(y+.5)*mm;
   if(X<14)density[i]=.8; // broad edge touching the sheet must keep broad-wash geometry
   if(Y>5&&Y<37&&X>33&&X<34){density[i]=.65;dark[i]=1;if(Y>20&&Y<22)hold[i]=1;}
   if(Y>5&&Y<37&&X>50&&X<51){density[i]=.15;channel[i]=1;}
  }
  density[Math.floor(3/mm)*w+Math.floor(60/mm)]=.65; // sub-footprint isolated fleck
  const p=planLightToDark({w,h,k:1,density,demand:density.slice(),hold,shaped:true,sheetWidthMm:70,
   calibratedPlan:true,cellLight:false,massTone:false,layers:4,layerSmoothMm:2});
  const at=(X,Y)=>Math.floor(Y/mm)*w+Math.floor(X/mm);
  const darkCell=at(33.5,10),lightCell=at(50.5,10);
  const middleAt=cell=>p.layers.filter(l=>l._valuePhase==='mid').flatMap(l=>l.shapes).reduce((sum,s)=>sum+(s.mask[cell]?s.amount:0),0);
  assert.ok(middleAt(darkCell)>middleAt(at(31,10)),nativeWidth+' original middle allocation develops the dark form');
  const unlayered=planLightToDark({w,h,k:1,density,demand:density.slice(),hold,shaped:true,sheetWidthMm:70,
   calibratedPlan:true,cellLight:false,massTone:false,layers:0,layerSmoothMm:2});
  const outer=plan=>plan.layers.filter(l=>l._valuePhase!=='mid').map(l=>({value:l.value,shapes:l.shapes.map(s=>({amount:s.amount,mask:Array.from(s.mask)}))}));
  assert.deepEqual(outer(p),outer(unlayered),'foundation and shadow geometry and pre-mass-tone charges remain exactly original');
  const baseMask=new Uint8Array(n);for(const l of p.layers.filter(l=>l.value===1))for(const s of l.shapes)for(let i=0;i<n;i++)if(s.mask[i])baseMask[i]=1;
  for(let i=0;i<n;i++)assert.equal(baseMask[i],hold[i]?0:1,'connected foundation geometry is unchanged');
  const paintAt=(cell,first=1)=>p.layers.filter(l=>l.value>=first).flatMap(l=>l.shapes).reduce((sum,s)=>sum+(s.mask[cell]?s.amount:0),0);
  assert.ok(p.layers.filter(l=>l.value===1).some(l=>l.shapes.some(s=>s.mask[lightCell]&&s.amount>0)),'base paint still owns the light channel');
  assert.ok(paintAt(lightCell,2)<paintAt(at(49,10),2),'later painting preserves the light channel relative to its neighbor: '+paintAt(lightCell,2)+' vs '+paintAt(at(49,10),2));
  const fleck=Math.floor(3/mm)*w+Math.floor(60/mm);
  assert.ok(!p.layers.some(l=>l.value===5&&l.shapes.some(s=>s.mask[fleck])),'isolated sub-footprint noise is not restored as a dark detail');
  for(const l of p.layers)for(const s of l.shapes)for(let i=0;i<n;i++)assert.ok(!hold[i]||!s.mask[i],'held gap remains free');
  const requested=density.reduce((a,v)=>a+v,0),booked=p.instructions.reduce((a,p)=>a+p.plannedPigmentMass,0)+p.omittedDemand;
  assert.ok(Math.abs(booked-requested)<1e-3*requested,'pre-mass-tone allocation neither duplicates nor drops demand');
 }
});

test('nested fine components do not discard their previously paintable halo', () => {
 for(const light of [false,true,'zero-core']){
  const w=180,h=140,n=w*h,density=new Float32Array(n).fill(light==='zero-core'?.8:light?.6:.2);
  for(let y=0;y<h;y++)for(let x=0;x<40;x++)density[y*w+x]=.8;
  for(let y=40;y<80;y++)for(let x=100;x<106;x++)density[y*w+x]=light==='zero-core'?(x<104?.12:.5):light?(x<104?.05:.3):(x<104?.75:.5);
  const p=planLightToDark({w,h,k:1,density,demand:density.slice(),shaped:true,sheetWidthMm:w*280/1200,
   calibratedPlan:true,cellLight:false,massTone:false,layers:4,layerSmoothMm:2});
  assert.equal(p.omittedDemand,0,'nested '+(light?'light':'dark')+' ownership cannot create omitted demand');
  assert.ok(p.layers.filter(l=>l._valuePhase==='mid').some(l=>l.shapes.some(s=>s.mask[60*w+105])),
   'the halo retains its original middle-paint owner');
 }
});


test('fine layers preserve explicit pale treatment and noncalibrated style allocation', () => {
 const w=300,h=180,n=w*h,density=new Float32Array(n).fill(.4);
 for(let y=0;y<h;y++)for(let x=0;x<60;x++)density[y*w+x]=.8;
 for(let y=20;y<160;y++)for(let x=140;x<145;x++)density[y*w+x]=.15;
 const args={w,h,k:1,density,demand:density.slice(),shaped:true,sheetWidthMm:70,
  nestedBands:true,cellLight:false,massTone:false,layers:4,layerSmoothMm:2};
 const p=planLightToDark({...args,styleGain:.7});
 const total=p.instructions.reduce((a,q)=>a+q.plannedPigmentMass,0)+p.omittedDemand;
 assert.ok(Math.abs(total-density.reduce((a,v)=>a+v,0)*.7)<1e-3,'explicit style allocation is not normalized to one');
 const pale=planLightToDark({...args,paleLights:.55});
 const lightCell=80*w+142;
 assert.ok(pale.layers.filter(l=>l.value===1).some(l=>l.shapes.some(s=>s.mask[lightCell])));
 assert.ok(!pale.layers.filter(l=>l.value>1).some(l=>l.shapes.some(s=>s.mask[lightCell])),'explicit pale wash is not crossed by fine middle paint');
});


test('broad straight and diagonal boundaries are not promoted as narrow difference rims', () => {
 for(const diagonal of [false,true]){
  const w=240,h=180,n=w*h,density=Float32Array.from({length:n},(_,i)=>
   i%w<(diagonal?40+Math.floor(i/w)/2:90)?.8:.3);
  const p=planLightToDark({w,h,k:1,density,demand:density.slice(),shaped:true,sheetWidthMm:56,
   calibratedPlan:true,cellLight:false,massTone:false,layers:4,layerSmoothMm:2});
  for(const layer of p.layers)for(const sh of layer.shapes){
   const cells=[];for(let i=0;i<n;i++)if(sh.mask[i])cells.push(i);
   let boundary=0;for(const i of cells)if(i%w===0||i%w===w-1||i<w||i>=n-w||!sh.mask[i-1]||!sh.mask[i+1]||!sh.mask[i-w]||!sh.mask[i+w])boundary++;
   assert.ok(2*cells.length/boundary*56/w>7,'ordinary broad boundary stays a broad passage, not a fine difference rim');
  }
 }
});

test('fine ownership does not split a continuous shadow glaze', () => {
 const w=300,h=180,n=w*h,density=new Float32Array(n).fill(.6);
 for(let y=0;y<h;y++)for(let x=0;x<60;x++)density[y*w+x]=.8;
 for(let y=20;y<160;y++)for(let x=140;x<145;x++)density[y*w+x]=.5;
 const p=planLightToDark({w,h,k:1,density,demand:density.slice(),shaped:true,sheetWidthMm:70,
  calibratedPlan:true,cellLight:false,massTone:false,layers:4,layerSmoothMm:2});
 const shadows=p.layers.filter(l=>l._valuePhase==='shadow');
 assert.ok(shadows.length);
 for(const layer of shadows){
  assert.equal(layer.shapes.length,1,'shadow remains one connected passage');
  if(layer.value===4)assert.ok(layer.shapes[0].mask[80*w+142]&&layer.shapes[0].mask[80*w+130],'eligible glaze crosses the fine ownership boundary');
 }
});


test('a real narrow dark remainder beside an explicit reserve stays paintable without new demand', () => {
 const w=240,h=180,n=w*h,density=Float32Array.from({length:n},(_,i)=>i%w<80?.8:.3);
 const hold=Uint8Array.from({length:n},(_,i)=>i%w<76?1:0);
 const p=planLightToDark({w,h,k:1,density,demand:density.slice(),hold,shaped:true,sheetWidthMm:56,
  calibratedPlan:true,cellLight:false,massTone:false,layers:4,layerSmoothMm:2});
 assert.ok(p.layers.filter(l=>l._valuePhase==='mid').some(l=>l.shapes.some(s=>s.mask[90*w+78]&&s.amount>0)),
  'remaining physical paint support is not rejected merely for touching a reserve');
 for(const l of p.layers)for(const sh of l.shapes)for(let i=0;i<n;i++)assert.ok(!hold[i]||!sh.mask[i]);
 const booked=p.instructions.reduce((a,q)=>a+q.plannedPigmentMass,0)+p.omittedDemand;
 assert.ok(Math.abs(booked-density.reduce((a,v)=>a+v,0))<1e-3,'reserve-adjacent classification invents no demand');
});

function samFixture(scale=1){
 const w=Math.round(120*scale),h=Math.round(80*scale),n=w*h,k=2;
 const density=new Float32Array(n).fill(1),demand=new Float32Array(n*k),labels=new Uint8Array(n);
 for(let i=0;i<n;i++){const left=i%w<w/2;labels[i]=left?1:2;demand[2*i]=left?.8:.2;demand[2*i+1]=left?.2:.8;}
 return {w,h,k,density,demand,formLabels:labels,shaped:true,sheetWidthMm:28,layers:4,calibratedPlan:true,cellLight:false,massTone:false,midDomains:false};
}
function samOuter(plan){return plan.layers.filter(l=>l._valuePhase!=='mid').map(l=>({value:l.value,pigment:l.pigment,shapes:l.shapes.map(s=>({amount:s.amount,mix:s.mix,mask:Buffer.from(s.mask).toString('hex')}))}));}
function samBooking(plan,n,k){const a=new Float64Array(n*k);for(const l of plan.layers)for(const s of l.shapes)for(let i=0;i<n;i++)if(s.mask[i])a[i*k+l.pigment]+=s.amount;return a;}
for(const scale of [1,2448/1200])test('SAM middle forms retain equal-value local colours at density '+Math.round(1200*scale),()=>{
 const o=samFixture(scale),base=planLightToDark({...o,formLabels:null}),p=planLightToDark(o);
 const mids=p.layers.filter(l=>l._valuePhase==='mid').flatMap(l=>l.shapes);
 assert.ok(mids.length>0);
 for(const s of mids){const ids=new Set();for(let i=0;i<o.w*o.h;i++)if(s.mask[i])ids.add(o.formLabels[i]);assert.equal(ids.size,1,'one accepted whole SAM form per middle passage');}
 assert.deepEqual(samOuter(p),samOuter(base),'outer geometry and charge stay identical');
 const b=samBooking(base,o.w*o.h,o.k),a=samBooking(p,o.w*o.h,o.k);
 for(let q=0;q<o.k;q++){let x=0,y=0;for(let i=q;i<a.length;i+=o.k){x+=a[i];y+=b[i];assert.equal(a[i]>0,b[i]>0,'positive demand retains an owner');}assert.ok(Math.abs(x-y)<1e-5,'per-pan planned allocation preserved');}
 assert.equal(p.omittedDemand,base.omittedDemand);
 assert.ok(p.formPlanning.stages.some(s=>s.acceptedForms>0),'returned plan records actual form admission');
 assert.ok(p.formPlanning.stages.every(s=>s.valueBand===2||s.valueBand===3),'only middle ownership is considered');
 assert.ok(mids.every(s=>s._valuePlan.formOwnership?.source==='sam'),'executable intents retain SAM ownership provenance');
});
test('SAM form ownership keeps constant and zero-label controls unchanged; rejects malformed labels',()=>{
 const o=samFixture(),base=planLightToDark({...o,formLabels:null});
 const zero=planLightToDark({...o,formLabels:new Uint8Array(o.w*o.h)});
 assert.deepEqual(samBooking(zero,o.w*o.h,o.k),samBooking(base,o.w*o.h,o.k));
 const flat={...o,demand:new Float32Array(o.w*o.h*o.k).fill(.5)};
 assert.equal(planLightToDark(flat).instructions.length,planLightToDark({...flat,formLabels:null}).instructions.length,'constant paint has no form boundary to retain');
 assert.throws(()=>planLightToDark({...o,formLabels:new Uint8Array(2)}),/form label/);
});
test('SAM tiny unselected labels remain in their coherent parent with original demand',()=>{
 const o=samFixture(),hold=new Uint8Array(o.w*o.h);hold[20*o.w+20]=1;
 const labels=o.formLabels.slice();labels[30*o.w+30]=3;
 const base=planLightToDark({...o,hold}),p=planLightToDark({...o,hold,formLabels:labels});
 const actual=samBooking(p,o.w*o.h,o.k),expected=samBooking(base,o.w*o.h,o.k);
 assert.ok(actual.every((v,i)=>v===expected[i]),'tiny label remains with its original coherent remainder');
 assert.deepEqual(samOuter(p),samOuter(base));
});

test('SAM hierarchy keeps accepted forms when a finer intersection is under the existing floor',()=>{
 const o=samFixture(),n=o.w*o.h;
 for(let y=0;y<o.h;y++)for(let x=0;x<o.w;x++){
  const i=y*o.w+x,v=x<15?.8:x>=58&&x<62&&y>=10&&y<70?.65:.4;
  o.density[i]=v;o.demand[2*i]=v*(x<o.w/2?.8:.2);o.demand[2*i+1]=v*(x<o.w/2?.2:.8);
 }
 const p=planLightToDark(o),base=planLightToDark({...o,formLabels:null});
 const mids=p.layers.filter(l=>l._valuePhase==='mid').flatMap(l=>l.shapes);
 assert.ok(mids.some(s=>s.mask[40*o.w+59]&&s.mask[40*o.w+40]),'fine sliver veto keeps its accepted SAM parent');
 for(const s of mids){const labels=new Set();for(let i=0;i<n;i++)if(s.mask[i])labels.add(o.formLabels[i]);assert.equal(labels.size,1,'fine refinement never reunites accepted SAM forms');}
 assert.ok(p.omittedDemand<=base.omittedDemand+1e-8);
 assert.deepEqual(samOuter(p),samOuter(base));
});
test('SAM splitting preserves authored family material decisions',()=>{
 const o=samFixture(),family={id:'wash',bounds:[0,0,1,1],baseMove:'dry brush',referenceCue:'broken pigment'};
 const p=planLightToDark({...o,families:[family]});
 const mid=p.instructions.filter(x=>x.phase==='mid');
 assert.ok(mid.length>0&&mid.every(x=>x.passageMaterial.family==='wash'&&x.move==='dry on dry'));
 const local={id:'local',bounds:[0,0,.5,1],baseMove:'dry brush'};
 const base=planLightToDark({...o,formLabels:null,families:[local]}),veto=planLightToDark({...o,families:[local]});
 assert.deepEqual(veto.instructions.map(x=>[x.id,x.move,x.passageMaterial]),base.instructions.map(x=>[x.id,x.move,x.passageMaterial]),'new form boundaries cannot change family assignment');
});
test('SAM label loading is fail-closed, cache-bound and consumed before the source seal',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path'),sharp=(await import('sharp')).default;
 const {loadSegments}=await import('../../crop/segments.mjs'),{inputHash}=await import('../run-cache.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sam-middle-'));
 try{
  const o=samFixture(),stem=path.join(dir,'source');
  await assert.rejects(loadSegments(stem,o.w,o.h),/no label map/);
  await sharp(Buffer.from(o.formLabels),{raw:{width:o.w,height:o.h,channels:1}}).png().toFile(stem+'.png');
  await fs.writeFile(stem+'.json',JSON.stringify({regions:[{id:1},{id:2}]}));
  const loaded=await loadSegments(stem,o.w,o.h);
  assert.deepEqual(loaded.labels,o.formLabels);
  assert.notEqual(inputHash({...o,formLabels:loaded.labels}),inputHash({...o,formLabels:new Uint8Array(o.w*o.h)}),'SAM labels participate in the existing cache input hash');
  let sealed=false;
  const source=new Proxy(Array.from(loaded.labels),{get(target,key){assert.equal(sealed,false,'source labels cannot be consulted during execution');return Reflect.get(target,key);}});
  const {createHash}=await import('node:crypto'),formSource={backend:'sam',planningLabelsSHA256:createHash('sha256').update(loaded.labels).digest('hex'),width:o.w,height:o.h};
  const p=planLightToDark({...o,formLabels:source,formSource});sealed=true;
  assert.deepEqual(p.formPlanning.source,formSource,'source identity survives in returned plan diagnostics');
  assert.deepEqual(JSON.parse(JSON.stringify(p.formPlanning)).source,formSource,'serialized value-plan metadata retains the hash');
  for(const l of p.layers)for(const s of l.shapes){assert.ok(s.mask.length===o.w*o.h);valueTechnique(s._valuePlan);}
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('SAM calibrated children retain pre-optical band mass and report real optical charge changes',async t=>{
 const {BOX,physicalPigment}=await import('../../crop/box.mjs');
 const o={...samFixture(),pigments:['ochre','ultramarine'].map(key=>physicalPigment(BOX.find(p=>p.key===key))),paperRGB:[252,251,248],massTone:true};
 const base=planLightToDark({...o,demand:o.demand.slice(),formLabels:null}),p=planLightToDark({...o,demand:o.demand.slice()});
 const outerGeometry=plan=>samOuter(plan).map(l=>({...l,shapes:l.shapes.map(({mask})=>mask)}));
 assert.deepEqual(outerGeometry(p),outerGeometry(base),'calibrated outer geometry remains connected and unchanged');
 const amounts=plan=>{const a={};for(const l of plan.layers)for(const s of l.shapes){const key=l.value+'/'+l.pigment;if(!a[key])a[key]={before:0,after:0};a[key].after+=s.amount*s.area;a[key].before+=s.amount*s.area/(s._tone??1);}return a;};
 const a=amounts(p),b=amounts(base),report=[];
 for(const key of Object.keys(b)){assert.ok(Math.abs(a[key].before-b[key].before)<1e-5,'original per-band/per-pan allocation '+key);report.push({bandPan:key,before:b[key].after,after:a[key].after});}
 assert.equal(p.omittedDemand,base.omittedDemand);
 assert.ok(report.some(r=>r.before!==r.after),'existing optical calibration genuinely evaluates the changed passages');
 t.diagnostic('Existing massTone calibrated charges (not forced to match): '+JSON.stringify(report));
});

test('SAM null and zero maps preserve activated fine-form geometry, booking and order',()=>{
 const w=240,h=180,n=w*h,density=new Float32Array(n).fill(.4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(x<40)density[y*w+x]=.8;if(y>20&&y<160&&x>=110&&x<115)density[y*w+x]=.65;if(y>20&&y<160&&x>=180&&x<185)density[y*w+x]=.15;}
 const o={w,h,k:1,density,demand:density.slice(),shaped:true,sheetWidthMm:56,calibratedPlan:true,cellLight:false,massTone:false,layers:4};
 const plain=planLightToDark(o),zero=planLightToDark({...o,formLabels:new Uint8Array(n)});
 const snap=p=>p.layers.map(l=>({band:l.value,pigment:l.pigment,shapes:l.shapes.map(s=>({intent:s._valuePlan,amount:s.amount,mix:s.mix,mask:Buffer.from(s.mask).toString('hex')}))}));
 assert.deepEqual(snap(zero),snap(plain));
 const feature=80*w+112;
 assert.ok(plain.layers.filter(l=>l._valuePhase==='mid').some(l=>l.shapes.some(s=>s.mask[feature]&&!s.mask[80*w+100])),'fine source form is actually separated from its coarse neighbor');
});

test('SAM binary proposal veto keeps a genuinely under-floor positive remainder',()=>{
 const o=samFixture(),labels=new Uint8Array(o.w*o.h).fill(1);labels[30*o.w+30]=2;
 const base=planLightToDark({...o,formLabels:null}),p=planLightToDark({...o,formLabels:labels});
 const a=samBooking(p,o.w*o.h,o.k),b=samBooking(base,o.w*o.h,o.k);
 assert.ok(a.every((v,i)=>v===b[i]));assert.deepEqual(samOuter(p),samOuter(base));
});
test('SAM topology uses the existing eight-connected diagonal support',()=>{
 const o=samFixture();o.formLabels.fill(1);
 for(let y=20;y<40;y++)for(let x=70;x<90;x++)if((x<80&&y<30)||(x>=80&&y>=30))o.formLabels[y*o.w+x]=2;
 for(let i=0;i<o.w*o.h;i++){o.demand[2*i]=o.formLabels[i]===1?.8:.2;o.demand[2*i+1]=1-o.demand[2*i];}
 const p=planLightToDark(o),mids=p.layers.filter(l=>l._valuePhase==='mid').flatMap(l=>l.shapes);
 assert.ok(mids.some(s=>s.area===200&&s.mask[25*o.w+75]&&s.mask[35*o.w+85]),'diagonally connected form remains one admissible support');
});

const familyMarksFixture=()=>({id:'surface',bounds:[0,0,1,1],baseMove:'wet on dry',brushWidthMm:1.2,marks:{kind:'masonry',reason:'source shows selected stone joints',cover:.3,placement:'whole',courseAngleDeg:0}});
test('family marks allocate only their nominal footprint before optical calibration',async()=>{
 const {familyMarkClip,familyMarkCharge}=await import('../../../tools/plate/paint.mjs');
 const family=familyMarksFixture(),o={...samFixture(),formLabels:null,families:[family],smallestBrushMm:1.2};
 const base=planLightToDark({...o,families:[{id:family.id,bounds:family.bounds,baseMove:family.baseMove}]}),p=planLightToDark(o);
 assert.deepEqual(samOuter(p),samOuter(base),'unmarked foundations and shadows retain original booking');
 const marked=p.layers.filter(l=>l._valuePhase==='mid').flatMap(l=>l.shapes).filter(s=>s._valuePlan.markDecision?.status==='accepted');
 assert.ok(marked.length>0);
 for(const s of marked){
  const d=s._valuePlan.markDecision,clip=familyMarkClip(s,o.w,o.h),instruction=p.instructions.find(i=>i.id===s._valuePlan.id);
  assert.equal(s.mask.reduce((a,v)=>a+v,0),s.area);assert.equal(s.area,d.allocatedArea);
  assert.ok(d.intentionalGapDemand>0);assert.ok(Math.abs(d.originalDemand-d.allocatedDemand-d.intentionalGapDemand)<1e-10);
  assert.ok(Math.abs(s.amount*s.area-d.allocatedDemand)<1e-5);assert.equal(instruction.plannedPigmentMass,d.allocatedDemand);
  assert.equal(clip.reduce((a,v)=>a+v,0),d.originalArea);assert.ok(clip.some((v,i)=>v&&!s.mask[i]),'physical clip does not stencil the nominal footprint');
  assert.equal(s.mix.filter(v=>v>0).length,1);assert.equal(s._rampVec,undefined);assert.equal(s._strokePlan,undefined);
  assert.equal(s._valuePlan.move,'wet on dry');assert.equal(s._valuePlan.brush.shape,'flat');
  assert.equal(familyMarkCharge(s._valuePlan.brush.paths,s.mask,o.w,o.h).under,1);
 }
});
test('family marks reject unfitting children explicitly without changing ordinary geometry or demand',()=>{
 const family={...familyMarksFixture(),brushWidthMm:100},o={...samFixture(),formLabels:null,families:[family]},base=planLightToDark({...o,families:[{id:family.id,bounds:family.bounds,baseMove:family.baseMove}]}),p=planLightToDark(o);
 assert.deepEqual(samBooking(p,o.w*o.h,o.k),samBooking(base,o.w*o.h,o.k));assert.deepEqual(samOuter(p),samOuter(base));
 const rejected=p.instructions.filter(i=>i.markDecision);assert.ok(rejected.length>0);
 assert.ok(rejected.every(i=>i.markDecision.status==='rejected'&&i.markDecision.intentionalGapDemand===0));
 for(const l of p.layers)for(const s of l.shapes)assert.equal(s._markSupport,undefined);
 assert.throws(()=>planLightToDark({...o,families:[{...family,marks:{...family.marks,kind:'typo'}}]}),/surface marks/);
});
test('family marks use physical widths at both native densities and preserve the input demand',async()=>{
 const {allocateFamilyMarks}=await import('./light-to-dark.mjs');
 for(const width of [1200,2448]){
  const mm=280/width,w=Math.round(28/mm),h=Math.round(20/mm),mask=new Uint8Array(w*h).fill(1),list=Array.from({length:w*h},(_,i)=>i),G=new Float32Array(w*h).fill(.3),saved=G.slice();
  const result=allocateFamilyMarks({family:familyMarksFixture(),mask,list,G,w,h,mmPerCell:mm,seedKey:'same-family/b2'});
  assert.equal(result.decision.status,'accepted');assert.deepEqual(G,saved);
  for(const path of result.paths)for(const q of path)assert.ok(Math.abs(q.r*2*mm-1.2)<1e-10);
  const rejected=allocateFamilyMarks({family:familyMarksFixture(),mask,list,G,w,h,mmPerCell:mm,seedKey:'same',eligible:false});assert.equal(rejected.decision.status,'rejected');
 }
});
test('family mark charge never concentrates gaps and accounts for repeated path overlap',async()=>{
 const {familyMarkCharge}=await import('../../../tools/plate/paint.mjs');
 const {sweepCount}=await import('../../media/wash.mjs');
 const w=40,h=30,path=Array.from({length:20},(_,i)=>({x:10+i,y:15,r:2,p:1})),mask=Uint8Array.from(sweepCount([path],w,h),v=>v?1:0);
 const once=familyMarkCharge([path],mask,w,h),twice=familyMarkCharge([path,path],mask,w,h);
 assert.equal(once.under,1);assert.equal(twice.under,1);assert.equal(once.cover,1);assert.equal(twice.cover,2);
 assert.throws(()=>familyMarkCharge([],mask,w,h),/nonempty/);assert.throws(()=>familyMarkCharge([path],new Uint8Array(w*h),w,h),/coverage/);
});
test('family mark optical accounting calibrates only allocated cells and keeps outer support',async()=>{
 const {BOX,physicalPigment}=await import('../../crop/box.mjs');
 const family=familyMarksFixture(),o={...samFixture(),formLabels:null,pigments:['ochre','ultramarine'].map(k=>physicalPigment(BOX.find(p=>p.key===k))),paperRGB:[252,251,248],massTone:true,families:[family]};
 const p=planLightToDark(o),base=planLightToDark({...o,demand:o.demand.slice(),families:[{id:family.id,bounds:family.bounds,baseMove:family.baseMove}]});
 const geometry=p=>p.layers.filter(l=>l._valuePhase!=='mid').map(l=>l.shapes.map(s=>Buffer.from(s.mask).toString('hex')));
 assert.deepEqual(geometry(p),geometry(base));
 for(const l of p.layers)for(const s of l.shapes)if(s._markSupport)assert.ok(Math.abs(s.amount*s.area/(s._tone??1)-s._valuePlan.markDecision.allocatedDemand)<1e-5,'raw allocation precedes optical strength');
});
test('family marks retain separate physical support through the actual plan cache',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
 const {cachedStep}=await import('../run-cache.mjs'),{familyMarkClip}=await import('../../../tools/plate/paint.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-mark-cache-'));
 try{
  const o={...samFixture(),formLabels:null,families:[familyMarksFixture()]},track={start(){},stop(){return []},current(){return null},replay(){}};
  const options={dir,name:'plan',code:'family-mark-test',track,inputs:o};
  let calls=0;const compute=async()=>{calls++;return planLightToDark(o);};
  const a=await cachedStep(options,compute),b=await cachedStep({...options,inputs:{...samFixture(),formLabels:null,families:[familyMarksFixture()]}},compute);assert.equal(calls,1);
  assert.equal(b.cached,true);
  for(let j=0;j<a.value.layers.length;j++)for(let k=0;k<a.value.layers[j].shapes.length;k++){
   const x=a.value.layers[j].shapes[k],y=b.value.layers[j].shapes[k];assert.deepEqual(y.mask,x.mask);
   if(x._markSupport){assert.deepEqual(familyMarkClip(y,o.w,o.h),familyMarkClip(x,o.w,o.h));assert.deepEqual(y._valuePlan.brush.paths,x._valuePlan.brush.paths);}
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('family marks use the production expected-ledger loop without crediting intentional gaps',async()=>{
 const fs=await import('node:fs'),{familyMarkClip}=await import('../../../tools/plate/paint.mjs');
 const p=planLightToDark({...samFixture(),formLabels:null,families:[familyMarksFixture()]}),sh=p.layers.flatMap(l=>l.shapes).find(s=>s._markSupport),w=sh.w,h=sh.ids.length/w;
 const source=fs.readFileSync(new URL('../../../tools/plate/paint.mjs',import.meta.url),'utf8'),start=source.indexOf('    for (let y = mb.y0;',source.indexOf('if(sh._authoredDose)')),end=source.indexOf('\n  }\n  if(ctx.VALUE_PLAN)',start);
 assert.ok(start>0&&end>start);
 const expected=new Float64Array(w*h*2);
 new Function('mb','w','m','sk','P','expected','mix','share','DELIVERY','TECH_CAL','sh','const gr=null,amt=0;'+source.slice(start,end))(sh.box,w,sh.mask,null,2,expected,sh.mix,1,null,null,sh);
 const clip=familyMarkClip(sh,w,h);let mass=0,gaps=0;
 for(let i=0;i<clip.length;i++)for(let j=0;j<2;j++){mass+=expected[i*2+j];if(clip[i]&&!sh.mask[i]){gaps++;assert.equal(expected[i*2+j],0);}}
 assert.ok(gaps>0);assert.ok(Math.abs(mass-sh.amount*sh.area)<1e-6);
});
test('family mark seeds vary child geometry but retain cross-pan registration',async()=>{
 const {allocateFamilyMarks}=await import('./light-to-dark.mjs');const w=140,h=60;
 const make=(x0,charge)=>{const mask=Uint8Array.from({length:w*h},(_,i)=>i%w>=x0&&i%w<x0+50&&Math.floor(i/w)>=5&&Math.floor(i/w)<55?1:0),list=Array.from({length:w*h},(_,i)=>i).filter(i=>mask[i]);return allocateFamilyMarks({family:familyMarksFixture(),mask,list,G:new Float32Array(w*h).fill(charge),w,h,mmPerCell:.2,seedKey:'family/b2'}).paths;};
 assert.deepEqual(make(5,.2),make(5,.4),'pigment amount does not change shared geometry');
 const relative=(paths,x)=>paths.map(ps=>ps.map(q=>({...q,x:Math.round((q.x-x)*1e9)/1e9})));
 assert.notDeepEqual(relative(make(5,.2),5),relative(make(75,.2),75),'translated children do not repeat one random pattern');
});
test('family marks preserve protected paper and reject below-kit source widths',async()=>{
 const {familyMarkClip}=await import('../../../tools/plate/paint.mjs');const o=samFixture(),hold=new Uint8Array(o.w*o.h);hold[40*o.w+60]=1;
 const plan=planLightToDark({...o,formLabels:null,hold,families:[familyMarksFixture()],smallestBrushMm:1.2});
 const shapes=plan.layers.flatMap(l=>l.shapes).filter(s=>s._markSupport);assert.ok(shapes.length);
 for(const sh of shapes){const clip=familyMarkClip(sh,o.w,o.h);for(let i=0;i<clip.length;i++)if(plan.protectedCells[i]){assert.equal(clip[i],0);assert.equal(sh.mask[i],0);}}
 for(const width of [.5,.65]){const p=planLightToDark({...samFixture(),formLabels:null,families:[{...familyMarksFixture(),brushWidthMm:width}],smallestBrushMm:1.2});const decisions=p.instructions.filter(i=>i.markDecision).map(i=>i.markDecision);assert.ok(decisions.length);assert.ok(decisions.every(d=>d.status==='rejected'));}
});

test('family marks execute the real numeric paint path with original clip and no empty rescue',{timeout:120000},async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path'),url=await import('node:url'),{execFileSync}=await import('node:child_process'),sharp=(await import('sharp')).default;
 const root=url.fileURLToPath(new URL('../../../',import.meta.url)),dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-marks-paint-'));
 try{
  await sharp(Buffer.from('<svg width="64" height="48"><rect width="64" height="48" fill="#a78c69"/><rect x="4" y="4" width="20" height="16" fill="#dfbb7c"/><rect x="37" y="22" width="22" height="21" fill="#735b4b"/></svg>')).png().toFile(path.join(dir,'target.png'));
  fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify({families:[familyMarksFixture()]}));
  // Synthetic CPU integration: segmentation is not under test; no native-quality claim.
  let script=String.raw`import './tools/plate/load-order.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {setup} from './tools/plate/setup.mjs';
import {plan} from './tools/plate/plan.mjs';
import {sheetAndBrushes} from './tools/plate/sheet.mjs';
import {penPlan} from './tools/plate/pen.mjs';
import {drawing} from './tools/plate/drawing.mjs';
import {paint,familyMarkClip} from './tools/plate/paint.mjs';
import {createJSONLWriter} from './tools/painter/jsonl-writer.mjs';
const dir=process.env.FAMILY_MARK_TEST_DIR;
process.argv=[process.execPath,import.meta.filename,'--recipe','none','--image',dir+'/target.png','--valueplan',dir+'/plan.json','--width','64','--scale','1','--sheetmm','16','--palettewide','1','--physical','1','--order','painter','--shapedmarks','1','--midlayers','2','--drawing','none','--linesource','none','--sourcelines','0','--texture','0','--mode','fast','--video','0','--frames','0','--gpu','off','--threads','1','--segments','off','--runcache','0','--allowdirty','1','--out',dir+'/out'];
const JSONL=createJSONLWriter(),ctx={WASH_FLAT_SPLAY:.03,ENTRY_FILE:new URL('./tools/paint-plate.mjs',import.meta.url).pathname,JSONL,sheet:null};
try{
 await setup(ctx);await plan(ctx);await sheetAndBrushes(ctx);await penPlan(ctx);await drawing(ctx);
 const layer=ctx.layers.find(l=>l.shapes.some(s=>s._markSupport));assert.ok(layer,'actual setup produced accepted marks');const sh=layer.shapes.find(s=>s._markSupport),clip=familyMarkClip(sh,ctx.w,ctx.h),allocation=sh.mask.slice();ctx.layers=[{...layer,shapes:[sh]}];
 const realClip=ctx.setClip,realStroke=ctx.stroke;let clipMatched=false,strokes=0;
 ctx.setClip=(sheet,m,...args)=>{if(m&&m.length===clip.length&&m.every((v,i)=>v===clip[i]))clipMatched=true;return realClip(sheet,m,...args);};
 ctx.stroke=(...args)=>{strokes++;return realStroke(...args);};
 const savedPaths=sh._valuePlan.brush.paths;sh._valuePlan.brush.paths=[];
 await assert.rejects(()=>paint(ctx),/empty-path rescue/);assert.equal(strokes,0,'empty accepted paths cannot execute rescue');
 sh._valuePlan.brush.paths=savedPaths;await paint(ctx);JSONL.flush();
 const records=fs.readFileSync(dir+'/out/value-commands.jsonl','utf8').trim().split('\n').map(JSON.parse),charges=records.filter(r=>r.kind==='family-mark-charge');
 assert.ok(clipMatched);assert.ok(strokes>0);assert.ok(charges.length);assert.ok(charges.every(r=>r.under===1&&r.overlap>=1));
 for(let i=0;i<allocation.length;i++)if(clip[i]&&!allocation[i])for(let j=0;j<ctx.PIGS.length;j++)assert.equal(ctx.expected[i*ctx.PIGS.length+j],0);
 fs.writeFileSync(dir+'/proof.json',JSON.stringify({realPaint:true,backend:'cpu',width:64,selectedShapes:1,clipMatched,noEmptyRescue:true,strokes,charges:charges.length,under:charges[0].under,scope:'actual numeric paint integration; not native-density coupon or visual acceptance'},null,2));
 console.log('REAL_PAINT_INTEGRATION_PASS');
}finally{ctx.sheet?._gpu?.close();JSONL.close();}
process.exit(0);
`;
  const toolsURL=url.pathToFileURL(path.join(root,'tools')+path.sep).href;
  script=script.replaceAll("'./tools/","'"+toolsURL);
  const runner=path.join(dir,'run.mjs');fs.writeFileSync(runner,script);
  try{execFileSync(process.execPath,[runner],{cwd:root,env:{...process.env,FAMILY_MARK_TEST_DIR:dir},encoding:'utf8',timeout:110000,maxBuffer:4*1024*1024});}
  catch(e){throw Error(String(e.stdout??'').slice(-2500)+String(e.stderr??'').slice(-2500));}
  const proof=JSON.parse(fs.readFileSync(path.join(dir,'proof.json'),'utf8'));
  assert.equal(proof.realPaint,true);assert.equal(proof.clipMatched,true);assert.equal(proof.noEmptyRescue,true);assert.equal(proof.under,1);assert.ok(proof.strokes>0&&proof.charges>0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
