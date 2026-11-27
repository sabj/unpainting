import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuSheet, openGpu, SRC, analyse, UF, UBYTES } from './stepfull.mjs';
import { levelBuffers, adaptLevel, levelBudget } from './film-level-host.mjs';
import { LV_BMAX } from './film-level-wgsl.mjs';
import { makePaper } from '../paper.mjs';
import { createSheet, deposit, DEFAULTS } from '../sheet.mjs';

let device;
async function gpu(t) {
  if (device) return device;
  const w = await import('webgpu'); Object.assign(globalThis, w.globals);
  try { ({ device } = await openGpu(w.create([]))); return device; }
  catch (e) { if (process.env.GPU_REQUIRED === '1') throw e; t.skip(e.message); }
}
test.after(() => device?.destroy());

test('meniscus distance matches CPU relaxation exactly across tiles on every ping-pong pass', async t => {
  const d = await gpu(t); if (!d) return;
  const w = 80, h = 48, mm = 0.125, reach = 6;
  const s = createSheet(makePaper(w, h, { seed: 7, mmPerCell: mm }), [
    { K: [1, .5, .2], S: [.02, .02, .02], rho: .05, omega: 1, gamma: .2 },
  ]);
  for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
    if (!(x >= 29 && x < 34 && y >= 18 && y < 24)) deposit(s, y * w + x, .2, [.01]);
  }
  const g = await GpuSheet.create(d, s, { ...DEFAULTS, mmPerCell: mm, meniscusMm: reach * mm });
  const neighbours = i => [i % w > 0 ? i - 1 : -1, i >= w ? i - w : -1,
    i % w + 1 < w ? i + 1 : -1, i + w < s.n ? i + w : -1];
  const wet = i => i >= 0 && s.M[i] === 1 && s.W[i] > DEFAULTS.levelFloor;
  let expected = Float32Array.from({ length: s.n }, (_, i) => wet(i) && neighbours(i).every(wet) ? 1e9 : 0);
  const run = (name, constants) => {
    const enc = d.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(constants ? g.lvPipe(name, constants) : g.p[name]); pass.setBindGroup(0, g.bg[name]);
    pass.dispatchWorkgroups(name === 'lv_boxes' ? 1 : 4); pass.end(); d.queue.submit([enc.finish()]);
  };
  try {
    d.pushErrorScope('validation');
    const tiles = Uint32Array.from({ length: g.ntiles + 1 }, (_, i) => i);
    d.queue.writeBuffer(g.b.TL, 0, tiles);
    run('lv_tiles'); run('lv_boxes'); run('lv_init');
    for (let r = 0; r < reach - 1; r++) {
      run('lv_dist', { LVPAR: r & 1, LVMEN: Number(r === reach - 2) });
      const next = expected.slice();
      for (let i = 0; i < s.n; i++) if (wet(i)) {
        for (const j of neighbours(i)) if (wet(j)) next[i] = Math.min(next[i], expected[j] + 1);
      }
      expected = next;
      const planes = new Float32Array(await g.readWords('LVP', s.n * 8));
      const off = (1 - (r & 1)) * s.n;
      for (let i = 0; i < s.n; i++) if (wet(i)) assert.equal(planes[off + i], expected[i], `pass ${r}, cell ${i}`);
    }
    const a = new Float32Array(await g.readWords('LVA', s.n * 16));
    for (let i = 0; i < s.n; i++) if (wet(i)) {
      const lowering = DEFAULTS.meniscus * Math.max(0, reach * mm - (expected[i] + .5) * mm);
      assert.ok(Math.abs(a[4 * i] - lowering) < 1e-7, `meniscus ${i}`);
    }
    assert.equal(await d.popErrorScope(), null);
  } finally { g.destroy(); }
});

test('more than 1024 disconnected wet components stop before remapping and report overflow', async t => {
  const d = await gpu(t); if (!d) return;
  // Only box-discovery buffers: this exercises a large tile topology without allocating or painting a large sheet.
  const w = 65 * 32, h = w, tw = w / 16, ntiles = tw * tw;
  const sizes = levelBuffers(w, h, w * h, ntiles, false), buffers = {};
  try {
    d.pushErrorScope('validation');
    for (const name of ['LVT', 'LVX', 'LVS', 'LVI']) buffers[name] = d.createBuffer({ size: sizes[name],
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    buffers.u = d.createBuffer({ size: UBYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const u = new ArrayBuffer(UBYTES), uint = new Uint32Array(u), float = new Float32Array(u);
    const values = { w, h, n: w * h, tw, th: tw, ntiles, lvBoxes: 16 };
    UF.forEach(([key, type], i) => { (type === 'u' ? uint : float)[i] = values[key] ?? 0; });
    d.queue.writeBuffer(buffers.u, 0, u);
    const tiles = new Uint32Array(sizes.LVT / 4);
    let components = 0;
    for (let y = 0; y < 65; y += 2) for (let x = 0; x < 65; x += 2) {
      if (components === LV_BMAX + 1) break;
      const at = 8 * ((2 * y) * tw + 2 * x), cx = x * 32 + 8, cy = y * 32 + 8;
      tiles.set([1, cx, cy, cx, cy, 0, 1, 1], at); components++;
    }
    assert.equal(components, 1025);
    d.queue.writeBuffer(buffers.LVT, 0, tiles);
    const info = analyse(SRC), use = info.uses('lv_boxes');
    const layout = d.createBindGroupLayout({ entries: use.map(binding => ({ binding,
      visibility: GPUShaderStage.COMPUTE, buffer: { type: binding === 0 ? 'uniform' : 'storage' } })) });
    const pipeline = d.createComputePipeline({ layout: d.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module: d.createShaderModule({ code: SRC }), entryPoint: 'lv_boxes' } });
    const bg = d.createBindGroup({ layout, entries: use.map(binding => ({ binding,
      resource: { buffer: buffers[info.decl.find(v => v.binding === binding).name] } })) });
    const enc = d.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(1); pass.end();
    d.queue.submit([enc.finish()]);
    const read = async (name, bytes) => {
      const rb = d.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      try {
        const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(buffers[name], 0, rb, 0, bytes);
        d.queue.submit([enc.finish()]); await rb.mapAsync(GPUMapMode.READ);
        return new Uint32Array(rb.getMappedRange()).slice();
      } finally { rb.destroy(); }
    };
    assert.deepEqual([...(await read('LVX', 12))], [0, 0, 1]);
    assert.deepEqual([...(await read('LVI', 24))], [0, 1, 1, 0, 1, 1]);
    const status = await read('LVS', 48);
    assert.equal(status[2], 1);
    assert.throws(() => adaptLevel(levelBudget(), status), /exceeded 1024/);
    assert.equal(await d.popErrorScope(), null);
  } finally { for (const b of Object.values(buffers)) b.destroy(); }
});
