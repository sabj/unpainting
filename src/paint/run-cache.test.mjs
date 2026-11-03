import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {codeHash,cachedStep} from './run-cache.mjs';
import {planLightToDark} from './methods/light-to-dark.mjs';

test('value plan cache restores mutable demand, shapes and material instructions',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'value-cache-'));
 try{
  const w=48,h=40,k=2,n=w*h;
  const inputs=()=>({w,h,k,shaped:true,litWarm:true,litLift:.2,litReserveL:99,layerSmoothMm:0,subject:null,
   pigments:[{name:'yellow ochre'},{name:"Payne's grey"}],
   density:Float32Array.from({length:n},(_,i)=>.1+(i%w)*.015),
   demand:Float32Array.from({length:n*k},(_,i)=>i%2?.12:.05),
   rgb:Uint8Array.from({length:n*3},(_,i)=>[230,218,180][i%3])});
  const track={start(){},stop(){return []},current(){return null},replay(){}};
  const run=async options=>{
   const saved=await cachedStep({dir,name:'value-plan',code:'value-test',track,inputs:options},async()=>({plan:planLightToDark(options),demand:options.demand}));
   if(saved.cached)options.demand.set(saved.value.demand);
   return saved;
  };
  const a=inputs(),b=inputs(),first=await run(a),second=await run(b);
  assert.equal(first.cached,false);assert.equal(second.cached,true);
  assert.deepEqual(b.demand,a.demand);
  assert.deepEqual(second.value,first.value);
  assert.ok(first.value.plan.layers.length);
  const changed=inputs();changed.density[0]+=.3;
  assert.equal((await run(changed)).cached,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
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

test('scoped hashes track dependencies but ignore unrelated edits',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scoped-code-'));
 try{fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src/a.mjs'),"import './b.mjs';");fs.writeFileSync(path.join(root,'src/b.mjs'),'export const b=1');fs.writeFileSync(path.join(root,'src/c.mjs'),'export const c=1');
 const hash=()=>codeHash(root,[],{dependencies:['src/a.mjs']}),a=hash();
 fs.writeFileSync(path.join(root,'src/c.mjs'),'export const c=2');assert.equal(hash(),a);
 fs.writeFileSync(path.join(root,'src/b.mjs'),'export const b=2');assert.notEqual(hash(),a);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('cache hits replay consumed target looks and preserve hard budget',async()=>{
 const {createTargetGuard}=await import('../../tools/guard/no-target.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guard-cache-'));
 const track={start(){},stop(){return []},current(){},replay(){}};
 try{
 const run=async()=>{const guard=createTargetGuard({mode:'hard',lookBudget:1});guard.provide('px',new Float32Array(100).fill(.5));
 const r=await cachedStep({dir,name:'guard',code:'test',inputs:{},track,guard},async()=>guard.look('review','test',new Uint8Array(100).fill(1),{ref:['px']}));return {r,guard};};
 const a=await run(),b=await run();assert.equal(b.r.cached,true);assert.deepEqual(a.r.value,b.r.value);assert.equal(b.guard.summary().looks.count,1);
 assert.equal(b.guard.look('review','second',new Uint8Array(100).fill(1),{ref:['px']}),null);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
