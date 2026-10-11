#!/usr/bin/env node
// node tools/lab/compare-live.mjs RUN OUT [--legacy]
// --legacy reads the former executor from Git commit 9ee5439 for a repeatable baseline.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import {gunzipSync} from 'node:zlib';
import {runTape} from '../../docs/lab/worker/live-tape.js';
import {tapeSheet,tapePixels,tapeFlow} from '../../docs/lab/worker/tape-sheet.js';
import {makePaper} from '../../docs/lab/media/paper.js';
import {createSheet,step,DEFAULTS} from '../../docs/lab/media/sheet.js';
import {paperReflectance} from '../../docs/lab/media/papers.js';
import {renderLayers} from '../../docs/lab/media/km.js';
const [run,out]=process.argv.slice(2),legacy=process.argv.includes('--legacy');
await fs.mkdir(out,{recursive:true});
let raw;try{raw=await fs.readFile(path.join(run,'marks.json'));}catch{raw=gunzipSync(await fs.readFile(path.join(run,'marks.json.gz')));}
const tape=JSON.parse(raw);
const sheet=legacy?createSheet({...makePaper(tape.w,tape.h,{seed:9,scale:1,toothScale:.2,fibres:.5,tooth:.5,proudBlur:1}),mmPerCell:25.4/60},tape.pigments):tapeSheet(tape);
let execute=runTape;
if(legacy){
 const base=new URL('../../docs/lab/worker/live-tape.js',import.meta.url);
 const source=execFileSync('git',['show','9ee54395c0fc:docs/lab/worker/live-tape.js'],{encoding:'utf8'}).replace(/from '([^']+)'/g,(_,p)=>`from '${new URL(p,base).href}'`);
 execute=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).runTape;
}
const t=performance.now();
// Legacy omitted graphite from its recordings, so baseline reproduces that omission.
await execute(legacy?{...tape,marks:tape.marks.filter(m=>m.k!=='g')}:tape,{sheet:()=>sheet,ready:async()=>true,begin:()=>{},end:()=>{},touch:async(p,r,fn)=>fn(),present:()=>{},progress:done=>{if(done%250===0)console.log(done);},mutate:async fn=>fn(),flow:async(dry,m)=>{if(!legacy)return tapeFlow(tape,sheet,dry,m);for(let i=0;i<(dry?Math.min(m?.m||30,90):1);i++)step(sheet,{...DEFAULTS,dt:dry?2:.3});}});
let pixels;
if(legacy){const base=Uint8Array.from(paperReflectance(sheet.paper,'cold',60),v=>v*255);pixels=renderLayers([...sheet.layers,sheet.G.map((g,k)=>Float32Array.from(g,(v,i)=>v+sheet.D[k][i]+sheet.P[k][i]))],tape.pigments,base,sheet.n,1);for(let i=0;i<sheet.n;i++){const sheen=sheet.W[i]>.02?1-Math.min(.025,sheet.W[i]*.03):1,reflection=Math.min(.025,Math.max(0,sheet.W[i])*.06);for(let c=0;c<3;c++)pixels[i*3+c]=Math.max(0,Math.min(255,pixels[i*3+c]*sheen+(c-1)*reflection*255));}}
else pixels=tapePixels(tape,sheet);
const expected=await sharp(path.join(run,'painting.png')).removeAlpha().raw().toBuffer();
if(expected.length!==pixels.length)throw Error('Native dimensions differ');
let sum=0,max=0;for(let i=0;i<pixels.length;i++){const d=Math.abs(pixels[i]-expected[i]);sum+=d;max=Math.max(max,d);}
const label=legacy?'before':'after';
await sharp(pixels,{raw:{width:tape.w,height:tape.h,channels:3}}).png().toFile(path.join(out,label+'.png'));
await sharp({create:{width:tape.w*2,height:tape.h,channels:3,background:'white'}}).composite([{input:await sharp(expected,{raw:{width:tape.w,height:tape.h,channels:3}}).png().toBuffer(),left:0,top:0},{input:await sharp(pixels,{raw:{width:tape.w,height:tape.h,channels:3}}).png().toBuffer(),left:tape.w,top:0}]).png().toFile(path.join(out,label+'-side-by-side.png'));
const result={meanAbsoluteDifference:sum/pixels.length,maxDifference:max,range:'0–255 RGB',width:tape.w,height:tape.h,seconds:(performance.now()-t)/1000,columns:['painter',legacy?'old Live executor':'fixed Live executor']};
await fs.writeFile(path.join(out,label+'.json'),JSON.stringify(result,null,2)+'\n');console.log(result);
