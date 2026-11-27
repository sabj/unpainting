import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheet,deposit,step,dry,quietDryTail,DEFAULTS} from '../sheet.mjs';
import {makePaper} from '../paper.mjs';
const pigment={K:[1,1,1],S:[.02,.02,.02],rho:.05,omega:1,gamma:.2};
function fixture(tail){
 const s=createSheet(makePaper(24,16,{seed:7}),[pigment]);
 // Bounded wet-on-dry wash, then a clean-water charge into the setting wash:
 // retain the flowing backrun and pinned hard boundary before quiet drying.
 for(let y=4;y<12;y++)for(let x=4;x<20;x++)deposit(s,y*24+x,.22,[.03]);
 for(let j=0;j<80;j++)step(s,DEFAULTS);
 for(let y=6;y<10;y++)for(let x=7;x<10;x++)deposit(s,y*24+x,.55,[0]);
 const iterations=dry(s,30000,DEFAULTS,{level:60,levelMax:140,dt:14,analyticTail:tail});
 return {s,iterations};
}
// Was within 1% and .002 a cell, in as many steps, while the fast dry kept the slow one's schedule. The fast dry's
// tail in chunks of 7 and its level looked at every 5 steps (time-chunks.mjs) part it from the slow dry by 2.4% and
// .0046 at the worst cell (of a cell's 0.097), in 82 steps against 97. With back-runs (backrun.mjs) the clean water's
// front runs in the fast dry's fewer, longer steps, each holding a face to a quarter of its puddle's water: 2.4% and
// .0102 at the worst cell, on the front (2.4% and .0043 with invade 0).
test('fast drying retains backrun/hard-boundary dried distribution within 4% total and .012 per cell',()=>{
 const a=fixture(false),b=fixture(true);let error=0,mass=0,peak=0;
 for(let i=0;i<a.s.n;i++){const v=a.s.layers[0][0][i],w=b.s.layers[0][0][i];error+=Math.abs(v-w);mass+=v;peak=Math.max(peak,Math.abs(v-w));}
 assert(error/mass<.04);assert(peak<.012);assert(b.iterations<=a.iterations);
 // the dried layer holds 0.3% more than the slow dry's (was within 1e-5): the slow dry leaves more pigment suspended
 // (G) after its dry; the layer and what stays on the sheet together hold the same
 assert(Math.abs(b.s.layers[0][0].reduce((x,y)=>x+y,0)-mass)<.005*mass);
 const all=s=>s.layers.reduce((t,L)=>t+L[0].reduce((x,y)=>x+y,0),0)+[s.G,s.P,s.D].reduce((t,X)=>t+X[0].reduce((x,y)=>x+y,0),0); assert(Math.abs(all(b.s)-all(a.s))<1e-5);
 assert(b.s.W.every(v=>v===0));assert(b.s.s.every(v=>v===0));assert(b.s.M.every(v=>v===0));
 console.log(JSON.stringify({slowIterations:a.iterations,fastIterations:b.iterations,relativeL1:error/mass,maxCellError:peak}));
});
test('quiet pore tail eliminates iterative drying and cannot clear transport-capable water',()=>{
 const make=()=>{const s=createSheet(makePaper(8,8,{seed:7}),[pigment]);for(let i=0;i<s.n;i++)s.s[i]=.25*s.paper.capacity[i];s.P[0].fill(.01);s.wetDirty=1;return s;};
 const a=make(),b=make();const slow=dry(a,30000,DEFAULTS,{dt:14}),fast=dry(b,30000,DEFAULTS,{dt:14,analyticTail:true});
 assert(slow>0);assert.equal(fast,0);assert(b.W.every(v=>v===0));assert(b.s.every(v=>v===0));
 const mobile=make();mobile.s.set(mobile.paper.capacity);assert.equal(quietDryTail(mobile),false);
 const wet=make();deposit(wet,20,.003,[.03]);const before=wet.W.slice();assert.equal(quietDryTail(wet),false);assert.deepEqual(wet.W,before);
});
import {GpuSheet, openGpu} from './stepfull.mjs';
test('GPU tail probes the whole sheet only without surface water, honors transport vetoes, and verifies final counters',async()=>{
 for(const [water,masked,blocked] of [[0,0,0],[0,0,1],[0,1,0],[.003,0,0],[.02,0,0]]) {
  let settled=false,dispatches=0,reads=0;const events=[];
  const counters=()=>{const c=new Uint32Array(8);c[1]=settled?0:1;c[6]=masked;new Float32Array(c.buffer)[7]=water;return c;};
  const pass={setPipeline(p){events.push(p);},setBindGroup(index,bg){assert.equal(index,0);events.push(bg);},dispatchWorkgroups(n){assert.equal(n,1);dispatches++;},end(){}};
  const h={resident:false,epoch:0,n:64,o:DEFAULTS,b:{CTR:'counters'},p:{quiet_dry_check:'check',quiet_pore_tail:'settle',quiet_dry_clear:'clear'},bg:{quiet_dry_check:'check-bindings',quiet_pore_tail:'settle-bindings',quiet_dry_clear:'clear-bindings'},
   device:{createCommandEncoder(){return {clearBuffer(b,offset,bytes){assert.deepEqual([b,offset,bytes],['counters',48,4]);},finish(){return {};}};},queue:{submit(){settled=true;}}},timestamps:{begin(){return pass;}},
   async readWords(name,bytes,offset,encoder){assert.deepEqual([name,bytes,offset],['CTR',4,48]);assert.ok(encoder);events.push('gate-read');return Uint32Array.of(blocked).buffer;},
   evaporateInPlace:GpuSheet.prototype.evaporateInPlace,
   setOptions(){},step(){},async counters(){events.push('read');reads++;return counters();},noteCount(){},
   dryS:{t:0,max:25,level:60,levelMax:140,levelTol:.02,dt:14,oLevel:1,fast:false,done:false,analyticTail:true,counterReads:0,counterReadMs:0,fastIterations:0,fastChunks:0}};
  await GpuSheet.prototype.dryAdvance.call(h);
  assert.equal(dispatches,water===0&&!masked?(blocked?1:3):0);
  if(settled){await GpuSheet.prototype.dryEnd.call(h);assert.equal(reads,2);assert.equal(h.dryTelemetry.analyticTailCalls,1);assert.deepEqual(events,['read','check','check-bindings','gate-read','settle','settle-bindings','clear','clear-bindings','read']);}
  else await assert.rejects(GpuSheet.prototype.dryEnd.call(h),/still wet/);
 }
});

test('GPU fast drying keeps the CPU requested dt even in a thin positive film', async()=>{
 const options=[];
 const h={o:DEFAULTS,resident:false,epoch:0,setOptions(o){options.push(o.dt);},step(){},noteCount(){},
  async counters(){const c=new Uint32Array(8);c[1]=1;c[6]=1;new Float32Array(c.buffer)[7]=.003;return c;}};
 GpuSheet.prototype.dryBegin.call(h,50,DEFAULTS,{level:0,levelMax:0,dt:14,analyticTail:true});
 assert.equal(h.dryS.dt,14);
 await GpuSheet.prototype.dryAdvance.call(h);
 assert.deepEqual(options,[DEFAULTS.dt,14]);
 assert.equal(h.dryS.done,false);
});

test('fast drying retains the ordinary adaptive CG budget in both drying phases', async () => {
 const lv = { iters: 128, light: true }, h = { lv, resident: false, epoch: 0, options: [],
  setOptions(o) { this.options.push(o.dt); }, step() {}, noteCount() {},
  async counters() { const c = new Uint32Array(8); c[6] = 1; return c; } };
 GpuSheet.prototype.dryBegin.call(h,50,DEFAULTS,{level:0,levelMax:0,dt:14,analyticTail:true});
 assert.equal(lv.iters,128);
 await GpuSheet.prototype.dryAdvance.call(h);
 assert.equal(lv.iters,128);
 assert.equal(lv.hold,undefined); assert.equal(lv.cap,undefined);
 await GpuSheet.prototype.dryEnd.call(h);
 assert.equal(lv.iters,128); assert.deepEqual(h.options,[DEFAULTS.dt,14,DEFAULTS.dt]);
});

test('fast dry ramps levelling while preserving physical duration and watched step cadence', async () => {
 for (const [water, watched] of [[.025,false],[.2,false],[.025,true]]) {
  const steps=[],h={o:{...DEFAULTS},resident:false,epoch:0,
   setOptions(o){Object.assign(this.o,o);},step(count){steps.push([this.o.dt,count]);},noteCount(){},
   async surfaceLevel(){return 1;},
   async counters(){const c=new Uint32Array(8);c[1]=1;c[6]=1;new Float32Array(c.buffer)[7]=water;return c;}};
  GpuSheet.prototype.dryBegin.call(h,30,DEFAULTS,{level:60,levelMax:140,dt:14,analyticTail:true});
  await GpuSheet.prototype.dryAdvance.call(h,watched?30:Infinity);
  if(watched){
   assert.equal(h.dryS.fast,false);
   assert.ok(steps.every(([dt])=>dt===DEFAULTS.dt));
  }else if(water<DEFAULTS.levelFloor){
   assert.equal(h.dryS.fast,true);
   assert.deepEqual(steps.slice(0,2),[[DEFAULTS.dt,5],[.5,11]]);
   assert(steps.slice(2).every(([dt])=>dt===14));
   assert.equal(steps.slice(2).reduce((n,[,count])=>n+count,0),14);
   assert.equal(h.dryS.fastAt,16);
   assert.equal(steps[0][0]*steps[0][1]+steps[1][0]*steps[1][1],60*DEFAULTS.dt);
  }else{
   assert.equal(h.dryS.fast,true);
   assert.equal(h.dryS.fastAt,20);
   assert.deepEqual(steps.slice(0,3),[[DEFAULTS.dt,5],[.5,3],[1,4]]);
   assert.equal(steps[0][0]*steps[0][1]+steps[1][0]*steps[1][1]+steps[2][0]*steps[2][1],60*DEFAULTS.dt);
   assert.equal(steps.slice(0,7).reduce((t,[dt,count])=>t+dt*count,0),140*DEFAULTS.dt);
  }
 }
});

test('thin-film warmup and thick-film ramped dry keep native CPU/GPU cellwise pigment parity and mass', async t => {
 const webgpu=await import('webgpu');Object.assign(globalThis,webgpu.globals);let device;
 try{({device}=await openGpu(webgpu.create([])));}catch(e){if(process.env.GPU_REQUIRED==='1')throw e;t.skip(e.message);return;}
 try{
  for (const [label, depth, expectFastAt, expectFastBy] of [['thin', .025, 16, 'thin film'], ['thick', .18, 12, 'level']]) {
   const make=()=>{const s=createSheet(makePaper(40,32,{seed:9,mmPerCell:.25}),[pigment]);for(let y=6;y<26;y++)for(let x=6;x<34;x++)deposit(s,y*s.w+x,depth,[.012]);return s;};
   const a=make(),b=make(),O={...DEFAULTS,mmPerCell:.25,slideCap:1},params={level:60,levelMax:140,dt:14,analyticTail:true};
   const total=s=>[s.G,s.P,s.D,...s.layers].reduce((a,planes)=>a+planes[0].reduce((a,b)=>a+b,0),0),initial=total(a);
   const g=await GpuSheet.create(device,b,O);
   try{
    dry(a,30000,O,params);g.dryBegin(30000,O,params);await g.dryAdvance();
    assert.equal(g.dryS.fastAt,expectFastAt,label);assert.equal(g.dryS.fastBy,expectFastBy,label);
    assert.equal(g.timeChunks,2,label);
    await g.dryEnd();await g.download(b);
    for(const s of [a,b]){assert(s.W.every(v=>v===0));assert(s.s.every(v=>v===0));assert(s.M.every(v=>v===0));assert(Math.abs(total(s)/initial-1)<1e-5);}
    const field=s=>Float64Array.from({length:s.n},(_,i)=>[s.G,s.P,s.D,...s.layers].reduce((v,L)=>v+L[0][i],0));
    const A=field(a),B=field(b),max=Math.max(...A.map((v,i)=>Math.abs(v-B[i])));
    assert(max<2e-4,`${label} pigment differs by ${max}`);
    t.diagnostic(JSON.stringify({label,maxPigmentDifference:max,cpuMass:total(a),gpuMass:total(b),initialMass:initial}));
   }finally{g.destroy();}
  }
 }finally{device.destroy();}
});


test('ordinary fast drying probes absorption before its evaporation horizon; explicit and watched chunks stay requested', async () => {
 const saved = process.env.GPU_FAST_DRY_CHUNK;
 try {
  for (const [override, watched, expected] of [[null, false, 4], ['50', false, 20], [null, true, 20]]) {
   if (override === null) delete process.env.GPU_FAST_DRY_CHUNK; else process.env.GPU_FAST_DRY_CHUNK = override;
   const chunks = [], h = { o: { ...DEFAULTS }, resident: false, epoch: 0,
    setOptions(o) { Object.assign(this.o, o); }, step(n) { chunks.push(n); }, noteCount() {},
    async counters() { const c = new Uint32Array(8); c[1] = 1; c[6] = 1; return c; } };
   GpuSheet.prototype.dryBegin.call(h, 20, DEFAULTS, { level: 0, levelMax: 0, dt: 14, analyticTail: true });
   await GpuSheet.prototype.dryAdvance.call(h, watched ? 20 : Infinity);
   assert.equal(chunks[0], expected);
   assert.equal(chunks.reduce((a, b) => a + b, 0), 20, 'a failed probe never truncates the dry limit');
  }
 } finally { if (saved === undefined) delete process.env.GPU_FAST_DRY_CHUNK; else process.env.GPU_FAST_DRY_CHUNK = saved; }
});
