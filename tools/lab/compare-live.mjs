#!/usr/bin/env node
// node tools/lab/compare-live.mjs RUN OUT
// Replays a run's recorded marks with Paint Lab's Live executor and compares the result with the run's painting.png.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {gunzipSync} from 'node:zlib';
import {runTape} from '../../demos/lab/worker/live-tape.js';
import {tapeSheet,tapePixels,tapeFlow} from '../../demos/lab/worker/tape-sheet.js';
const [run,out]=process.argv.slice(2);
await fs.mkdir(out,{recursive:true});
let raw;try{raw=await fs.readFile(path.join(run,'marks.json'));}catch{raw=gunzipSync(await fs.readFile(path.join(run,'marks.json.gz')));}
const tape=JSON.parse(raw);
const sheet=tapeSheet(tape);
const t=performance.now();
await runTape(tape,{sheet:()=>sheet,ready:async()=>true,begin:()=>{},end:()=>{},touch:async(p,r,fn)=>fn(),present:()=>{},progress:done=>{if(done%50===0)console.log(done);},mutate:async fn=>fn(),flow:async(dry,m)=>tapeFlow(tape,sheet,dry,m)});
const pixels=tapePixels(tape,sheet);
const expected=await sharp(path.join(run,'painting.png')).removeAlpha().raw().toBuffer();
if(expected.length!==pixels.length)throw Error('Native dimensions differ');
let sum=0,max=0;for(let i=0;i<pixels.length;i++){const d=Math.abs(pixels[i]-expected[i]);sum+=d;max=Math.max(max,d);}
const label='after';
await sharp(pixels,{raw:{width:tape.w,height:tape.h,channels:3}}).png().toFile(path.join(out,label+'.png'));
await sharp({create:{width:tape.w*2,height:tape.h,channels:3,background:'white'}}).composite([{input:await sharp(expected,{raw:{width:tape.w,height:tape.h,channels:3}}).png().toBuffer(),left:0,top:0},{input:await sharp(pixels,{raw:{width:tape.w,height:tape.h,channels:3}}).png().toBuffer(),left:tape.w,top:0}]).png().toFile(path.join(out,label+'-side-by-side.png'));
const result={meanAbsoluteDifference:sum/pixels.length,maxDifference:max,range:'0–255 RGB',executor:'current',backend:'browser serial CPU',width:tape.w,height:tape.h,seconds:(performance.now()-t)/1000,columns:['painter','Live executor']};
await fs.writeFile(path.join(out,label+'.json'),JSON.stringify(result,null,2)+'\n');console.log(result);
