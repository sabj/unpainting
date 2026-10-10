import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuLink} from './link.mjs';
import {FreshMap} from './fresh.mjs';
import {measurePaper} from '../../paint/methods/wetdry.mjs';
test('neighboring paper checks share a tile read; mutation forces a fresh map and leaves pigment stale',()=>{
 const old=process.env.GPU_PAPER_OBSERVE;process.env.GPU_PAPER_OBSERVE='1';
 try{
 const w=128,h=128,n=w*h,reads=[];
 const sheet={w,h,W:new Float32Array(n),s:new Float32Array(n),M:new Uint8Array(n),paper:{capacity:new Float32Array(n).fill(1)}};
 const fresh=new FreshMap(w,h);fresh.stale();
 const link=Object.assign(Object.create(GpuLink.prototype),{w,h,K:7,stale:true,fresh,version:1,stats:{},rectData:new Float32Array(n*3),flushDrys(){},recordTransfer(){},call(m){reads.push(m);this.rectData.fill(.03);}});sheet._gpu=link;
 const cells=[10*w+10,11*w+11];assert.equal(measurePaper(sheet,cells).waterMax,Math.fround(.03));measurePaper(sheet,[12*w+12]);
 assert.equal(reads.length,1);assert.deepEqual(reads[0].rect,[0,0,64,64]);assert.equal(link.stats.paperDownBytes,64*64*12);
 assert.ok(fresh.staleBounds([10,10,1,1]),'paper observation must not mark pigment planes fresh');
 link.version++;measurePaper(sheet,cells);assert.equal(reads.length,2);
 }finally{if(old===undefined)delete process.env.GPU_PAPER_OBSERVE;else process.env.GPU_PAPER_OBSERVE=old;}
});
