// The film's levelling, the boxes' hollow fill, the thin-film hold and co-settling on the GPU sheet
// (film-level-wgsl.mjs) against the CPU sheet (film-level.mjs, sheet.mjs), stepped on both. Skipped without a GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheet, deposit, step, setTilt, DEFAULTS } from '../sheet.mjs';
import { makePaper } from '../paper.mjs';
import { GpuSheet, openGpu } from './stepfull.mjs';

const ULTRAMARINE = { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85, floc: 0.3 };
const PHTHALO = { K: [0.4861, 0.2344, 0.1063], S: [0.02, 0.02, 0.02], rho: 0.032, omega: 20, gamma: 0 };
const N = 96, MM = 0.25;
// a disc standing twice as deep on its right half, ultramarine and phthalo in it: the film levels across the step
function disc({ cx = 48, cy = 48, r = 30, deep = 0.3, shallow = 0.1, conc = [0.45, 0.2] } = {}, sheet = createSheet(makePaper(N, N, { seed: 9, mmPerCell: MM }), [ULTRAMARINE, PHTHALO])) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x - cx, y - cy) < r) { const wv = x > cx ? deep : shallow; deposit(sheet, y * N + x, wv, conc.map(c => c * wv)); }
  return sheet;
}
const worst = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
const sum = a => { let t = 0; for (let i = 0; i < a.length; i++) t += a[i]; return t; };
const water = s => sum(s.W) + sum(s.s);
const pigment = (s, k) => sum(s.G[k]) + sum(s.P[k]) + sum(s.D[k]);

let device = null;
async function gpu(t) {
  if (device) return device;
  try { const w = await import('webgpu'); Object.assign(globalThis, w.globals); ({ device } = await openGpu(w.create([]))); return device; }
  catch (e) { if (process.env.GPU_REQUIRED === '1') throw e; t.skip(`GPU unavailable: ${e.message}`); return null; }
}
test.after(() => device?.destroy());

// both sheets stepped `steps` times; the GPU's state brought down
async function both(t, make, O, steps, tilt = 0) {
  const d = await gpu(t); if (!d) return null;
  const cpu = make(), gs = make();
  if (tilt) { setTilt(cpu, tilt, 'bottom'); setTilt(gs, tilt, 'bottom'); }
  const g = await GpuSheet.create(d, gs, { ...O, tiltX: gs.tilt?.x ?? 0, tiltY: gs.tilt?.y ?? 0 });
  try {
    for (let i = 0; i < steps; i++) step(cpu, O);
    await g.advance(steps); await g.download(gs); await g.lvAdapt();
    return { cpu, gs, stats: g.levelStats() };
  } finally { g.destroy(); }
}

for (const tilt of [0, 5]) {
  test(`the GPU film levels as the CPU's${tilt ? ' on a board tilted 5 degrees' : ''}: water and pigment cell by cell`, { timeout: 120000 }, async t => {
    const O = { ...DEFAULTS, edgeEvap: 0, mmPerCell: MM, dt: 2 };
    const r = await both(t, () => disc(), O, 20, tilt); if (!r) return;
    const { cpu, gs, stats } = r;
    const dW = worst(cpu.W, gs.W), dG = Math.max(worst(cpu.G[0], gs.G[0]), worst(cpu.G[1], gs.G[1]));
    t.diagnostic(JSON.stringify({ dW, dG, stats }));
    // the levelling moved water: a level film would leave the deep half 0.2 mm deeper
    // (its surface: the depth over the paper's surface, which the wet sheet's cockle bends, paper.mjs)
    const H = i => cpu.W[i] + O.slope * cpu.paper.surface[i];
    assert.ok(Math.abs(H(48 * N + 60) - H(48 * N + 36)) < 0.02, 'the CPU film levelled');
    // float32 against the CPU's doubles. Level, a few float32 roundings of a cell's water. On the tilted board the
    // film runs to a 0.64 mm bead in a step at face conductances near 3000 (each face's flux is that times the
    // difference of two neighbours' surface changes, and float32 holds a change of 0.3 mm to 3e-8): 5e-4 a step, and
    // up to 0.5% of the bead after 20 steps
    // On the tilted board the bead leaves a trail of cells near the levelling's floor (sheet.mjs levelFloor), and a
    // few of them fall on the other side of it in float32: 0.013 of water at the worst cell after 20 steps.
    assert.ok(dW < (tilt ? 2e-2 : 1e-4), `water differs by ${dW}`);
    assert.ok(dG < (tilt ? 2e-3 : 1e-4), `pigment differs by ${dG}`);
    assert.equal(stats.short, 0, 'no solve ran out of iterations');
  });
}

test('the GPU levelling and settling keep water and pigment to 1e-5, on a tilted board', { timeout: 120000 }, async t => {
  // no evaporation, no pores: what was laid is all there is
  const O = { ...DEFAULTS, evap: 0, paperDry: 0, absorb: 0, edgeEvap: 0, mmPerCell: MM, dt: 2 };
  const r = await both(t, () => disc(), O, 40, 3); if (!r) return;
  const ref = disc();
  for (const s of [r.cpu, r.gs]) {
    assert.ok(Math.abs(water(s) / water(ref) - 1) < 1e-5, `water ${water(s)} against ${water(ref)}`);
    for (const k of [0, 1]) assert.ok(Math.abs(pigment(s, k) / pigment(ref, k) - 1) < 1e-5, `pigment ${k}: ${pigment(s, k)} against ${pigment(ref, k)}`);
  }
});

test('each box fills its hollows by its own load (fillRef), strands only in a thin film, and settles a mix together, as on the CPU', { timeout: 120000 }, async t => {
  // two passages far apart, a dark one and a light one: two boxes with different fills; levelling off to see the slide alone
  // on a flat sheet (no cockle): over the cockle the wet fronts' thresholds fall on a few cells that float32 and doubles
  // decide differently, and the deposits part by 0.003 there, which is not the fill this measures
  const flatSheet = () => createSheet(makePaper(N, N, { seed: 9, mmPerCell: MM, cockle: { rmsMm: 0 } }), [ULTRAMARINE, PHTHALO]);
  const make = () => { const s = disc({ cx: 22, cy: 48, r: 16, deep: 0.2, shallow: 0.2, conc: [6, 1] }, flatSheet()); return disc({ cx: 74, cy: 48, r: 16, deep: 0.2, shallow: 0.2, conc: [0.5, 0.1] }, s); };
  // (the painter's slideCap: without it a deposit near its repose slides a whole cell's worth or none, by a rounding)
  const O = { ...DEFAULTS, edgeEvap: 0, level: 0, mmPerCell: MM, dt: 2, slideCap: 1, fillRef: 0.4 };
  const r = await both(t, make, O, 120); if (!r) return;
  const { cpu, gs } = r, dD = Math.max(worst(cpu.D[0], gs.D[0]), worst(cpu.D[1], gs.D[1])), dG = Math.max(worst(cpu.G[0], gs.G[0]), worst(cpu.G[1], gs.G[1]));
  // the dark box's fill changed its deposit, or the comparison proves nothing
  const flat = make(); for (let i = 0; i < 120; i++) step(flat, { ...O, fillRef: 0 });
  const effect = worst(flat.D[0], cpu.D[0]);
  t.diagnostic(JSON.stringify({ dD, dG, effect }));
  assert.ok(effect > 1e-2, `fillRef barely changes the CPU deposit: ${effect}`);
  assert.ok(dD < 5e-4 && dG < 1e-5, `deposit differs by ${dD}, suspension by ${dG}`);
});

test('a puddle run into damp paint (backrun.mjs) on the GPU as on the CPU: water and pigment cell by cell, both kept', { timeout: 120000 }, async t => {
  // a damp disc (0.012 mm, its paint settled) with a puddle of clean water 0.2 mm deep in its middle
  const make = () => {
    const s = disc({ deep: 0.012, shallow: 0.012, conc: [0, 0] });
    for (let i = 0; i < s.n; i++) if (s.M[i]) { s.D[0][i] = 0.05; s.D[1][i] = 0.02; }
    for (let y = 42; y < 54; y++) for (let x = 42; x < 54; x++) s.W[y * N + x] = 0.2;
    return s;
  };
  const O = { ...DEFAULTS, evap: 0, paperDry: 0, absorb: 0, edgeEvap: 0, mmPerCell: MM, dt: 0.5 };
  const r = await both(t, make, O, 30); if (!r) return;
  const { cpu, gs } = r, ref = make();
  const dW = worst(cpu.W, gs.W), dG = Math.max(worst(cpu.G[0], gs.G[0]), worst(cpu.G[1], gs.G[1])), dD = Math.max(worst(cpu.D[0], gs.D[0]), worst(cpu.D[1], gs.D[1]));
  t.diagnostic(JSON.stringify({ dW, dG, dD }));
  // the puddle ran out into the damp paint and pushed paint on: a cell two beyond the puddle's edge took water and paint
  assert.ok(cpu.W[48 * N + 56] > 0.02, `the CPU puddle invaded: ${cpu.W[48 * N + 56]}`);
  for (const s of [cpu, gs]) {
    assert.ok(Math.abs(water(s) / water(ref) - 1) < 1e-5, `water ${water(s)} against ${water(ref)}`);
    for (const k of [0, 1]) assert.ok(Math.abs(pigment(s, k) / pigment(ref, k) - 1) < 1e-5, `pigment ${k}`);
  }
  assert.ok(dW < 1e-4, `water differs by ${dW}`);
  assert.ok(dG + dD < 2e-4, `pigment differs by ${dG} suspended, ${dD} settled`);
});

test('the GPU bloom uses the fibre entry head, including rotation and release by a deeper puddle', { timeout: 120000 }, async t => {
  // Isolate entry pressure from thin-film stranding as well as settling. The
  // 0.01 mm fixture lies exactly on holdDepth; its f32 storage is below the
  // CPU's double threshold but equal to the GPU's f32 threshold.
  const O = { ...DEFAULTS, dt: 0.1, mmPerCell: MM, evap: 0, paperDry: 0, absorb: 0, edgeEvap: 0, capRate: 0, flow: 0, diffuse: 0, filmDiffuse: 0, settle: 0, lift: 0, slide: 0, holdDepth: 0 };
  for (const vertical of [false, true]) for (const depth of [0.2, 0.4]) {
    const centre = 48 * N + 48;
    const make = () => {
      const s = createSheet(makePaper(N, N, { seed: 3, mmPerCell: MM }), [ULTRAMARINE, PHTHALO]);
      s.paper.surface.fill(0.5); s.paper.throat.fill(0.5); s.paper.grain.fill(1);
      s.paper.fdx.fill(vertical ? 0 : 1); s.paper.fdy.fill(vertical ? 1 : 0);
      for (let i = 0; i < s.n; i++) deposit(s, i, 0.01, [0.01, 0.005]);
      s.W[centre] = depth;
      return s;
    };
    const r = await both(t, make, O, 1); if (!r) return;
    const { cpu, gs } = r, along = vertical ? N : 1, across = vertical ? 1 : N;
    assert.ok(cpu.W[centre + along] > 0.02, 'the water ran along the fibres');
    if (depth === 0.2) assert.ok(Math.abs(cpu.W[centre + across] - 0.01) < 1e-8, 'the fibre edge pinned the front');
    else assert.ok(cpu.W[centre + across] > 0.02, 'more head released the front');
    const dW = worst(cpu.W, gs.W), dG = worst(cpu.G[0], gs.G[0]), dD = worst(cpu.D[0], gs.D[0]);
    t.diagnostic(JSON.stringify({ vertical, depth, dW, dG, dD }));
    assert.ok(dW < 1e-6 && dG + dD < 1e-6, 'the CPU and GPU use the same entry pressure');
    for (const s of [cpu, gs]) {
      const ref = make();
      assert.ok(Math.abs(water(s) / water(ref) - 1) < 1e-6);
      for (const k of [0, 1]) assert.ok(Math.abs(pigment(s, k) / pigment(ref, k) - 1) < 1e-6);
    }
  }
});

test('the film and back-run agree on water stored exactly at shine-off on CPU and GPU', { timeout: 120000 }, async t => {
  const O = { ...DEFAULTS, dt: 0.1, mmPerCell: MM, evap: 0, paperDry: 0, absorb: 0, edgeEvap: 0, capRate: 0, flow: 0, diffuse: 0, filmDiffuse: 0, settle: 0, lift: 0, slide: 0, holdDepth: 0 };
  const make = () => {
    const s = createSheet(makePaper(N, N, { seed: 3, mmPerCell: MM }), [ULTRAMARINE, PHTHALO]);
    s.paper.surface.fill(0.5); s.paper.throat.fill(0); s.paper.grain.fill(1);
    s.paper.fdx.fill(1); s.paper.fdy.fill(0);
    for (let i = 0; i < s.n; i++) deposit(s, i, O.levelFloor, [0.01, 0.005]);
    s.W[48 * N + 48] = 0.2;
    return s;
  };
  const r = await both(t, make, O, 1); if (!r) return;
  assert.ok(r.cpu.W[48 * N + 49] > O.levelFloor, 'a damp receiver took water through its throat');
  const dW = worst(r.cpu.W, r.gs.W), dG = worst(r.cpu.G[0], r.gs.G[0]);
  t.diagnostic(JSON.stringify({ dW, dG }));
  assert.ok(dW < 1e-6 && dG < 1e-6, 'no finite jump at the shared float32 boundary');
  for (const s of [r.cpu, r.gs]) {
    const ref = make();
    assert.ok(Math.abs(water(s) / water(ref) - 1) < 1e-6);
    for (const k of [0, 1]) assert.ok(Math.abs(pigment(s, k) / pigment(ref, k) - 1) < 1e-6);
  }
});

test('a film stored exactly at holdDepth does not strand pigment on either backend', { timeout: 120000 }, async t => {
  const O = { ...DEFAULTS, dt: 0.1, mmPerCell: MM, level: 0, evap: 0, paperDry: 0, absorb: 0, edgeEvap: 0, capRate: 0, flow: 0, diffuse: 0, filmDiffuse: 0, settle: 0, lift: 0, slide: 0 };
  const make = () => {
    const s = createSheet(makePaper(N, N, { seed: 3, mmPerCell: MM }), [ULTRAMARINE, PHTHALO]);
    for (let i = 0; i < s.n; i++) deposit(s, i, O.holdDepth, [0.05, 0.02]);
    return s;
  };
  const r = await both(t, make, O, 1); if (!r) return;
  const ref = make();
  for (const s of [r.cpu, r.gs]) {
    assert.ok(worst(s.D[0], ref.D[0]) < 1e-8, 'only a film strictly thinner than holdDepth strands paint');
    assert.ok(worst(s.G[0], ref.G[0]) < 1e-8);
    for (const k of [0, 1]) assert.ok(Math.abs(pigment(s, k) / pigment(ref, k) - 1) < 1e-6);
  }
});

test('a marginal bloom receiver admits a continuous conservative push on CPU and GPU', { timeout: 120000 }, async t => {
  const O = { ...DEFAULTS, dt: 0.1, mmPerCell: MM, evap: 0, paperDry: 0, absorb: 0, edgeEvap: 0, capRate: 0, flow: 0, diffuse: 0, filmDiffuse: 0, settle: 0, lift: 0, slide: 0, holdDepth: 0, pinning: 0 };
  const centre = 48 * N + 48;
  for (const depth of [0.04999463, O.levelFloor, 0.05003053, O.puddle]) {
    const make = () => {
      const s = createSheet(makePaper(N, N, { seed: 3, mmPerCell: MM }), [ULTRAMARINE, PHTHALO]);
      s.paper.surface.fill(0.5); s.paper.throat.fill(0);
      for (const [offset, w] of [0.2, 0.01, depth].entries()) deposit(s, centre + offset - 1, w, [0, 0]);
      s.D[0][centre] = 0.05; s.D[1][centre] = 0.02;
      return s;
    };
    const r = await both(t, make, O, 1); if (!r) return;
    const dW = worst(r.cpu.W, r.gs.W), dG = worst(r.cpu.G[0], r.gs.G[0]), dD = worst(r.cpu.D[0], r.gs.D[0]);
    assert.ok(dW < 1e-6 && dG + dD < 1e-6, 'marginal receiver agrees on both backends');
    if (depth < O.puddle) assert.ok(r.cpu.G[0][centre + 1] > 0.003 && r.gs.G[0][centre + 1] > 0.003, 'the front still advances through the refilling tooth');
    else assert.equal(r.cpu.G[0][centre + 1], 0, 'a flooded receiver admits no capillary push');
    for (const s of [r.cpu, r.gs]) {
      const ref = make();
      assert.ok(Math.abs(water(s) / water(ref) - 1) < 1e-6);
      for (const k of [0, 1]) assert.ok(Math.abs(pigment(s, k) / pigment(ref, k) - 1) < 1e-6);
    }
    t.diagnostic(JSON.stringify({ depth, dW, dG, dD, pushed: r.cpu.G[0][centre + 1] }));
  }
});
