import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../paper.mjs';
import { createSheet, step, DEFAULTS as SHEET_DEFAULTS, setClip, applyResist } from '../sheet.mjs';
import { createBrush, dip, thirsty, stroke, setStrokeVariety } from '../brush.mjs';
import { kappaOf } from '../tuft-section.mjs';
import { attachGpu } from './link.mjs';
import { assertDeviceHealthy } from './device-health.mjs';
import { renderLayers } from '../km.mjs';
import { labOf, deltaE2000 } from '../../eval/colour.mjs';

const DEFAULTS = { ...SHEET_DEFAULTS, edgeEvap: 0 };
const PIGS = [
  { K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 },
  { K: [0.65, 0.18, 0.12], S: [0.02, 0.02, 0.02], rho: 0.06, omega: 0.9, gamma: 0.35 },
  { K: [0.12, 0.45, 0.72], S: [0.03, 0.03, 0.03], rho: 0.07, omega: 0.6, gamma: 0.55 },
];

function brushMass(brush, K, scale) {
  let w = brush.resW;
  const p = new Float64Array(K);
  for (let k = 0; k < K; k++) p[k] += brush.resP?.[k] ?? 0;
  for (const hr of brush.hairs) {
    w += hr.water;
    if (hr.pig) for (let k = 0; k < K; k++) p[k] += hr.pig[k];
  }
  const pig = Array.from(p, v => v * scale);
  return { water: w * scale, pig };
}

function sheetMass(sheet) {
  let w = 0;
  for (let i = 0; i < sheet.n; i++) w += sheet.W[i] + sheet.s[i];
  const pig = [];
  for (let k = 0; k < sheet.K; k++) {
    let s = 0;
    const G = sheet.G[k], P = sheet.P[k], D = sheet.D[k];
    for (let i = 0; i < sheet.n; i++) s += G[i] + P[i] + D[i];
    pig.push(s);
  }
  return { water: w, pig };
}

function maxDiff(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > m) m = d;
  }
  return m;
}

function sheetMeanDE00(cpu, gpu) {
  const prgb = [247, 245, 237];
  const paperBuf = new Uint8ClampedArray(cpu.n * 3);
  for (let i = 0; i < cpu.n; i++) {
    paperBuf[3 * i] = prgb[0];
    paperBuf[3 * i + 1] = prgb[1];
    paperBuf[3 * i + 2] = prgb[2];
  }
  const sumL = sh => sh.G.map((g, k) => Float32Array.from(g, (v, i) => v + sh.D[k][i] + sh.P[k][i]));
  const a = renderLayers([...cpu.layers, sumL(cpu)], PIGS, paperBuf, cpu.n, 6);
  const b = renderLayers([...gpu.layers, sumL(gpu)], PIGS, paperBuf, gpu.n, 6);
  let sum = 0;
  for (let i = 0; i < cpu.n; i++) sum += deltaE2000(labOf(a, i, prgb), labOf(b, i, prgb));
  return sum / cpu.n;
}

function comparePair(t, { name, w = 84, h = 68, paperOpts = {}, setup, run, resident = false, fieldTol = 5e-4, meanTol = 5e-6, massTol = 1e-5, brushRelTol = 5e-4, deTol = 0.15 }) {
  const prevRes = process.env.GPU_RESIDENT;
  if (resident) process.env.GPU_RESIDENT = '1';
  else delete process.env.GPU_RESIDENT;
  const paper = makePaper(w, h, { seed: 19, mmPerCell: 0.25, tooth: 0.75, coldPress: { mmPerCell: 0.25 }, ...paperOpts });
  const cpu = createSheet(paper, PIGS);
  const gpu = createSheet(paper, PIGS);
  setup?.(cpu);
  setup?.(gpu);
  const info = attachGpu(gpu, DEFAULTS, { mode: process.env.GPU_REQUIRED === '1' ? 'on' : 'auto', log() {} });
  if (info.backend !== 'gpu') {
    if (prevRes === undefined) delete process.env.GPU_RESIDENT; else process.env.GPU_RESIDENT = prevRes;
    t.skip(info.reason);
    return;
  }
  try {
    const cpuRet = run(cpu, false);
    const gpuRet = run(gpu, true);
    for (const b of gpuRet.brushes) gpu._gpu.settleBrush(b);
    gpu._gpu.syncAll(gpu);
    assertDeviceHealthy(gpu);
    assert.ok((gpu._gpu.stats.sectionGpuStrokes ?? 0) > 0, `${name}: expected GPU section strokes`);
    assert.equal(gpu._gpu.stats.cpuStrokes ?? 0, 0, `${name}: expected zero CPU fallback strokes`);

    const planes = [
      ['W', cpu.W, gpu.W],
      ['s', cpu.s, gpu.s],
      ['M', cpu.M, gpu.M],
      ['ever', cpu.ever, gpu.ever],
      ...PIGS.map((_, k) => [`G${k}`, cpu.G[k], gpu.G[k]]),
      ...PIGS.map((_, k) => [`D${k}`, cpu.D[k], gpu.D[k]]),
      ...PIGS.map((_, k) => [`P${k}`, cpu.P[k], gpu.P[k]]),
    ];
    for (const [label, a, b] of planes) {
      const isMask = label === 'M' || label === 'ever';
      let mx = 0, sum = 0;
      for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        sum += d;
        // Binary wet masks can flip on a single border cell when float32 vs float64 rounds ~1e-9 water across 0.
        if (isMask && d > 0 && Math.abs(cpu.W[i] - gpu.W[i]) <= 1e-6 && Math.abs(cpu.s[i] - gpu.s[i]) <= 1e-6) continue;
        if (d > mx) mx = d;
      }
      const mean = sum / a.length;
      assert.ok(mx <= fieldTol, `${name} ${label}: max diff ${mx} > ${fieldTol}`);
      assert.ok(mean <= meanTol, `${name} ${label}: mean diff ${mean} > ${meanTol}`);
    }

    const meanDE = sheetMeanDE00(cpu, gpu);
    assert.ok(meanDE <= deTol, `${name}: mean dE00 ${meanDE} > ${deTol}`);

    if (cpuRet.laneStates) {
      for (let s = 0; s < cpuRet.laneStates.length; s++) for (let j = 0; j < cpuRet.laneStates[s].length; j++) {
        const a = cpuRet.laneStates[s][j], b = gpuRet.laneStates[s][j];
        for (let k = 0; k < a.length; k++) assert.ok(Math.abs(a[k] - b[k]) <= Math.max(2e-5, Math.abs(a[k]) * 2e-3),
          `${name} stroke ${s} hair ${j} channel ${k}: ${a[k]} vs ${b[k]}`);
      }
    }
    // Verify brush state parity & mass conservation
    const mmc = paper.mmPerCell;
    for (let bi = 0; bi < cpuRet.brushes.length; bi++) {
      const cb = cpuRet.brushes[bi], gb = gpuRet.brushes[bi];
      const scale = kappaOf(cb, mmc) / (mmc * mmc);
      const cm = brushMass(cb, PIGS.length, scale), gm = brushMass(gb, PIGS.length, scale);
      assert.ok(Math.abs(cm.water - gm.water) <= Math.max(1e-4, cm.water * brushRelTol), `${name} brush[${bi}] water ${cm.water} vs ${gm.water}`);
      for (let k = 0; k < PIGS.length; k++) {
        assert.ok(Math.abs(cm.pig[k] - gm.pig[k]) <= Math.max(1e-4, cm.pig[k] * brushRelTol), `${name} brush[${bi}] pig[${k}] ${cm.pig[k]} vs ${gm.pig[k]}`);
      }
    }

    if (gpuRet.beforeMass) {
      const afterS = sheetMass(gpu);
      const afterB = { water: 0, pig: new Array(PIGS.length).fill(0) };
      for (const b of gpuRet.brushes) {
        const scale = kappaOf(b, mmc) / (mmc * mmc);
        const m = brushMass(b, PIGS.length, scale);
        afterB.water += m.water;
        for (let k = 0; k < PIGS.length; k++) afterB.pig[k] += m.pig[k];
      }
      const totalW = afterS.water + afterB.water;
      const wErr = Math.abs(totalW - gpuRet.beforeMass.water) / Math.max(1, gpuRet.beforeMass.water);
      assert.ok(wErr < massTol, `${name}: GPU water conservation error ${wErr} >= ${massTol}`);
      for (let k = 0; k < PIGS.length; k++) {
        const totalP = afterS.pig[k] + afterB.pig[k];
        const pErr = Math.abs(totalP - gpuRet.beforeMass.pig[k]) / Math.max(1, gpuRet.beforeMass.pig[k]);
        assert.ok(pErr < massTol, `${name}: GPU pigment[${k}] conservation error ${pErr} >= ${massTol}`);
      }
    }
  } finally {
    gpu._gpu?.close();
    if (prevRes === undefined) delete process.env.GPU_RESIDENT; else process.env.GPU_RESIDENT = prevRes;
  }
}

test('GPU section brush parity: wet-on-dry wash (round & flat, with variety)', t => {
  setStrokeVariety(1);
  for (const flat of [false, true]) {
    comparePair(t, {
      name: `wet-on-dry-${flat ? 'flat' : 'round'}`,
      run: sh => {
        const b = createBrush({ model: 'section', flat, radius: flat ? 8 : 6, bristles: 18, capacity: 40, belly: 6, feed: 0.25, give: 0.85, free: 0.4, wetness: 0.9, bridge: 0.65, bridgeSoft: 1.0, streak: 0.4, seed: 23 });
        dip(b, { water: 0.85, conc: [0.3, 0.15, 0.05] });
        const mmc = sh.paper.mmPerCell, scale = kappaOf(b, mmc) / (mmc * mmc);
        const bm = brushMass(b, PIGS.length, scale), sm = sheetMass(sh);
        const beforeMass = { water: bm.water + sm.water, pig: bm.pig.map((v, k) => v + sm.pig[k]) };
        const path = [{ x: 12, y: 18, p: 0.35 }, { x: 34, y: 24, p: 0.95 }, { x: 58, y: 40, p: 0.8 }, { x: 72, y: 48, p: 0.3 }];
        stroke(b, sh, path, { spacing: 0.7, lift: true });
        return { brushes: [b], beforeMass };
      },
    });
  }
});

test('GPU section brush parity: wet-on-wet (wetMix + thirsty lift)', t => {
  setStrokeVariety(1);
  comparePair(t, {
    name: 'wet-on-wet-and-lift',
    fieldTol: 2e-3,
    meanTol: 5e-5,
    brushRelTol: 2e-3,
    setup: sh => {
      for (let y = 12; y < 56; y++) for (let x = 14; x < 70; x++) {
        const i = y * sh.w + x;
        sh.W[i] = 0.18; sh.s[i] = 0.04; sh.M[i] = 1; sh.ever[i] = 1;
        sh.G[1][i] = 0.05; sh.G[2][i] = 0.02;
      }
    },
    run: sh => {
      const b1 = createBrush({ model: 'section', flat: false, radius: 6, bristles: 16, capacity: 30, belly: 4, feed: 0.2, give: 0.8, free: 0.4, wetness: 0.9, wetMix: 0.5, seed: 31 });
      dip(b1, { water: 0.8, conc: [0.35, 0, 0] });
      const b2 = createBrush({ model: 'section', flat: true, radius: 7, bristles: 14, capacity: 35, belly: 4, feed: 0.2, give: 0.85, free: 0.4, wetness: 0.9, seed: 37 });
      dip(b2, { water: 0.5, conc: [0, 0, 0] });
      thirsty(b2, { water: 0.12 });
      const mmc = sh.paper.mmPerCell;
      const m1 = brushMass(b1, PIGS.length, kappaOf(b1, mmc) / (mmc * mmc));
      const m2 = brushMass(b2, PIGS.length, kappaOf(b2, mmc) / (mmc * mmc));
      const sm = sheetMass(sh);
      const beforeMass = { water: m1.water + m2.water + sm.water, pig: m1.pig.map((v, k) => v + m2.pig[k] + sm.pig[k]) };
      stroke(b1, sh, [{ x: 16, y: 20, p: 0.7 }, { x: 48, y: 34, p: 0.9 }, { x: 66, y: 46, p: 0.6 }]);
      stroke(b2, sh, [{ x: 20, y: 48, p: 0.85 }, { x: 52, y: 24, p: 0.9 }]);
      return { brushes: [b1, b2], beforeMass };
    },
  });
});

test('GPU section brush parity: dry-brush crest breakup on rough tooth', t => {
  setStrokeVariety(1);
  comparePair(t, {
    name: 'dry-brush-crests',
    paperOpts: { tooth: 0.95 },
    run: sh => {
      const b = createBrush({ model: 'section', flat: true, radius: 9, bristles: 20, capacity: 60, belly: 8, feed: 0.3, give: 0.9, free: 0.4, bridge: 0.55, bridgeSoft: 0.4, streak: 0.6, seed: 70 });
      dip(b, { water: 0.14, conc: [0.4, 0.2, 0.1] });
      const mmc = sh.paper.mmPerCell, scale = kappaOf(b, mmc) / (mmc * mmc);
      const bm = brushMass(b, PIGS.length, scale), sm = sheetMass(sh);
      const beforeMass = { water: bm.water + sm.water, pig: bm.pig.map((v, k) => v + sm.pig[k]) };
      stroke(b, sh, [{ x: 10, y: 34, p: 0.6 }, { x: 44, y: 30, p: 0.75 }, { x: 74, y: 36, p: 0.5 }], { upright: 'sweep' });
      return { brushes: [b], beforeMass };
    },
  });
});

test('GPU section brush parity: multi-pigment belly depletion, lift:false continuation, clip, resist and mid-stroke flows (GPU_RESIDENT=1)', t => {
  setStrokeVariety(1);
  comparePair(t, {
    name: 'resident-multi-stroke-flow-clip-resist',
    resident: true,
    meanTol: 1e-5,
    setup: sh => {
      const clip = Uint8Array.from({ length: sh.n }, (_, i) => ((i % sh.w) >= 10 && (i % sh.w) < 74 && ((i / sh.w) | 0) >= 8 && ((i / sh.w) | 0) < 60 ? 1 : 0));
      setClip(sh, clip);
      const resist = Uint8Array.from({ length: sh.n }, (_, i) => ((i % sh.w) >= 34 && (i % sh.w) < 44 && ((i / sh.w) | 0) >= 26 && ((i / sh.w) | 0) < 38 ? 1 : 0));
      applyResist(sh, resist);
    },
    run: sh => {
      const b = createBrush({ model: 'section', flat: false, radius: 5, bristles: 16, capacity: 8, belly: 1.5, feed: 0.15, give: 0.85, free: 0.35, wetness: 0.9, bridge: 0.7, seed: 47 });
      dip(b, { water: 0.95, conc: [0.25, 0.3, 0.2] });
      // Multi-part stroke (lift: false -> lift: true) + second stroke without re-dip to exercise belly depletion & resident brush slot carry-over
      stroke(b, sh, [{ x: 14, y: 18, p: 0.8 }, { x: 40, y: 26, p: 0.95 }], {
        lift: false, gpuBetween: true, flowEvery: 6,
        between: k => { if (k % 6 === 0) step(sh, DEFAULTS); },
      });
      stroke(b, sh, [{ x: 40, y: 26, p: 0.95 }, { x: 68, y: 42, p: 0.7 }], {
        lift: true, gpuBetween: true, flowEvery: 6,
        between: k => { if (k % 6 === 0) step(sh, DEFAULTS); },
      });
      stroke(b, sh, [{ x: 64, y: 18, p: 0.85 }, { x: 20, y: 50, p: 0.75 }], { lift: true });
      return { brushes: [b] };
    },
  });
});

test('GPU section brush parity: large wash brush multi-workgroup (r=45 round & flat)', t => {
  setStrokeVariety(1);
  for (const flat of [false, true]) {
    comparePair(t, {
      name: `large-wash-r45-${flat ? 'flat' : 'round'}`,
      w: 220,
      h: 180,
      resident: true,
      fieldTol: 1.5e-2,
      meanTol: 1e-4,
      brushRelTol: 2e-3,
      deTol: 0.15,
      run: sh => {
        const b = createBrush({ model: 'section', flat, radius: 45, bristles: 32, capacity: 60, belly: 8, feed: 0.25, give: 0.85, free: 0.4, wetness: 0.9, bridge: 0.65, bridgeSoft: 1.0, streak: 0.4, seed: 23 });
        dip(b, { water: 0.85, conc: [0.3, 0.15, 0.05] });
        const mmc = sh.paper.mmPerCell, scale = kappaOf(b, mmc) / (mmc * mmc);
        const bm = brushMass(b, PIGS.length, scale), sm = sheetMass(sh);
        const beforeMass = { water: bm.water + sm.water, pig: bm.pig.map((v, k) => v + sm.pig[k]) };
        stroke(b, sh, [{ x: 65, y: 90, p: 0.85 }, { x: 155, y: 90, p: 0.85 }], { spacing: 0.7, lift: true });
        return { brushes: [b], beforeMass };
      },
    });
  }
});

test('GPU section brush parity: NONE/OFFSHEET and full signed-zero pigment path', t => {
  comparePair(t, {
    name: 'mixed-fused-parallel', w: 120, h: 80, resident: true, fieldTol: 2e-3, meanTol: 5e-5, brushRelTol: 2e-3,
    run: sh => {
      const b = createBrush({ model: 'section', radius: 5, bristles: 24, capacity: 20, seed: 37 });
      dip(b, { water: 0.8, conc: [0.3, 0.1, -0] });
      for (const hr of b.hairs) hr.pig[2] = -0;
      b.resP[2] = -0;
      stroke(b, sh, [
        { x: -35, y: 30, r: 3, p: 0.8 }, { x: 25, y: 30, r: 3, p: 0.8 },
        { x: 38, y: 35, r: 3, p: 0.9 }, { x: 60, y: 35, r: 3, p: 0.9 },
        { x: 75, y: 40, r: 3, p: 0.8 }, { x: 85, y: 40, r: 3, p: 0 },
        { x: 100, y: 40, r: 3, p: 0.8 },
      ]);
      return { brushes: [b] };
    },
  });
});

test('section run partition uses one dispatch per maximal small run and splits at flows and large steps', async () => {
  const { SectionBrushGpu } = await import('./section-brush-gpu.mjs');
  const driver = Object.create(SectionBrushGpu.prototype);
  const U = new Uint32Array(64 + 8 * 32); U[0] = 32;
  for (let s = 0; s < 8; s++) { const b = 64 + s * 32; U[b + 30] = 7; U[b + 31] = 7; }
  U[64 + 2 * 32 + 27] = 1;
  U[64 + 3 * 32 + 28] = 0xFFFFFFFF;
  U[64 + 4 * 32 + 30] = 50; U[64 + 4 * 32 + 31] = 50;
  U[64 + 7 * 32 + 28] = 0xFFFFFFFE;
  const calls = [], pass = { setBindGroup() {}, setPipeline(p) { this.p = p; }, dispatchWorkgroups(n) { calls.push([this.p, n]); } };
  const pipes = Object.fromEntries(['Init', 'Eval', 'Scale', 'Apply', 'Commit', 'Small'].map(n => [`p${n}`, n]));
  const boundaries = [...driver.encodeRuns(() => pass, U, 8, 32, 64, pipes)];
  assert.deepEqual(boundaries, [{ s: 2, flows: 1 }, { s: 3, flows: 0 }, { s: 4, flows: 0 }, { s: 7, flows: 0 }]);
  assert.deepEqual(calls.map(c => c[0]), ['Small', 'Small', 'Init', 'Eval', 'Scale', 'Apply', 'Commit', 'Small']);
  const tiny = new Uint32Array(64 + 80 * 32); tiny[0] = 32;
  for (let i = 0; i < 80; i++) { const b = 64 + i * 32; tiny[b + 30] = 7; tiny[b + 31] = 7; }
  calls.length = 0;
  assert.equal([...driver.encodeRuns(() => pass, tiny, 80, 32, 64, pipes)].length, 1);
  assert.deepEqual(calls, [['Small', 1]], '80 active small steps: 321 legacy dispatches become one');
  const medium = new Uint32Array(64 + 3 * 32); medium[0] = 32;
  for (let s = 0; s < 3; s++) {
    const b = 64 + s * 32;
    medium[b + 30] = [31, 63, 64][s]; medium[b + 31] = 31;
  }
  calls.length = 0;
  assert.deepEqual([...driver.encodeRuns(() => pass, medium, 3, 32, 64, pipes)],
    [{ s: 1, flows: 0 }, { s: 2, flows: 0 }]);
  assert.deepEqual(calls.map(c => c[0]), ['Small', 'Init', 'Eval', 'Scale', 'Apply', 'Commit'],
    '1024 and 2048 cells fuse together; the next larger footprint stays parallel');
});

test('section shaders compile with ten storage buffers and the WebGPU 16 KiB shared-memory floor', async t => {
  const { create, globals } = await import('webgpu');
  const { SectionBrushGpu } = await import('./section-brush-gpu.mjs');
  Object.assign(globalThis, globals);
  const gpu = create([]), adapter = await gpu.requestAdapter();
  if (!adapter) { if (process.env.GPU_REQUIRED === '1') assert.fail('GPU required'); return t.skip('no adapter'); }
  const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10, maxComputeWorkgroupStorageSize: 16384 } });
  const buffers = [];
  let driver;
  try {
    device.pushErrorScope('validation');
    const b = Object.fromEntries(['U', 'M', 'EVER', 'RESIST', 'W', 'S', 'G', 'D', 'FLAGS2', 'BSTR', 'BPAP'].map(name => {
      const buffer = device.createBuffer({ size: 256, usage: name === 'U' ? GPUBufferUsage.UNIFORM : GPUBufferUsage.STORAGE });
      buffers.push(buffer); return [name, buffer];
    }));
    const prelude = `struct U { w: u32, n: u32, tw: u32, ntiles: u32, p3: u32, nAct: u32, kl: array<vec4<u32>, 4> }
      @group(0) @binding(0) var<uniform> u: U;\n`;
    driver = new SectionBrushGpu({ device, SB: 4194304, b }, prelude);
    assert.equal(await device.popErrorScope(), null);
  } finally { driver?.bSwork.destroy(); for (const b of buffers) b.destroy(); device.destroy(); }
});


test('GPU section brush parity: 40 mm mixed radii across small/parallel transitions', t => {
  comparePair(t, {
    name: 'mixed-radii-40mm', w: 160, h: 120, resident: true,
    // The existing large-brush CPU/float32 contact tolerance also applies at r=30.
    fieldTol: 1.5e-2, meanTol: 1e-4, brushRelTol: 2e-3,
    run: sh => {
      const b = createBrush({ model: 'section', radius: 8, bristles: 20, capacity: 40, seed: 23 });
      dip(b, { water: .85, conc: [.3, .15, .05] });
      stroke(b, sh, [
        { x: 30, y: 50, r: 4, p: .8 }, { x: 50, y: 50, r: 8, p: .8 },
        { x: 75, y: 55, r: 14, p: .8 }, { x: 105, y: 60, r: 30, p: .8 },
        { x: 125, y: 60, r: 4, p: .8 },
      ]);
      return { brushes: [b] };
    },
  });
});


test('parallel section publishes per-hair water and pigment across consecutive large wet strokes', t => {
  comparePair(t, {
    name: 'parallel-consecutive-wet', w: 220, h: 180, resident: true,
    fieldTol: 1.5e-2, meanTol: 1e-4, brushRelTol: 2e-3,
    setup: sh => {
      sh.W.fill(.18); sh.s.fill(.04); sh.M.fill(1); sh.ever.fill(1);
      sh.G[1].fill(.03); sh.G[2].fill(.015);
    },
    run: (sh, isGpu) => {
      const b = createBrush({ model: 'section', radius: 45, bristles: 32, capacity: 60, belly: 8, feed: .3, wetMix: .4, seed: 23 });
      dip(b, { water: .85, conc: [.3, .15, .05] });
      const laneStates = [];
      // Radius 45 produces footprints far above 2048 cells at every dab.
      for (const y of [65, 85, 105]) {
        stroke(b, sh, [{ x: 65, y, p: .85 }, { x: 155, y, p: .85 }], { spacing: .7, lift: true });
        if (isGpu) sh._gpu.settleBrush(b);
        laneStates.push(b.hairs.map(hr => [hr.water, ...hr.pig]));
      }
      return { brushes: [b], laneStates };
    },
  });
});

test('zigzag multi-lane section stroke never self-clips adjacent lanes at start/end endLines (CPU + GPU parity)', t => {
  comparePair(t, {
    name: 'zigzag-endline-no-self-clip', w: 180, h: 160, resident: true,
    fieldTol: 1.5e-2, meanTol: 1e-4, brushRelTol: 2e-3,
    run: (sh, isGpu) => {
      const b = createBrush({ model: 'section', radius: 22, bristles: 32, capacity: 80, belly: 10, seed: 7 });
      dip(b, { water: .9, conc: [.4, .2, .1] });
      // 3-lane zigzag spaced ~1.33*R (29 cells) apart: lane 2 passes spatially under start (100,45) and above end (90,103)
      stroke(b, sh, [
        { x: 100, y: 45, p: .4 }, { x: 45, y: 45, p: .9 },
        { x: 50, y: 74, p: .9 }, { x: 130, y: 74, p: .9 },
        { x: 125, y: 103, p: .9 }, { x: 90, y: 103, p: .4 },
      ], { spacing: .7, lift: true });
      if (!isGpu) {
        // Lane 2 directly under start (x=108, y=74) must be painted cleanly, not sliced by start endLine at x=100.
        assert.ok(sh.W[74 * 180 + 108] > 0.05, `expected wet paint at (108,74), got ${sh.W[74 * 180 + 108]}`);
        // Lane 2 directly above end (x=81, y=75) must be painted cleanly, not sliced by end endLine at x=90.
        assert.ok(sh.W[75 * 180 + 81] > 0.05, `expected wet paint at (81,75), got ${sh.W[75 * 180 + 81]}`);
      }
      return { brushes: [b] };
    },
  });
});

test('pressed round section stroke leaks zero wet cells behind its landing endLine (CPU + GPU parity)', t => {
  comparePair(t, {
    name: 'round-start-no-nub', w: 220, h: 120, resident: true,
    fieldTol: 1.5e-2, meanTol: 1e-4, brushRelTol: 2e-3,
    run: (sh, isGpu) => {
      const b = createBrush({ model: 'section', radius: 30, bristles: 32, capacity: 80, belly: 10, seed: 7 });
      dip(b, { water: .9, conc: [.4, .2, .1] });
      stroke(b, sh, [{ x: 60, y: 60, p: .35 }, { x: 185, y: 60, p: 1.0 }], { spacing: .7, lift: true });
      if (!isGpu) {
        let behind = 0;
        for (let y = 0; y < 120; y++) for (let x = 0; x < 59; x++) if (sh.W[y * 220 + x] > 0) behind++;
        assert.equal(behind, 0, `expected 0 wet cells behind start line x<59, got ${behind}`);
      }
      return { brushes: [b] };
    },
  });
});
