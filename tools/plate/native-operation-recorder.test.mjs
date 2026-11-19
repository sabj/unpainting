import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {createNativeOperationRecorder,verifyNativeMarkCoverage} from './native-operation-recorder.mjs';
import {applyNativeOperation,playFilm} from '../../demos/lab/targets/film.js';
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
  const writer=record?createNativeOperationRecorder({directory,width:width*2,height:height*2,diskFloor:10*1024**3}):null;
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

for(const demand of ['0','1'])test('main GPU refill frames read current ink and flowed layers, not the version memo (demand '+demand+')', {skip:process.platform!=='darwin',timeout:120000},async t=>{
 const {attachGpu}=await import('../../src/media/gpu/link.mjs'),{coherent,step}=await import('../../src/media/sheet.mjs');
 const priorDemand=process.env.GPU_DEMAND_READBACK;process.env.GPU_DEMAND_READBACK=demand;t.after(()=>{if(priorDemand===undefined)delete process.env.GPU_DEMAND_READBACK;else process.env.GPU_DEMAND_READBACK=priorDemand;});
 const {readActiveStroke}=await import('./sheet.mjs'),{renderSheet}=await import('../../src/media/render-cache.mjs');
 const source=fs.readFileSync(new URL('./sheet.mjs',import.meta.url),'utf8');
 const raw=source.slice(source.indexOf('const renderRaw = () => {'),source.indexOf('const render = () =>'));
 const w=100,h=60,pigments=[materialProfile('drawing-ink').pigment],base=Buffer.alloc(w*h*3,250),directory=dir(t);
 function run(record){
  const main=createSheet(makePaper(w,h,{seed:23}),pigments);attachGpu(main,DEFAULTS,{mode:'on',log:()=>{}});
  const ctx={sheet:main,RENDER_REUSED:0},view=new Function('ctx','renderSheet','readActiveStroke','SHEET_PIGS','base','N2','NATIVE_PAINT_MODE','SPEED_GPU_OPTICS','WETRENDER','num',raw+';return renderRaw;')(ctx,renderSheet,readActiveStroke,pigments,base,w*h,{mode:'strict'},false,false,()=>0);
  let writer=null;
  try{
   const brush=createBrush({radius:8,flat:true,capacity:40,seed:9});dip(brush,{water:.7,conc:[.4]});stroke(brush,main,[{x:8,y:40,p:.6},{x:90,y:40,p:.8}],{upright:'sweep'});
   dry(main,30000,DEFAULTS,{levelMax:90,dt:14,analyticTail:true});dip(brush,{water:.7,conc:[.1]});stroke(brush,main,[{x:8,y:40,p:.6},{x:90,y:40,p:.8}],{upright:'sweep'});step(main,DEFAULTS);
   const tape=recordMarks(true);main._tape=true;
   writer=record?createNativeOperationRecorder({directory,width:w,height:h,diskFloor:10*1024**3}):null;writer?.capture(view(),{operation:'initial'});
   const events=[],audit=[];let gestures=0;
   drawMaterial(main,[{points:[{x:4,y:12,s:.6,nw:.8},{x:94,y:12,s:.6,nw:.8}]}],new Float32Array(w*h),w,h,{medium:'drawing-ink',mmPerCell:.25,O:DEFAULTS,pen:{reservoir:.5},dryInk:false,audit,afterStroke:()=>gestures++,...(record?{afterSegment:e=>{const topStale=main._gpu.topStale,version=main._gpu.version,rgb=view(),reference=renderLayers(layersOf(main),pigments,base,w*h,1);assert.equal(hash(rgb),hash(reference),'production frame equals current physical pigment');assert.equal(main._gpu.version,version,'observation cannot advance GPU physics');events.push({version,topStale,hash:hash(rgb),reason:e.reason});writer.capture(rgb,{operation:'ink',reason:e.reason});}}:{})});
   const pixels=Buffer.from(view());writer?.finish(pixels);coherent(main);
   return {pixels,tape:structuredClone(tape),audit,gestures,events,fields:Object.fromEntries(['W','s','G','P','D','layers'].map(k=>[k,structuredClone(main[k])]))};
  }finally{recordMarks(false);main._gpu.close();}
 }
 const off=run(false),on=run(true);assert.deepEqual(on.pixels,off.pixels);assert.deepEqual(on.fields,off.fields);assert.deepEqual(on.tape,off.tape);assert.deepEqual(on.audit,off.audit);assert.equal(on.gestures,1);
 assert(on.events.length>3);assert(on.events.some((e,i,a)=>i&&e.version===a[i-1].version&&e.hash!==a[i-1].hash),'two real segments between GPU flow steps must have different frames');
 assert(on.events.some(e=>e.topStale),'fixture must refresh a GPU-changed dried layer');
 assert(new Set(on.events.map(e=>e.version)).size>2,'fixture must cross GPU flow boundaries');
 verifyNativeMarkCoverage(on.tape,{ink:on.events.length,brush:0,graphite:0});const {rgb}=await reconstruct(directory);assert.deepEqual(Buffer.from(rgb),on.pixels);
});

test('empty first refill segment remains an explicit unchanged native event',async t=>{
 const w=30,h=20,pigments=[materialProfile('drawing-ink').pigment],sheet=createSheet(makePaper(w,h,{seed:4}),pigments),directory=dir(t),tape=recordMarks(true);sheet._tape=true;
 const view=()=>renderLayers(layersOf(sheet),pigments,Buffer.alloc(w*h*3,255),w*h,1),writer=createNativeOperationRecorder({directory,width:w,height:h,diskFloor:0});
 writer.capture(view(),{operation:'initial'});let segments=0,gestures=0;
 try{
  drawMaterial(sheet,[{points:[{x:3,y:10,s:.6},{x:25,y:10,s:.6}]}],new Float32Array(w*h),w,h,{medium:'drawing-ink',mmPerCell:.25,sourceInk:true,O:DEFAULTS,beforeStroke:({pen})=>{pen.ink=0;pen.drop=0;},afterSegment:e=>{segments++;writer.capture(view(),{operation:'ink',reason:e.reason});},afterStroke:()=>gestures++});
  writer.finish(view());verifyNativeMarkCoverage(tape,{ink:segments,brush:0,graphite:0});assert.equal(gestures,1);assert.equal(segments,2);
  const {manifest}=await reconstruct(directory);assert.equal(manifest.events[1].reason,'refill');assert.equal(manifest.events[1].file,null);assert.equal(manifest.events[1].pixelSHA256,manifest.events[0].pixelSHA256);assert.notEqual(manifest.events[2].pixelSHA256,manifest.events[1].pixelSHA256);
 }finally{recordMarks(false);}
});

test('native player awaits each exact native surface and rejects invalid seeks before fetching',async t=>{
 const directory=dir(t),width=8,height=4,rgb=Buffer.alloc(width*height*3,240),writer=createNativeOperationRecorder({directory,width,height,diskFloor:0});
 writer.capture(rgb,{operation:'initial'});writer.capture(rgb,{operation:'unchanged'});rgb[9]=25;writer.capture(rgb,{operation:'ink'});writer.finish(rgb);
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'operations.json'))),saved=new Map(['fetch','OffscreenCanvas','ImageData','createImageBitmap'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 t.after(()=>{for(const [k,d]of saved)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];});
 class Canvas{
  constructor(w,h){this.width=w;this.height=h;this.pixels=new Uint8ClampedArray(w*h*4);}
  getContext(){const c=this;return {putImageData(image){c.pixels=new Uint8ClampedArray(image.data);},getImageData(){return {data:new Uint8ClampedArray(c.pixels)};},fillRect(){},drawImage(image){c.pixels=new Uint8ClampedArray(image.pixels??image.data);}};}
 }
 let requests=0;
 globalThis.OffscreenCanvas=Canvas;globalThis.ImageData=class{constructor(data,w,h){this.data=data;this.width=w;this.height=h;}};
 globalThis.createImageBitmap=async blob=>{const d=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {width:d.info.width,height:d.info.height,data:d.data,close(){}};};
 globalThis.fetch=async url=>{requests++;const name=path.basename(new URL(url).pathname);if(name==='operations.json')return {ok:true,json:async()=>manifest};const b=fs.readFileSync(path.join(directory,name));return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
 const film={operations:'https://fixture.invalid/operations.json'},options={progress:()=>{},skipped:()=>true,alive:()=>true};
 const surfaceRGB=surface=>{const a=surface.getContext('2d').getImageData().data,b=Buffer.alloc(a.length/4*3);for(let i=0,j=0;i<a.length;i+=4,j+=3){b[j]=a[i];b[j+1]=a[i+1];b[j+2]=a[i+2];}return b;};
 const order=[];
 const result=await playFilm(film,new Canvas(40,30),40,30,{...options,onFrame:async(surface,event)=>{
  order.push('start'+event.index);assert.equal(surface.width,width);assert.equal(surface.height,height);assert.equal(hash(surfaceRGB(surface)),event.pixelSHA256);
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(hash(surfaceRGB(surface)),event.pixelSHA256,'surface cannot advance before consumer finishes');order.push('end'+event.index);
 }});
 assert.deepEqual(order,manifest.events.flatMap(e=>['start'+e.index,'end'+e.index]));assert.deepEqual(surfaceRGB(result.final),rgb);
 const without=await playFilm(film,new Canvas(40,30),40,30,options);assert.deepEqual(surfaceRGB(without.final),rgb);
 for(const seek of [0,.5,1]){const seen=[];await playFilm(film,new Canvas(40,30),40,30,{...options,seek,onFrame:(_,e)=>seen.push(e.index)});assert.equal(seen[0],Math.floor(seek*(manifest.events.length-1)));assert.equal(seen.at(-1),manifest.events.length-1);}
 const before=requests;for(const seek of [NaN,Infinity,-Infinity,-.1,1.1])await assert.rejects(()=>playFilm(film,null,40,30,{...options,seek}),/seek must be finite/);assert.equal(requests,before);
 let rejected=0;await assert.rejects(()=>playFilm(film,new Canvas(40,30),40,30,{...options,onFrame:async()=>{rejected++;throw Error('consumer failed');}}),/consumer failed/);assert.equal(rejected,1);
});
