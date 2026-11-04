// Exact W/S/M observation of disjoint dirty rectangles, in one dispatch and map.
// This deliberately does not bind or pack pigment planes. No f16 rounding at gates.
const SOURCE = `
struct Rect { box: vec4<u32>, info: vec4<u32> }
@group(0) @binding(0) var<storage, read> W: array<f32>;
@group(0) @binding(1) var<storage, read> S: array<f32>;
@group(0) @binding(2) var<storage, read> M: array<u32>;
@group(0) @binding(3) var<storage, read> rects: array<Rect>;
@group(0) @binding(4) var<storage, read_write> result: array<f32>;
@compute @workgroup_size(256)
fn pack(@builtin(global_invocation_id) id: vec3<u32>) {
  let cell = id.x;
  let count = arrayLength(&rects);
  let last = rects[count - 1u];
  if (cell >= last.info.x + last.box.z * last.box.w) { return; }
  var lo = 0u; var hi = count;
  loop {
    if (lo + 1u >= hi) { break; }
    let mid = (lo + hi) / 2u;
    if (rects[mid].info.x <= cell) { lo = mid; } else { hi = mid; }
  }
  let r = rects[lo]; let j = cell - r.info.x; let area = r.box.z * r.box.w;
  let i = (r.box.y + j / r.box.z) * r.info.y + r.box.x + j % r.box.z;
  let base = r.info.x * 3u;
  result[base + j] = W[i]; result[base + area + j] = S[i]; result[base + 2u * area + j] = f32(M[i]);
}`;

export class PaperReadback {
  constructor(device) {
    this.device = device;
    this.pipeline = device.createComputePipeline({layout:'auto', compute:{module:device.createShaderModule({code:SOURCE}), entryPoint:'pack'}});
  }
  buffer(key, bytes, usage) {
    if (!this[key] || this[key].size < bytes) {
      this[key]?.destroy();
      this[key] = this.device.createBuffer({size:Math.max(32, Math.ceil(bytes * 1.5 / 4) * 4), usage});
    }
    return this[key];
  }
  async read(sheet, rects) {
    if (!rects.length) return new Float32Array();
    const d=this.device, descriptors=new Uint32Array(rects.length*8);
    let area=0;
    rects.forEach((rect,q)=>{descriptors.set([...rect,area,sheet.w,0,0],q*8);area+=rect[2]*rect[3];});
    const bytes=area*12;
    const meta=this.buffer('meta',descriptors.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
    const packed=this.buffer('packed',bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
    const readback=this.buffer('readback',bytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    d.queue.writeBuffer(meta,0,descriptors);
    const buffers=[sheet.b.W,sheet.b.S,sheet.b.M,meta,packed];
    const group=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:buffers.map((buffer,binding)=>({binding,resource:{buffer,...(binding===3?{size:descriptors.byteLength}: {})}}))});
    const encoder=d.createCommandEncoder(),pass=encoder.beginComputePass();
    pass.setPipeline(this.pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(area/256));pass.end();
    encoder.copyBufferToBuffer(packed,0,readback,0,bytes);d.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ,0,bytes);
    try { return new Float32Array(readback.getMappedRange(0,bytes).slice(0)); }
    finally { readback.unmap(); }
  }
  destroy() { for(const key of ['meta','packed','readback'])this[key]?.destroy(); }
}
