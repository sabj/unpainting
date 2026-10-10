import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuSheet} from './stepfull.mjs';
import {renderLayers} from '../km.mjs';
const pigment={K:[.8,.5,.3],S:[.02,.02,.02]};
for(const resident of [false,true])test(`actual fix archives optical paint using ${resident?'prepared sparse':'full ordinary'} dispatch`,async()=>{
 globalThis.GPUBufferUsage={COPY_SRC:1,COPY_DST:2};
 const archived=[Float32Array.of(.6)],live=[Float32Array.of(.03)],appended=[],dispatches=[];
 const pass={setPipeline(p){dispatches.push(p);},setBindGroup(){},dispatchWorkgroups(){},dispatchWorkgroupsIndirect(){},end(){}};
 const device={queue:{submit(){}},createBuffer({size}){return {size};},createCommandEncoder(){return {copyBufferToBuffer(){},finish(){return {};}};}};
 const gpu=Object.assign(Object.create(GpuSheet.prototype),{device,resident,w:1,h:1,n:1,K:1,ntiles:1,b:{TOP:archived,FLAGS2:{},ARGS:{}},p:{fix_args:'fix_args',fix_a:'fix_a',fix_b:'fix_b'},bg:{fix_args:{},fix_a:{},fix_b:{}},timestamps:{begin(){return pass;}},resetCounters:async()=>{},counters:async()=>Uint32Array.of(0,0,0,1,0,1),hasTop:true,opticalCount:2,setOptions(){},optical:{append(layer,options){assert.equal(layer,archived);assert.equal(!!options.sparse,resident);if(resident){assert.equal(options.args,gpu.b.ARGS);assert(dispatches.includes('fix_args'));}else{assert.equal(options.args,undefined);assert(!dispatches.includes('fix_args'));}appended.push(layer);}}});
 const r=await gpu.fix();assert(r.pushed&&r.hadTop);assert.equal(gpu.opticalCount,3);
 const actual=renderLayers([...appended,live],[pigment],Uint8Array.of(255,255,255),1),expected=renderLayers([archived,live],[pigment],Uint8Array.of(255,255,255),1);
 assert.deepEqual(actual,expected);assert(actual[0]<220,'Archived brown paint must remain visibly present');
});
test('an empty fix cannot append or advance the optical fixed stack',async()=>{
 const pass={setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}};
 const gpu=Object.assign(Object.create(GpuSheet.prototype),{resident:false,w:1,h:1,device:{queue:{submit(){}},createCommandEncoder(){return {finish(){return {};}};}},timestamps:{begin(){return pass;}},p:{},bg:{},resetCounters:async()=>{},counters:async()=>new Uint32Array(6),opticalCount:2,optical:{append(){assert.fail('Empty fix must not archive paint');}}});
 assert.equal((await gpu.fix()).pushed,false);assert.equal(gpu.opticalCount,2);
});
