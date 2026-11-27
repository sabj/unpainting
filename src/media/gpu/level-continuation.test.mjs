import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuSheet, openGpu } from './stepfull.mjs';
import { encodeLevel } from './film-level-host.mjs';
import { LV_ITMAX } from './film-level-cg-wgsl.mjs';
import { makePaper } from '../paper.mjs';
import { createSheet, deposit, step, DEFAULTS, totals } from '../sheet.mjs';

const options = { ...DEFAULTS, dt: 2, mmPerCell: .25, evap: 0, edgeEvap: 0, absorb: 0, paperDry: 0 };
const maxDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
function fixture() {
  const s = createSheet(makePaper(152, 40, { seed: 7, mmPerCell: .25 }), [
    { K: [1, .5, .2], S: [.02, .02, .02], rho: .05, omega: 1, gamma: .2 },
  ]);
  // Two boxes, each crossing tile boundaries. The second box has a different load and RHS. One box workgroup
  // must stride over both; a continuation cannot mix their sums or stop when the first box converges.
  for (const x0 of [5, 112]) for (let y = 5; y < 35; y++) for (let x = x0; x < x0 + 30; x++) {
    const water = x < x0 + 15 ? .06 : .3;
    deposit(s, y * s.w + x, water, [water * (x < x0 + 15 ? .1 : .5) * (x0 === 5 ? 1 : .7)]);
  }
  return s;
}
async function deviceFor(t) {
  const webgpu = await import('webgpu'); Object.assign(globalThis, webgpu.globals);
  try { return (await openGpu(webgpu.create([]))).device; }
  catch (e) { if (process.env.GPU_REQUIRED === '1') throw e; t.skip(e.message); return null; }
}
const dispatch = (g, pass, name, groups, constants, offset) => {
  pass.setPipeline(constants ? g.lvPipe(name, constants) : g.p[name]); pass.setBindGroup(0, g.bg[name]);
  if (offset === undefined) pass.dispatchWorkgroups(groups); else pass.dispatchWorkgroupsIndirect(g.b.LVI, offset);
};
// Execute only the solve, retaining its residual instead of letting backrun reuse its scratch fields.
async function solve(g) {
  const enc = g.device.createCommandEncoder(), pass = enc.beginComputePass();
  for (const name of ['tiles_prep', 'tiles_build', 'tiles_args']) dispatch(g, pass, name, name === 'tiles_args' ? 1 : Math.ceil(g.ntiles / 64));
  let solver = true;
  encodeLevel((name, groups, constants, offset) => {
    if (name === 'lv_flux') solver = false;
    if (solver) dispatch(g, pass, name, groups, constants, offset);
  }, g.o, g.lvMm(), g.lv, g.ntiles);
  pass.end(); g.device.queue.submit([enc.finish()]);
  const words = new Uint32Array(await g.readWords('LVX', g.b.LVX.size));
  const r = new Float32Array(await g.readWords('LVB', g.b.LVB.size));
  const floats = new Float32Array(words.buffer);
  assert.equal(words[0], 2);
  for (let b = 0; b < words[0]; b++) {
    const B = 16 + 11 * Math.ceil(g.w / 32) * Math.ceil(g.h / 32) + 16 * b;
    assert.equal(words[B + 14], 3, `box ${b} converged`);
    let rr = 0;
    for (let y = words[B + 1]; y <= words[B + 3]; y++) for (let x = words[B]; x <= words[B + 2]; x++) rr += r[4 * (y * g.w + x) + 1] ** 2;
    assert.ok(rr <= 1.001 * floats[B + 12], `box ${b}: residual ${rr} exceeds tolerance ${floats[B + 12]}`);
  }
  await g.lvAdapt();
  return g.levelStats();
}

test('a small parallel CG budget continues to the same residual before transport, for both parities and boxes', { timeout: 120000 }, async t => {
  const device = await deviceFor(t); if (!device) return;
  try {
    const results = [];
    for (const budget of [1, 2, 3, 128]) {
      const s = fixture(), before = totals(s), g = await GpuSheet.create(device, s, options);
      try {
        g.lv.iters = budget; g.lv.boxes = 1; g.setOptions({});
        const stats = await solve(g);
        assert.equal(stats.short, 0);
        if (budget < 4) assert.equal(stats.continued, 2, 'both boxes exhaust the small parallel budget');
        // Start again to compare the entire physical step, including donor budgets and pigment transport.
        g.upload(s); g.lv.iters = budget; g.setOptions({}); g.step(1);
        await g.download(s); await g.lvAdapt();
        const after = totals(s);
        assert.ok(Math.abs(after.water / before.water - 1) < 1e-5);
        assert.ok(Math.abs(after.pig[0] / before.pig[0] - 1) < 1e-5);
        results.push(s); t.diagnostic(JSON.stringify({ budget, stats, before, after }));
      } finally { g.destroy(); }
    }
    for (const s of results.slice(1)) {
      for (const key of ['W', 's']) assert.ok(maxDiff(results[0][key], s[key]) < 1e-6, key);
      for (const key of ['G', 'P', 'D']) assert.ok(maxDiff(results[0][key][0], s[key][0]) < 1e-6, key);
    }
    // The stiff dt=2 film above checks identical GPU iterates and transport at both parities. For CPU parity,
    // reduce face conductances: float32 cancellation in its sharp 0.06/0.3 mm step otherwise amplifies the different
    // CPU/GPU preconditioners' residual errors by up to 0.000221 mm, even with the full parallel budget.
    const parityOptions = { ...options, dt: .1 }, cpu = fixture(), gpu = fixture();
    const g = await GpuSheet.create(device, gpu, parityOptions);
    try {
      g.lv.iters = 1; g.setOptions({}); g.step(1); await g.download(gpu); step(cpu, parityOptions);
      const dW = maxDiff(cpu.W, gpu.W), dG = maxDiff(cpu.G[0], gpu.G[0]);
      t.diagnostic(JSON.stringify({ parityDt: parityOptions.dt, dW, dG }));
      assert.ok(dW < 1e-4, `CPU water parity: ${dW}`);
      assert.ok(dG < 1e-4, `CPU pigment parity: ${dG}`);
    } finally { g.destroy(); }
  } finally { device.destroy(); }
});

test('the GPU safety ceiling reports failure and cannot produce transport for an unconverged box', async t => {
  const device = await deviceFor(t); if (!device) return;
  const s = fixture(), g = await GpuSheet.create(device, s, options);
  try {
    const words = new Uint32Array(g.b.LVX.size / 4), B = 16 + 11 * Math.ceil(g.w / 32) * Math.ceil(g.h / 32);
    words[0] = 1; words[1] = 4; words[B + 13] = LV_ITMAX; words[B + 14] = 1;
    device.queue.writeBuffer(g.b.LVX, 0, words);
    device.queue.writeBuffer(g.b.LVI, 24, new Uint32Array(192).fill(1));
    const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
    dispatch(g, pass, 'lv_cg_continue', 1); dispatch(g, pass, 'lv_flux', 1); dispatch(g, pass, 'lv_subs', 1);
    pass.end(); device.queue.submit([enc.finish()]);
    const after = new Uint32Array(await g.readWords('LVX', words.byteLength));
    assert.equal(after[B + 14], 4);
    const flux = new Float32Array(await g.readWords('LVF', g.b.LVF.size));
    assert.ok(flux.every(v => v === 0), 'an unconverged box cannot publish flux or mark a transport cell');
    const args = new Uint32Array(await g.readWords('LVI', 768, 24));
    for (let r = 0; r < 64; r++) assert.equal(args[3 * r], 0);
    await assert.rejects(g.lvAdapt(), /failed to converge/);
    await assert.rejects(g.lvAdapt(), /failed to converge/);
  } finally { g.destroy(); device.destroy(); }
});

test('transport continuation keeps two pigments, unequal box round counts and tile boundaries identical', { timeout: 120000 }, async t => {
  const device = await deviceFor(t); if (!device) return;
  const make = () => {
    const paper = makePaper(184, 48, { seed: 11, mmPerCell: .25 });
    const pigment = { K: [1, .5, .2], S: [.02, .02, .02], rho: .05, omega: 1, gamma: .2 };
    const s = createSheet(paper, [pigment, { ...pigment, rho: .08, omega: 2 }]);
    for (const x0 of [5, 138]) for (let y = 5; y < 43; y++) for (let x = x0; x < x0 + 36; x++) {
      const depth = x0 === 5 ? (x < x0 + 18 ? .06 : .3) : .13;
      deposit(s, y * s.w + x, depth, [depth * (x < x0 + 18 ? .1 : .5), depth * (y < 24 ? .45 : .12)]);
    }
    return s;
  };
  try {
    const results = [];
    for (const budget of [1, 2, 8, 64]) {
      const s = make(), before = totals(s), g = await GpuSheet.create(device, s, { ...options, dt: 1 });
      try {
        g.lv.subs = budget; g.lv.boxes = 1; g.setOptions({});
        g.step(1); await g.download(s);
        const after = totals(s), stats = g.levelStats();
        assert.equal(stats.boxes, 2);
        assert.ok(stats.subs > 1, 'the one-round budget must exercise same-step transport continuation');
        assert.ok(Math.abs(after.water / before.water - 1) < 1e-5);
        for (let k = 0; k < 2; k++) assert.ok(Math.abs(after.pig[k] / before.pig[k] - 1) < 1e-5);
        results.push(s); t.diagnostic(JSON.stringify({ transportBudget: budget, stats, before, after }));
      } finally { g.destroy(); }
    }
    for (const s of results.slice(1)) {
      assert.equal(maxDiff(results[0].W, s.W), 0, 'identical water arithmetic');
      for (const key of ['G', 'P', 'D']) for (let k = 0; k < 2; k++) assert.equal(maxDiff(results[0][key][k], s[key][k]), 0, `${key}[${k}]`);
    }
  } finally { device.destroy(); }
});
