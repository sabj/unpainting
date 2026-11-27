import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./fine-material-inputs.wgsl', import.meta.url), 'utf8');

// Reuse the slide's move buffer before any material phase starts. Its four
// planes hold film, active indices, fixed bed and coarse turnover. No additional
// fine-sized device allocation or host interleaving is needed.
export class GpuFineMaterialInputs {
  constructor(device) {
    this.device = device;
    const module = device.createShaderModule({ label: 'fine material input copies', code: source });
    this.layout = device.createBindGroupLayout({ entries: Array.from({ length: 4 }, (_, binding) => ({
      binding, visibility: GPUShaderStage.COMPUTE,
      buffer: { type: binding === 0 ? 'uniform' : binding === 1 ? 'read-only-storage' : 'storage' },
    })) });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    this.pipelines = Object.fromEntries(['reset', 'activate'].map(entryPoint => [entryPoint,
      device.createComputePipeline({ layout, compute: { module, entryPoint } })]));
  }

  pack(M, F, wa, encoder, waterSource = null, commands = null) {
    const d = this.device, q = commands ?? d.queue, n = F.fn, cells = F.activeWetCells;
    if (this.water !== M.water) {
      this.destroy(); this.water = M.water;
      this.uniform = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this.buffers = [this.uniform];
      this.group = d.createBindGroup({ layout: this.layout, entries: [this.uniform, M.moves, M.water, M.mask]
        .map((buffer, binding) => ({ binding, resource: { buffer } })) });
    }
    // Lower fixed layers (below top) are immutable across a glaze. Cache their
    // sum once per layer stack; bedField adds the live resident top layer on GPU.
    const lowerCount = F.o.fixedBed > 0 && F.layers.length > 1 ? F.layers.length - 1 : 0;
    const fixed = lowerCount > 0;
    if (fixed && (this.bedLayers !== F.layers || this.bedLowerCount !== lowerCount)) {
      this.hostBed ??= new Float32Array(n); this.hostBed.fill(0);
      for (let L = 0; L < lowerCount; L++) {
        const layer = F.layers[L];
        for (let k = 0; k < F.K; k++) {
          const plane = layer[k];
          if (!plane.some(v => v !== 0)) continue;
          for (let f = 0; f < n; f++) this.hostBed[f] += plane[f];
        }
      }
      this.bedLayers = F.layers; this.bedLowerCount = lowerCount;
    }
    const max = d.limits.maxComputeWorkgroupsPerDimension, gx = Math.min(M.groups, max), gy = Math.ceil(M.groups / gx);
    if (gy > max) throw new Error('fine GPU material inputs exceed dispatch limits');
    q.writeBuffer(this.uniform, 0, Uint32Array.of(F.FW, n, F.N, F.sheet.w, gx * 128, cells.length, fixed ? 1 : 0, 0));
    let waBytes = 0;
    if (waterSource) encoder.copyBufferToBuffer(waterSource.buffer, waterSource.offset, M.moves, 0, n * 4);
    else { q.writeBuffer(M.moves, 0, wa); waBytes = wa.byteLength; }
    if (cells.length) q.writeBuffer(M.moves, n * 4, cells);
    if (fixed) q.writeBuffer(M.moves, n * 8, this.hostBed);
    q.writeBuffer(M.moves, n * 12, F.L.turn);
    const pass = encoder.beginComputePass(); pass.setBindGroup(0, this.group);
    for (const name of ['reset', 'activate']) { pass.setPipeline(this.pipelines[name]); pass.dispatchWorkgroups(gx, gy); }
    pass.end();
    return 32 + waBytes + cells.byteLength + (fixed ? this.hostBed.byteLength : 0) + F.L.turn.byteLength;
  }

  destroy() {
    for (const b of this.buffers ?? []) b.destroy();
    this.buffers = null; this.water = null; this.hostBed = null; this.bedLayers = null; this.bedLowerCount = 0;
  }
}
