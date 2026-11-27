import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuSheet, openGpu, SRC, analyse, UBYTES } from './stepfull.mjs';
import { levelBuffers } from './film-level-host.mjs';
import { makePaper } from '../paper.mjs';
import { createSheet, deposit, step, DEFAULTS, totals } from '../sheet.mjs';

function fixture(film) {
  const s = createSheet(makePaper(40, 32, { seed: 7, mmPerCell: .25 }), [
    { K: [1, .5, .2], S: [.02, .02, .02], rho: .05, omega: 1, gamma: .2 },
  ]);
  for (let y = 5; y < 27; y++) for (let x = 5; x < 35; x++) {
    const water = film ? (x < 20 ? .09 : .2) : .01;
    deposit(s, y * s.w + x, water, [.3 * water]);
  }
  return s;
}
const options = { ...DEFAULTS, dt: .1, mmPerCell: .25, evap: 0, edgeEvap: 0, absorb: 0, paperDry: 0 };
const maxDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

test('a light GPU step levels newly mobile film in the same step, with the ordinary result and conserved mass', async t => {
  const webgpu = await import('webgpu'); Object.assign(globalThis, webgpu.globals);
  let device;
  try { ({ device } = await openGpu(webgpu.create([]))); }
  catch (e) { if (process.env.GPU_REQUIRED === '1') throw e; t.skip(e.message); return; }
  try {
    for (const film of [false, true]) {
      const results = [];
      for (const light of [false, true]) {
        const s = fixture(film), before = totals(s), g = await GpuSheet.create(device, s, options);
        try {
          // Simulate a prior read with no film. Water redistribution between reads can make it mobile again without
          // a host write; this solve must not wait for another readback or for the next physical step.
          g.lv.light = light;
          g.step(1); await g.download(s); await g.lvAdapt();
          const args = new Uint32Array(await g.readWords('LVI', 24)), stats = g.levelStats(), after = totals(s);
          assert.equal(stats.short, 0); assert.equal(stats.fewer, 0);
          assert.equal(stats.recovered, light && film ? 1 : 0);
          assert.equal(args[0] > 0, film); assert.equal(args[3] > 0, film);
          assert.ok(Math.abs(after.water - before.water) < 1e-5 * before.water);
          assert.ok(Math.abs(after.pig[0] - before.pig[0]) < 1e-5 * before.pig[0]);
          results.push(s);
          t.diagnostic(JSON.stringify({ film, light, args: [...args], stats }));
        } finally { g.destroy(); }
      }
      for (const key of ['W', 's']) assert.ok(maxDiff(results[0][key], results[1][key]) < 1e-6, key);
      for (const key of ['G', 'P', 'D']) assert.ok(maxDiff(results[0][key][0], results[1][key][0]) < 1e-6, key);
      assert.deepEqual(results[0].M, results[1].M);
    }
  } finally { device.destroy(); }
});

// Dawn's null backend compiles WGSL and validates resource usage without executing the physics. This protects the
// shared shader/host layout on CPU-only machines; only the hardware test above proves the solver result.
test('the light gate compiles and its indirect dispatches validate on Dawn (no hardware parity claim)', async t => {
  const webgpu = await import('webgpu'); Object.assign(globalThis, webgpu.globals);
  const instance = webgpu.create(['backend=null']), adapter = await instance.requestAdapter();
  assert.ok(adapter, 'Dawn null adapter');
  const device = await adapter.requestDevice({ requiredLimits: {
    maxStorageBuffersPerShaderStage: Math.min(14, adapter.limits.maxStorageBuffersPerShaderStage),
    maxComputeWorkgroupStorageSize: Math.min(32768, adapter.limits.maxComputeWorkgroupStorageSize),
  } });
  const buffers = new Map();
  try {
    device.pushErrorScope('validation');
    const module = device.createShaderModule({ code: SRC }), info = await module.getCompilationInfo();
    assert.deepEqual(info.messages.filter(m => m.type === 'error').map(m => m.message), []);
    const analysis = analyse(SRC), compiled = [];
    // The null adapter has only eight storage bindings. Compile all level entry points that fit it, including the
    // changed producer and the CG/transport consumers. Compilation info above still covers the entire WGSL module.
    const names = analysis.entries.filter(n => n.startsWith('lv_') && analysis.uses(n).filter(b => b !== 0).length <= device.limits.maxStorageBuffersPerShaderStage);
    const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
    for (const name of names) {
      const use = [0, ...analysis.uses(name).filter(b => b !== 0)];
      const entries = use.map(binding => {
        const d = analysis.decl.find(v => v.binding === binding);
        if (!buffers.has(d.name)) buffers.set(d.name, device.createBuffer({
          size: d.name === 'u' ? UBYTES : d.name === 'LVI' ? levelBuffers(16, 16, 256, 1, true).LVI : 128 * 1024,
          usage: d.name === 'u' ? GPUBufferUsage.UNIFORM : GPUBufferUsage.STORAGE | (d.name === 'LVI' ? GPUBufferUsage.INDIRECT : 0),
        }));
        return { binding, resource: { buffer: buffers.get(d.name) } };
      });
      const layout = device.createBindGroupLayout({ entries: use.map(binding => {
        const d = analysis.decl.find(v => v.binding === binding);
        return { binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: d.kind === 'uniform' ? 'uniform' : d.kind === 'storage, read' ? 'read-only-storage' : 'storage' } };
      }) });
      const pipeline = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module, entryPoint: name, ...(name === 'lv_boxes' ? { constants: { LVLIGHT: 1 } } : {}) } });
      pass.setPipeline(pipeline); pass.setBindGroup(0, device.createBindGroup({ layout, entries }));
      if (name === 'lv_boxes' || name === 'lv_br_a' || name === 'lv_subs') pass.dispatchWorkgroups(1);
      else pass.dispatchWorkgroupsIndirect(buffers.get('LVI'), ['lv_cg0', 'lv_cg_d', 'lv_cg_continue'].includes(name) ? 12 : ['lv_s1', 'lv_s2'].includes(name) ? 24 : 0);
      compiled.push(name);
    }
    pass.end(); device.queue.submit([encoder.finish()]); await device.queue.onSubmittedWorkDone();
    assert.equal(await device.popErrorScope(), null);
    assert.ok(compiled.includes('lv_boxes') && compiled.includes('lv_cg_a') && compiled.includes('lv_flux'));
    t.diagnostic(JSON.stringify({ backend: 'null', pipelines: compiled.length, messages: info.messages.length }));
  } finally { for (const buffer of buffers.values()) buffer.destroy(); device.destroy(); }
});


test('a sudden larger transport request completes now, matches the full schedule and keeps mass', async t => {
  const webgpu = await import('webgpu'); Object.assign(globalThis, webgpu.globals);
  let device;
  try { ({ device } = await openGpu(webgpu.create([]))); }
  catch (e) { if (process.env.GPU_REQUIRED === '1') throw e; t.skip(e.message); return; }
  const make = () => {
    const s = fixture(true);
    for (let i = 0; i < s.n; i++) if (s.M[i]) {
      s.W[i] = i % s.w < 20 ? .06 : .3;
      s.G[0][i] = s.W[i] * (i % s.w < 20 ? .1 : .5);
    }
    return s;
  };
  const opts = { ...options, dt: 1 };
  try {
    const results = [];
    for (const oldBudget of [1, 8, 64]) {
      const s = make(), before = totals(s), g = await GpuSheet.create(device, s, opts);
      try {
        g.lv.subs = oldBudget; g.setOptions({});
        g.step(1); await g.download(s); await g.lvAdapt();
        const stats = g.levelStats(), after = totals(s);
        assert.ok(stats.subs > 1, 'the request must exceed the old one-round budget');
        assert.equal(stats.fewer, 0); assert.equal(stats.short, 0);
        assert.ok(Math.abs(after.water / before.water - 1) < 1e-5);
        assert.ok(Math.abs(after.pig[0] / before.pig[0] - 1) < 1e-5);
        const args = new Uint32Array(await g.readWords('LVI', 768, 24));
        for (let r = 0; r < 64; r++) {
          assert.equal(args[3 * r] > 0, r < stats.subs, `round ${r}`);
          assert.equal(args[3 * r + 1], 1); assert.equal(args[3 * r + 2], 1);
        }
        t.diagnostic(JSON.stringify({ oldBudget, stats, before, after })); results.push(s);
      } finally { g.destroy(); }
    }
    for (const s of results.slice(1)) {
      for (const key of ['W', 's']) assert.ok(maxDiff(results[0][key], s[key]) < 1e-7, key);
      for (const key of ['G', 'P', 'D']) assert.ok(maxDiff(results[0][key][0], s[key][0]) < 1e-7, key);
    }
    const cpu = make(); step(cpu, opts);
    assert.ok(maxDiff(cpu.W, results[0].W) < 1e-4, `CPU water parity: ${maxDiff(cpu.W, results[0].W)}`);
    assert.ok(maxDiff(cpu.G[0], results[0].G[0]) < 1e-4, `CPU pigment parity: ${maxDiff(cpu.G[0], results[0].G[0])}`);
  } finally { device.destroy(); }
});


test('the current transport gate covers more than one box per lane and clears every stale round', async t => {
  const webgpu = await import('webgpu'); Object.assign(globalThis, webgpu.globals);
  let device;
  try { ({ device } = await openGpu(webgpu.create([]))); }
  catch (e) { if (process.env.GPU_REQUIRED === '1') throw e; t.skip(e.message); return; }
  const s = fixture(true), g = await GpuSheet.create(device, s, options);
  try {
    const bx = b => 16 + 11 * Math.ceil(s.w / 32) * Math.ceil(s.h / 32) + 16 * b;
    const words = new Uint32Array(levelBuffers(s.w, s.h, s.n, g.ntiles, true).LVX / 4);
    const stats = new Uint32Array((16 + 2 * 1024)), floats = new Float32Array(stats.buffer);
    const execute = async () => {
      device.queue.writeBuffer(g.b.LVX, 0, words); device.queue.writeBuffer(g.b.LVS, 0, stats);
      const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
      pass.setPipeline(g.p.lv_subs); pass.setBindGroup(0, g.bg.lv_subs); pass.dispatchWorkgroups(1); pass.end();
      device.queue.submit([enc.finish()]);
      return new Uint32Array(await g.readWords('LVI', 768, 24));
    };
    for (const active of [65, 3, 0]) {
      words.fill(0); stats.fill(0); words[0] = active; words[1] = 4;
      let most = 0;
      for (let b = 0; b < active; b++) {
        const want = b === 64 ? 64 : 1 + b % 3; most = Math.max(most, want);
        words[bx(b) + 14] = 3; floats[17 + 2 * b] = .5 * want - .1;
      }
      const args = await execute();
      for (let r = 0; r < 64; r++) assert.deepEqual([...args.slice(3 * r, 3 * r + 3)], [r < most ? 4 : 0, 1, 1]);
      const after = new Uint32Array(await g.readWords('LVX', words.byteLength));
      for (let b = 0; b < active; b++) assert.equal(after[bx(b) + 15], b === 64 ? 64 : 1 + b % 3);
    }
  } finally { g.destroy(); device.destroy(); }
});
