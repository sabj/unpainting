// Optional GPU timestamps. Profiling uses one pass per dispatch; normal rendering
// retains its batched passes. No CPU wall time is labelled as kernel time.
export class KernelTimer {
  constructor(device) {
    this.device = device; this.names = []; this.supported = device.features.has('timestamp-query');
    if (!this.supported) return;
    this.queries = device.createQuerySet({ type: 'timestamp', count: 512 });
    this.resolve = device.createBuffer({ size: 4096, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    this.read = device.createBuffer({ size: 4096, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  }
  pass(encoder, name) {
    const i = this.names.length * 2; this.names.push(name);
    return encoder.beginComputePass({ timestampWrites: { querySet: this.queries, beginningOfPassWriteIndex: i, endOfPassWriteIndex: i + 1 } });
  }
  async collect() {
    const count = this.names.length * 2, enc = this.device.createCommandEncoder();
    enc.resolveQuerySet(this.queries, 0, count, this.resolve, 0);
    enc.copyBufferToBuffer(this.resolve, 0, this.read, 0, count * 8); this.device.queue.submit([enc.finish()]);
    await this.read.mapAsync(GPUMapMode.READ);
    const ns = new BigUint64Array(this.read.getMappedRange()), rows = this.names.map((name, i) => ({ name, ms: Number(ns[i * 2 + 1] - ns[i * 2]) / 1e6 }));
    this.read.unmap(); this.names = []; return rows;
  }
  destroy() { this.queries?.destroy(); this.resolve?.destroy(); this.read?.destroy(); }
}
