#!/usr/bin/env node
// Portable physical checkpoints, made with the same executor as the browser.
// Rebuild after changing the live executor or simulator. No image becomes pigment.
// node tools/lab/build-live-checkpoints.mjs [--gpu] [--resume]
// --resume reuses completed checkpoints; omit it after a simulator change.
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import sharp from 'sharp';
import {runTape,SHEET_FIELDS} from '../../docs/lab/worker/live-tape.js';
import {encodeState,decodeState} from '../../docs/lab/worker/history.js';
import {makePaper} from '../../docs/lab/media/paper.js';
import {createSheet,step,DEFAULTS} from '../../docs/lab/media/sheet.js';
import {paperReflectance} from '../../docs/lab/media/papers.js';
import {layerRT} from '../../docs/lab/media/km.js';
const root=new URL('../../docs/lab/',import.meta.url),manifestURL=new URL('examples/recorded.json',root);
const useGpu=process.argv.includes('--gpu');
let gpuFactory;if(useGpu){const webgpu=await import('webgpu');Object.assign(globalThis,webgpu.globals);const gpuHandle=webgpu.create([]);gpuFactory=()=>gpuHandle;}
const {GpuPhysics}=await import('../../docs/lab/gpu/gpu-physics.js');
const manifest=JSON.parse(await fs.readFile(manifestURL));
function pixels(s){const R=paperReflectance(s.paper,'cold',60),n=s.n;
 for(const layer of [...s.layers,s.G.map((g,k)=>Float32Array.from(g,(v,i)=>v+s.D[k][i]+s.P[k][i]))])for(let i=0;i<n;i++){
  const mass=layer.reduce((v,p)=>v+p[i],0);if(mass<1e-7)continue;
  for(let c=0;c<3;c++){let K=0,S=0;for(let k=0;k<s.K;k++){K+=layer[k][i]/mass*s.pigments[k].K[c];S+=layer[k][i]/mass*s.pigments[k].S[c];}const [r,t]=layerRT(K,S,mass),b=R[i*3+c];R[i*3+c]=r+t*t*b/(1-r*b);}
 }
 const rgba=new Uint8Array(n*4);for(let i=0;i<n;i++){const sheen=s.W[i]>.02?1-Math.min(.025,s.W[i]*.03):1,reflection=Math.min(.025,Math.max(0,s.W[i])*.06);for(let c=0;c<3;c++)rgba[i*4+c]=Math.max(0,Math.min(255,(R[i*3+c]*sheen+(c-1)*reflection)*255));rgba[i*4+3]=255;}return rgba;
}
for(const ex of manifest.examples){ex.checkpoints={};for(const limit of [250,2500]){
 const tape=JSON.parse(gunzipSync(await fs.readFile(new URL(ex.live[limit],root))));
 const w=360,h=Math.round(w*tape.h/tape.w),paper={...makePaper(w,h,{...tape.paper,scale:Math.max(.2,(tape.paper?.scale||1)*w/tape.w)}),mmPerCell:25.4/60},sheet=createSheet(paper,tape.pigments);
 const base=paperReflectance(paper,'cold',60),graphite=new Float32Array(sheet.n);
 let phys=null;
 const stops=new Map([.1,.25,.5,.75,.9,1].map(f=>[Math.floor(tape.strokeCount*f),f])),list=[];
 let resume=null;
 if(process.argv.includes('--resume'))for(const [done,fraction]of stops){const prefix=`examples/${ex.id}/checkpoints/${limit}-${Math.round(fraction*100)}`;try{const saved=await decodeState(await fs.readFile(new URL(prefix+'.bin.gz',root)));await fs.access(new URL(prefix+'.webp',root));resume=saved;list.push({fraction,done,state:prefix+'.bin.gz',image:prefix+'.webp'});}catch{break;}}
 if(resume){Object.assign(sheet,resume.fields);sheet.wetDirty=1;console.log('resume',ex.id,limit,resume.tape.done);}
 if(useGpu&&resume?.tape.done!==tape.strokeCount)phys=await GpuPhysics.create(tape.pigments,DEFAULTS,gpuFactory());
 if(phys)await phys.load(sheet,base,graphite);
 await runTape(tape,{sheet:()=>sheet,ready:async()=>true,begin:()=>{},end:()=>{},touch:async(p,r,fn)=>{if(!phys)return fn();const rect=phys.rect(p,r);await phys.ensureFresh(sheet,rect);fn();phys.up(sheet,rect);},present:async()=>{},progress:async()=>{},mutate:async fn=>{if(phys)await phys.syncAll(sheet);fn();if(phys)await phys.load(sheet,base,graphite);},flow:async(dry,m)=>{if(phys){phys.setOptions({...DEFAULTS,dt:dry?2:.3});await phys.step(dry?Math.min(m?.m||30,90):1);return;}for(let i=0;i<(dry?Math.min(m?.m||30,90):1);i++)step(sheet,{...DEFAULTS,dt:dry?2:.3});},checkpoint:async(done,state)=>{
  if(!stops.has(done))return;const fraction=stops.get(done),prefix=`examples/${ex.id}/checkpoints/${limit}-${Math.round(fraction*100)}`;
  await fs.mkdir(new URL(`examples/${ex.id}/checkpoints/`,root),{recursive:true});
  if(phys)await phys.syncAll(sheet);
  for(const a of [sheet.W,sheet.s,...sheet.G,...sheet.P,...sheet.D,...sheet.layers.flat()])if(!a.every(Number.isFinite))throw Error(`${ex.id} ${limit}/${done}: invalid physical checkpoint`);
  const fields=Object.fromEntries(SHEET_FIELDS.map(k=>[k,sheet[k]]));
  await fs.writeFile(new URL(prefix+'.bin.gz',root),await encodeState({version:1,w,h,fields,tape:state()}));
  await sharp(pixels(sheet),{raw:{width:w,height:h,channels:4}}).webp({quality:86}).toFile(new URL(prefix+'.webp',root).pathname);
  list.push({fraction,done,state:prefix+'.bin.gz',image:prefix+'.webp'});console.log(ex.id,limit,done);
 }},resume?.tape);
 phys?.destroy();ex.checkpoints[limit]=list;
}}
await fs.writeFile(manifestURL,JSON.stringify(manifest,null,2)+'\n');
