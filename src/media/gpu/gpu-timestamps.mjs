// Sample GPU execution without inserting a queue wait. Query data is mapped only
// when the caller requests the final profile, after ordinary work was submitted.
export class GpuTimestamps {
  constructor(device, stride = 64) {
    this.device = device; this.stride = Math.max(1, Number(process.env.GPU_TIMESTAMP_STRIDE) || stride); this.kernelMode = process.env.GPU_TIMESTAMP_KERNELS === '1'; this.seen = new Map(); this.pages = [];
    this.enabled = process.env.GPU_TIMESTAMPS === '1' && device.features.has('timestamp-query');
  }
  begin(encoder, label) {
    if (this.enabled && this.kernelMode) return this.kernelPass(encoder, label);
    return this.samplePass(encoder, label);
  }
  // Split only around sampled dispatches. Replay pipeline/bind state across pass
  // boundaries; command order and all dispatches are retained, with no waits.
  kernelPass(encoder, fallback) {
    let pipeline, pass = null; const groups = new Map();
    const close = () => { if (pass) pass.end(); pass = null; };
    const dispatch = (method, args) => {
      const label = pipeline.label || fallback;
      const count = (this.seen.get(label) ?? 0) + 1; this.seen.set(label, count);
      const sampled = (count - 1) % this.stride === 0;
      if (sampled) close();
      if (!pass) {
        pass = sampled ? this.queryPass(encoder, label) : encoder.beginComputePass();
        pass.setPipeline(pipeline);
        for (const [index, args] of groups) pass.setBindGroup(index, ...args);
      }
      pass[method](...args);
      if (sampled) close();
    };
    return {
      setPipeline(value) { pipeline = value; if (pass) pass.setPipeline(value); },
      setBindGroup(index, ...args) { groups.set(index, args); if (pass) pass.setBindGroup(index, ...args); },
      dispatchWorkgroups: (...args) => dispatch('dispatchWorkgroups', args),
      dispatchWorkgroupsIndirect: (...args) => dispatch('dispatchWorkgroupsIndirect', args),
      end: close,
    };
  }
  samplePass(encoder, label) {
    if (!this.enabled) return encoder.beginComputePass();
    const count = (this.seen.get(label) ?? 0) + 1; this.seen.set(label, count);
    if ((count - 1) % this.stride) return encoder.beginComputePass();
    return this.queryPass(encoder, label);
  }
  queryPass(encoder, label) {
    let page = this.pages.at(-1);
    if (!page || page.labels.length === 256) {
      page = { query: this.device.createQuerySet({ type: 'timestamp', count: 512 }), labels: [] }; this.pages.push(page);
    }
    const at = page.labels.length * 2; page.labels.push(label);
    return encoder.beginComputePass({ timestampWrites: { querySet: page.query, beginningOfPassWriteIndex: at, endOfPassWriteIndex: at + 1 } });
  }
  async result() {
    const result = { enabled: this.enabled, stride: this.stride, scope: this.kernelMode ? 'sampled individual kernel dispatches; estimated totals assume representative samples; indirect zero-work dispatches included' : 'sampled logical compute passes', passes: Object.fromEntries(this.seen), samples: {} };
    for (const page of this.pages) {
      const bytes = page.labels.length * 16, d = this.device;
      const resolve = d.createBuffer({ size: bytes, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      const read = d.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const e = d.createCommandEncoder(); e.resolveQuerySet(page.query, 0, page.labels.length * 2, resolve, 0); e.copyBufferToBuffer(resolve, 0, read, 0, bytes); d.queue.submit([e.finish()]);
      await read.mapAsync(GPUMapMode.READ); const values = new BigUint64Array(read.getMappedRange());
      page.labels.forEach((label, i) => { const entry = result.samples[label] ??= { count: 0, gpuMs: 0, maxMs: 0 }; const ms = Number(values[2*i+1]-values[2*i])/1e6; entry.count++; entry.gpuMs += ms; entry.maxMs = Math.max(entry.maxMs, ms); });
      read.unmap(); read.destroy(); resolve.destroy();
    }
    for (const [label, entry] of Object.entries(result.samples)) { entry.meanMs = entry.gpuMs / entry.count; entry.estimatedGpuMs = entry.meanMs * this.seen.get(label); }
    return result;
  }
  destroy() { for (const page of this.pages) page.query.destroy(); this.pages.length = 0; }
}
