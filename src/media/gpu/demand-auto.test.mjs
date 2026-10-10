import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {GpuLink} from './link.mjs';import {GpuSheet} from './stepfull.mjs';
import {createBrush,dip,stroke} from '../brush.mjs';
function env(mode,fn){const old=process.env.GPU_DEMAND_READBACK;try{if(mode===undefined)delete process.env.GPU_DEMAND_READBACK;else process.env.GPU_DEMAND_READBACK=mode;return fn();}finally{if(old===undefined)delete process.env.GPU_DEMAND_READBACK;else process.env.GPU_DEMAND_READBACK=old;}}
function wired(opts,mode,size=[673,359]){return env(mode,()=>{let entries=0;const [w,h]=size,n=w*h,sh={W:new Float32Array(n),s:new Float32Array(n),M:new Uint8Array(n),ever:new Uint8Array(n),G:[],P:[],D:[]};const link=Object.assign(Object.create(GpuLink.prototype),{w,h,stats:{},notPlanning(){},validRect:r=>r,ensureFresh(){entries++;},down(){assert.fail('No extra entry read');}});link.beginStroke(sh,[0,0,w,h],opts);assert.equal(entries,1);return !!sh._cpuDemandWindow;});}
test('actual beginStroke AUTO wire only tested brush scope and explicit overrides',()=>{
 const trusted={tracked:true,instrument:'brush',planOverflow:true,periodic:true,flowEvery:184};
 assert.equal(wired(trusted),true);for(const flowEvery of[76,173,184,187,296])assert.equal(wired({...trusted,flowEvery}),true);assert.equal(wired(trusted,undefined,[96,128]),false);for(const patch of[{instrument:'pen'},{periodic:false},{planOverflow:false},{tracked:false},{flowEvery:24},{flowEvery:75},{flowEvery:297},{flowEvery:187.5}])assert.equal(wired({...trusted,...patch}),false);
 assert.equal(wired(trusted,'0'),false);assert.equal(wired({...trusted,instrument:'pen'},'1'),true);
});
test('oversized brush forwards cadence metadata before any physical mutation',()=>env(undefined,()=>{
 const w=673,h=359,n=w*h;
 for(const every of [184,173,187,76,296]){
  const b=createBrush({radius:18,bristles:16,capacity:60});dip(b,{water:.8,conc:[.25,0,0,0,0,0,0]});
  const sh={w,h,K:7,paper:{},W:new Float32Array(n),s:new Float32Array(n),M:new Uint8Array(n),ever:new Uint8Array(n),G:[],P:[],D:[]};
  const stop=Error('stop at admission');let got;
  const link=Object.assign(Object.create(GpuLink.prototype),{w,h,stats:{},brushGpu:true,strokePlanCapacity:1,notPlanning(){},validRect:r=>r,ensureFresh(){},down(){assert.fail('No extra read at admission');},beginStroke(sheet,rect,options){
   got=options;assert.equal(options.planOverflow,true);GpuLink.prototype.beginStroke.call(this,sheet,rect,options);assert.ok(sheet._cpuDemandWindow);throw stop;
  }});sh._gpu=link;
  const p=[{x:0,y:0,p:.8,r:18},{x:673,y:359,p:.7,r:18}];
  assert.throws(()=>stroke(b,sh,p,{gpuBetween:true,flowEvery:every,between(){}}),e=>e===stop);
  assert.deepEqual(got,{tracked:true,instrument:'brush',planOverflow:true,periodic:true,flowEvery:every});
  assert.equal(sh.W.some(v=>v!==0),false);assert.equal(sh.s.some(v=>v!==0),false);
 }
}));
test('actual lazy metadata setup allocates and compiles once on first call only',async()=>{
 const old=process.env.GPU_DEMAND_READBACK;delete process.env.GPU_DEMAND_READBACK;globalThis.GPUBufferUsage={STORAGE:1,COPY_SRC:2,COPY_DST:4};globalThis.GPUShaderStage={COMPUTE:1};
 const shader=fs.readFileSync(new URL('./stepfull.wgsl',import.meta.url),'utf8'),calls=[];
 const device={createBuffer(v){calls.push(['buffer',v.size]);return{destroy(){}};},createShaderModule(){calls.push(['module']);return{};},createBindGroupLayout(){return{};},createPipelineLayout(){return{};},async createComputePipelineAsync(){calls.push(['pipeline']);return{};},createBindGroup(){return{};}};
 const g=Object.assign(Object.create(GpuSheet.prototype),{device,b:{},demandShaderSource:shader,names:{},uses:{},bgl:{},p:{},bg:{},bufFor(){return{};}});
 try{assert.deepEqual(calls,[]);await Promise.all([g.ensureUploadMetadata(),g.ensureUploadMetadata()]);await g.ensureUploadMetadata();assert.deepEqual(calls,[['buffer',16],['module'],['pipeline']]);assert.ok(g.b.UPLOAD_META);}
 finally{if(old===undefined)delete process.env.GPU_DEMAND_READBACK;else process.env.GPU_DEMAND_READBACK=old;delete globalThis.GPUBufferUsage;delete globalThis.GPUShaderStage;}
});
test('actual ordinary init excludes metadata allocation, pipeline and shader entry',async()=>{
 const old=process.env.GPU_DEMAND_READBACK;delete process.env.GPU_DEMAND_READBACK;globalThis.GPUBufferUsage={STORAGE:1,COPY_SRC:2,COPY_DST:4,UNIFORM:8,INDIRECT:16};globalThis.GPUShaderStage={COMPUTE:1};
 const {makePaper}=await import('../paper.mjs'),{createSheet,DEFAULTS}=await import('../sheet.mjs');const sh=createSheet(makePaper(4,4),[{K:[.1,.2,.3],S:[.02,.02,.02],rho:.05,omega:1.4,gamma:.25}]);const modules=[],pipelines=[];
 const device={limits:{maxStorageBufferBindingSize:128*1024*1024,maxBufferSize:256*1024*1024},features:new Set(),queue:{writeBuffer(){}},createBuffer(v){return{size:v.size,destroy(){}};},createShaderModule(v){modules.push(v.code);return{};},createBindGroupLayout(){return{};},createPipelineLayout(){return{};},createComputePipeline(v){pipelines.push(v.compute.entryPoint);return{};},createBindGroup(){return{};}};
 const g=new GpuSheet();g.setOptions=()=>{};g.upload=()=>{};
 try{await g.init(device,sh,DEFAULTS);assert.equal(g.b.UPLOAD_META,undefined);assert.ok(!pipelines.includes('upload_metadata_rect'));assert.equal(modules.length,1);assert.ok(!modules[0].includes('fn upload_metadata_rect'));assert.ok(!modules[0].includes('@binding(43)'));assert.equal(g.demandSetup,null);}
 finally{if(old===undefined)delete process.env.GPU_DEMAND_READBACK;else process.env.GPU_DEMAND_READBACK=old;delete globalThis.GPUBufferUsage;delete globalThis.GPUShaderStage;}
});
test('actual destroy/re-init recreates lazy resources and rejects stale pending generation',async()=>{
 const old=process.env.GPU_DEMAND_READBACK;delete process.env.GPU_DEMAND_READBACK;globalThis.GPUBufferUsage={STORAGE:1,COPY_SRC:2,COPY_DST:4,UNIFORM:8,INDIRECT:16};globalThis.GPUShaderStage={COMPUTE:1};
 const {makePaper}=await import('../paper.mjs'),{createSheet,DEFAULTS}=await import('../sheet.mjs');const sh=createSheet(makePaper(4,4),[{K:[.1,.2,.3],S:[.02,.02,.02],rho:.05,omega:1.4,gamma:.25}]);let builds=0,pending=false,release;const allocated=[];
 const device={limits:{maxStorageBufferBindingSize:128*1024*1024,maxBufferSize:256*1024*1024},features:new Set(),queue:{writeBuffer(){}},createBuffer(v){const b={size:v.size,destroyed:false,destroy(){this.destroyed=true;}};allocated.push(b);return b;},createShaderModule(){return{};},createBindGroupLayout(){return{};},createPipelineLayout(){return{};},createComputePipeline(){return{};},createComputePipelineAsync(){builds++;return pending?new Promise(r=>release=r):Promise.resolve({});},createBindGroup(){return{};}};
 const g=new GpuSheet();g.setOptions=()=>{};g.upload=()=>{};g.flushStrokes=()=>{};
 try{
  await g.init(device,sh,DEFAULTS);await g.ensureUploadMetadata();const first=g.b.UPLOAD_META,firstGeneration=g.allocationGeneration;assert.equal(builds,1);
  g.destroy();assert.ok(first.destroyed);assert.equal(g.demandSetup,null);
  await g.init(device,sh,DEFAULTS);assert.ok(g.allocationGeneration>firstGeneration);assert.equal(g.b.UPLOAD_META,undefined);await g.ensureUploadMetadata();assert.notEqual(g.b.UPLOAD_META,first);assert.equal(builds,2);
  g.destroy();await g.init(device,sh,DEFAULTS);pending=true;const stale=g.ensureUploadMetadata(),staleBuffer=allocated.at(-1);const rejection=assert.rejects(stale,/allocation changed/);
  g.destroy();await g.init(device,sh,DEFAULTS);release({});await rejection;assert.ok(staleBuffer.destroyed);assert.equal(g.b.UPLOAD_META,undefined);assert.equal(g.p.upload_metadata_rect,undefined);assert.equal(g.demandSetup,null);
  pending=false;await g.ensureUploadMetadata();assert.equal(builds,4);assert.ok(g.b.UPLOAD_META);g.destroy();
 }finally{if(old===undefined)delete process.env.GPU_DEMAND_READBACK;else process.env.GPU_DEMAND_READBACK=old;delete globalThis.GPUBufferUsage;delete globalThis.GPUShaderStage;}
});
test('actual default AUTO step invalidates early shifted flow and next contact requires fresh GPU state',()=>env(undefined,()=>{
 const w=673,h=359,n=w*h,s={W:new Float32Array(n),s:new Float32Array(n),M:new Uint8Array(n),ever:new Uint8Array(n),G:[],P:[],D:[],steps:0};let version=0;const order=[];
 const link=Object.assign(Object.create(GpuLink.prototype),{w,h,stats:{steps:0},fresh:{stale(){}},notPlanning(){},validRect:r=>r,ensureFresh(){},applyOptions(){},uploadCpuStroke(_s,r){assert.deepEqual(r,[0,0,w,h]);order.push('upload-original-logical');},post(m){assert.equal(m.op,'step');version++;order.push('physical-step');},down(sh,[x,y,rw,rh]){for(let r=y;r<y+rh;r++)sh.W.fill(version,r*w+x,r*w+x+rw);}});
 s._gpu=link;link.beginStroke(s,[0,0,w,h],{tracked:true,instrument:'brush',periodic:true,planOverflow:true,flowEvery:187});assert.ok(s._cpuDemandWindow);
 // Real first flow occurs at158<187. No predicted-cadence clock controls reset.
 s.W[10*w+10]=.123;link.step(s,{});assert.throws(()=>s._cpuDemandWindow.assertFresh([10,10,1,1]));
 s._cpuDemandWindow.require([10,10,2,2]);assert.equal(s.W[10*w+10],1);s._cpuDemandWindow.assertFresh([10,10,1,1]);s.W[10*w+10]=.456;
 link.step(s,{});assert.throws(()=>s._cpuDemandWindow.assertFresh([10,10,1,1]));s._cpuDemandWindow.require([10,10,2,2]);assert.equal(s.W[10*w+10],2);assert.equal(s.steps,2);assert.deepEqual(order,['upload-original-logical','physical-step','upload-original-logical','physical-step']);
}));
