import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./fine-absorb.wgsl', import.meta.url), 'utf8');

// Film-to-pore absorption and phase-5 pore/film drying on resident G, P, D buffers.
// Owns only its small uniform and pigment-mobility buffers.
export class GpuFineAbsorb {
  constructor(device) {
    this.device = device;
    const module = device.createShaderModule({ label: 'fine film to pore absorption', code: source });
    this.layout = device.createBindGroupLayout({ entries: Array.from({ length: 6 }, (_, binding) => ({
      binding, visibility: GPUShaderStage.COMPUTE,
      buffer: { type: binding === 0 ? 'uniform' : (binding === 3 || binding === 4) ? 'read-only-storage' : 'storage' },
    })) });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    this.pipeline = device.createComputePipeline({ layout, compute: { module, entryPoint: 'absorb' } });
    this.dryPipeline = device.createComputePipeline({ layout, compute: { module, entryPoint: 'dryPhase' } });
  }

  allocate(T, F) {
    if (this.G === T.materials.G && this.P === T.materials.P && this.capture === T.capture) return;
    this.destroy(); this.G = T.materials.G; this.P = T.materials.P; this.capture = T.capture;
    const d = this.device;
    this.uniform = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.mobility = d.createBuffer({ size: F.K * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.buffers = [this.uniform, this.mobility];
    const buffers = [this.uniform, T.materials.G, T.materials.P, T.capture, this.mobility, T.materials.D];
    this.group = d.createBindGroup({ layout: this.layout, entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })) });
  }

  async advance(T, F, shares, blocks, mobility, outerScoped = false) {
    this.allocate(T, F);
    const d = this.device, state = T.sequenceState, commands = state.commands, q = commands ?? d.queue, n = F.fn;
    if (!state.persistent && !state.pores) {
      let staged = 0;
      for (let k = 0; k < F.K; k++) {
        if (staged + F.P[k].byteLength > 128 * 2**20) {
          d.queue.submit([]); await d.queue.onSubmittedWorkDone(); staged = 0;
        }
        d.queue.writeBuffer(T.materials.P, k * n * 4, F.P[k]); staged += F.P[k].byteLength;
      }
      state.pores = true;
    }
    const max = d.limits.maxComputeWorkgroupsPerDimension, groups = Math.ceil(n / 128);
    const gx = Math.min(groups, max), gy = Math.ceil(groups / gx);
    if (gy > max) throw new Error('fine GPU absorption exceeds dispatch limits');
    T.hostCapture.fill(0);
    for (const c of blocks) T.hostCapture[c * 2] = shares[c];
    const m = new Float32Array(F.K * 2);
    for (let k = 0; k < F.K; k++) { m[k * 2] = mobility[k]; m[k * 2 + 1] = mobility[k] - m[k * 2]; }
    if (!outerScoped) d.pushErrorScope('validation');
    try {
      q.writeBuffer(this.uniform, 0, Uint32Array.of(F.FW, n, F.N, F.sheet.w, gx * 128, F.K, 0, 0));
      q.writeBuffer(this.mobility, 0, m); q.writeBuffer(T.capture, 0, T.hostCapture);
      const enc = commands?.encoder ?? d.createCommandEncoder(), pass = enc.beginComputePass();
      pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.group); pass.dispatchWorkgroups(gx, gy); pass.end();
      if (!commands) d.queue.submit([enc.finish()]);
    } finally {
      if (!outerScoped) {
        const error = await d.popErrorScope();
        if (error) throw new Error(`fine GPU absorption: ${error.message}`);
      }
    }
  }

  async dryPhase(T, F, blocks, outerScoped = false) {
    this.allocate(T, F);
    const d = this.device, commands = T.sequenceState?.commands, q = commands ?? d.queue, n = F.fn, s = F.sheet, L = F.L;
    const max = d.limits.maxComputeWorkgroupsPerDimension, groups = Math.ceil(n / 128);
    const gx = Math.min(groups, max), gy = Math.ceil(groups / gx);
    if (gy > max) throw new Error('fine GPU dry phase exceeds dispatch limits');
    T.hostCapture.fill(0);
    let any = false;
    for (const c of blocks) {
      const pd = L.pd[c], dried = L.dried[c] || (!s.M[c] && L.M0[c]) ? 1 : 0;
      if (pd || dried) { T.hostCapture[c * 2] = pd; T.hostCapture[c * 2 + 1] = dried; any = true; }
    }
    if (!any) return;
    if (!outerScoped) d.pushErrorScope('validation');
    try {
      q.writeBuffer(this.uniform, 0, Uint32Array.of(F.FW, n, F.N, s.w, gx * 128, F.K, 0, 0));
      q.writeBuffer(T.capture, 0, T.hostCapture);
      const enc = commands?.encoder ?? d.createCommandEncoder(), pass = enc.beginComputePass();
      pass.setPipeline(this.dryPipeline); pass.setBindGroup(0, this.group); pass.dispatchWorkgroups(gx, gy); pass.end();
      if (!commands) d.queue.submit([enc.finish()]);
    } finally {
      if (!outerScoped) {
        const error = await d.popErrorScope();
        if (error) throw new Error(`fine GPU dry phase: ${error.message}`);
      }
    }
  }

  async observe(T, F) {
    if (T.sequenceState.persistent || !T.sequenceState.pores) return;
    const d = this.device, n = F.fn;
    for (let k = 0; k < F.K; k++) {
      const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(T.materials.P, k * n * 4, T.materials.read, 0, n * 4);
      d.queue.submit([enc.finish()]); await T.materials.read.mapAsync(GPUMapMode.READ);
      try { F.P[k].set(new Float32Array(T.materials.read.getMappedRange())); }
      finally { T.materials.read.unmap(); }
    }
    T.sequenceState.pores = false;
  }

  destroy() {
    if (this.buffers) for (const buffer of this.buffers) buffer.destroy();
    this.buffers = null; this.G = null; this.P = null; this.capture = null;
  }
}
