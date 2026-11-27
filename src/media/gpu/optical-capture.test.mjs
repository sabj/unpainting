import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuOpticalComposite} from './optical-gpu.mjs';
import {openGpu} from './stepfull.mjs';
const pigments=[{K:[.8,.5,.3],S:[.02,.03,.04]},{K:[.12,.45,.72],S:[.03,.03,.03]}];

test('pipelined optical snapshots match the copy-based transform and retain capture order',async t=>{
 let device;try{const w=await import('webgpu');Object.assign(globalThis,w.globals);({device}=await openGpu(w.create([])));}catch(error){if(process.env.GPU_REQUIRED==='1')throw error;t.skip(error.message);return;}
 const n=257,base=Uint8Array.from({length:n*3},(_,i)=>230+i%26),make=(seed)=>pigments.map((_,k)=>Float32Array.from({length:n},(_,i)=>(i+seed)%7===0?0:((i*13+k*7+seed)%97)/150));
 const composite=await GpuOpticalComposite.create(device,n,pigments,null,n);
 try{
  for(let i=0;i<9;i++)composite.append(make(i));
  const reference=async live=>{
   const e=device.createCommandEncoder();e.copyBufferToBuffer(composite.matrix,0,composite.scratch,0,composite.matrix.size);
   const uploads=live.map(L=>{const b=device.createBuffer({size:composite.layer.size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});L.forEach((a,k)=>device.queue.writeBuffer(b,k*n*4,a));composite.encode(e,'compose',composite.scratch,b);return b;});
   composite.encode(e,'frame',composite.scratch);const rb=device.createBuffer({size:composite.out.size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});e.copyBufferToBuffer(composite.out,0,rb,0,rb.size);device.queue.submit([e.finish()]);await rb.mapAsync(GPUMapMode.READ);const rgb=new Uint8Array(rb.getMappedRange(),0,n*3).slice();rb.unmap();rb.destroy();uploads.forEach(b=>b.destroy());return rgb;
  };
  await composite.frame(base);
  const frames=[[],[make(20)],[make(21),make(22)],pigments.map(()=>new Float32Array(n))];frames[3]=[frames[3]];
  const expected=[];for(const live of frames)expected.push(await reference(live));
  const ready=[];for(const live of frames)ready.push((await composite.capture(null,live)).ready);
  const actual=await Promise.all(ready);actual.forEach((rgb,i)=>assert.deepEqual(rgb,expected[i]));
  assert.equal(composite.readSlots.length,2);assert.equal(composite.readWaiters?.length??0,0);
 }finally{await composite.drain();composite.destroy();device.destroy();}
});
