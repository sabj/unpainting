import fs from 'node:fs';
import { GpuTimestamps } from './gpu-timestamps.mjs';
const source = fs.readFileSync(process.env.GPU_OPTICAL_WGSL_FILE || new URL('./optical-gpu.wgsl', import.meta.url), 'utf8');
function pairs(values, divisor = 1) { const out = new Float32Array(values.length*2); for(let i=0;i<values.length;i++){const value=values[i]/divisor;out[2*i]=value;out[2*i+1]=value-out[2*i];}return out; }
// The fixed stack is a GPU-resident fractional-linear optical transform. Changing
// the paper or preparatory ink under it does not require rendering the stack again.
export class GpuOpticalComposite {
  static async create(device, n, pigments, micro = null, width = n) {
    // Guard every storage binding, including mask checkpoints, before host/GPU allocation.
    const largest = Math.max(16, 96*n, 4*n*pigments.length, 56*pigments.length);
    if (!Number.isSafeInteger(largest) || largest > device.limits.maxStorageBufferBindingSize || largest > device.limits.maxBufferSize)
      throw new RangeError(`optical-gpu storage binding exceeds device limits (${largest} bytes)`);
    const self = new GpuOpticalComposite();Object.assign(self,{device,n,pigments,micro,width,stats:{layers:0,frames:0,readBytes:0}});
    device.pushErrorScope('validation');self.init();const error=await device.popErrorScope();if(error)throw new Error(error.message);return self;
  }
  init(){
    const d=this.device,n=this.n;this.timestamps=new GpuTimestamps(d);
    const mk=(size,usage=0)=>d.createBuffer({size:Math.max(16,size),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST|usage});
    this.matrix=mk(n*3*4*8);this.scratch=mk(this.matrix.size);this.layer=mk(n*this.pigments.length*4);this.base=mk(n*3*8);this.out=mk(Math.ceil(n*3/4)*4);this.texture=mk(n*4);this.wet=mk(n*this.pigments.length*4);this.unused=mk(16);this.flags=mk(16);
    this.uniform=d.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.sparseUniform=d.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.copyUniform=d.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});const opts=[n,this.pigments.length,!!this.micro,0,this.width,Math.ceil(this.width/16)*Math.ceil(n/this.width/16),0,0];d.queue.writeBuffer(this.uniform,0,new Uint32Array(opts));opts[6]=1;d.queue.writeBuffer(this.sparseUniform,0,new Uint32Array(opts));opts[6]=0;opts[7]=1;d.queue.writeBuffer(this.copyUniform,0,new Uint32Array(opts));
    const table=pairs(this.pigments.flatMap((p,k)=>[...p.K,...p.S,this.micro?.amp[k]??0]));this.table=mk(table.byteLength);d.queue.writeBuffer(this.table,0,table);if(this.micro)d.queue.writeBuffer(this.texture,0,this.micro.t);
    const layout=d.createBindGroupLayout({entries:Array.from({length:11},(_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===0?'uniform':[1,2,3,5,7,8,10].includes(binding)?'read-only-storage':'storage'}}))});
    this.layout=layout;const pipelineLayout=d.createPipelineLayout({bindGroupLayouts:[layout]}),module=d.createShaderModule({code:source,strictMath:true});this.p={};
    for(const entryPoint of ['reset','compose','frame','wet_sum','restore_mask'])this.p[entryPoint]=d.createComputePipeline({label:'optical-'+entryPoint,layout:pipelineLayout,compute:{module,entryPoint}});
    this.reset();
  }
  bind(matrix=this.matrix,layer=this.layer, options={}){const buffers=[options.from?this.copyUniform:options.sparse?this.sparseUniform:this.uniform,this.table,this.texture,layer,matrix,options.from??options.base??this.base,this.out,options.deposit??this.layer,options.pore??this.layer,options.wet??this.unused,options.flags??this.flags];return this.device.createBindGroup({layout:this.layout,entries:buffers.map((buffer,binding)=>({binding,resource:{buffer}}))});}
  encode(encoder,name,matrix=this.matrix,layer=this.layer,options={}){const p=this.timestamps.begin(encoder,'optical-'+name);p.setPipeline(this.p[name]);p.setBindGroup(0,this.bind(matrix,layer,options));if(options.args)p.dispatchWorkgroupsIndirect(options.args,36);else {const groups=Math.ceil((name==='frame'?Math.ceil(this.n*3/4):this.n*(name==='wet_sum'?this.pigments.length:name==='compose'?1:3))/(name==='compose'?256:64));const x=Math.min(groups,this.device.limits.maxComputeWorkgroupsPerDimension);p.dispatchWorkgroups(x,Math.ceil(groups/x));}p.end();}
  sumWet(g,d,p){const e=this.device.createCommandEncoder();this.encode(e,'wet_sum',this.matrix,g,{deposit:d,pore:p,wet:this.wet});this.device.queue.submit([e.finish()]);return this.wet;}
  reset(){const e=this.device.createCommandEncoder();this.encode(e,'reset');this.device.queue.submit([e.finish()]);this.stats.layers=0;}
  beginMask(mask,top=null){
    const d=this.device;this.maskCheckpoint?.destroy();this.maskBuffer?.destroy();
    this.maskCheckpoint=d.createBuffer({size:this.matrix.size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
    this.maskBuffer=d.createBuffer({size:this.n*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});d.queue.writeBuffer(this.maskBuffer,0,Float32Array.from(mask));
    const e=d.createCommandEncoder();e.copyBufferToBuffer(this.matrix,0,this.maskCheckpoint,0,this.matrix.size);if(top)this.encode(e,'compose',this.maskCheckpoint,top);d.queue.submit([e.finish()]);
  }
  endMask(){if(!this.maskCheckpoint)return;const e=this.device.createCommandEncoder();this.encode(e,'restore_mask',this.matrix,this.maskBuffer,{base:this.maskCheckpoint});this.device.queue.submit([e.finish()]);this.maskCheckpoint.destroy();this.maskBuffer.destroy();this.maskCheckpoint=null;this.maskBuffer=null;}
  uploadLayer(layer){for(let k=0;k<layer.length;k++)this.device.queue.writeBuffer(this.layer,k*this.n*4,layer[k]);return this.layer;}
  append(layer,options={}){const buffer=Array.isArray(layer)?this.uploadLayer(layer):layer;const e=this.device.createCommandEncoder();this.encode(e,'compose',this.matrix,buffer,options);this.device.queue.submit([e.finish()]);this.stats.layers++;}
  async capture(paperRGB,live=[],reflectance=false){
    const d=this.device;
    this.readSlots??=Array.from({length:2},()=>({buffer:d.createBuffer({size:this.out.size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),busy:false}));
    let slot=this.readSlots.find(s=>!s.busy);
    if(!slot)slot=await new Promise(resolve=>(this.readWaiters??=[]).push(resolve));
    slot.busy=true;
    if(paperRGB!=null)d.queue.writeBuffer(this.base,0,pairs(paperRGB,reflectance?1:255));
    const e=d.createCommandEncoder(),matrix=live.length?this.scratch:this.matrix;
    const uploads=[];let first=true;
    for(const layer of live){let buffer=layer;if(Array.isArray(layer)){buffer=d.createBuffer({size:this.layer.size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});for(let k=0;k<layer.length;k++)d.queue.writeBuffer(buffer,k*this.n*4,layer[k]);uploads.push(buffer);}this.encode(e,'compose',matrix,buffer,first?{from:this.matrix}:{});first=false;}
    this.encode(e,'frame',matrix);const read=slot.buffer;e.copyBufferToBuffer(this.out,0,read,0,read.size);d.queue.submit([e.finish()]);
    const ready=read.mapAsync(GPUMapMode.READ).then(()=>{try{const out=new Uint8Array(read.getMappedRange(),0,this.n*3).slice();this.stats.frames++;this.stats.readBytes+=read.size;return out;}finally{read.unmap();}}).finally(()=>{for(const b of uploads)b.destroy();const next=this.readWaiters?.shift();if(next)next(slot);else slot.busy=false;});
    (this.pendingFrames??=new Set()).add(ready);ready.then(()=>this.pendingFrames.delete(ready),()=>this.pendingFrames.delete(ready));
    return {ready};
  }
  async drain(){await Promise.all(this.pendingFrames??[]);}
  async frame(...args){const {ready}=await this.capture(...args);return ready;}

  destroy(){this.maskCheckpoint?.destroy();this.maskBuffer?.destroy();for(const slot of this.readSlots??[])slot.buffer.destroy();for(const k of ['matrix','scratch','layer','base','out','texture','uniform','sparseUniform','copyUniform','table','wet','unused','flags'])this[k].destroy();this.timestamps.destroy();}
}
