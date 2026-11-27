// Run with GPU_REQUIRED=1 node src/media/gpu/drying-pressure-bench.mjs.
// --baseline <git-ref> measures the original solver with exactly these inputs.
// --replay <directory> rechecks captured v8-serialized solver inputs (order, count, index, width, sink, pressure).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deserialize } from 'node:v8';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { dryingPressure } from '../drying-pressure.mjs';
import { GpuDryingPressure as Current } from './drying-pressure-gpu.mjs';
import { prepareEdgeGeometry } from './edge-geometry.mjs';
import { GpuContactDistance, contactGrid } from './contact-distance.mjs';
import { openGpu } from './stepfull.mjs';
const impl = await import('webgpu'); Object.assign(globalThis, impl.globals);
const { device, adapter } = await openGpu(impl.create([]));
console.log(JSON.stringify({ adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description }, node: process.version }));
let Solver = Current;
const baseline = process.argv.indexOf('--baseline');
if (baseline >= 0) {
  const ref = process.argv[baseline + 1];
  let code = execFileSync('git', ['show', `${ref}:src/media/gpu/drying-pressure-gpu.mjs`], { encoding: 'utf8' });
  const shader = execFileSync('git', ['show', `${ref}:src/media/gpu/drying-pressure-wgsl.mjs`], { encoding: 'utf8' });
  code = code.replace("'../drying-pressure.mjs'", JSON.stringify(new URL('../drying-pressure.mjs', import.meta.url).href))
    .replace("'./drying-pressure-wgsl.mjs'", JSON.stringify('data:text/javascript;base64,' + Buffer.from(shader).toString('base64')));
  Solver = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).GpuDryingPressure;
}
const output = n => [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
const cases = [
  ['round-wash', 512, 512, (x, y) => ((x - 256) / 154) ** 2 + ((y - 256) / 149) ** 2 < 1],
  ['thin-peninsula', 512, 512, (x, y) => ((x - 223) / 148) ** 2 + ((y - 256) / 150) ** 2 < 1 || x >= 220 && x < 470 && y >= 250 && y < 266],
  ['donut-holes', 512, 512, (x, y) => ((x - 256) / 231) ** 2 + ((y - 256) / 222) ** 2 < 1 && (x - 256) ** 2 + (y - 256) ** 2 > 60 ** 2 && (x - 155) ** 2 + (y - 210) ** 2 > 25 ** 2],
  ['large-single', 1086, 1448, (x, y) => ((x - 543) / 460) ** 2 + ((y - 724) / 625) ** 2 < 1],
  ['large-multiple', 1086, 1448, (x, y) => (((x - 275) / 235) ** 2 + ((y - 724) / 610) ** 2 < 1 || ((x - 815) / 220) ** 2 + ((y - 724) / 610) ** 2 < 1)],
];
const replay = process.argv.indexOf('--replay');
if (replay >= 0) {
  const directory = process.argv[replay + 1];
  cases.length = 0;
  for (const file of fs.readdirSync(directory).filter(f => f.endsWith('.bin')).sort((a, b) => parseInt(a) - parseInt(b))) {
    const input = deserialize(fs.readFileSync(path.join(directory, file)));
    cases.push([file, input.width, input.index.length / input.width, null, input]);
  }
  assert.ok(cases.length, 'replay inputs required');
}
const summary = { solves: 0, pressureMs: 0, fallback: 0, footprintMs: 0, hierarchyMs: 0, gpuMs: 0, defectMs: 0 };
try {
  const runner = new Solver(device);
  // Compile pipelines and warm runtime without caching any measured footprint.
  const n = 80 * 80, warmOrder = Int32Array.from({ length: n }, (_, i) => i);
  await runner.solve(warmOrder, n, new Uint8Array(n).fill(1), 80, Float64Array.from({ length: n }, (_, i) => .01 * (1 + Math.sin(i))), ...output(n));
  for (const [shape, w, h, wet, saved] of cases) {
    const index = saved?.index ?? new Uint8Array(w * h), sink = saved?.sink ?? new Float64Array(w * h), cells = saved?.order ?? [];
    if (!saved) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (wet(x, y)) {
      const i = y * w + x; cells.push(i); index[i] = 1;
      sink[i] = .004 * (1 + Math.sin(.07 * x) * Math.cos(.12 * y)) + .02 * (x % 31 === 0);
    }
    const order = saved ? saved.order.subarray(0, saved.count) : Int32Array.from(cells), cpu = output(w * h), actual = output(w * h);
    if (saved) cpu[2].set(saved.pressure);
    const cpuStart = performance.now(); dryingPressure(order, order.length, index, w, sink, ...cpu); const cpuMs = performance.now() - cpuStart;
    for (let run = 0; run < 2; run++) {
      for (const a of actual) a.fill(0);
      if (saved) actual[2].set(saved.pressure);
      const start = performance.now(); const result = await runner.solve(order, order.length, index, w, sink, ...actual); const ms = performance.now() - start;
      let error = 0;
      for (const i of order) error = Math.max(error, Math.abs(cpu[0][i] - actual[0][i]), Math.abs(cpu[1][i] - actual[1][i]));
      if (run === 0) {
        summary.solves++; summary.pressureMs += ms; summary.fallback += Number(result.fallback);
        for (const key of ['footprintMs', 'hierarchyMs', 'gpuMs', 'defectMs']) summary[key] += result.timings?.[key] ?? 0;
      }
      assert.equal(result.backend, 'gpu', JSON.stringify(result)); assert.equal(result.fallback, false);
      assert.ok(result.relativeResidual <= 1e-6); assert.ok(error < 1e-5, `flux error ${error}`);
      const H = runner.hierarchy;
      const topologyBytes = H?.mask?.byteLength ?? (H ? H.graph.byteLength + H.inverse.byteLength : 0);
      console.log(JSON.stringify({ shape, w, h, cells: order.length, run, ms, cpuMs, error, topologyBytes, coldTargetMet: run === 0 ? ms <= 15 : undefined, ...result }));
    }
    if (saved) continue;
    const scratch = {}, options = { edgeEvap: .004, edgeMm: 1, reachMm: 1.5 };
    const sheet = { w, h, M: index, ever: new Uint8Array(w * h) }, box = [0, 0, w - 1, h - 1];
    const contact = new GpuContactDistance(device), packed = new Uint32Array(Math.ceil(w * h / 8));
    for (const i of order) packed[i >>> 3] |= 2 << (4 * (i % 8));
    const buffer = device.createBuffer({ size: packed.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(buffer, 0, packed);
    try {
      for (let run = 0; run < 2; run++) {
        const start = performance.now(); const prepared = prepareEdgeGeometry(sheet, options, box, .25, scratch); const prepareMs = performance.now() - start;
        const contactStart = performance.now(); await contact.edgeFlux(buffer, w, h, contactGrid(box, .25, 1, device.limits), 0, .25, 1);
        console.log(JSON.stringify({ shape, run, prepareMs, edgeFluxMs: performance.now() - contactStart, geometryCells: prepared?.n }));
      }
    } finally { buffer.destroy(); contact.destroy(); }
  }
  console.log(JSON.stringify({ summary }));
  runner.destroy();
} finally { device.destroy(); }
