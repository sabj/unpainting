import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuSheet} from './stepfull.mjs';

function host({resident=true,persistent=false,dampOnly=false}={}) {
  const events=[];
  const pass={setPipeline(name){events.push(name);},setBindGroup(){},dispatchWorkgroups(){},dispatchWorkgroupsIndirect(){},end(){}};
  const h=Object.assign(Object.create(GpuSheet.prototype),{
    resident,persistent,cap:4,workers:2,ntiles:4,K:1,act:[0],o:{edgeWidth:2,flowIters:2,slide:1},
    dryS:dampOnly?{dampOnly:true}:null,b:{CTR:{},ARGS:{}},
    p:new Proxy({}, {get:(_,key)=>key}),bg:{},timestamps:{begin(){return pass;}},
    device:{createCommandEncoder(){return {clearBuffer(_,offset,size){events.push(['clear',offset,size]);},finish(){return {};}};},queue:{submit(){events.push('submit');}}}
  });
  return {h,pass,events};
}

test('steps preserve the frontier every time and measure counters only on demand',()=>{
  for(const options of [{},{resident:false},{persistent:true},{dampOnly:true}]) {
    const {h,pass,events}=host(options);
    h.stepsInPass(pass,200);
    assert.equal(events.filter(x=>x==='wetfrontier').length,200);
    assert.equal(events.filter(x=>x==='wetscan').length,0);
    h.measureWetCounters(); h.measureWetCounters();
    assert.equal(events.filter(x=>x==='wetmeasure').length,1);
    assert.deepEqual(events.filter(Array.isArray),[['clear',4,4],['clear',24,8]]);
    h.stepsInPass(pass,1); h.measureWetCounters();
    assert.equal(events.filter(x=>x==='wetmeasure').length,2);
  }
});

test('legacy step schedule also retains the frontier without redundant measurement',()=>{
  const before=process.env.GPU_STEP;process.env.GPU_STEP='old';
  try {
    const {h,pass,events}=host();h.stepsInPass(pass,5);
    assert.equal(events.filter(x=>x==='wetfrontier').length,5);
    assert.equal(events.filter(x=>x==='wetscan').length,0);
  } finally {if(before===undefined)delete process.env.GPU_STEP;else process.env.GPU_STEP=before;}
});

test('a requested chunk result scans only its last step, without another submission',()=>{
  for(const fused of [false,true]) {
    const {h,pass,events}=host();
    h.p=new Proxy({}, {get:(_,key)=>key==='p5c_wetscan'&&!fused?undefined:key});
    h.stepsInPass(pass,200,true); h.measureWetCounters();
    assert.equal(events.filter(x=>x===(fused?'p5c_wetscan':'wetscan')).length,1);
    assert.equal(events.filter(x=>x==='wetfrontier').length,199);
    assert.equal(events.filter(x=>x==='submit').length,0);
    assert.equal(h.wetCountersDirty,false);
  }
});
