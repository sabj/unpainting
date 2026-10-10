import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {codeHash,cachedStep} from './run-cache.mjs';
test('warm plans retain typed data; target, options, and planning sources invalidate',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'w6-cache-'));
 try{
 fs.mkdirSync(path.join(root,'src'));fs.mkdirSync(path.join(root,'tools'));
 fs.writeFileSync(path.join(root,'src/plan.mjs'),'export const p=1');fs.writeFileSync(path.join(root,'tools/planner.mjs'),'export const p=1');
 let raw='2',calls=0;
 const track={start(){},stop(){return [['glaze',raw]]},current(){return raw},replay(){}};
 const run=target=>cachedStep({dir:path.join(root,'cache'),name:'plan',code:codeHash(root),inputs:{target:Uint8Array.of(target)},track},async()=>{calls++;return {amounts:Float32Array.of(-0,.25),value:NaN};});
 const a=await run(1),b=await run(1);assert.equal(a.cached,false);assert.equal(b.cached,true);assert.deepEqual(a.value,b.value);assert.equal(calls,1);
 raw='3';assert.equal((await run(1)).cached,false);assert.equal((await run(2)).cached,false);
 fs.writeFileSync(path.join(root,'src/plan.mjs'),'export const p=2');assert.equal((await run(2)).cached,false);
 fs.writeFileSync(path.join(root,'tools/planner.mjs'),'export const p=2');assert.equal((await run(2)).cached,false);assert.equal(calls,5);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('cached production block plan retains shared labels and lazy mask setter/drop behavior',async()=>{
 const {blockInPigments,dropMask}=await import('../crop/blockin.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'w6-block-'));
 try{
 const w=24,h=24,A=Float32Array.from({length:w*h},(_,i)=>i%w>3&&i%w<20?.6:0);
 const track={start(){},stop(){return []},current(){},replay(){}};
 const args={dir,name:'block-plan',code:'fixture',inputs:{A,w,h},track};let calls=0;
 const make=async()=>{calls++;return blockInPigments(A,1,w,h,{glaze:.12,floorShape:1,minShape:1});};
 const a=await cachedStep(args,make),b=await cachedStep(args,make);assert.equal(b.cached,true);assert.equal(calls,1);
 assert.deepEqual(b.value.delivered,a.value.delivered);assert.ok(b.value.layers.length);
 for(let l=0;l<b.value.layers.length;l++)for(let j=0;j<b.value.layers[l].shapes.length;j++){
 const sh=b.value.layers[l].shapes[j],original=a.value.layers[l].shapes[j];assert.deepEqual(sh.mask,original.mask);
 dropMask(sh);assert.deepEqual(sh.mask,original.mask);const replacement=new Uint8Array(w*h).fill(1);sh.mask=replacement;assert.equal(sh.ids,null);assert.equal(sh.mask,replacement);
 }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
