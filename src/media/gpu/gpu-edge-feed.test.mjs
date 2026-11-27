// The pinned-edge feed on the GPU sheet (edge-geometry.mjs, edge-feed-wgsl.mjs) against the CPU sheet's (edge-feed.mjs):
// a poured disc and a square with a dry bay, stepped on both, must hold the same water and pigment; and with no other
// evaporation the GPU's water left plus what its feed evaporated must be the water poured. Skipped without a GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheet, deposit, step, DEFAULTS } from '../sheet.mjs';
import { makePaper } from '../paper.mjs';
import { GpuSheet, openGpu } from './stepfull.mjs';

const PIGMENTS = [{ K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85, floc: 0.3 }];
const N = 96, MM = 0.25;
function wash(shape) {
  // a flat sheet (no cockle, paper.mjs): the cockle keeps the film moving, and its pigment's float32 trades on the GPU
  // then part from the CPU's by 6e-4, more than the feed's own 1e-4 measures (gpu-film-level.test.mjs covers the cockle)
  const sheet = createSheet(makePaper(N, N, { seed: 9, mmPerCell: MM, cockle: { rmsMm: 0 } }), PIGMENTS);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const disc = Math.hypot(x - 48, y - 48) < 30, square = x > 16 && x < 80 && y > 16 && y < 80 && !(x > 48 && Math.abs(y - 48) < 8);
    if (shape === 'disc' ? disc : square) deposit(sheet, y * N + x, 0.3, [0.45]);
  }
  return sheet;
}
const water = s => { let t = 0; for (let i = 0; i < s.n; i++) t += s.W[i] + s.s[i]; return t; };
const pigment = s => { let t = 0; for (let i = 0; i < s.n; i++) t += s.G[0][i] + s.P[0][i] + s.D[0][i]; return t; };
const worst = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };

let device = null;
async function gpu(t) {
  if (device) return device;
  try { const w = await import('webgpu'); Object.assign(globalThis, w.globals); ({ device } = await openGpu(w.create([]))); return device; }
  catch (e) { if (process.env.GPU_REQUIRED === '1') throw e; t.skip(`GPU unavailable: ${e.message}`); return null; }
}
test.after(() => device?.destroy());

for (const shape of ['disc', 'square']) {
  test(`the GPU edge feed holds the CPU's water and pigment on a ${shape}`, { timeout: 120000 }, async t => {
    const d = await gpu(t); if (!d) return;
    // A strong feed, so the rim is well formed in 120 steps. Slide off: its repose threshold turns a float32 rounding of
    // the deposit into a whole cell's slide or none (with it on, the rim cells' deposits part by up to 0.07 from step 30,
    // with or without the feed); the wash cases (tools/lab/gpu-wash-cases.test.mjs) compare the dried colour with it on.
    const O = { ...DEFAULTS, edgeEvap: 0.004, mmPerCell: MM, dt: 2, slide: 0 };
    const cpu = wash(shape), gs = wash(shape), g = await GpuSheet.create(d, gs, O);
    try {
      for (let i = 0; i < 120; i++) step(cpu, O);
      await g.advance(120); await g.download(gs);
    } finally { g.destroy(); }
    const total = s => Float64Array.from(s.G[0], (v, i) => v + s.P[0][i] + s.D[0][i]);
    const dW = Math.max(worst(cpu.W, gs.W), worst(cpu.s, gs.s)), dG = worst(total(cpu), total(gs)), dP = worst(cpu.edgePending, gs.edgePending);
    t.diagnostic(JSON.stringify({ dW, dG, dP, waterCpu: water(cpu), waterGpu: water(gs) }));
    // float32 against the CPU's double-precision feed: a few float32 roundings of a cell's water and pigment
    assert.ok(dW < 1e-4, `water differs by ${dW}`);
    assert.ok(dG < 1e-4, `pigment differs by ${dG}`);
    assert.ok(dP < 1e-5, `unmet edge demand differs by ${dP}`);
    assert.ok(Math.abs(water(gs) / water(cpu) - 1) < 1e-5, 'total water');
  });
}

test('the GPU edge feed balances water and pigment to 1e-5', { timeout: 120000 }, async t => {
  const d = await gpu(t); if (!d) return;
  // no evaporation but the feed's: what leaves the sheet is what the feed reports
  const O = { ...DEFAULTS, evap: 0, paperDry: 0, edgeEvap: 0.004, mmPerCell: MM, dt: 2 };
  const gs = wash('square'), w0 = water(gs), p0 = pigment(gs), g = await GpuSheet.create(d, gs, O);
  let gone;
  try { await g.advance(150); gone = await g.edgeEvaporated(); await g.download(gs); } finally { g.destroy(); }
  t.diagnostic(JSON.stringify({ w0, left: water(gs), gone, p0, p1: pigment(gs) }));
  assert.ok(gone > 0.05 * w0, `the feed evaporated ${gone} of ${w0}`);
  assert.ok(Math.abs(water(gs) + gone - w0) < 1e-5 * w0, `water balance ${(water(gs) + gone - w0) / w0}`);
  assert.ok(Math.abs(pigment(gs) - p0) < 1e-5 * p0, `pigment balance ${(pigment(gs) - p0) / p0}`);
});

// A tiny sheet with a genuinely large feed list, two unequal boxes, two pigments, and a workgroup crossing the box
// boundary. Compare the new cached/reduced/indirect path to the original full-range kernels without changing physics.
test('large parallel edge rounds retain the original iterates across dt regimes and inactive rounds', { timeout: 25000 }, async t => {
  const d = await gpu(t); if (!d) return;
  const make = () => {
    const s = createSheet(makePaper(224, 80, { seed: 9, mmPerCell: MM, cockle: { rmsMm: 0 } }),
      [PIGMENTS[0], { ...PIGMENTS[0], omega: 2 }]);
    for (const x0 of [8, 136]) for (let y = 5; y < 75; y++) for (let x = x0; x < x0 + 69; x++) {
      const depth = x0 === 8 ? .06 + .004 * ((x + y) % 9) : .22;
      deposit(s, y * s.w + x, depth, [.4 * depth, .2 * depth]);
    }
    return s;
  };
  const gs = make(), g = await GpuSheet.create(d, gs, { ...DEFAULTS, mmPerCell: MM, edgeEvap: .08, dt: .1 });
  try {
    d.pushErrorScope('validation');
    await g.efRefresh(); assert.ok(g.ef.count > 4096); assert.equal(g.ef.boxes, 2);
    const states = [], statuses = [];
    for (const parallel of [false, true]) {
      g.upload(make());
      d.queue.writeBuffer(g.b.EFB, 8, new Uint32Array(2));
      for (const dt of [.1, 1, 2, .1]) {
        g.setOptions({ dt });
        const enc = d.createCommandEncoder(), pass = enc.beginComputePass();
        if (parallel) g.efEncode(pass);
        else {
          const dispatch = (name, groups, round) => {
            pass.setPipeline(round === undefined ? g.p[name] : g.efPipe(name, round));
            pass.setBindGroup(0, g.bg[name]); pass.dispatchWorkgroups(groups);
          };
          const groups = Math.ceil(g.ef.count / 256);
          dispatch('ef_reset', 1); dispatch('ef_begin', groups);
          for (let r = 0; r < 32; r++) { dispatch('ef_prep', groups, r); dispatch('ef_apply', groups, r); }
        }
        pass.end(); d.queue.submit([enc.finish()]);
      }
      const state = {};
      for (const [name, bytes] of [['W', g.n * 4], ['G', g.n * 8], ['EFS', g.n * 16]]) {
        state[name] = new Float32Array(await g.readWords(name, bytes));
      }
      states.push(state); statuses.push(new Uint32Array(await g.readWords('EFB', 20)));
    }
    for (const name of ['W', 'G', 'EFS']) assert.equal(worst(states[0][name], states[1][name]), 0, `${name}: identical float32 arithmetic`);
    assert.deepEqual(statuses[1], statuses[0]);
    assert.ok(statuses[1][3] > 8, 'this exercises rounds that used to enter single-workgroup continuation');
    assert.equal(await d.popErrorScope(), null);
    t.diagnostic(JSON.stringify({ cells: g.ef.count, boxes: g.ef.boxes, rounds: statuses[1][3], forced: statuses[1][2], maxFieldError: 0 }));
  } finally { g.destroy(); }
});

test('edge geometry survives an intervening dry footprint without repeating the pressure solve', async t => {
  const d = await gpu(t); if (!d) return;
  const original = wash('disc');
  const g = await GpuSheet.create(d, original, { ...DEFAULTS, mmPerCell: MM, edgeEvap: .004 });
  try {
    await g.efRefresh();
    const geometry = [...g.ef.boxGeo.values()];
    assert.ok(geometry.some(Boolean));
    let solves = 0;
    const solve = g.dryingPressure.solve.bind(g.dryingPressure);
    g.dryingPressure.solve = (...args) => { solves++; return solve(...args); };
    const dry = wash('disc');
    for (const name of ['W', 's', 'M', 'ever']) dry[name].fill(0);
    g.upload(dry); await g.efRefresh();
    assert.equal(g.ef.boxGeo.size, 0);
    const glaze = wash('disc');
    for (let i = 0; i < glaze.n; i++) glaze.W[i] *= .5;
    g.upload(glaze); await g.efRefresh();
    assert.equal(solves, 0, 'water amount does not change footprint geometry');
    assert.deepEqual([...g.ef.boxGeo.values()], geometry);
    assert.ok(g.ef.geometryHistoryBytes <= 64 * 1024 * 1024);
  } finally { g.destroy(); }
});

test('large-list edge smoke keeps CPU parity through stroke, level and fast dt changes', { timeout: 25000 }, async t => {
  const d = await gpu(t); if (!d) return;
  const make = () => {
    const s = createSheet(makePaper(N, N, { seed: 9, mmPerCell: MM, cockle: { rmsMm: 0 } }), PIGMENTS);
    for (let y = 6; y < 90; y++) for (let x = 5; x < 91; x++) deposit(s, y * N + x, .12, [.054]);
    return s;
  };
  const cpu = make(), gs = make(), o = { ...DEFAULTS, edgeEvap: .004, mmPerCell: MM, slide: 0 };
  const g = await GpuSheet.create(d, gs, o);
  try {
    for (const dt of [.1, 1, 2, .1]) { g.setOptions({ dt }); await g.advance(1); step(cpu, { ...o, dt }); }
    assert.ok(g.ef.count > 4096);
    await g.download(gs);
    const dW = Math.max(worst(cpu.W, gs.W), worst(cpu.s, gs.s));
    const dG = Math.max(worst(cpu.G[0], gs.G[0]), worst(cpu.P[0], gs.P[0]), worst(cpu.D[0], gs.D[0]));
    assert.ok(dW < 1e-4, `water differs by ${dW}`); assert.ok(dG < 1e-4, `pigment differs by ${dG}`);
    assert.ok(worst(cpu.edgePending, gs.edgePending) < 1e-5);
    t.diagnostic(JSON.stringify({ cells: g.ef.count, dW, dG, stats: g.levelStats() }));
  } finally { g.destroy(); }
});
