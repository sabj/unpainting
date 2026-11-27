// Regional gate reductions. Return original S/capacity for the winning cell so
// the client performs the reported normalization in JS. Borderline decisions
// fall back to the exact W/S/M path rather than rounding a material threshold.
// reduce_full additionally packs W[cells[id.x]] right after the group headers
// so median/P95 bed measurements avoid full-rect W/S/M readbacks.
const SOURCE = `
@group(0) @binding(0) var<storage, read> W: array<f32>;
@group(0) @binding(1) var<storage, read> S: array<f32>;
@group(0) @binding(2) var<storage, read> paper: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> cells: array<u32>;
@group(0) @binding(4) var<storage, read_write> result: array<f32>;
@group(0) @binding(5) var<uniform> count: vec4<u32>;
var<workgroup> water: array<f32, 256>;
var<workgroup> ratio: array<f32, 256>;
var<workgroup> winner: array<u32, 256>;
var<workgroup> moist: array<u32, 256>;
var<workgroup> total: array<f32, 256>;
var<workgroup> uncertain: array<u32, 256>;
var<workgroup> invalid: array<u32, 256>;
fn subnormal(v: f32) -> bool { let bits=bitcast<u32>(v)&0x7fffffffu;return bits!=0u && bits<0x00800000u; }
fn nonfinite(v: f32) -> bool { return (bitcast<u32>(v) & 0x7f800000u) == 0x7f800000u; }
fn reduceBody(id: vec3<u32>, lane: u32, group: vec3<u32>, numGroups: u32, writeW: bool) {
  water[lane]=0.0;ratio[lane]=0.0;winner[lane]=cells[group.x*256u];moist[lane]=0u;total[lane]=0.0;uncertain[lane]=0u;invalid[lane]=0u;
  if(id.x<count.x){
    let i=cells[id.x];let w=W[i];let s=S[i]/max(1e-8,paper[i].x);
    if(writeW){result[numGroups*8u+id.x]=w;}
    water[lane]=max(0.0,w);ratio[lane]=max(0.0,s);winner[lane]=i;total[lane]=w;
    // First f32 >= the JS double threshold 0.015, including exact boundary semantics.
    moist[lane]=select(0u,1u,w>=0.015000000596046448 || s>=0.6);
    uncertain[lane]=select(0u,1u,abs(s-0.6)<1e-6 || abs(s-0.02)<1e-6 || subnormal(w) || subnormal(S[i]) || paper[i].x<1e-8);
    invalid[lane]=select(0u,1u,nonfinite(w)||nonfinite(s));
  }
  workgroupBarrier();
  for(var stride=128u;stride>0u;stride/=2u){
    if(lane<stride){
      water[lane]=max(water[lane],water[lane+stride]);
      if(ratio[lane+stride]>ratio[lane]){ratio[lane]=ratio[lane+stride];winner[lane]=winner[lane+stride];}
      moist[lane]+=moist[lane+stride];total[lane]+=total[lane+stride];
      uncertain[lane]|=uncertain[lane+stride];invalid[lane]|=invalid[lane+stride];
    }
    workgroupBarrier();
  }
  if(lane==0u){let at=group.x*8u;let i=winner[0];result[at]=water[0];result[at+1u]=S[i];result[at+2u]=paper[i].x;result[at+3u]=f32(moist[0]);result[at+4u]=total[0];result[at+5u]=f32(uncertain[0]);result[at+6u]=f32(invalid[0]);result[at+7u]=0.0;}
}
@compute @workgroup_size(256)
fn reduce(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_index) lane: u32, @builtin(workgroup_id) group: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  reduceBody(id, lane, group, ng.x, false);
}
@compute @workgroup_size(256)
fn reduce_full(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_index) lane: u32, @builtin(workgroup_id) group: vec3<u32>, @builtin(num_workgroups) ng: vec3<u32>) {
  reduceBody(id, lane, group, ng.x, true);
}`;

export class PaperGate {
  constructor(device) {
    this.device=device;
    this.count=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.binds=[];
    const module=device.createShaderModule({code:SOURCE});
    this.pipeline=device.createComputePipeline({label:'paper-gate',layout:'auto',compute:{module,entryPoint:'reduce'}});
    this.fullPipeline=device.createComputePipeline({label:'paper-gate-full',layout:'auto',compute:{module,entryPoint:'reduce_full'}});
  }
  buffer(key,bytes,usage){
    if(!this[key]||this[key].size<bytes){this[key]?.destroy();this[key]=this.device.createBuffer({size:Math.max(32,Math.ceil(bytes*1.5/4)*4),usage});}
    return this[key];
  }
  async read(sheet,indices,full=false){
    const d=this.device,groups=Math.ceil(indices.length/256),bytes=(groups*8+(full?indices.length:0))*4;
    const cells=this.buffer('cells',indices.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
    const output=this.buffer('output',bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
    const rb=this.buffer('rb',bytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    d.queue.writeBuffer(cells,0,indices);
    d.queue.writeBuffer(this.count,0,new Uint32Array([indices.length,0,0,0]));
    const pipeline=full?this.fullPipeline:this.pipeline;
    const buffers=[sheet.b.W,sheet.b.S,sheet.b.PAPER,cells,output,this.count],key=full?1:0;
    let cached=this.binds[key];
    if(!cached||buffers.some((buffer,i)=>buffer!==cached.buffers[i])){
      cached={buffers,bind:d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:buffers.map((buffer,binding)=>({binding,resource:{buffer}}))})};this.binds[key]=cached;
    }
    const bind=cached.bind;
    const encoder=d.createCommandEncoder(),pass=encoder.beginComputePass();
    pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(groups);pass.end();encoder.copyBufferToBuffer(output,0,rb,0,bytes);d.queue.submit([encoder.finish()]);
    await rb.mapAsync(GPUMapMode.READ,0,bytes);
    try{return new Float32Array(rb.getMappedRange(0,bytes).slice(0));}finally{rb.unmap();}
  }
  destroy(){for(const key of ['cells','output','rb','count'])this[key]?.destroy();}
}
