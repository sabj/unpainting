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

