import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createOpticalFramer} from './optical-framer.mjs';
import {createInkComposer} from '../../paint/methods/ink-compose.mjs';

test('optical film keeps capture-time ink and native metadata, applies backpressure and drains completed marks',async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'optical-framer-')),raw=Uint8Array.from({length:4*4*3},(_,i)=>i*5),base=new Float64Array(raw.length).fill(1);base._immutable=true;
 const state={N:2,W2:4,H2:4,width:8,height:8,ratio:new Float32Array(8*8*3).fill(1),version:0};
 const ink={frameComposition(){return {...state};}},events=[],calls=[];let port;
 const link={stats:{},n:16,post(message){calls.push(message.op);if(message.op==='opticalPort')port=message.port;else if(message.op==='opticalSnap'){const rgb=raw.slice();setTimeout(()=>port.postMessage({id:message.id,rgb},[rgb.buffer]),message.id%2?10:0);}}};
 const sheet={_gpu:link},F=createOpticalFramer({sheet,prepare:()=>base,ink,out,outW:8,outH:8,n:16,w:4,h:4,W2:4,SC:1,paperRGB:[255,255,255],onFrame:(rgb,event)=>events.push({rgb,event})});
 const composer=createInkComposer(state);composer.setRatio(state.ratio);const expected=Buffer.from(composer.compose(raw));
 try{
  const first=F.capture();F.name(first,'f0000.webp',{stage:{pass:1},marks:{brush:3}});
  state.ratio.fill(.5);state.version++;
  for(let i=1;i<6;i++)F.name(F.capture(),`f000${i}.webp`,{stage:{pass:i+1}});
  await F.ready();
  const mark=F.capture();F.mark(mark,'test',new Float32Array(16));
  const marks=await F.drain();assert.equal(marks.length,1);assert.equal(marks[0].id,mark);
  assert.deepEqual(await sharp(path.join(out,'f0000.webp')).raw().toBuffer(),expected);
  assert.deepEqual(events[0].event,{stage:{pass:1},marks:{brush:3}});assert.deepEqual(Buffer.from(events[0].rgb),expected);
  assert.deepEqual(events.map(e=>e.event.stage.pass),[1,2,3,4,5,6]);
  assert(!calls.includes('opticalFrame'));assert(!calls.includes('framePort'));assert.equal(link.stats.opticalAsyncFrames,7);
  assert.deepEqual(await F.drain(),[]);
  sheet._layerVer=1;assert.equal(F.active,false);
 }finally{F.close();port.close();fs.rmSync(out,{recursive:true,force:true});}
});

test('a GPU frame failure rejects pending work instead of leaving drain blocked',async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'optical-error-'));let port;
 const link={stats:{},n:1,post(message){if(message.op==='opticalPort')port=message.port;else if(message.op==='opticalSnap')port.postMessage({error:'capture failed'});}};
 const F=createOpticalFramer({sheet:{_gpu:link},prepare:()=>new Float64Array(3),out,outW:1,outH:1,n:1,w:1,h:1,W2:1,SC:1,paperRGB:[255,255,255]});
 try{F.name(F.capture(),'f0000.webp');await assert.rejects(F.drain(),/capture failed/);}finally{await F.close();port.close();fs.rmSync(out,{recursive:true,force:true});}
});
