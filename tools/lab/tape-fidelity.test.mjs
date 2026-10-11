import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrush,dip,stroke,recordMarks,BRUSHES,BRUSHOPTS,PENS,PENOPTS} from '../../docs/lab/media/brush.js';
import {tapeSheet,tapeFlow,tapePixels,tapeRenderBase} from '../../docs/lab/worker/tape-sheet.js';
import {tapeSheet as recordSheet,step,dry,DEFAULTS,liftResist} from '../../docs/lab/media/sheet.js';
import {pencilDraw} from '../../docs/lab/media/graphite.js';
import {runTape} from '../../docs/lab/worker/live-tape.js';
import {PIGMENTS} from '../../docs/lab/media/pigments.js';
test('complete tape reproduces native brush, graphite, within-stroke flows and fixed dry layers',async()=>{
 const t={version:2,w:48,h:32,scale:10,paper:{seed:9,mmPerCell:.8,coldPress:{mmPerCell:.8}},paperRGB:[250,248,240],paperShade:.04,pigments:[PIGMENTS[5]],opts:{...DEFAULTS,gran:.25,fixedBed:1}};
 const native=tapeSheet(t);native._tape=1;const marks=recordMarks(true);recordSheet(marks);
 const b=createBrush({radius:3.237,flat:true,capacity:10,seed:7});dip(b,{water:.72,conc:[.371294]});
 stroke(b,native,[{x:4.231,y:10.03,p:.634},{x:35.822,y:18.72,p:.785}],{upright:'sweep',spacing:1.1,between:n=>{if(n%8===0)step(native,t.opts);}});
 pencilDraw(native,[{points:[{x:10,y:24,s:.24,nw:.78},{x:38,y:27,s:.3,nw:.5}]}],0,{amount:.6,width:.9,usePointWidths:true});
 dry(native,30000,t.opts,{levelMax:90,dt:14,analyticTail:true});
 Object.assign(t,{marks,brushes:[...BRUSHES],brushOpts:[...BRUSHOPTS],pens:[...PENS],penOpts:[...PENOPTS],strokeCount:2});
 recordMarks(false);recordSheet(null);
 const replay=tapeSheet(t);let finalIndex;
 await runTape(t,{sheet:()=>replay,ready:async()=>true,begin:()=>{},end:()=>{},touch:async(p,r,fn)=>fn(),present:()=>{},progress:()=>{},mutate:async fn=>fn(),flow:async(d,m)=>tapeFlow(t,replay,d,m),finished:(done,state)=>{finalIndex=state().index;}});
 assert.equal(finalIndex,marks.length,'100% includes the trailing dry');
 assert.deepEqual(tapePixels(t,replay),tapePixels(t,native));
 for(const key of ['W','s','G','D','P','layers'])assert.deepEqual(replay[key],native[key],key);
});

test('native checkpoint resumes an unlifted, partly depleted brush without resetting its contact history',async()=>{
 const {encodeState,decodeState}=await import('../../docs/lab/worker/history.js');
 const {SHEET_FIELDS}=await import('../../docs/lab/worker/live-tape.js');
 const tape={version:2,w:48,h:32,scale:10,paper:{seed:9},pigments:[PIGMENTS[5]],brushes:[0],brushOpts:[{radius:3,flat:true,capacity:3,variety:.8,seed:19}],pens:[],penOpts:[],strokeCount:2,marks:[{k:'d',b:0,w:.6,c:[.4]},{k:'s',b:0,lf:0,points:[{x:4,y:10,p:.6},{x:21,y:16,p:.7}]},{k:'s',b:0,points:[{x:21,y:16,p:.7},{x:39,y:21,p:.3}]},{k:'y',m:30000,lm:90,dt:14,at:true}]};
 const api=s=>({sheet:()=>s,ready:async()=>true,begin:()=>{},end:()=>{},touch:async(p,r,fn)=>fn(),present:()=>{},progress:()=>{},mutate:async fn=>fn(),flow:async(d,m)=>tapeFlow(tape,s,d,m)});
 const a=tapeSheet(tape);let bytes;
 await runTape(tape,{...api(a),checkpoint:async(done,state)=>{if(done===1)bytes=await encodeState({fields:Object.fromEntries(SHEET_FIELDS.map(k=>[k,a[k]])),tape:state()});}});
 const b=tapeSheet(tape),saved=await decodeState(bytes);Object.assign(b,saved.fields);b.wetDirty=1;
 await runTape(tape,api(b),saved.tape);
 assert.deepEqual(tapePixels(tape,b),tapePixels(tape,a));
 assert.deepEqual(b.layers,a.layers);
});

test('Live fixed-bed cache agrees with reference physics through glazes, rewetting and film removal',()=>{
 const t={w:48,h:32,paper:{seed:13},pigments:[PIGMENTS[2],PIGMENTS[5]],opts:{...DEFAULTS,fixedBed:1,slideFill:2}};
 const reference=tapeSheet(t),live=tapeSheet(t);
 for(const s of [reference,live]){
  s.layers=Array.from({length:24},(_,l)=>s.G.map((_,k)=>Float32Array.from({length:s.n},(_,i)=>(i+l+k)%9===0?0:((i*13+l*7+k)%31)*.00037)));
  s.resist=Uint8Array.from({length:s.n},(_,i)=>i%17===0?1:0);s.resistStrength=new Float32Array(s.n).fill(.4);s.resistFrom=0;
 }
 for(let pass=0;pass<3;pass++){
  for(const s of [reference,live])for(let i=0;i<s.n;i++){s.W[i]=.15;s.s[i]=.12;s.M[i]=s.ever[i]=1;s.G[pass%2][i]=.03;s.wetDirty=1;}
  for(let j=0;j<12;j++){step(reference,t.opts);tapeFlow(t,live,false);}
  dry(reference,10000,t.opts,{level:20,levelMax:40,dt:14,analyticTail:true});
  tapeFlow(t,live,true,{m:10000,l:20,lm:40,dt:14,at:true});
  for(const key of ['W','s','G','P','D','layers'])assert.deepEqual(live[key],reference[key],`${key}, glaze ${pass}`);
  assert.deepEqual(tapePixels(t,live),tapePixels(t,reference));
  if(pass===1){liftResist(reference);liftResist(live);}
 }
});

test('Live optical cache follows newly fixed layers, lifted film and a changed paper base',()=>{
 const s={K:1,layers:[[new Float32Array([.2,.1])],[new Float32Array([.3,.4])]]};
 let base=new Float32Array([.98,.97]);
 const glaze=(rgb,L)=>{for(let i=0;i<rgb.length;i++)rgb[i]=rgb[i]*(1-L[0][i])+.1*L[0][i];};
 const check=()=>{const expected=base.slice();for(const L of s.layers.slice(0,-1))glaze(expected,L);assert.deepEqual(tapeRenderBase(s,base,glaze),expected);};
 check();s.layers.at(-1)[0][0]=.5;check();
 s.layers.push([new Float32Array([.1,.2])]);check();
 s.layers[0][0][0]=0;s._layerVer=1;check();
 base=new Float32Array([.8,.7]);check();
 s.layers.shift();check();
});
