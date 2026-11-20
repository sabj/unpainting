#!/usr/bin/env node
// Portable physical checkpoints from complete runs, using the browser executor.
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import sharp from 'sharp';
import {runTape,SHEET_FIELDS} from '../../demos/lab/worker/live-tape.js';
import {encodeState} from '../../demos/lab/worker/history.js';
import {tapeSheet,tapePixels,tapeFlow} from '../../demos/lab/worker/tape-sheet.js';
// Use the browser's serial solver: Node's banded solver does not implement the
// fixed-layer settling used by these tapes, so it is not an equivalent backend.
const root=new URL('../../demos/lab/',import.meta.url),manifestURL=new URL('examples/recorded.json',root);
const manifest=JSON.parse(await fs.readFile(manifestURL));
for(const ex of manifest.examples){if(!ex.live)continue;ex.checkpoints={};for(const limit of Object.keys(ex.live)){
 const tape=JSON.parse(gunzipSync(await fs.readFile(new URL(ex.live[limit],root))));
 if(tape.version<2||!tape.complete)throw Error('Checkpoints require a complete recorded run');
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

}}
await fs.writeFile(manifestURL,JSON.stringify(manifest,null,2)+'\n');
