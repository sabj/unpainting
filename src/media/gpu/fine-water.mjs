import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('./fine-water.wgsl',import.meta.url),'utf8');

export class GpuFineWater {
  constructor(device){
    this.device=device;
    const module=device.createShaderModule({label:'block-conservative fine film reconstruction',code:source});
    this.pipeline=device.createComputePipeline({layout:'auto',compute:{module,entryPoint:'reconstruct'}});
  }

  allocate(F){
    if(this.F===F)return;this.destroy();this.F=F;this.buffers=[];
    const d=this.device,n=F.fn,c=F.sheet.n,storage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST;
    if(Math.max(n*8,c*16)>Math.min(d.limits.maxStorageBufferBindingSize,d.limits.maxBufferSize))throw new Error('fine GPU water exceeds device buffer limits');
    const mk=(size,usage)=>{const b=d.createBuffer({size,usage});this.buffers.push(b);return b;};
    this.uniform=mk(48,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);this.state=mk(c*16,storage);this.coarse=mk(c*8,storage);
    this.paper=mk(n*8,storage);this.mask=mk(c*4,storage);this.result=mk(n*8,storage|GPUBufferUsage.COPY_SRC);
    this.fineMask=mk(Math.ceil(n/4)*4,storage);this.uploadedMaskVersion=-1;
    this.read=mk(n*8,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    const buffers=[this.uniform,this.state,this.coarse,this.paper,this.mask,this.result,this.fineMask];
    this.group=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:buffers.map((buffer,binding)=>({binding,resource:{buffer}}))});
    this.hostState=new Float32Array(c*4);this.hostMask=new Uint32Array(c);this.lastBlocks=null;this.lastBlocksLen=-1;this.lastY0=0;this.lastY1=F.sheet.h-1;
    const cp=F.sheet.paper,fp=F.paper,hc=cp.surface||cp.valley||cp.height,hf=fp.surface||fp.valley||fp.height;
    const coarse=new Float32Array(c*2),fine=new Float32Array(n*2);
    for(let i=0;i<c;i++){coarse[i*2]=hc[i];coarse[i*2+1]=cp.capacity[i];}
    for(let i=0;i<n;i++){fine[i*2]=hf[i];fine[i*2+1]=fp.capacity[i];}
    d.queue.writeBuffer(this.coarse,0,coarse);d.queue.writeBuffer(this.paper,0,fine);
  }

  async reconstruct(F,W,M,s,outW,outS,blocks,filmSlot=null,outerScoped=false,commands=null){
    if(F.N>8)throw new Error('fine GPU water supports ratios 2 through 8');
    this.allocate(F);const d=this.device,q=commands??d.queue,c=F.sheet.n,n=F.fn,N=F.N;
    const sw=F.sheet.w,sh=F.sheet.h;
    const sameBlocks=blocks===this.lastBlocks&&blocks.length===this.lastBlocksLen;
    let y0,y1;
    if(sameBlocks){y0=this.lastY0;y1=this.lastY1;}
    else{
      this.hostMask.fill(0);let rMin=sh,rMax=-1;
      for(let i=0;i<blocks.length;i++){const b=blocks[i];this.hostMask[b]=1;const r=(b/sw)|0;if(r<rMin)rMin=r;if(r>rMax)rMax=r;}
      y0=rMax>=0?Math.max(0,rMin-1):0;y1=rMax>=0?Math.min(sh-1,rMax+1):-1;
      this.lastBlocks=blocks;this.lastBlocksLen=blocks.length;this.lastY0=y0;this.lastY1=y1;
    }
    const i0=y0*sw,i1=y1>=y0?(y1+1)*sw:0;
    for(let i=i0;i<i1;i++){this.hostState[i*4]=W[i];this.hostState[i*4+1]=s[i];this.hostState[i*4+2]=M[i];}
    const gx=Math.min(c,d.limits.maxComputeWorkgroupsPerDimension),gy=Math.ceil(c/gx);
    if(gy>d.limits.maxComputeWorkgroupsPerDimension)throw new Error('fine GPU water exceeds dispatch limits');
    const params=new ArrayBuffer(48),u=new Uint32Array(params),f=new Float32Array(params);
    u.set([F.FW,n,N,sw,sh,gx]);f[8]=F.o.slope??0;f[9]=(F.o.slope??0)-f[8];
    u[6]=filmSlot??0;u[7]=filmSlot==null?0:1;
    if(!outerScoped)d.pushErrorScope('validation');
    try{
      q.writeBuffer(this.uniform,0,params);
      if(i1>i0)q.writeBuffer(this.state,i0*16,this.hostState,i0*4,(i1-i0)*4);
      if(!sameBlocks)q.writeBuffer(this.mask,0,this.hostMask);
      if(this.uploadedMaskVersion!==F.maskVersion){q.writeBuffer(this.fineMask,0,F.M);this.uploadedMaskVersion=F.maskVersion;}
      const enc=commands?.encoder??d.createCommandEncoder(),pass=enc.beginComputePass();pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.group);pass.dispatchWorkgroups(gx,gy);pass.end();
      if(filmSlot!=null){if(!commands)d.queue.submit([enc.finish()]);return;}
      if(commands)throw new Error('observed fine water requires a submitted batch');
      enc.copyBufferToBuffer(this.result,0,this.read,0,n*8);d.queue.submit([enc.finish()]);await this.read.mapAsync(GPUMapMode.READ);
      try{
        const a=new Float32Array(this.read.getMappedRange());
        // Coarse blocks are normally listed by row. Copy each contiguous run's
        // fine rows directly from planar observations, keeping unlisted cells
        // untouched. Unsorted or isolated blocks also form valid one-block runs.
        for(let b=0;b<blocks.length;b++){
          const first=blocks[b];let last=first;
          while(b+1<blocks.length&&last%F.sheet.w+1<F.sheet.w&&blocks[b+1]===last+1){last=blocks[++b];}
          const x=first%F.sheet.w*N,y=Math.floor(first/F.sheet.w)*N,count=(last-first+1)*N;
          for(let row=0;row<N;row++){
            const at=(y+row)*F.FW+x;
            outW.set(a.subarray(at,at+count),at);outS.set(a.subarray(n+at,n+at+count),at);
          }
        }
      }
      finally{this.read.unmap();}
    }finally{if(!outerScoped){const error=await d.popErrorScope();if(error)throw new Error(`fine GPU water: ${error.message}`);}}
  }

  async observeFilm(F,slot,out){
    const d=this.device,enc=d.createCommandEncoder();
    enc.copyBufferToBuffer(this.result,slot*F.fn*4,this.read,0,F.fn*4);d.queue.submit([enc.finish()]);
    await this.read.mapAsync(GPUMapMode.READ);
    try{const a=new Float32Array(this.read.getMappedRange(),0,F.fn);for(const f of F.activeCells)out[f]=a[f];}finally{this.read.unmap();}
  }

  destroy(){if(this.buffers)for(const b of this.buffers)b.destroy();this.buffers=null;this.F=null;}
}
