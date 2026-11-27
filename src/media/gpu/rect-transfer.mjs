// Pack disjoint rectangles in one dispatch/map. Each rectangle retains the
// original W/S/M/ever/G/P/D plane layout (optionally restricted to active
// pigment channels in `mask`); no simulator arithmetic is performed.
const SOURCE = `
struct Rect { box: vec4<u32>, info: vec4<u32> }
@group(0) @binding(0) var<storage, read_write> W: array<f32>;
@group(0) @binding(1) var<storage, read_write> S: array<f32>;
@group(0) @binding(2) var<storage, read_write> M: array<u32>;
@group(0) @binding(3) var<storage, read_write> E: array<u32>;
@group(0) @binding(4) var<storage, read_write> G: array<f32>;
@group(0) @binding(5) var<storage, read_write> P: array<f32>;
@group(0) @binding(6) var<storage, read_write> D: array<f32>;
@group(0) @binding(7) var<storage, read> rects: array<Rect>;
@group(0) @binding(8) var<storage, read_write> packed: array<f32>;
fn rectangle(cell: u32) -> u32 {
  var lo=0u;var hi=arrayLength(&rects);
  loop { if(lo+1u>=hi){break;}let mid=(lo+hi)/2u;if(rects[mid].info.x<=cell){lo=mid;}else{hi=mid;} }
  return lo;
}
@compute @workgroup_size(256)
fn pack(@builtin(global_invocation_id) id: vec3<u32>) {
  let last=rects[arrayLength(&rects)-1u];
  if(id.x>=last.info.x+last.box.z*last.box.w){return;}
  let r=rects[rectangle(id.x)];let a=r.box.z*r.box.w;let j=id.x-r.info.x;
  let i=(r.box.y+j/r.box.z)*r.info.y+r.box.x+j%r.box.z;
  let K=r.info.w&0xffu;let mask=r.info.w>>8u;let nAct=countOneBits(mask);let at=r.info.x*(4u+3u*nAct)+j;
  packed[at]=W[i];packed[at+a]=S[i];packed[at+2u*a]=f32(M[i]);packed[at+3u*a]=f32(E[i]);
  var s=0u;
  for(var k=0u;k<K;k++){
    if(((mask>>k)&1u)==0u){continue;}
    let q=k*r.info.z+i;
    packed[at+(4u+s)*a]=G[q];packed[at+(4u+nAct+s)*a]=P[q];packed[at+(4u+2u*nAct+s)*a]=D[q];
    s=s+1u;
  }
}
@compute @workgroup_size(256)
fn unpack(@builtin(global_invocation_id) id: vec3<u32>) {
  let last=rects[arrayLength(&rects)-1u];
  if(id.x>=last.info.x+last.box.z*last.box.w){return;}
  let r=rects[rectangle(id.x)];let a=r.box.z*r.box.w;let j=id.x-r.info.x;
  let i=(r.box.y+j/r.box.z)*r.info.y+r.box.x+j%r.box.z;
  let K=r.info.w&0xffu;let mask=r.info.w>>8u;let nAct=countOneBits(mask);let at=r.info.x*(4u+3u*nAct)+j;
  W[i]=packed[at];S[i]=packed[at+a];M[i]=u32(packed[at+2u*a]);E[i]=u32(packed[at+3u*a]);
  var s=0u;
  for(var k=0u;k<K;k++){
    if(((mask>>k)&1u)==0u){continue;}
    let q=k*r.info.z+i;
    G[q]=packed[at+(4u+s)*a];P[q]=packed[at+(4u+nAct+s)*a];D[q]=packed[at+(4u+2u*nAct+s)*a];
    s=s+1u;
  }
}`;

function popcount(mask, K) {
  let n = 0;
  for (let k = 0; k < K; k++) if ((mask >>> k) & 1) n++;
  return n;
}

export class RectTransfer {
  constructor(device) {
    this.device=device;
    const module=device.createShaderModule({code:SOURCE});
    this.pipelines=Object.fromEntries(['pack','unpack'].map(entryPoint=>[entryPoint,device.createComputePipeline({label:`rect-${entryPoint}`,layout:'auto',compute:{module,entryPoint}})]));
  }
  buffer(key,bytes,usage) {
    if(!this[key]||this[key].size<bytes){this[key]?.destroy();this[key]=this.device.createBuffer({size:Math.max(32,Math.ceil(bytes*1.5/4)*4),usage});}
    return this[key];
  }
  encode(sheet,rects,name,mask = ((1<<sheet.K)-1)>>>0) {
    const d=this.device,meta=new Uint32Array(rects.length*8),validMask=(mask&((1<<sheet.K)-1))>>>0;
    const planes=4+3*popcount(validMask,sheet.K),packedInfo=((validMask<<8)|(sheet.K&0xff))>>>0;
    let area=0;
    rects.forEach((r,q)=>{meta.set([...r,area,sheet.w,sheet.n,packedInfo],q*8);area+=r[2]*r[3];});
    const bytes=area*planes*4;
    const descriptors=this.buffer('descriptors',meta.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
    const packed=this.buffer('packed',bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST);
    d.queue.writeBuffer(descriptors,0,meta);
    const pipeline=this.pipelines[name],buffers=[sheet.b.W,sheet.b.S,sheet.b.M,sheet.b.EVER,sheet.b.G,sheet.b.P,sheet.b.D,descriptors,packed];
    const group=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:buffers.map((buffer,binding)=>({binding,resource:{buffer,...(binding===7?{size:meta.byteLength}:{})}}))});
    const encoder=d.createCommandEncoder(),pass=encoder.beginComputePass();
    pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(area/256));pass.end();
    return {encoder,packed,bytes};
  }
  async read(sheet,rects,mask = ((1<<sheet.K)-1)>>>0) {
    const {encoder,packed,bytes}=this.encode(sheet,rects,'pack',mask),d=this.device;
    const rb=this.buffer('readback',bytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    encoder.copyBufferToBuffer(packed,0,rb,0,bytes);d.queue.submit([encoder.finish()]);
    await rb.mapAsync(GPUMapMode.READ,0,bytes);
    try{return new Float32Array(rb.getMappedRange(0,bytes).slice(0));}finally{rb.unmap();}
  }
  write(sheet,rects,data,mask = ((1<<sheet.K)-1)>>>0) {
    const {encoder,packed,bytes}=this.encode(sheet,rects,'unpack',mask);
    if(data.byteLength!==bytes)throw new RangeError('Rectangle upload payload has the wrong size');
    this.device.queue.writeBuffer(packed,0,data);
    return encoder;
  }
  destroy(){for(const key of ['descriptors','packed','readback'])this[key]?.destroy();}
}
