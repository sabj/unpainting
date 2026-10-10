import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GpuLink } from './link.mjs';
import { logicalUploadMetadata } from './cpu-demand-window.mjs';

test('reduced upload ACK supplies exact remote mask before act/step without touching dry slots', () => {
  const previous=process.env.GPU_DEMAND_READBACK; process.env.GPU_DEMAND_READBACK='1';
  try {
    const w=3,n=9,K=16,make=()=>({W:new Float32Array(n),s:new Float32Array(n),M:new Uint8Array(n),ever:new Uint8Array(n),G:Array.from({length:K},()=>new Float32Array(n)),P:Array.from({length:K},()=>new Float32Array(n)),D:Array.from({length:K},()=>new Float32Array(n))});
    const host=make(),remote=make(); remote.D[15][8]=NaN; remote.W[7]=-0;
    host.G[3][0]=.5;
    // Host is stale outside the one-cell payload. A full host metadata scan is wrong.
    host.G[0].fill(NaN,1);
    const ctrl=new Int32Array(16);ctrl[7]=123;ctrl[8]=456;ctrl[9]=789;
    const events=[],link=Object.create(GpuLink.prototype);
    Object.assign(link,{w,h:3,K,ctrl,wetMask:0,topMask:0,sentMask:-1,actCount:[],stats:{},recordTransfer:(kind,bytes)=>events.push([kind,bytes]),
      call(m) {
        events.push(['unpack']); const planes=[remote.W,remote.s,remote.M,remote.ever,...remote.G,...remote.P,...remote.D];
        if(m.rect) planes.forEach((p,k)=>{p[0]=m.data[k];});
        events.push(['logical-mark']);const result=logicalUploadMetadata(remote,w,m.logicalRect,K);
        events.push(['reduce']);ctrl[10]=result.mask;ctrl[11]=result.signedZero?1:0;events.push(['ack']);
      },post:m=>events.push([m.op,m.mask])});
    const result=link.upReduced(host,[0,0,1,1],[0,0,3,3]);
    assert.deepEqual(result,{mask:(1<<15)|(1<<3),signedZero:true});
    assert.deepEqual(Array.from(ctrl.slice(7,10)),[123,456,789]);
    assert.deepEqual(events.slice(0,5).map(e=>e[0]),['unpack','logical-mark','reduce','ack','act']);
    assert.equal(link.stats.reducedAckBytes,8);
    link.upReduced(host,null,[2,2,1,1]);
    assert.equal(ctrl[10],1<<15);assert.equal(ctrl[11],0);
    remote.D[15][8]=0;link.upReduced(host,null,[2,2,1,1]);assert.equal(ctrl[10],0);
    assert.throws(()=>link.upReduced(host,[0,0,2,2],[0,0,1,1]),/fit/);
  } finally {if(previous===undefined)delete process.env.GPU_DEMAND_READBACK;else process.env.GPU_DEMAND_READBACK=previous;}
});

test('ordinary default rejects the experimental transport',()=>{
  const previous=process.env.GPU_DEMAND_READBACK;delete process.env.GPU_DEMAND_READBACK;
  try {assert.throws(()=>GpuLink.prototype.upReduced.call({}, {},null,[0,0,1,1]),/disabled/);}
  finally {if(previous!==undefined)process.env.GPU_DEMAND_READBACK=previous;}
});

test('source protocol isolates metadata from physical counters and reserves control10/11',()=>{
  const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
  const wgsl=read('./stepfull.wgsl'),kernel=wgsl.match(/fn upload_metadata_rect[\s\S]*?(?=@compute)/)[0];
  for(const name of ['G','P','D']) assert.ok(kernel.includes(`(bitcast<u32>(${name}[q]) & 0x7fffffffu) != 0u`));
  assert.ok(kernel.includes('bitcast<u32>(W[i]) == 0x80000000u'));
  assert.ok(kernel.includes('bitcast<u32>(D[q]) == 0x80000000u'));
  assert.ok(!kernel.includes('CTR'));assert.ok(!kernel.includes('markDirty'));
  const worker=read('./worker.mjs'),operation=worker.match(/case 'upReduced':[\s\S]*?\n    }/)[0];
  assert.ok(operation.indexOf('gpu.writeRect')<operation.indexOf('await gpu.uploadMetadata'));
  assert.ok(operation.indexOf('await gpu.uploadMetadata')<operation.indexOf('ctrl[10]'));
  assert.ok(!operation.includes('ctrl[7]'));
  const gpu=read('./stepfull.mjs');assert.ok(gpu.includes("process.env.GPU_DEMAND_READBACK !== '1') info.entries = info.entries.filter"));
  assert.ok(gpu.includes("readWords('UPLOAD_META', 8)"));
});

test('integer nonzero predicate matches JS !==0 across float32 bit classes',()=>{
  const patterns=[0,0x80000000,1,0x80000001,0x007fffff,0x00800000,0x3f800000,0xbf800000,
    0x7f7fffff,0xff7fffff,0x7f800000,0xff800000,0x7f800001,0x7fc00000,0xff800001,0xffffffff];
  const storage=new Uint32Array(1),float=new Float32Array(storage.buffer);
  for(const pattern of patterns){storage[0]=pattern;assert.equal((pattern&0x7fffffff)!==0,float[0]!==0,pattern.toString(16));}
});

test('each pigment plane contributes only its own mask bit without changing its payload',()=>{
 const w=3,n=9,K=16,planes=['G','P','D'];
 for(const plane of planes)for(let k=0;k<K;k++)for(const value of [0,-0,.23,-.23,NaN,Infinity]){
  const sheet={W:new Float32Array(n),s:new Float32Array(n),M:new Uint8Array(n),ever:new Uint8Array(n),G:Array.from({length:K},()=>new Float32Array(n)),P:Array.from({length:K},()=>new Float32Array(n)),D:Array.from({length:K},()=>new Float32Array(n))};
  sheet[plane][k][4]=value;const before=sheet[plane][k].slice();
  const result=logicalUploadMetadata(sheet,w,[1,1,1,1],K);
  assert.equal(result.mask,value!==0?1<<k:0);assert.deepEqual(sheet[plane][k],before);
 }
});

test('GPU metadata acknowledgement uses its own buffer and reads no physical counter buffer',async()=>{
 const {GpuSheet}=await import('./stepfull.mjs');const events=[];
 const g=Object.assign(Object.create(GpuSheet.prototype),{b:{RC:{name:'rect'},UPLOAD_META:{name:'metadata'}},ensureUploadMetadata:async()=>events.push('ready'),flushStrokes:()=>events.push('flush'),rectPass:(enc,name,rect)=>events.push([name,rect]),readWords:async(name,bytes)=>{events.push(['read',name,bytes]);return Uint32Array.from([8,1]).buffer;},device:{queue:{writeBuffer:(buffer,offset,data)=>events.push(['write',buffer.name,Array.from(data)]),submit:()=>events.push('submit')},createCommandEncoder:()=>({clearBuffer:buffer=>events.push(['clear',buffer.name]),finish:()=>({})})}});
 assert.deepEqual(await g.uploadMetadata([1,2,3,4]),{mask:8,signedZero:true});
 assert.deepEqual(events.filter(e=>Array.isArray(e)&&e[0]==='read'),[['read','UPLOAD_META',8]]);
 assert.ok(events.indexOf('submit')<events.findIndex(e=>Array.isArray(e)&&e[0]==='read'));
});
