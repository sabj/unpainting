// The pinned-edge evaporation integral only visits cells whose centres are at most E/mm + sqrt(2)
// cells from the boundary. Each of the nine samples in such a cell is within another sqrt(2)/2.
// Compute that band exactly in integer half-cell units, then take the same double sqrt as the CPU.
import { contactDistanceWgsl } from './contact-distance-wgsl.mjs';
const GROUP = 128;
// A short CPU transform beats the fixed cost of a dispatch and readback on small marks.
const minArea = 16384;
const maxRadius = 64;

export function contactGrid(box, mm, edgeMm, limits) {
  const [x0, y0, x1, y1] = box;
  const cols = x1 - x0 + 1, rows = y1 - y0 + 1;
  const width = 2 * cols + 1, height = 2 * rows + 1;
  const samples = width * height, radius = Math.ceil(2 * (edgeMm / mm + 1.5 * Math.SQRT2)) + 1;
  if (!(radius > 0 && radius <= maxRadius) || cols * rows < minArea ||
      samples * 4 > Math.min(limits.maxStorageBufferBindingSize, limits.maxBufferSize) ||
      Math.ceil(samples / GROUP) > limits.maxComputeWorkgroupsPerDimension) return null;
  return { x0, y0, cols, rows, samples, width, radius };
}

export class GpuContactDistance {
  constructor(device) {
    this.device = device;
    const module = device.createShaderModule({ label: 'wet-edge contact distance', code: contactDistanceWgsl });
    this.pipelines = ['faces', 'seeds', 'nearestVertical', 'nearestHorizontal', 'edge_flux'].map(entryPoint =>
      device.createComputePipeline({ label: entryPoint, layout: 'auto', compute: { module, entryPoint } }));
  }

  // The packed M/ever mask is the very snapshot the host uses. The scratch can be reused after the
  // copy has executed. A caller completes one box before starting another on the same instance.
  async field(packed, w, h, geometry, holeSpan) {
    return this.run(packed, w, h, geometry, holeSpan);
  }

  /** Cell averages, without downloading or taking square roots of the half-cell field on the host. */
  async edgeFlux(packed, w, h, geometry, holeSpan, mm, edgeMm) {
    return this.run(packed, w, h, geometry, holeSpan, { mm, edgeMm });
  }

  async run(packed, w, h, geometry, holeSpan, flux = null) {
    const d = this.device, { x0, y0, cols, rows, samples, width, radius } = geometry;
    if (!this.scratch || this.scratch.samples < samples || this.scratch.cells < cols * rows) {
      this.destroy();
      const storage = GPUBufferUsage.STORAGE;
      this.scratch = { samples, cells: cols * rows, buffers: [] };
      const keep = (size, usage) => {
        const buffer = d.createBuffer({ size, usage });
        this.scratch.buffers.push(buffer);
        return buffer;
      };
      this.uniform = keep(48, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
      this.sides = keep(cols * rows * 4, storage);
      this.result = keep(samples * 4, storage | GPUBufferUsage.COPY_SRC);
      this.vertical = keep(samples * 4, storage);
      this.flux = keep(cols * rows * 4, storage | GPUBufferUsage.COPY_SRC);
      this.read = keep(samples * 4, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
    }
    d.queue.writeBuffer(this.uniform, 0, Uint32Array.of(w, h, x0, y0, cols, rows, radius, Math.max(0, Math.min(Math.max(w, h), holeSpan))));
    if (flux) {
      d.queue.writeBuffer(this.uniform, 32, Float32Array.of(flux.mm, flux.edgeMm));
      d.queue.writeBuffer(this.uniform, 40, Uint32Array.of(Math.min(64, Math.max(2, Math.ceil(flux.mm / (.005 * flux.edgeMm))))));
    }
    const buffers = [this.uniform, packed, this.sides, this.result, this.vertical, this.flux];
    const bindings = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 3, 4], [0, 1, 3, 5]];
    const enc = d.createCommandEncoder(), pass = enc.beginComputePass();
    for (const [index, pipeline] of this.pipelines.entries()) {
      if (index === 4 && !flux) break;
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, d.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
        entries: bindings[index].map(binding => ({ binding, resource: { buffer: buffers[binding] } })) }));
      pass.dispatchWorkgroups(Math.ceil((index === 0 || index === 4 ? cols * rows : samples) / GROUP));
    }
    pass.end();
    const bytes = (flux ? cols * rows : samples) * 4;
    enc.copyBufferToBuffer(flux ? this.flux : this.result, 0, this.read, 0, bytes);
    d.queue.submit([enc.finish()]);
    await this.read.mapAsync(GPUMapMode.READ, 0, bytes);
    try {
      if (flux) return new Float32Array(this.read.getMappedRange(0, bytes).slice(0));
      const squared = new Uint32Array(this.read.getMappedRange(0, samples * 4));
      const distance = new Float64Array(samples);
      for (let i = 0; i < samples; i++) distance[i] = 0.5 * Math.sqrt(squared[i]);
      return { distance, width, ox: 2 * x0, oy: 2 * y0 };
    } finally { this.read.unmap(); }
  }

  destroy() {
    if (this.scratch) for (const buffer of this.scratch.buffers) buffer.destroy();
    this.scratch = null;
  }
}
