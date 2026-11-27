import test from 'node:test';
import assert from 'node:assert/strict';
import {PaperGate} from './paper-gate.mjs';

test('paper gates reuse bindings across request counts and rebuild them after allocation growth',async()=>{
 const saved=[globalThis.GPUBufferUsage,globalThis.GPUMapMode];globalThis.GPUBufferUsage={UNIFORM:1,COPY_DST:2,STORAGE:4,COPY_SRC:8,MAP_READ:16};globalThis.GPUMapMode={READ:1};
 let binds=0;const counts=[];
 const device={createShaderModule(){return {};},createComputePipeline(){return {getBindGroupLayout(){return {};}};},createBuffer({size}){return {size,destroy(){},async mapAsync(){},getMappedRange(_offset,bytes){return new ArrayBuffer(bytes);},unmap(){}};},createBindGroup(){binds++;return {};},queue:{writeBuffer(buffer,_offset,data){if(buffer.size===16)counts.push(data[0]);},submit(){}},createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}};},copyBufferToBuffer(){},finish(){return {};}};}};
 const gate=new PaperGate(device),sheet={b:{W:{},S:{},PAPER:{}}};
 try{for(const n of [33,44])await gate.read(sheet,new Uint32Array(n));assert.equal(binds,1);await gate.read(sheet,new Uint32Array(44),true);assert.equal(binds,2);await gate.read(sheet,new Uint32Array(100));assert.equal(binds,3);assert.deepEqual(counts,[33,44,44,100]);}finally{gate.destroy();[globalThis.GPUBufferUsage,globalThis.GPUMapMode]=saved;}
});
