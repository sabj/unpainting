import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./fine-flux.wgsl', import.meta.url), 'utf8');

// Geometry, donor volumes and the bounded substep schedule stay on-device.
// The last kernel writes indirect dispatches; no event reads a donor budget.
export class GpuFineFlux {
  constructor(device) {
    this.device = device;
    const module = device.createShaderModule({ label: 'fine RT0 Neumann DCT', code: source });
    const visibility = GPUShaderStage.COMPUTE;
    this.layout = device.createBindGroupLayout({ entries: Array.from({ length: 11 }, (_, binding) => ({ binding, visibility,
      buffer: { type: binding === 0 ? 'uniform' : [4, 5, 7, 8, 9, 10].includes(binding) ? 'read-only-storage' : 'storage' },
    })) });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    this.pipelines = Object.fromEntries(['inputs', 'activate', 'prolong', 'budget', 'schedule'].map(entryPoint => [entryPoint,
      device.createComputePipeline({ layout, compute: { module, entryPoint } })]));
  }

  allocate(T, F, n) {
    const d = this.device, coarse = T.coarse;
    if (this.n !== n || this.coarse !== coarse || this.F !== F) {
      this.destroy(); this.n = n; this.coarse = coarse; this.F = F; this.buffers = [];
      const mk = (size, usage) => { const b = d.createBuffer({ size, usage }); this.buffers.push(b); return b; };
      const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
      this.uniform = mk(48, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
      this.coarseFlux = mk(coarse * 8, storage); this.coefficients = mk(72 * 4, storage);
      this.maximum = T.schedule;
      this.maskWords = Math.ceil(n / 4);
      this.fineMask = mk(this.maskWords * 8, storage); this.blockCounts = mk(coarse * 8, storage);
      this.uploadedMaskVersion = -1; this.uploadedEverVersion = -1; this.uploadedN = -1;
      this.depositCellsSeq = null; this.depositCellsRef = null; this.depositCellsLen = -1;
      this.prevFluxY0 = null; this.prevFluxY1 = null;
      // Faces and deposit are scratch until carry starts. Reuse them for the
      // two planar water inputs and active index list, without more buffers.
      const buffers = [this.uniform, T.geometry, T.volume, T.active, this.coarseFlux, this.coefficients, this.maximum, T.faces, T.deposit, this.fineMask, this.blockCounts];
      this.group = d.createBindGroup({ layout: this.layout, entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })) });
    }
  }

  inputs(T, F, wb, wa, cells, encoder, maskMode = 'film', commands = null) {
    this.allocate(T, F, wb.length);
    const d = this.device, q = commands ?? d.queue, n = wb.length, coarse = T.coarse, max = d.limits.maxComputeWorkgroupsPerDimension;
    const bx = Math.min(coarse, max), by = Math.ceil(coarse / bx), groups = Math.ceil(n / 128), gx = Math.min(groups, max), gy = Math.ceil(groups / gx);
    if (by > max || gy > max) throw new Error('fine GPU inputs exceed dispatch limits');
    const mode = maskMode === true || maskMode === 'none' ? 1 : maskMode === 'ever' ? 2 : 0;
    q.writeBuffer(this.uniform, 0, Uint32Array.of(F.FW, n, F.N, F.sheet.w, bx, gx * 128, coarse, cells.length, mode, this.maskWords, gx, gy));
    for(const [water,offset] of [[wb,0],[wa,n*4]]){
      const slot=T.sequenceState?.water.get(water);
      if(slot==null)q.writeBuffer(T.faces,offset,water);
      else encoder.copyBufferToBuffer(T.water.result,slot*n*4,T.faces,offset,n*4);
    }
    const seq = T.sequenceState;
    const sameCells = seq && this.depositCellsSeq === seq && this.depositCellsRef === cells && this.depositCellsLen === cells.length;
    if (cells.length && !sameCells) {
      q.writeBuffer(T.deposit, 0, cells);
      this.depositCellsSeq = seq; this.depositCellsRef = cells; this.depositCellsLen = cells.length;
    } else if (!cells.length) {
      this.depositCellsSeq = null;
    }
    const pass = encoder.beginComputePass(); pass.setBindGroup(0, this.group);
    pass.setPipeline(this.pipelines.inputs); pass.dispatchWorkgroups(gx, gy);
    pass.setPipeline(this.pipelines.activate); pass.dispatchWorkgroups(gx, gy); pass.end();
    return { bx, by, gx, gy };
  }

  async prepare(T, F, fx, fy, wb, wa, maskMode = 'film', outerScoped = false, commands = null) {
    const d = this.device, q = commands ?? d.queue, N = F.N, coarse = T.coarse, sw = F.sheet.w, sh = F.sheet.h;
    if (N > 8) throw new Error('fine GPU DCT supports ratios 2 through 8');
    this.allocate(T, F, wb.length);
    const faces = T.hostCapture;
    // Only pack and upload rows covering the active coarse span (padded by 1 row for left/top face reads)
    // plus the previously uploaded span so stale non-zero entries are cleared.
    const y0 = T.water?.lastY0 ?? 0, y1 = T.water?.lastY1 ?? (sh - 1);
    const u0 = this.prevFluxY0 == null ? 0 : Math.min(this.prevFluxY0, y0);
    const u1 = this.prevFluxY1 == null ? sh - 1 : Math.max(this.prevFluxY1, y1);
    const c0 = Math.max(0, u0 * sw), c1 = Math.min(coarse, (u1 + 1) * sw);
    for (let c = c0; c < c1; c++) { faces[c * 2] = fx[c]; faces[c * 2 + 1] = fy[c]; }
    this.prevFluxY0 = y0; this.prevFluxY1 = y1;
    if (!outerScoped) d.pushErrorScope('validation');
    try {
      const enc = commands?.encoder ?? d.createCommandEncoder();
      const { bx, by, gx, gy } = this.inputs(T, F, wb, wa, F.activeCells, enc, maskMode, commands);
      if (c1 > c0) q.writeBuffer(this.coarseFlux, c0 * 8, faces, c0 * 2, (c1 - c0) * 2);
      if (this.uploadedN !== N) {
        const coefficients = new Float32Array(72);
        coefficients.set(F.dct.C); coefficients.set(F.dct.lam, N * N);
        q.writeBuffer(this.coefficients, 0, coefficients);
        this.uploadedN = N;
      }
      const mode = maskMode === true || maskMode === 'none' ? 1 : maskMode === 'ever' ? 2 : 0;
      if (mode === 0 && this.uploadedMaskVersion !== F.maskVersion) {
        q.writeBuffer(this.fineMask, 0, F.M);
        q.writeBuffer(this.blockCounts, 0, Uint32Array.from(F.blockMaskCount));
        this.uploadedMaskVersion = F.maskVersion;
      } else if (mode === 2 && this.uploadedEverVersion !== F.everVersion) {
        q.writeBuffer(this.fineMask, this.maskWords * 4, F.ever);
        q.writeBuffer(this.blockCounts, coarse * 4, Uint32Array.from(F.blockEverCount));
        this.uploadedEverVersion = F.everVersion;
      }
      enc.clearBuffer(this.maximum);
      const pass = enc.beginComputePass();
      pass.setBindGroup(0, this.group);
      pass.setPipeline(this.pipelines.prolong); pass.dispatchWorkgroups(bx, by);
      pass.setPipeline(this.pipelines.budget); pass.dispatchWorkgroups(gx, gy);
      pass.setPipeline(this.pipelines.schedule); pass.dispatchWorkgroups(1); pass.end();
      if (!commands) d.queue.submit([enc.finish()]);
    } finally {
      if (!outerScoped) {
        const error = await d.popErrorScope();
        if (error) throw new Error(`fine GPU flux: ${error.message}`);
      }
    }
  }

  destroy() {
    if (this.buffers) for (const buffer of this.buffers) buffer.destroy();
    this.buffers = null; this.n = 0; this.coarse = 0; this.F = null;
    this.depositCellsSeq = null; this.depositCellsRef = null; this.depositCellsLen = -1;
    this.prevFluxY0 = null; this.prevFluxY1 = null;
  }
}
