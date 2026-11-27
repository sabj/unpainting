import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('reruns release shared GPU before another attach and tag every message',async()=>{
 const source=(await fs.readFile(new URL('../../demos/lab/strokes/bench-worker.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 const messages=[],calls=[];let release,attached=0;
 const pause=new Promise(resolve=>release=resolve);
 const context=vm.createContext({performance,setTimeout,Float32Array,Uint8Array,Uint8ClampedArray,
  BY_KEY:{ultramarine:{}},DEFAULTS:{},BENCH_STROKES:[{id:'one',paper:'cold'}],navigator:{gpu:{}},
  GpuPhysics:{create:async()=>({name:'mock',setOptions(){},load:async()=>{attached++;calls.push('attach');if(attached===1)await pause;},step:async()=>calls.push('step'),fix(){},syncAll(){}})},
  benchPigments:()=>[],layBenchStroke:async(s,{ops})=>{const sheet={n:1,w:1,h:1,paper:{mmPerCell:1}};await ops.attach(sheet);await ops.step(sheet,1,{});await ops.read(sheet);return {sheet,pigments:[],steps:1};},
  paperReflectance:()=>new Float32Array(3).fill(1),layersOf:()=>[],renderLayers:()=>new Uint8Array(3),
  postMessage:m=>messages.push(m)
 });
 vm.runInContext(source,context);
 const run=gen=>context.onmessage({data:{type:'run',gen,mmPerCell:1,backends:['gpu']}});
 run(1);while(!attached)await tick();assert.equal(attached,1);
 run(2);run(3);await tick();assert.equal(attached,1,'old await owns GPU until it settles');
 release();await vm.runInContext('pending',context);
 assert.equal(attached,2,'queued superseded run never attaches');
 assert.deepEqual(calls,['attach','attach','step']);
 assert.ok(messages.every(m=>Number.isInteger(m.gen)));
 assert.deepEqual(messages.filter(m=>m.type==='stroke'||m.type==='done').map(m=>[m.type,m.gen]),[['stroke',3],['done',3]]);
});

test('GPU dampness counts exact W > 1e-3 cells using only the water plane',async()=>{
 const source=(await fs.readFile(new URL('../../demos/lab/strokes/bench-worker.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 const calls=[],context=vm.createContext({BY_KEY:{},Float32Array,p:{sheet:{levelReady:async()=>calls.push('level'),readWords:async(name,bytes)=>{calls.push([name,bytes]);return Float32Array.of(0,.001,.0011,.2).buffer;}}}});
 vm.runInContext(source,context);
 assert.equal(await vm.runInContext('gpuOps(p).standing({n:4})',context),3); // Float32 .001 rounds slightly above the JS threshold.
 assert.deepEqual(calls,['level',['W',16]]);
});
