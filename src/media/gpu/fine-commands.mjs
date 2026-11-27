// Snapshot changing CPU ledger inputs before recording their consumers. Queue
// writes directly to reused uniforms/scratch would otherwise make every phase
// in a batched submission see the last event's values.
export class FineCommands {
  constructor(device) {
    this.device = device;
    this.buffers = [];
    this.offsets = [];
  }

  get encoder() {
    return this.pending ??= this.device.createCommandEncoder({ label: 'fine phase sequence' });
  }

  writeBuffer(buffer, offset, data, dataOffset = 0, size = undefined) {
    const unit = data.BYTES_PER_ELEMENT ?? 1;
    const bytes = new Uint8Array(data.buffer ?? data, (data.byteOffset ?? 0) + dataOffset * unit,
      size == null ? data.byteLength - dataOffset * unit : size * unit);
    if (!bytes.byteLength) return;
    let page = this.buffers.findIndex((b, i) => b.size - this.offsets[i] >= bytes.byteLength);
    if (page < 0) {
      page = this.buffers.length;
      this.buffers.push(this.device.createBuffer({
        label: 'fine ledger upload', size: Math.max(2 ** 20, Math.ceil(bytes.byteLength / 256) * 256),
        usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      }));
      this.offsets.push(0);
    }
    const at = this.offsets[page];
    this.device.queue.writeBuffer(this.buffers[page], at, bytes);
    this.encoder.copyBufferToBuffer(this.buffers[page], at, buffer, offset, bytes.byteLength);
    this.offsets[page] += Math.ceil(bytes.byteLength / 4) * 4;
    this.staged = (this.staged ?? 0) + bytes.byteLength;
  }

  checkpoint() {
    // Bound retained uploads on large sheets without waiting for the GPU.
    if (this.staged >= 32 * 2 ** 20) this.flush();
  }

  flush() {
    if (this.pending) this.device.queue.submit([this.pending.finish()]);
    this.discard();
  }

  discard() {
    this.pending = null;
    this.offsets.fill(0);
    this.staged = 0;
  }

  destroy() {
    this.discard();
    for (const buffer of this.buffers) buffer.destroy();
    this.buffers = [];
    this.offsets = [];
  }
}
