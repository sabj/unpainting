import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuSheet} from './stepfull.mjs';
function host({resident=false,knownDry=false,wet=[1,1,1]}={}){
 const steps=[],counts=[];let index=0;
 return {resident,knownDry,steps,counts,step(n,chunk){steps.push([n,chunk]);},async counters(){return Uint32Array.from([7+index,wet[index++]??1]);},noteCount(n){counts.push(n);}};
}
test('actual non-resident advance uses only chunk counters, no dry-only state',async()=>{
 const h=host();assert.equal(h.dryS,undefined);await GpuSheet.prototype.advance.call(h,62,25);
 assert.deepEqual(h.steps,[[25,25],[25,25],[12,25]]);assert.deepEqual(h.counts,[7,8,9]);assert.equal(h.knownDry,false);assert.equal(h.dryS,undefined);
});
test('counter reports dry and exits before remaining chunks',async()=>{
 const h=host({wet:[1,0,1]});await GpuSheet.prototype.advance.call(h,62,25);assert.deepEqual(h.steps,[[25,25],[25,25]]);assert.equal(h.knownDry,true);assert.deepEqual(h.counts,[7,8]);
});
test('resident, already-dry and short advance routes remain unchanged',async()=>{
 const resident=host({resident:true});await GpuSheet.prototype.advance.call(resident,62,25);assert.deepEqual(resident.steps,[[62,25]]);assert.deepEqual(resident.counts,[]);
 const dry=host({knownDry:true});await GpuSheet.prototype.advance.call(dry,62,25);assert.deepEqual(dry.steps,[]);
 const short=host();await GpuSheet.prototype.advance.call(short,12,25);assert.deepEqual(short.steps,[[12,25]]);assert.deepEqual(short.counts,[]);
});
