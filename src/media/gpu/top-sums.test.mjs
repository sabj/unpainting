import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuLink} from './link.mjs';

for (const resident of [false,true]) test(`top and sums observation preserves cache validity (${resident?'paired':'ordinary'})`,()=>{
 const n=2,K=3,ops=[],sheet={layers:[Array.from({length:K},()=>new Float32Array(n))]};
 const link=Object.assign(Object.create(GpuLink.prototype),{resident,n,K,version:7,topMask:1,wetMask:2,topStale:true,stale:true,stats:{},
   layerData:Float32Array.of(.5,.25,0,0,0,0),sumData:Float32Array.of(.125,.0625,.75,.875,0,0),
   sums:Array.from({length:K},()=>new Float32Array(n).fill(99)),sumsLive:7,
   flushDrys(){},syncLower(){},notPlanning(){},call(m){ops.push(m.op);}});
 link.syncTop(sheet,true);
 assert.deepEqual(Array.from(sheet.layers[0][0]),[.5,.25]);
 assert.equal(link.topStale,false);assert.equal(link.stale,true);assert.equal(link.version,7);
 const sums=link.wetSums(sheet);
 assert.deepEqual(sums.map(a=>Array.from(a)),[[.125,.0625],[.75,.875],[0,0]]);
 assert.deepEqual(ops,resident?['topSums']:['topDown','sums']);
 if(resident){link.wetSums(sheet);assert.deepEqual(ops,['topSums']);}
 link.version++;link.topStale=true;link.needFullUp=true;link.syncTop(sheet,true);
 assert.equal(ops.at(-1),'topDown','a pending CPU upload cannot cache GPU wet sums');
 assert.equal(link.wetSums(sheet),null);
});
