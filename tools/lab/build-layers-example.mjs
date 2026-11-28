#!/usr/bin/env node
// Publish actual saved stages and their fixed named-form map, without inventing
// intermediate frames. Run after a section-brush painting with --marks 1.
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import sharp from 'sharp';
const [run,receiptFile,title,maxWArg]=process.argv.slice(2);if(!run||!receiptFile||!title)throw Error('usage: build-layers-example.mjs RUN NAMED_SAM_RECEIPT TITLE [MAX_WIDTH]');
const maxW=maxWArg?+maxWArg:960;
const read=async f=>JSON.parse(await fs.readFile(f)),record=await read(path.join(run,'frames.json')),card=await read(path.join(run,'run-card.json')),receipt=await read(receiptFile),tape=await read(path.join(run,'marks.json'));
if(card.gpuBackend.backend!=='gpu'||card.gpuBackend.fallback||!tape.brushOpts.every(o=>o.model==='section'))throw Error('Requires a real GPU section-brush painting');
const group=f=>f.stage==='paint'?`paint-${Math.min(2,Math.floor((f.pass-1)/Math.ceil(f.of/3)))}`:f.stage;
const indices=new Set([0,record.frames.length-1]);
for(let i=1;i<record.frames.length;i++)if(group(record.frames[i])!==group(record.frames[i-1])){indices.add(i-1);indices.add(i);}
for(const p of [.1,.25,.5,.75,.9])indices.add(Math.floor((record.frames.length-1)*p));
const chosen=[...indices].sort((a,b)=>a-b),out=path.resolve('demos/layers/data');await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
const srcMeta=await sharp(path.join(run,record.frames[0].src)).metadata();
const scale=srcMeta.width>maxW?maxW/srcMeta.width:1;
const w=Math.round(srcMeta.width*scale),h=Math.round(srcMeta.height*scale);
const frames=[],sources=[],stages=[];
const names={frisket:'Reserve lights',drawing:'Ink drawing',paper:'Paper',dry:'Dry the sheet',finish:'Final accents',final:'Finished sheet',finished:'Finished sheet',unmask:'Lift the reserves'};
for(const [i,k]of chosen.entries()){
 const f=record.frames[k],file=`f${String(i).padStart(4,'0')}.webp`,srcPath=path.join(run,f.src);
 const bytes=scale<1?await sharp(srcPath).resize(w,h,{fit:'fill'}).webp({quality:88}).toBuffer():await fs.readFile(srcPath);
 await fs.writeFile(path.join(out,file),bytes);frames.push(`data/${file}`);sources.push({savedFrame:k,stage:f.stage,value:f.value??null,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 if(!i)continue;const key=group(f);let s=stages.at(-1);if(s?.group!==key){s={key:`${key}-${i}`,group:key,label:names[f.stage]??(f.stage==='paint'?['First washes','Building color','Final washes'][+key.slice(6)]:f.stage),frames:[i,i],...(f.stage==='drawing'?{ink:true}:{})};stages.push(s);}s.frames[1]=i;
}
await sharp(path.resolve(path.dirname(receiptFile),receipt.mask.path)).resize(w,h,{kernel:'nearest',fit:'fill'}).png().toFile(path.join(out,'subjects.png'));
await fs.writeFile(path.join(out,'meta.json'),JSON.stringify({title,w,h,stageGrouping:'Three contiguous groups of recorded brush passages between drawing and finishing; original saved frames only.',frames,labels:'data/subjects.png',subjects:receipt.forms.map(f=>f.name),stages,source:{code:card.codeSHA,dirty:!card.cleanTree,brush:'section',backend:card.gpuBackend,dimensions:card.dimensions,targetSHA256:card.targetSHA256,maskSHA256:receipt.mask.sha256,frames:sources}},null,2)+'\n');
console.log(`${title}: ${frames.length} real frames, ${stages.length} stages, ${receipt.forms.length} named forms, ${w}×${h}`);
