import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {createNativeOperationRecorder,verifyNativeMarkCoverage} from './native-operation-recorder.mjs';
import {applyNativeOperation} from '../../demos/lab/targets/film.js';
import {makePaper} from '../../src/media/paper.mjs';
import {createSheet,layersOf,dry,DEFAULTS} from '../../src/media/sheet.mjs';
import {createBrush,dip,stroke,recordMarks} from '../../src/media/brush.mjs';
import {renderLayers} from '../../src/media/km.mjs';
import {materialProfile,drawMaterial} from '../../src/paint/methods/material-profiles.mjs';
import {makeInkRes} from '../../src/paint/methods/ink-res.mjs';
import {drawFineMaterial} from '../../src/paint/methods/fine-material.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const dir=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'native-operations-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
async function reconstruct(directory){
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'operations.json')));assert.equal(manifest.complete,true);
 const rgb=new Uint8Array(manifest.width*manifest.height*3);let prior=null;
 for(const [index,event]of manifest.events.entries()){
  assert.equal(event.index,index);assert.equal(event.previousSHA256,prior);
  let decoded=null;if(event.file){const bytes=fs.readFileSync(path.join(directory,event.file));assert.equal(hash(bytes),event.payloadSHA256);decoded=await sharp(bytes).raw().toBuffer();}
  applyNativeOperation(rgb,manifest.width,manifest.height,event,decoded);prior=hash(rgb);assert.equal(prior,event.pixelSHA256);
 }
 return {manifest,rgb};
}
test('lossless native rectangles, unchanged events, final keyframe and ordered backpressure',async t=>{
 const directory=dir(t),width=64,height=48,writer=createNativeOperationRecorder({directory,width,height,diskFloor:0});
 const rgb=Buffer.alloc(width*height*3,241);writer.capture(rgb,{operation:'initial'});writer.capture(rgb,{operation:'unchanged'});
 for(let i=0;i<12;i++){rgb[i*33]=i;writer.capture(rgb,{operation:'mark',ordinal:i});}
 writer.finish(rgb);const {manifest,rgb:actual}=await reconstruct(directory);assert.deepEqual(Buffer.from(actual),rgb);assert.equal(manifest.events.length,15);assert.equal(manifest.events[1].file,null);assert.equal(manifest.events.at(-1).keyframe,true);const film=JSON.parse(fs.readFileSync(path.join(directory,'film.json')));assert.equal(film.operationCount,15);assert.equal(film.keyframes.at(-1).fraction,1);assert(manifest.events.slice(2,-1).some(e=>e.rectangle.width<width||e.rectangle.height<height));
 assert.throws(()=>writer.capture(rgb),/closed/);
});
test('invalid dimensions, existing output and capacity/floor errors fail loudly',t=>{
 const directory=dir(t);assert.throws(()=>createNativeOperationRecorder({directory,width:0,height:4}),/dimensions/);
 assert.throws(()=>createNativeOperationRecorder({directory,width:16,height:16,diskFloor:0,byteCap:1}),/cap/);
 const other=dir(t);assert.throws(()=>createNativeOperationRecorder({directory:other,width:16,height:16,diskFloor:Number.MAX_SAFE_INTEGER}),/floor/);
 const saved=dir(t),w=createNativeOperationRecorder({directory:saved,width:2,height:2,diskFloor:0});w.finish(Buffer.alloc(12));const before=fs.readFileSync(path.join(saved,'operations.json'));
 assert.throws(()=>createNativeOperationRecorder({directory:saved,width:2,height:2,diskFloor:0}),/already exists/);assert.deepEqual(fs.readFileSync(path.join(saved,'operations.json')),before);
});
test('abort preserves incomplete evidence and rectangle decoder rejects malformed input',t=>{
 const directory=dir(t),w=createNativeOperationRecorder({directory,width:2,height:2,diskFloor:0});w.capture(Buffer.alloc(12),{operation:'initial'});w.abort('strict material failure');const m=JSON.parse(fs.readFileSync(path.join(directory,'operations.json')));assert.equal(m.complete,false);assert.equal(m.events.length,1);assert.match(m.error,/material/);
 assert.throws(()=>applyNativeOperation(new Uint8Array(12),2,2,{rectangle:{x:1,y:0,width:2,height:1},encoding:'replace'},new Uint8Array(6)),/rectangle/);
});
test('actual brush, graphite, drying and layer observations preserve physical output exactly',async t=>{
 const width=32,height=24,pigments=[materialProfile('graphite-HB').pigment],directory=dir(t);
 function run(record){
  const sheet=createSheet(makePaper(width,height,{seed:7}),pigments),base=Buffer.alloc(width*height*3,248),view=()=>renderLayers(layersOf(sheet),pigments,base,width*height,1);
  const writer=record?createNativeOperationRecorder({directory,width,height,diskFloor:0}):null;
  const capture=operation=>writer?.capture(view(),{operation});capture('initial');
  const brush=createBrush({radius:2,flat:true,capacity:10,seed:9});dip(brush,{water:.7,conc:[.3]});stroke(brush,sheet,[{x:3,y:5,p:.6},{x:25,y:15,p:.8}],{upright:'sweep'});capture('brush');
  dry(sheet,30000,DEFAULTS,{levelMax:90,dt:14,analyticTail:true});capture('dry');
  drawMaterial(sheet,[{points:[{x:4,y:19,s:.5},{x:25,y:20,s:.6}]},{points:[{x:5,y:3,s:.6},{x:25,y:5,s:.7}]}],new Float32Array(width*height),width,height,{medium:'graphite-HB',mmPerCell:1,O:DEFAULTS,afterStroke:record?()=>capture('graphite'):undefined});capture('layer');writer?.finish(view());
  return {sheet,pixels:view()};
 }
 const off=run(false),on=run(true);assert.deepEqual(on.pixels,off.pixels);for(const k of ['W','s','G','P','D','layers'])assert.deepEqual(on.sheet[k],off.sheet[k],k);
 const {manifest,rgb}=await reconstruct(directory);assert.deepEqual(Buffer.from(rgb),Buffer.from(on.pixels));assert.deepEqual(manifest.events.map(e=>e.operation),['initial','brush','dry','graphite','graphite','layer','final']);
});
test('fine ink captures each deposited gesture with fresh native rendering and unchanged physical state',async t=>{
 const w=30,h=20,pigments=[materialProfile('drawing-ink').pigment],directory=dir(t);
 function run(record){
  const main=createSheet(makePaper(w,h,{seed:9}),pigments),fine=makeInkRes({N:2,W2:w,H2:h,paperOpts:{seed:9},pigments,main});
  for(let i=0;i<main.n;i++){main.W[i]=.03;main.s[i]=.03;main.M[i]=main.ever[i]=1;}
  const writer=record?createNativeOperationRecorder({directory,width:w*2,height:h*2,diskFloor:0}):null,view=()=>fine.compose(renderLayers(layersOf(main),pigments,Buffer.alloc(w*h*3,255),w*h,1));
  writer?.capture(view(),{operation:'initial'});
  drawFineMaterial(fine,[7,13].map(y=>({points:[{x:3,y,s:.6,nw:.8},{x:22,y,s:.6,nw:.8}]})),{w,h,medium:'drawing-ink',sourceInk:true,mmPerCell:.25,O:DEFAULTS,...(record?{afterStroke:()=>writer.capture(view(),{operation:'ink'}),afterDry:()=>writer.capture(view(),{operation:'drawing-dry'})}:{})});
  writer?.finish(view());return {main,fine,pixels:view()};
 }
 const off=run(false),on=run(true);assert.deepEqual(on.pixels,off.pixels);for(const k of ['W','s','G','P','D','layers']){assert.deepEqual(on.main[k],off.main[k]);assert.deepEqual(on.fine.fine[k],off.fine.fine[k]);}
 const {manifest,rgb}=await reconstruct(directory);assert.deepEqual(Buffer.from(rgb),Buffer.from(on.pixels));assert.deepEqual(manifest.events.map(e=>e.operation),['initial','drawing-dry','ink','drawing-dry','ink','final']);const inkEvents=manifest.events.filter(e=>e.operation==='ink');assert.notEqual(inkEvents[0].pixelSHA256,inkEvents[1].pixelSHA256);
});

test('GPU recording parity through brush, fine carry, drawing dry and graphite', {skip:process.platform!=='darwin',timeout:120000},async t=>{
 const {attachGpu}=await import('../../src/media/gpu/link.mjs');
 const {coherent,step}=await import('../../src/media/sheet.mjs');
 const width=48,height=32,pigments=[materialProfile('graphite-HB').pigment,materialProfile('drawing-ink').pigment],directory=dir(t);
 function run(record){
  const sheet=createSheet(makePaper(width,height,{seed:15}),pigments),info=attachGpu(sheet,DEFAULTS,{mode:'on',log:()=>{}});assert.equal(info.backend,'gpu');assert.equal(info.fallback,false);
  const fine=makeInkRes({N:2,W2:width,H2:height,paperOpts:{seed:15},pigments,main:sheet,inkAt:1});
  const view=()=>fine.compose(renderLayers(layersOf(sheet),pigments,Buffer.alloc(width*height*3,248),sheet.n,1));
  const writer=record?createNativeOperationRecorder({directory,width:width*2,height:height*2,diskFloor:21*1024**3}):null;
  const capture=operation=>writer?.capture(view(),{operation});
  if(record)for(const name of ['wet','carry','settle']){const original=fine[name];fine[name]=(...args)=>{const value=original(...args);capture('ink-'+name);return value;};}
  try{
   capture('initial');const brush=createBrush({radius:3,flat:true,capacity:10,seed:17});dip(brush,{water:.7,conc:[.3,0]});stroke(brush,sheet,[{x:4,y:6,p:.6},{x:39,y:17,p:.8}],{upright:'sweep'});capture('brush');step(sheet,DEFAULTS);
   drawFineMaterial(fine,[10,17].map(y=>({points:[{x:4,y,s:.6,nw:.8},{x:39,y,s:.6,nw:.8}]})),{w:width,h:height,medium:'drawing-ink',sourceInk:true,mmPerCell:.25,O:DEFAULTS,...(record?{afterStroke:()=>capture('ink'),afterDry:()=>capture('drawing-dry')}:{})});
   dry(sheet,30000,DEFAULTS,{levelMax:90,dt:14,analyticTail:true});capture('dry');fine.settle();
   drawMaterial(sheet,[{points:[{x:5,y:25,s:.6},{x:38,y:26,s:.7}]}],new Float32Array(sheet.n),width,height,{medium:'graphite-HB',mmPerCell:1,O:DEFAULTS,...(record?{afterStroke:()=>capture('graphite'),afterDry:()=>capture('drawing-dry')}:{})});capture('layer');
   const pixels=view();writer?.finish(pixels);coherent(sheet);return {pixels,fields:Object.fromEntries(['W','s','G','P','D','layers'].map(k=>[k,structuredClone(sheet[k])])),fineFields:Object.fromEntries(['W','s','G','P','D','layers'].map(k=>[k,structuredClone(fine.fine[k])]))};
  }finally{sheet._gpu.close();}
 }
 const off=run(false),on=run(true);assert.deepEqual(on.pixels,off.pixels);assert.deepEqual(on.fields,off.fields);assert.deepEqual(on.fineFields,off.fineFields);
 const {manifest,rgb}=await reconstruct(directory);assert.deepEqual(Buffer.from(rgb),Buffer.from(on.pixels));const kinds=manifest.events.map(e=>e.operation);for(const kind of ['brush','ink','ink-carry','ink-wet','ink-settle','drawing-dry','graphite','dry','layer','final'])assert(kinds.includes(kind),kind);
});

test('completion refuses any physical tape mark absent from native observations',()=>{
 const tape=[{k:'s'},{k:'P'},{k:'g'},{k:'y'}];assert.deepEqual(verifyNativeMarkCoverage(tape,{brush:1,ink:1,graphite:1}),{brush:1,ink:1,graphite:1});
 assert.throws(()=>verifyNativeMarkCoverage(tape,{brush:0,ink:1,graphite:1}),/Incomplete native recording: brush/);
 assert.throws(()=>verifyNativeMarkCoverage(tape,{brush:1,ink:1,graphite:2}),/Incomplete native recording: graphite/);
});

test('saved native prefix resumes complete chronology, verifies payloads and preserves final bytes',async t=>{
 const directory=dir(t),snapshot=path.join(dir(t),'prefix'),out=dir(t),rgb=Buffer.alloc(96,240);
 const a=createNativeOperationRecorder({directory,width:8,height:4,diskFloor:0});a.capture(rgb,{operation:'initial'});rgb[10]=45;a.capture(rgb,{operation:'ink'});a.checkpoint(snapshot);a.abort('saved boundary');
 const b=createNativeOperationRecorder({directory:out,width:8,height:4,diskFloor:0,resumeFrom:snapshot});rgb[42]=56;b.capture(rgb,{operation:'brush'});b.finish(rgb);
 const result=await reconstruct(out);assert.deepEqual(Buffer.from(result.rgb),rgb);assert.deepEqual(result.manifest.events.map(e=>e.operation),['initial','ink','brush','final']);assert(result.manifest.events.every((e,i,a)=>!i||e.elapsedMs>=a[i-1].elapsedMs));
 fs.writeFileSync(path.join(snapshot,'resume-frame.png'),Buffer.from('bad'));
 assert.throws(()=>createNativeOperationRecorder({directory:dir(t),width:8,height:4,diskFloor:0,resumeFrom:snapshot}),/Native recording failed/);
});


test('refill boundaries capture every physical ink segment without changing gesture audits or state',async t=>{
 const {attachGpu}=await import('../../src/media/gpu/link.mjs');
 const {coherent}=await import('../../src/media/sheet.mjs');
 const w=80,h=30,pigments=[materialProfile('drawing-ink').pigment],directory=dir(t);
 function run(record){
  const tape=recordMarks(true),main=createSheet(makePaper(w,h,{seed:19}),pigments);main._tape=true;
  if(process.platform==='darwin'){const info=attachGpu(main,DEFAULTS,{mode:'on',log:()=>{}});assert.equal(info.backend,'gpu');assert.equal(info.fallback,false);}
  const fine=makeInkRes({N:2,W2:w,H2:h,paperOpts:{seed:19},pigments,main}),audit=[],segments=[],gestureCallbacks=[];
  const view=()=>fine.compose(renderLayers(layersOf(main),pigments,Buffer.alloc(w*h*3,255),w*h,1));
  const writer=record?createNativeOperationRecorder({directory,width:w*2,height:h*2,diskFloor:0}):null;
  writer?.capture(view(),{operation:'initial'});
  try{
   drawFineMaterial(fine,[{points:[{x:3,y:12,s:.6,nw:.8},{x:74,y:12,s:.6,nw:.8}]}],{w,h,medium:'drawing-ink',sourceInk:true,mmPerCell:.25,O:DEFAULTS,pen:{reservoir:2},audit,afterStroke:e=>gestureCallbacks.push(e.reloads),...(record?{afterSegment:e=>{segments.push({reason:e.reason,pixels:Buffer.from(view())});writer.capture(view(),{operation:'ink',reason:e.reason});}}:{})});
   const pixels=Buffer.from(view());writer?.finish(pixels);coherent(main);
   return {pixels,tape:structuredClone(tape),audit,segments,gestureCallbacks,fields:Object.fromEntries(['W','s','G','P','D','layers'].map(k=>[k,structuredClone(fine.fine[k])])),mainFields:Object.fromEntries(['W','s','G','P','D','layers'].map(k=>[k,structuredClone(main[k])]))};
  }finally{recordMarks(false);main._gpu?.close();}
 }
 const off=run(false),on=run(true);assert.deepEqual(on.pixels,off.pixels);assert.deepEqual(on.tape,off.tape);assert.deepEqual(on.fields,off.fields);assert.deepEqual(on.mainFields,off.mainFields);assert.deepEqual(on.audit,off.audit);assert.deepEqual(on.gestureCallbacks,off.gestureCallbacks);assert.equal(on.gestureCallbacks.length,1);
 const penMarks=on.tape.filter(m=>m.k==='P');assert(penMarks.length>1,'fixture must refill inside one gesture');assert.equal(new Set(penMarks.map(m=>m.gestureId)).size,1);assert.equal(on.segments.length,penMarks.length);assert.equal(on.segments.at(-1).reason,'gesture-end');assert(on.segments.slice(0,-1).every(e=>e.reason==='refill'));
 assert.equal(on.audit[0].reloadsWithinStroke,penMarks.length-1);for(let i=1;i<on.segments.length;i++)assert.notEqual(hash(on.segments[i-1].pixels),hash(on.segments[i].pixels),'each completed segment must deposit visible ink');
 verifyNativeMarkCoverage(on.tape,{ink:on.segments.length,brush:0,graphite:0});
 const {manifest,rgb}=await reconstruct(directory);assert.deepEqual(Buffer.from(rgb),on.pixels);assert.deepEqual(manifest.events.filter(e=>e.operation==='ink').map(e=>e.pixelSHA256),on.segments.map(e=>hash(e.pixels)));
});
