import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {nativeUploadPolicy,nativeDryOptions} from './native-paint-mode.mjs';
test('Fast/Full tracked-upload policy preserves explicit environment; Full dry unchanged',()=>{
 for(const [mode,explicit,expected] of [['fast',undefined,'1'],['full',undefined,'0'],['fast','0','0'],['full','1','1'],['fast','other','other']]){
  const p=nativeUploadPolicy(mode,explicit);assert.equal(p.value,expected);assert.equal(p.enabled,expected==='1');assert.equal(p.selection,explicit===undefined?'native-mode-default':'explicit-environment');
 }
 const opts={dt:2,levelMax:140};assert.strictEqual(nativeDryOptions('full',opts),opts);
 assert.throws(()=>nativeUploadPolicy('invalid',undefined));
});
test('actual CLI records effective policy before failed image load; mode uses last flag',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'native-upload-policy-'));
 try{
  for(const [n,args,explicit,want,selection] of [
   [0,['--mode','fast','--speedtransfers','0'],undefined,'1','native-mode-default'],
   [1,['--mode','fast','--mode','full','--speedtransfers','0'],undefined,'0','native-mode-default'],
   [2,['--mode','fast'],'0','0','explicit-environment'],
   [3,['--mode','full'],'1','1','explicit-environment'],
   [4,['--mode','fast'],undefined,'1','speed-transfer-default'],
   [5,['--mode','full'],undefined,'1','speed-transfer-default'],
  ]){
   const out=path.join(folder,'out'+n),env={...process.env};delete env.GPU_DIRTY_UPLOAD;if(explicit!==undefined)env.GPU_DIRTY_UPLOAD=explicit;
   const r=spawnSync(process.execPath,['tools/paint-plate.mjs',...args,'--image',path.join(folder,'absent.png'),'--gpu','off','--out',out],{cwd:path.resolve(import.meta.dirname,'../..'),env,encoding:'utf8',timeout:10000});
   assert.equal(r.status,1);const actual=JSON.parse(fs.readFileSync(path.join(out,'native-mode.json')));
   assert.equal(actual.uploadPolicy.value,want);assert.equal(actual.uploadPolicy.enabled,want==='1');assert.equal(actual.uploadPolicy.selection,selection);assert.match(r.stdout,/native tracked CPU upload:/);
  }
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
