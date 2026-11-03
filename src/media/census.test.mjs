import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('census distinguishes shared zero-plane references from allocated backing buffers',async()=>{
 const old=process.env.PAINTER_CENSUS;process.env.PAINTER_CENSUS='1';
 const {census,censusDry}=await import('./census.mjs?enabled-test');
 const {writeCensus}=await import('../../tools/speed/census-write.mjs');
 if(old===undefined)delete process.env.PAINTER_CENSUS;else process.env.PAINTER_CENSUS=old;
 const zero=new Float32Array(4),paint=new Float32Array([1,0,0,0]);
 const sheet={layers:[[zero,paint],[zero,zero]]},dir=fs.mkdtempSync(path.join(os.tmpdir(),'census-'));
 try {
  fs.writeFileSync(path.join(dir,'commands.jsonl'),'{}\n');censusDry(sheet);writeCensus(dir,{main:sheet,fine:null},census);
  const result=JSON.parse(fs.readFileSync(path.join(dir,'census.json'))),s=result.layers.main;
  assert.equal(s.layers,2);assert.equal(s.planeReferences,4);assert.equal(s.uniquePlanes,2);
  assert.equal(s.logicalPlaneBytes,64);assert.equal(s.allocatedPlaneBytes,32);assert.equal(s.nonzeroPlanes,1);
  assert.equal(Object.values(result.dry)[0].maxAllocatedPlaneBytes,32);
  assert.equal(result.jsonlBytes['commands.jsonl'],3);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
