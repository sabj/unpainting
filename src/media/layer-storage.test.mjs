import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makePaper } from './paper.mjs';
import { createSheet, layersOf, thickness, totals, layersChanged } from './sheet.mjs';
import { renderLayers } from './km.mjs';
import { renderSheet } from './render-cache.mjs';
import { compactLowerLayers, layerStorageStats } from './layer-storage.mjs';
import { writeState, readState } from '../../tools/aware/state-io.mjs';
const pigments=[{K:[1,.7,.5],S:[.02,.02,.02],rho:.05,omega:60,gamma:0},
 {K:[.22,.22,.23],S:[.02,.02,.02],rho:.05,omega:60,gamma:0}];
function setup(){
 const sheet=createSheet(makePaper(24,18),pigments);
 for(let l=0;l<5;l++){
  const layer=pigments.map(()=>new Float32Array(sheet.n));
  for(let y=3;y<7;y++)for(let x=4;x<9;x++)for(let k=0;k<2;k++)layer[k][y*sheet.w+x]=(l+k+1)*.031;
  sheet.layers.push(layer);
 }
 return sheet;
}
test('cropped lower planes preserve cached/plain thickness, optics, totals and later edits',()=>{
 const sheet=setup(),base=Buffer.alloc(sheet.n*3,251);
 const expected=renderLayers(layersOf(sheet),pigments,base,sheet.n);
 const thick=thickness(sheet),mass=totals(sheet);
 assert.deepEqual(renderSheet(sheet,pigments,base,sheet.n),expected);
 const before=layerStorageStats(sheet),result=compactLowerLayers(sheet);
 const after=layerStorageStats(sheet);
 assert(result.savedBytes>0);assert(after.allocatedBytes<before.allocatedBytes);
 assert.equal(after.compactedPlanes,6);assert.equal(after.nonzeroPlanes,before.nonzeroPlanes);
 assert.deepEqual(thickness(sheet),thick);
 assert.deepEqual(renderSheet(sheet,pigments,base,sheet.n),expected);
 const alternate=Buffer.alloc(sheet.n*3,235);
 assert.deepEqual(renderSheet(sheet,pigments,alternate,sheet.n),renderLayers(layersOf(sheet),pigments,alternate,sheet.n));
 compactLowerLayers(sheet);assert.deepEqual(totals(sheet),mass);
 compactLowerLayers(sheet);
 const old=process.env.LAYER_CACHE;process.env.LAYER_CACHE='0';
 try{assert.deepEqual(thickness(sheet),thick);}finally{if(old===undefined)delete process.env.LAYER_CACHE;else process.env.LAYER_CACHE=old;}
 compactLowerLayers(sheet);sheet.layers[1][0][100]=.7;layersChanged(sheet);
 assert.deepEqual(renderSheet(sheet,pigments,base,sheet.n),renderLayers(layersOf(sheet),pigments,base,sheet.n));
});
test('compaction respects prep, top, resist, retained pigments and pending archives',()=>{
 const sheet=setup();
 sheet.resistFrom=4;sheet._gpu={pendingLayers:[{index:2,mask:3}]};
 compactLowerLayers(sheet,{from:2,retainPigments:[1]});
 assert.equal(layerStorageStats(sheet).compactedPlanes,1); // layer 3, pigment 0 only
 assert.equal(Object.getOwnPropertyDescriptor(sheet.layers[0],0).get,undefined);
 assert.equal(Object.getOwnPropertyDescriptor(sheet.layers[2],0).get,undefined);
 assert.equal(Object.getOwnPropertyDescriptor(sheet.layers[4],0).get,undefined);
});
test('cropped storage rehydrates identical bits, shared buffers and checkpoint values',()=>{
 const sheet=setup(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'cropped-state-'));
 const plane=new Float32Array(new SharedArrayBuffer(sheet.n*4));
 const bits=new Uint32Array(plane.buffer);bits[100]=0x80000000;bits[101]=0x7fc01234;bits[102]=0x3f000000;
 sheet.layers[1][0]=plane;
 compactLowerLayers(sheet);
 assert.equal(layerStorageStats(sheet).compactedPlanes,6);
 const restored=sheet.layers[1][0];
 assert(restored.buffer instanceof SharedArrayBuffer);assert.deepEqual(new Uint32Array(restored.buffer),bits);
 // Use a finite sheet for the material/optics state round trip.
 sheet.layers[1][0][101]=.25;compactLowerLayers(sheet);
 try{
  writeState(dir,{layers:sheet.layers});
  const loaded=readState(dir);
  for(let l=0;l<sheet.layers.length;l++)for(let k=0;k<2;k++)
   assert.deepEqual(new Uint32Array(loaded.layers[l][k].buffer),new Uint32Array(sheet.layers[l][k].buffer));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('plane aliases to retained layers or live reservoirs are never detached',()=>{
 const sheet=setup();
 sheet.layers[1][0]=sheet.layers[0][0];sheet.layers[2][0]=sheet.G[0];
 compactLowerLayers(sheet);
 assert.strictEqual(sheet.layers[1][0],sheet.layers[0][0]);
 assert.strictEqual(sheet.layers[2][0],sheet.G[0]);
 sheet.layers[0][0][100]=.5;assert.equal(sheet.layers[1][0][100],.5);
});

import { fixedBedLower } from './fixed-bed.mjs';
import { attachGpu } from './gpu/link.mjs';
import { step, dry, DEFAULTS } from './sheet.mjs';
test('fixed-bed rebuild reads cropped planes without losing support',()=>{
 const sheet=setup(),before=fixedBedLower(sheet);
 compactLowerLayers(sheet);
 assert.deepEqual(fixedBedLower(sheet),before);
});
test('GPU uploads, fixation and reads match with cropped lower planes', {timeout:120000},t=>{
 const run=compact=>{
  const sheet=setup(),O={...DEFAULTS,fixedBed:1};
  if(compact)compactLowerLayers(sheet);
  const info=attachGpu(sheet,O,{mode:'auto',log:()=>{}});
  if(info.backend!=='gpu')return null;
  try{
   sheet.W[100]=.08;sheet.M[100]=1;sheet.ever[100]=1;sheet.D[0][100]=.05;
   sheet._gpu.cpuWroteAll();
   for(let i=0;i<4;i++)step(sheet,O);
   dry(sheet,2000,O,{levelMax:5,dt:14});
   if(compact)compactLowerLayers(sheet);
   const mass=thickness(sheet);
   return {mass,rgb:renderLayers(layersOf(sheet),pigments,Buffer.alloc(sheet.n*3,255),sheet.n)};
  }finally{sheet._gpu.close();}
 };
 const ref=run(false);
 if(!ref){t.skip('GPU unavailable');return;}
 assert.deepEqual(run(true),ref);
});

test('storage work does not flush queued asynchronous GPU drying',()=>{
 const sheet={_gpu:{queuedDrys:1},get layers(){throw Error('unexpected GPU flush');}};
 assert.deepEqual(compactLowerLayers(sheet),{packed:0,savedBytes:0});
});
