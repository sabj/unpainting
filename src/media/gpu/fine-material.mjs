import { readFileSync } from 'node:fs';
import { settleSpeed, settleDiffusion } from '../settling.mjs';
import { grainDrag } from '../grain-water.mjs';
import { slideRate, reposeStep } from '../grain-field.mjs';
import { GpuFineMaterialInputs } from './fine-material-inputs.mjs';
const source = readFileSync(new URL('./fine-material.wgsl', import.meta.url), 'utf8'), STRIDE = 256;

export class GpuFineMaterial {
  constructor(device) {
    if (device.limits.maxStorageBuffersPerShaderStage < 10) throw new Error('fine GPU material requires ten storage bindings');
    this.device = device;
    this.inputs = new GpuFineMaterialInputs(device);
    const module = device.createShaderModule({ label: 'fine Stokes residence and grain slide', code: source });
    this.layout = device.createBindGroupLayout({ entries: Array.from({ length: 11 }, (_, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE,
      buffer: binding === 0 ? { type: 'uniform', hasDynamicOffset: true, minBindingSize: 96 } :
        { type: [4,6,7].includes(binding) ? 'read-only-storage' : 'storage' },
    })) });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    this.pipelines = Object.fromEntries(['settle','bedField','bedMean','surface','slideFaces','slideGather'].map(entryPoint => [entryPoint,
      device.createComputePipeline({ layout, compute: { module, entryPoint } })]));
  }

  allocate(F) {
    const top = F.layers.at(-1);
    if (this.F === F && this.topLayer === top) return;
    const d = this.device, n = F.fn, K = F.K, size = n * K * 4;
    let topCount = 0;
    const topIndices = Array.from({ length: K }, (_, k) => top?.[k].some(v => v !== 0) ? topCount++ : -1);
    // Reuse all sheet-sized buffers (including the 16-byte/cell paper buffer) across dried layers;
    // only grow `this.top` when a newer fixed layer activates more channels than previously allocated.
    if (this.F === F && this.buffers) {
      this.topLayer = top;
      this.topIndices = topIndices;
      if (topCount <= this.topCap) return;
      const oldIdx = this.buffers.indexOf(this.top);
      this.top.destroy();
      const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
      this.top = d.createBuffer({ size: Math.max(4, topCount * n * 4), usage: storage | GPUBufferUsage.COPY_SRC });
      this.topCap = topCount;
      if (oldIdx >= 0) this.buffers[oldIdx] = this.top; else this.buffers.push(this.top);
      const buffers = [this.uniform,this.G,this.D,this.top,this.paper,this.water,this.mask,this.material,this.field,this.moves,this.partial];
      this.group = d.createBindGroup({ layout: this.layout, entries: buffers.map((buffer,binding) => ({ binding, resource: { buffer, ...(binding === 0 ? { size: 96 } : {}) } })) });
      return;
    }
    this.destroy();
    if (Math.max(size, n * 16) > Math.min(d.limits.maxBufferSize, d.limits.maxStorageBufferBindingSize)) throw new Error('fine GPU material exceeds device buffer limits');
    this.F = F; this.topLayer = top; this.buffers = []; this.topIndices = topIndices; this.topCap = topCount;
    const mk = (bytes, usage) => { const b = d.createBuffer({ size: bytes, usage }); this.buffers.push(b); return b; };
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.uniform = mk(STRIDE * K, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.G = mk(size, storage | GPUBufferUsage.COPY_SRC); this.D = mk(size, storage | GPUBufferUsage.COPY_SRC); this.P = mk(size, storage | GPUBufferUsage.COPY_SRC); this.top = mk(Math.max(4, topCount*n*4), storage | GPUBufferUsage.COPY_SRC);
    this.paper = mk(n * 16, storage); this.water = mk(n * 16, storage); this.mask = mk(n * 4, storage);
    this.material = mk(K * 32 + Math.ceil(K/4)*16, storage); this.field = mk(n * 8, storage); this.moves = mk(n * 16, storage);
    this.groups = Math.ceil(n / 128); this.partial = mk(this.groups * 8, storage | GPUBufferUsage.COPY_SRC);
    // One pigment readback is sufficient. Read observations serially instead of
    // retaining three additional full-palette images on the device.
    this.read = mk(n * 4, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
    const buffers = [this.uniform,this.G,this.D,this.top,this.paper,this.water,this.mask,this.material,this.field,this.moves,this.partial];
    this.group = d.createBindGroup({ layout: this.layout, entries: buffers.map((buffer,binding) => ({ binding, resource: { buffer, ...(binding === 0 ? { size: 96 } : {}) } })) });
    const fp = F.paper, height = fp.surface || fp.valley || fp.height, paper = new Float32Array(n*4);
    for (let f=0;f<n;f++) paper.set([fp.hollow[f],height[f],fp.grainH[f],fp.tooth[f]], f*4);
    d.queue.writeBuffer(this.paper,0,paper);
  }

  async uploadSuspended(F) {
    this.allocate(F);
    const d = this.device;
    let staged = 0;
    for (let k = 0; k < F.K; k++) {
      if (staged + F.G[k].byteLength > 128 * 2**20) {
        d.queue.submit([]); await d.queue.onSubmittedWorkDone(); staged = 0;
      }
      d.queue.writeBuffer(this.G, k * F.fn * 4, F.G[k]); staged += F.G[k].byteLength;
    }
    // Retire these uploads before advance() stages deposits and fixed pigment.
    if (staged + F.fn * 20 > 128 * 2**20) { d.queue.submit([]); await d.queue.onSubmittedWorkDone(); }
    return this.G;
  }

  async observeSuspended(F) {
    const d = this.device, n = F.fn;
    for (let k = 0; k < F.K; k++) {
      const enc = d.createCommandEncoder(); enc.copyBufferToBuffer(this.G, k * n * 4, this.read, 0, n * 4);
      d.queue.submit([enc.finish()]); await this.read.mapAsync(GPUMapMode.READ);
      try { F.G[k].set(new Float32Array(this.read.getMappedRange())); }
      finally { this.read.unmap(); }
    }
  }

  async uploadAll(F, pigments = null) {
    this.allocate(F);
    const d = this.device, n = F.fn, top = F.layers.at(-1);
    const list = pigments ?? Array.from({ length: F.K }, (_, k) => k);
    let staged = 0;
    const upload = async (buffer, offset, data) => {
      if (staged + data.byteLength > 128 * 2**20) {
        d.queue.submit([]); await d.queue.onSubmittedWorkDone(); staged = 0;
      }
      d.queue.writeBuffer(buffer, offset, data); staged += data.byteLength;
    };
    for (const k of list) {
      await upload(this.G, k * n * 4, F.G[k]);
      await upload(this.D, k * n * 4, F.D[k]);
      await upload(this.P, k * n * 4, F.P[k]);
      if (this.topIndices[k] >= 0) await upload(this.top, this.topIndices[k] * n * 4, top[k]);
    }
    // Zero any newly inactive pigment buffers so stale GPU values from an earlier wash never leak.
    if (pigments && this.prevUploaded) {
      for (const k of this.prevUploaded) {
        if (list.includes(k)) continue;
        await upload(this.G, k * n * 4, F.G[k]);
        await upload(this.D, k * n * 4, F.D[k]);
        await upload(this.P, k * n * 4, F.P[k]);
      }
    }
    this.prevUploaded = list.slice();
  }

  async observePlane(buffer, offset, out) {
    const d = this.device, enc = d.createCommandEncoder();
    enc.copyBufferToBuffer(buffer, offset, this.read, 0, out.byteLength);
    d.queue.submit([enc.finish()]); await this.read.mapAsync(GPUMapMode.READ);
    try { out.set(new Float32Array(this.read.getMappedRange())); }
    finally { this.read.unmap(); }
  }

  async observeAll(F, pigments = null) {
    const n = F.fn, top = F.layers.at(-1), list = pigments ?? Array.from({ length: F.K }, (_, k) => k);
    for (const k of list) {
      await this.observePlane(this.G, k * n * 4, F.G[k]);
      await this.observePlane(this.D, k * n * 4, F.D[k]);
      await this.observePlane(this.P, k * n * 4, F.P[k]);
      if (this.topIndices[k] >= 0) await this.observePlane(this.top, this.topIndices[k] * n * 4, top[k]);
    }
  }

  async observeBackrun(F, pigments = null) {
    const n = F.fn, list = pigments ?? Array.from({ length: F.K }, (_, k) => k);
    for (const k of list) {
      await this.observePlane(this.G, k * n * 4, F.G[k]);
      await this.observePlane(this.D, k * n * 4, F.D[k]);
    }
  }

  async uploadBackrun(F, pigments = null) {
    const d = this.device, n = F.fn, list = pigments ?? Array.from({ length: F.K }, (_, k) => k);
    let staged = 0;
    for (const k of list) {
      if (staged + n * 8 > 128 * 2**20) { d.queue.submit([]); await d.queue.onSubmittedWorkDone(); staged = 0; }
      d.queue.writeBuffer(this.G, k * n * 4, F.G[k]);
      d.queue.writeBuffer(this.D, k * n * 4, F.D[k]);
      staged += n * 8;
    }
  }

  async advance(F, wa, residentG = null, waterSource = null, outerScoped = false, keepResident = false, activePigments = null, commands = null) {
    this.allocate(F);
    if (residentG && residentG !== this.G) throw new Error('fine GPU material suspension belongs to another allocation');
    const d=this.device, n=F.fn, K=F.K, o=F.o, top=F.layers.at(-1), pigments=F.sheet.pigments;
    const max=d.limits.maxComputeWorkgroupsPerDimension, gx=Math.min(this.groups,max), gy=Math.ceil(this.groups/gx);
    if (gy>max) throw new Error('fine GPU material exceeds dispatch limits');
    const mats=new Float32Array(K*8+Math.ceil(K/4)*4);
    for(let k=0;k<K;k++) { const p=pigments[k]; mats.set([settleSpeed(p)*(o.settle??1),settleDiffusion(p)*(o.settle??1),p.gamma*(o.gran??1),p.rho/p.omega*o.lift*o.looseLift,(o.scour??0)/p.omega,p.omega,p.floc??0,grainDrag(settleSpeed(p))],k*8); }
    mats.set(this.topIndices,K*8);
    const params=new ArrayBuffer(K*STRIDE), u=new Uint32Array(params), v=new Float32Array(params);
    const slide=slideRate(o.slide??0,F.paper.mmPerCell), repose=reposeStep(o.repose??0,F.paper.mmPerCell);
    const fill=o.slideFill??1, fillRef=o.fillRef??0;
    for(let k=0;k<K;k++) {
      const at=k*STRIDE/4;u.set([F.FW,n,K,k,gx*128,top?1:0,Number.isFinite(o.hold??Infinity)?1:0,o.fixedBed>0?1:0],at);
      v.set([F.L.dt,o.granFill??0,o.coSettle??0,o.liftDepth??.15,o.hold??0,o.holdDepth??o.film,o.rewetLift,o.film,slide,repose,o.slideCap??0,fill,fillRef,this.groups,0,0],at+8);
    }
    if (!outerScoped) d.pushErrorScope('validation');
    try {
      const q = commands ?? d.queue;
      const enc = commands?.encoder ?? d.createCommandEncoder(), inputBytes = this.inputs.pack(this,F,wa,enc,waterSource,commands);
      for(const [buffer,data] of [[this.uniform,params],[this.material,mats]])q.writeBuffer(buffer,0,data);
      if (!keepResident) {
        let staged = inputBytes + mats.byteLength + params.byteLength;
        const upload = async (buffer, offset, data) => {
          if (staged + data.byteLength > 128 * 2**20) {
            d.queue.submit([]); await d.queue.onSubmittedWorkDone(); staged = 0;
          }
          d.queue.writeBuffer(buffer, offset, data); staged += data.byteLength;
        };
        for(let k=0;k<K;k++) {
          if(!residentG)await upload(this.G,k*n*4,F.G[k]);
          await upload(this.D,k*n*4,F.D[k]);
          if(this.topIndices[k]>=0)await upload(this.top,this.topIndices[k]*n*4,top[k]);
        }
      }
      const pass = enc.beginComputePass();
      pass.setPipeline(this.pipelines.settle); pass.setBindGroup(0,this.group,[0]); pass.dispatchWorkgroups(gx,gy);
      if (slide > 0) {
        pass.setPipeline(this.pipelines.bedField); pass.setBindGroup(0,this.group,[0]); pass.dispatchWorkgroups(gx,gy);
        pass.setPipeline(this.pipelines.bedMean); pass.setBindGroup(0,this.group,[0]); pass.dispatchWorkgroups(1);
        const slideList = activePigments ?? Array.from({ length: K }, (_, k) => k);
        for (const k of slideList) if (mats[k*8+2] > 0) for (const name of ['surface','slideFaces','slideGather']) {
          pass.setPipeline(this.pipelines[name]); pass.setBindGroup(0,this.group,[k*STRIDE]); pass.dispatchWorkgroups(gx,gy);
        }
      }
      pass.end();
      if (commands) { if (!keepResident) commands.flush(); }
      else d.queue.submit([enc.finish()]);
      if (!keepResident) {
        for(let k=0;k<K;k++) {
          await this.observePlane(this.G,k*n*4,F.G[k]);await this.observePlane(this.D,k*n*4,F.D[k]);
          if(this.topIndices[k]>=0)await this.observePlane(this.top,this.topIndices[k]*n*4,top[k]);
        }
      }
    } finally {if (!outerScoped) { const error=await d.popErrorScope();if(error)throw new Error(`fine GPU material: ${error.message}`); }}
  }

  destroy() { this.inputs?.destroy();if(this.buffers)for(const b of this.buffers)b.destroy();this.buffers=null;this.F=null;this.topLayer=null;this.prevUploaded=null; }
}
