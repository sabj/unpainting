#!/usr/bin/env node
// Portable physical checkpoints from complete runs, using the browser executor.
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import sharp from 'sharp';
import {runTape,SHEET_FIELDS} from '../../docs/lab/worker/live-tape.js';
import {encodeState} from '../../docs/lab/worker/history.js';
import {tapeSheet,tapePixels,tapeFlow} from '../../docs/lab/worker/tape-sheet.js';
const root=new URL('../../docs/lab/',import.meta.url),manifestURL=new URL('examples/recorded.json',root);
const manifest=JSON.parse(await fs.readFile(manifestURL));
const ri=process.argv.indexOf('--runs'),runs=ri<0?null:process.argv.slice(ri+1,ri+5);
if(runs&&runs.length!==4)throw Error('--runs requires four painter output directories');
for(const ex of manifest.examples){ex.checkpoints={};for(const limit of [250,2500]){
 const tape=JSON.parse(gunzipSync(await fs.readFile(new URL(ex.live[limit],root))));
 if(tape.version<2||!tape.complete)throw Error('Checkpoints require a complete budgeted run');
 const sheet=tapeSheet(tape),{w,h}=sheet;
 const stops=new Map([.1,.25,.5,.75,.9,1].map(f=>[Math.floor(tape.strokeCount*f),f])),list=[];
 const save=async(done,state,final=false)=>{
  if(!stops.has(done)||done===tape.strokeCount&&!final)return;
  const fraction=stops.get(done),prefix=`examples/${ex.id}/checkpoints/${limit}-${Math.round(fraction*100)}`;
  await fs.mkdir(new URL(`examples/${ex.id}/checkpoints/`,root),{recursive:true});
  for(const a of [sheet.W,sheet.s,...sheet.G,...sheet.P,...sheet.D,...sheet.layers.flat()])if(!a.every(Number.isFinite))throw Error(`${ex.id} ${limit}/${done}: invalid physical checkpoint`);
  const fields=Object.fromEntries(SHEET_FIELDS.map(k=>[k,sheet[k]]));
  await fs.writeFile(new URL(prefix+'.bin.gz',root),await encodeState({version:2,w,h,fields,tape:state()}));
  await sharp(tapePixels(tape,sheet),{raw:{width:w,height:h,channels:3}}).webp({lossless:true}).toFile(new URL(prefix+'.webp',root).pathname);
  list.push({fraction,done,state:prefix+'.bin.gz',image:prefix+'.webp'});console.log(ex.id,limit,done);
 };
 await runTape(tape,{sheet:()=>sheet,ready:async()=>true,begin:()=>{},end:()=>{},touch:async(p,r,fn)=>fn(),present:async()=>{},progress:async()=>{},mutate:async fn=>fn(),flow:async(dry,m)=>tapeFlow(tape,sheet,dry,m),checkpoint:save,finished:(done,state)=>save(done,state,true)});
 ex.checkpoints[limit]=list;
 if(runs){
  const run=runs[manifest.examples.indexOf(ex)*2+(limit===2500?1:0)],prefix=`examples/${ex.id}/studies/${limit}`;
  await fs.mkdir(new URL(prefix+'/',root),{recursive:true});
  const expected=await sharp(run+'/painting.png').removeAlpha().raw().toBuffer(),pixels=tapePixels(tape,sheet);
  if(expected.length!==pixels.length)throw Error('Native comparison dimensions differ');
  let sum=0,max=0;for(let i=0;i<pixels.length;i++){const d=Math.abs(pixels[i]-expected[i]);sum+=d;max=Math.max(max,d);}
  const native=await sharp(expected,{raw:{width:w,height:h,channels:3}}).png().toBuffer(),live=await sharp(pixels,{raw:{width:w,height:h,channels:3}}).png().toBuffer();
  await fs.writeFile(new URL(prefix+'/painting.png',root),native);
  await fs.writeFile(new URL(prefix+'/live.png',root),live);
  await sharp({create:{width:w*2,height:h,channels:3,background:'white'}}).composite([{input:native,left:0,top:0},{input:live,left:w,top:0}]).png().toFile(new URL(prefix+'/after-side-by-side.png',root).pathname);
  const metrics={meanAbsoluteDifference:sum/pixels.length,maxDifference:max,range:'0–255 RGB',width:w,height:h,columns:['painter','Live executor']};
  await fs.writeFile(new URL(prefix+'/after.json',root),JSON.stringify(metrics,null,2)+'\n');
  Object.assign(ex.studies[limit],{painting:prefix+'/painting.png',comparison:prefix+'/after-side-by-side.png',metrics:prefix+'/after.json'});
  console.log(ex.id,limit,metrics);
 }
}}
await fs.writeFile(manifestURL,JSON.stringify(manifest,null,2)+'\n');
