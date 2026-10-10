// Two reusable staging slots let independent brush-state reads overlap. GPU brush
// state stays resident until requested; this pool never introduces a queue wait.
export class BrushReadbacks {
  constructor(device) { this.device = device; this.slots = [{}, {}]; }
  async read(source, bytes) {
    const slot = this.slots.find(slot => !slot.busy) ?? { transient: true };
    slot.busy = true;
    try {
      if (!slot.buffer || slot.buffer.size < bytes) {
        slot.buffer?.destroy();
        slot.buffer = this.device.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      }
      const encoder = this.device.createCommandEncoder();
      encoder.copyBufferToBuffer(source, 0, slot.buffer, 0, bytes);
      this.device.queue.submit([encoder.finish()]);
      await slot.buffer.mapAsync(GPUMapMode.READ, 0, bytes);
      try { return new Float32Array(slot.buffer.getMappedRange(0, bytes).slice(0)); }
      finally { slot.buffer.unmap(); }
    } finally { slot.busy = false; if (slot.transient) slot.buffer?.destroy(); }
  }
  destroy() { for (const slot of this.slots) slot.buffer?.destroy(); }
}
