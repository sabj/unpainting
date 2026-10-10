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
test('quiet Fast drying retains backrun/hard-boundary dried distribution within 1% total and .002 per cell',()=>{
 const a=fixture(false),b=fixture(true);let error=0,mass=0,peak=0;
 for(let i=0;i<a.s.n;i++){const v=a.s.layers[0][0][i],w=b.s.layers[0][0][i];error+=Math.abs(v-w);mass+=v;peak=Math.max(peak,Math.abs(v-w));}
 assert(error/mass<.01);assert(peak<.002);assert(b.iterations<a.iterations);
 assert(Math.abs(b.s.layers[0][0].reduce((x,y)=>x+y,0)-mass)<1e-5);
 assert(b.s.W.every(v=>v===0));assert(b.s.s.every(v=>v===0));assert(b.s.M.every(v=>v===0));
 console.log(JSON.stringify({slowIterations:a.iterations,fastIterations:b.iterations,relativeL1:error/mass,maxCellError:peak}));
});
test('quiet pore tail eliminates iterative drying and cannot clear transport-capable water',()=>{
 const make=()=>{const s=createSheet(makePaper(8,8,{seed:7}),[pigment]);s.s.fill(.25);s.P[0].fill(.01);s.wetDirty=1;return s;};
 const a=make(),b=make();const slow=dry(a,30000,DEFAULTS,{dt:14}),fast=dry(b,30000,DEFAULTS,{dt:14,analyticTail:true});
 assert(slow>10);assert.equal(fast,0);assert(b.W.every(v=>v===0));assert(b.s.every(v=>v===0));
 const wet=make();deposit(wet,20,.02,[.03]);const before=wet.W.slice();assert.equal(quietDryTail(wet),false);assert.deepEqual(wet.W,before);
});
import {GpuSheet} from './stepfull.mjs';
test('GPU tail uses measured maximum gate, orders both passes once, and verifies final counters',async()=>{
 for(const water of [.003,.02]) {
  let settled=false,dispatches=0,reads=0;const events=[];
  const counters=()=>{const c=new Uint32Array(8);c[1]=settled?0:1;new Float32Array(c.buffer)[7]=water;return c;};
  const pass={setPipeline(p){events.push(p);},setBindGroup(index,bg){assert.equal(index,0);events.push(bg);},dispatchWorkgroups(n){assert.equal(n,1);dispatches++;},end(){}};
  const h={resident:false,epoch:0,n:64,o:DEFAULTS,p:{quiet_dry_tail:'settle',quiet_dry_clear:'clear'},bg:{quiet_dry_tail:'settle-bindings',quiet_dry_clear:'clear-bindings'},
   device:{createCommandEncoder(){return {finish(){return {};}};},queue:{submit(){settled=true;}}},timestamps:{begin(){return pass;}},
   setOptions(){},step(){},async counters(){events.push('read');reads++;return counters();},noteCount(){},
   dryS:{t:0,max:25,level:60,levelMax:140,levelTol:.02,dt:14,oLevel:1,fast:false,done:false,analyticTail:true,counterReads:0,counterReadMs:0,fastIterations:0,fastChunks:0}};
  await GpuSheet.prototype.dryAdvance.call(h);
  assert.equal(dispatches,water<=DEFAULTS.wetEps?2:0);
  if(settled){await GpuSheet.prototype.dryEnd.call(h);assert.equal(reads,2);assert.equal(h.dryTelemetry.analyticTailCalls,1);assert.deepEqual(events,['read','settle','settle-bindings','clear','clear-bindings','read']);}
  else await assert.rejects(GpuSheet.prototype.dryEnd.call(h),/still wet/);
 }
});
