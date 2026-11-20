// The GPU sheet backend against the CPU sheet, through the public calls the painter uses (stroke, step, dry, thickness).
// Skipped where there is no GPU or no `webgpu` package: the CPU sheet is the reference and the fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, step, dry, thickness, totals, DEFAULTS as SHEET_DEFAULTS, layersChanged } from './sheet.mjs';
// the GPU sheet has no pinned-edge feed (src/media/edge-feed.mjs) and refuses one; these tests run both sheets without it
const DEFAULTS = { ...SHEET_DEFAULTS, edgeEvap: 0 };
import { createBrush, dip, stroke } from './brush.mjs';
import { attachGpu, gpuStats } from './gpu/link.mjs';
import { GPU_PORT_TODO } from './gpu/port-todo.mjs';

const pigments = [
  { K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 },
  { K: [0.8, 0.5, 0.2], S: [0.03, 0.03, 0.02], rho: 0.3, omega: 0.9, gamma: 0.6 },
];
const N = 96;

// A short painting: a wet stroke that flows while it is laid, a settle, a second stroke into the wet, a dry, and a
// glaze over the dried layer that lifts a little of it.
function paint(sheet, O) {
  const brush = createBrush({ flat: true, radius: 6, wetMix: 0.5, capacity: 80, seed: 3 });
  dip(brush, { water: 1, conc: [0.8, 0.1] });
  stroke(brush, sheet, [{ x: 20, y: 24, p: 1, r: 6 }, { x: 74, y: 30, p: 1, r: 6 }], { upright: 'sweep', gpuBetween: true, between: k => { if (k % 6 === 0) step(sheet, O); } });
  for (let q = 0; q < 40; q++) step(sheet, O);
  dip(brush, { water: 0.8, conc: [0.1, 0.7] });
  stroke(brush, sheet, [{ x: 30, y: 12, p: 1, r: 5 }, { x: 34, y: 52, p: 1, r: 5 }], { upright: true });
  for (let q = 0; q < 30; q++) step(sheet, O);
  dry(sheet, 3000, O, { level: 60, levelMax: 90, dt: 6 });
  dip(brush, { water: 1, conc: [0.4, 0.4] });
  stroke(brush, sheet, [{ x: 16, y: 40, p: 1, r: 7 }, { x: 78, y: 44, p: 1, r: 7 }], { upright: 'sweep', gpuBetween: true, between: k => { if (k % 8 === 0) step(sheet, O); } });
  for (let q = 0; q < 30; q++) step(sheet, O);
  dry(sheet, 3000, O, { level: 60, levelMax: 90, dt: 6 });
  return thickness(sheet);
}
const fresh = () => createSheet(makePaper(N, N, { seed: 5 }), pigments);
const stats = (a, b) => { let max = 0, sum = 0; for (let k = 0; k < a.length; k++) for (let i = 0; i < a[k].length; i++) { const d = Math.abs(a[k][i] - b[k][i]); if (d > max) max = d; sum += d; } return { max, mean: sum / (a.length * a[0].length) }; };
const peak = t => Math.max(...t.map(a => a.reduce((m, v) => Math.max(m, v), 0)));

test('the GPU sheet paints within the CPU sheet\'s own float noise', { timeout: 120000 , todo: GPU_PORT_TODO }, t => {
  const O = { ...DEFAULTS, gran: 0.25 };
  const cpuSheet = fresh(), ref = paint(cpuSheet, O);
  assert.equal(cpuSheet._gpu, undefined, 'the CPU run must not touch the GPU path');
  // the noise floor: the same painting with three constants nudged by a float32 rounding
  const O2 = { ...O }; for (const k of ['flow', 'diffuse', 'evap']) O2[k] = Math.fround(O[k] * (1 + 1e-6));
  const floor = stats(paint(fresh(), O2), ref);

  const g = fresh(), info = attachGpu(g, O, { mode: 'auto', log: () => {} });
  if (info.backend !== 'gpu') { t.skip(`no GPU: ${info.reason}`); return; }
  try {
    const out = paint(g, O), d = stats(out, ref), scale = peak(ref);
    assert.ok(gpuStats(g).steps > 100 && gpuStats(g).drys === 2, 'the run went through the GPU');
    // inside the float noise, with room for the handful of cells where a threshold falls on the other side
    assert.ok(d.mean <= Math.max(20 * floor.mean, 1e-6 * scale), `mean difference ${d.mean} against floor ${floor.mean}`);
    assert.ok(d.max <= Math.max(50 * floor.max, 2e-3 * scale), `max difference ${d.max} against floor ${floor.max} (peak ${scale})`);
  } finally { g._gpu.close(); }
});

// 033 item 4: the GPU contact holds a loaded brush's free liquid out of dry sized pores as the CPU one does (the CPU
// stroke conserves: physics.test.mjs), so the GPU sheet must hold the same water and pigment, and as much standing
test('a loaded stroke on dry paper leaves the same water, pigment and standing film on the GPU as on the CPU', { timeout: 120000 }, t => {
  const lay = sheet => { const b = createBrush({ flat: true, radius: 6, capacity: 80, seed: 3 }); dip(b, { water: 1, conc: [0.8, 0.1] }); stroke(b, sheet, [{ x: 20, y: 24, p: 1, r: 6 }, { x: 74, y: 30, p: 1, r: 6 }], { upright: 'sweep' }); const T = totals(sheet); return { water: T.water, pig: T.pig, film: sheet.W.reduce((v, x) => v + x, 0) }; };
  const cpu = lay(fresh()), g = fresh(), info = attachGpu(g, DEFAULTS, { mode: 'auto', log: () => {} });
  if (info.backend !== 'gpu') { t.skip(`no GPU: ${info.reason}`); return; }
  try {
    const gpu = lay(g); assert.ok(gpuStats(g).strokes >= 1, 'the stroke was laid on the GPU');
    const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(b)), `${what}: GPU ${a} against CPU ${b}`);
    near(gpu.water, cpu.water, 'water'); gpu.pig.forEach((v, k) => near(v, cpu.pig[k], 'pigment ' + k)); near(gpu.film, cpu.film, 'standing film');
    assert.ok(cpu.film > cpu.water - cpu.film, `standing ${cpu.film} against pores ${cpu.water - cpu.film}`); console.log(JSON.stringify({ cpu, gpu }));
  } finally { g._gpu.close(); }
});
test('--gpu off leaves the sheet on the untouched CPU path', () => {
  const off = fresh(), info = attachGpu(off, DEFAULTS, { mode: 'off' });
  assert.equal(info.backend, 'cpu'); assert.equal(off._gpu, undefined);
});

test('accumulated support follows GPU fixation and CPU edits to lower layers', { timeout: 120000 , todo: GPU_PORT_TODO }, t => {
  const O = { ...DEFAULTS, gran: 0.25, fixedBed: 1 };
  const cpu = fresh(), gpu = fresh();
  const info = attachGpu(gpu, O, {mode:'auto', log:()=>{}});
  if(info.backend !== 'gpu'){t.skip(`no GPU: ${info.reason}`);return;}
  try {
    for(let round=0;round<2;round++) {
      const ref=paint(cpu,O),out=paint(gpu,O),d=stats(out,ref);
      assert.ok(d.max < 2e-3 * peak(ref), `support round ${round}: ${JSON.stringify(d)}`);
      if(round===0){
        gpu._gpu.syncAll(gpu);gpu._gpu.syncLower(gpu);
        for(const s of [cpu,gpu]) for(const plane of s.layers[0]) for(let i=0;i<plane.length;i++)plane[i]*=.5;
        layersChanged(cpu, [cpu.layers[0]]); layersChanged(gpu, [gpu.layers[0]]);
      }
    }
  } finally { gpu._gpu.close(); }
});

test('dry-fraction evaporation parity across CPU and GPU with dynamic mmPerCell', { timeout: 120000 }, t => {
  for (const edgeFlowDepth of [0.06, 0]) {
    for (const mmPerCell of [0.218, 0.3]) {
      const paperCpu = makePaper(64, 64, { seed: 7, mmPerCell });
      const cpu = createSheet(paperCpu, pigments);
      const paperGpu = makePaper(64, 64, { seed: 7, mmPerCell });
      const gpu = createSheet(paperGpu, pigments);

      // Turn off bulk flow so we test pure dry-fraction boundary evaporation
      const O = { ...DEFAULTS, evap: 0.02, edgeEvap: 0.10, edgeWidth: 3, flowIters: 0, dt: 1, edgeFlowDepth };
      const info = attachGpu(gpu, O, { mode: 'auto', log: () => {} });
      if (info.backend !== 'gpu') { t.skip(`no GPU: ${info.reason}`); return; }

      try {
        // Create a square wet passage in the center with dry surrounding paper
        const mask = new Uint8Array(64 * 64);
        for (let y = 16; y < 48; y++) {
          for (let x = 16; x < 48; x++) {
            mask[y * 64 + x] = 1;
          }
        }
        cpu.prewetRegion(mask, 0.12);
        gpu.prewetRegion(mask, 0.12);
        for (let i = 0; i < 64 * 64; i++) {
          if (mask[i]) { cpu.W[i] = 0.12; gpu.W[i] = 0.12; }
        }

        // Force GPU to upload initial state
        gpu._gpu.fullUp(gpu);

        // Advance both CPU and GPU by 10 drying steps, checking intermediate wet steps
        for (let i = 0; i < 10; i++) {
          step(cpu, O);
          step(gpu, O);
          if (i === 4) {
            gpu._gpu.down(gpu, [0, 0, 64, 64]);
            assert.ok(cpu.W[32 * 64 + 32] > 0, 'intermediate interior CPU W must be positive');
            assert.ok(gpu.W[32 * 64 + 32] > 0, 'intermediate interior GPU W must be positive');
            for (let j = 0; j < 64 * 64; j++) {
              if (mask[j]) {
                assert.ok(Math.abs(cpu.W[j] - gpu.W[j]) < 5e-3, `intermediate step parity mismatch: diff ${Math.abs(cpu.W[j] - gpu.W[j])}`);
              }
            }
          }
        }

        // Synchronize GPU state down to CPU sheet
        gpu._gpu.down(gpu, [0, 0, 64, 64]);

        // Calculate error metrics
        let maxDiff = 0, sumDiff = 0, count = 0;
        for (let i = 0; i < 64 * 64; i++) {
          if (mask[i]) {
            const diff = Math.abs(cpu.W[i] - gpu.W[i]);
            if (diff > maxDiff) maxDiff = diff;
            sumDiff += diff;
            count++;
          }
        }
        const meanDiff = sumDiff / (count || 1);

        // Tight parity bound: CPU and GPU must agree within float noise
        assert.ok(maxDiff < 5e-3, `edgeFlowDepth ${edgeFlowDepth} mmPerCell ${mmPerCell}: max difference ${maxDiff} exceeds 5e-3 tolerance`);
        assert.ok(meanDiff < 5e-4, `edgeFlowDepth ${edgeFlowDepth} mmPerCell ${mmPerCell}: mean difference ${meanDiff} exceeds 5e-4 tolerance`);
      } finally {
        gpu._gpu.close();
      }
    }
  }
});


// brush-review item 8: a damp round carrying paint, drawn through a wet wash, gives its paint into it as it drinks; the
// GPU contact trades both ways as the CPU one does.
test('a damp round carrying paint through a wet wash lays the same paint on the GPU as on the CPU', { timeout: 120000 , todo: GPU_PORT_TODO }, t => {
  const lay = sheet => {
    const flat = createBrush({ flat: true, radius: 10, capacity: 100, belly: 12, give: 0.9, free: 0.4, wetMix: 0.55, seed: 5 });
    dip(flat, { water: 0.62, conc: [0.3, 0] }); stroke(flat, sheet, [{ x: 8, y: 48, p: 0.9, r: 10 }, { x: 88, y: 48, p: 0.9, r: 10 }], { upright: 'sweep' });
    for (let j = 0; j < 10; j++) step(sheet, DEFAULTS);
    const round = createBrush({ radius: 2.5, bristles: 8, capacity: 26, belly: 2, feed: 0.08, give: 0.7, free: 0.4, film: 0.22, wetMix: 0.15, seed: 31 });
    dip(round, { water: 0.3, conc: [0, 0.5] });
    stroke(round, sheet, [{ x: 20, y: 46, p: 0.7, r: 2.5 }, { x: 76, y: 50, p: 0.7, r: 2.5 }]);
    const T = totals(sheet); return { water: T.water, pig: T.pig };
  };
  const cpu = lay(fresh()), g = fresh(), info = attachGpu(g, DEFAULTS, { mode: 'auto', log: () => {} });
  if (info.backend !== 'gpu') { t.skip(`no GPU: ${info.reason}`); return; }
  try {
    const gpu = lay(g); assert.ok(gpuStats(g).strokes >= 2, 'the strokes were laid on the GPU');
    const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(b)), `${what}: GPU ${a} against CPU ${b}`);
    near(gpu.water, cpu.water, 'water'); gpu.pig.forEach((v, k) => near(v, cpu.pig[k], 'pigment ' + k));
    assert.ok(cpu.pig[1] > 0, 'the round laid its paint');
  } finally { g._gpu.close(); }
});

// A dry brush on cold-press tooth: the GPU reads the tooth level in the height's units from its brush plane, as the CPU
// brush does (paper.mjs toothRange), so the same cells are touched and the same paint is laid.
test('a dry brush over cold-press tooth lays the same paint on the GPU as on the CPU', { timeout: 120000 }, t => {
  const m = 0.6, cold = () => createSheet(makePaper(N, N, { mmPerCell: m, seed: 9, toothScale: 0.2, coldPress: { mmPerCell: m, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } }), pigments);
  const lay = sheet => { const b = createBrush({ flat: true, radius: 4, bristles: 12, capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, wetMix: 0, bridge: 0.38, bridgeSoft: 1, seed: 31 }); dip(b, { water: 0.22, conc: [0.5, 0] }); stroke(b, sheet, [{ x: 10, y: 48, p: 0.9, r: 4 }, { x: 86, y: 48, p: 0.9, r: 4 }], { upright: 'sweep' }); return totals(sheet).pig[0]; };
  const cpu = lay(cold()), g = cold(), info = attachGpu(g, DEFAULTS, { mode: 'auto', log: () => {} });
  if (info.backend !== 'gpu') { t.skip(`no GPU: ${info.reason}`); return; }
  try {
    const gpu = lay(g); assert.ok(gpuStats(g).strokes >= 1, 'the stroke was laid on the GPU');
    assert.ok(cpu > 0 && Math.abs(gpu - cpu) <= 1e-4 * cpu, `GPU ${gpu} against CPU ${cpu}`);
  } finally { g._gpu.close(); }
});

test('a GPU sheet refuses the pinned-edge feed it does not have, loudly with --gpu on and by falling back with auto', () => {
  const make = () => createSheet(makePaper(16, 16, { seed: 3 }), [{ K: [1, 1, 1], S: [.02, .02, .02], rho: .05, omega: 1, gamma: 0 }]);
  assert.throws(() => attachGpu(make(), SHEET_DEFAULTS, { mode: 'on', log: () => {} }), /pinned-edge feed/);
  const info = attachGpu(make(), SHEET_DEFAULTS, { mode: 'auto', log: () => {} });
  assert.equal(info.backend, 'cpu'); assert.match(info.reason, /pinned-edge feed/);
});
