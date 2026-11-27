// Exact drawing handoff: only wet-recipient M and one pigment's G/D at changed
// cells. Packing copies float32 values; all addition/clamping stays on the CPU.
const SOURCE = `
@group(0) @binding(0) var<storage, read> M: array<u32>;
@group(0) @binding(1) var<storage, read_write> G: array<f32>;
@group(0) @binding(2) var<storage, read_write> D: array<f32>;
@group(0) @binding(3) var<storage, read> cells: array<u32>;
@group(0) @binding(4) var<storage, read_write> packed: array<f32>;
@group(0) @binding(5) var<uniform> shape: vec4<u32>;
@compute @workgroup_size(256)
fn pack(@builtin(global_invocation_id) id: vec3<u32>) {
  let j=id.x;if(j>=arrayLength(&cells)){return;}
  let i=cells[j];let p=shape.x*shape.y+i;
  packed[3u*j]=f32(M[i]);packed[3u*j+1u]=G[p];packed[3u*j+2u]=D[p];
}
@compute @workgroup_size(256)
fn unpack(@builtin(global_invocation_id) id: vec3<u32>) {
  let j=id.x;if(j>=arrayLength(&cells)){return;}
  let p=shape.x*shape.y+cells[j];
  G[p]=packed[3u*j+1u];D[p]=packed[3u*j+2u];
}`;

export class PigmentCells {
  constructor(device) {
    this.device=device;
    const module=device.createShaderModule({code:SOURCE});
    this.pipelines=Object.fromEntries(['pack','unpack'].map(entryPoint=>[entryPoint,device.createComputePipeline({label:`pigment-${entryPoint}`,layout:'auto',compute:{module,entryPoint}})]));
  }
  buffer(key,bytes,usage) {
    if(!this[key]||this[key].size<bytes){this[key]?.destroy();this[key]=this.device.createBuffer({size:Math.max(16,Math.ceil(bytes*1.5/4)*4),usage});}
    return this[key];
  }
  encode(sheet,k,cells,name,data=null) {
    const d=this.device,bytes=cells.length*12;
    const indices=this.buffer('indices',cells.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
    const packed=this.buffer('packed',bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST);
    const shape=this.buffer('shape',16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
    d.queue.writeBuffer(indices,0,cells);d.queue.writeBuffer(shape,0,new Uint32Array([sheet.n,k,0,0]));
    if(data)d.queue.writeBuffer(packed,0,data);
    const pipeline=this.pipelines[name];
    // Auto layouts omit M from unpack: it is read-only, never rewritten.
    const entries=[sheet.b.M,sheet.b.G,sheet.b.D,indices,packed,shape].flatMap((buffer,binding)=>name==='unpack'&&binding===0?[]:[{binding,resource:{buffer,...(binding===3?{size:cells.byteLength}:{})}}]);
    const group=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries});
    const encoder=d.createCommandEncoder(),pass=encoder.beginComputePass();
    pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(cells.length/256));pass.end();
    return {encoder,packed,bytes};
  }
  async read(sheet,k,cells) {
    const {encoder,packed,bytes}=this.encode(sheet,k,cells,'pack'),d=this.device;
    const rb=this.buffer('readback',bytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    encoder.copyBufferToBuffer(packed,0,rb,0,bytes);d.queue.submit([encoder.finish()]);
    await rb.mapAsync(GPUMapMode.READ,0,bytes);
    try{return new Float32Array(rb.getMappedRange(0,bytes).slice(0));}finally{rb.unmap();}
  }
  write(sheet,k,cells,data) { return this.encode(sheet,k,cells,'unpack',data).encoder; }
  destroy(){for(const key of ['indices','packed','shape','readback'])this[key]?.destroy();}
}
