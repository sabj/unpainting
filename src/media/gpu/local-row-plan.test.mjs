import test from 'node:test';import assert from 'node:assert/strict';
import {localRowPlanBound} from './local-row-plan.mjs';import {GpuLink} from './link.mjs';
import {createBrush,dip,stroke} from '../brush.mjs';import {makePaper} from '../paper.mjs';import {createSheet} from '../sheet.mjs';
const pigment={K:[1,1,1],S:[.02,.02,.02],rho:.05,omega:1,gamma:0};
function packed(path,options={},brushOptions={},capacity=Infinity){
 const sheet=createSheet(makePaper(32,24,{seed:9}),[pigment]),brush=createBrush({radius:8,seed:17,...brushOptions});dip(brush,{water:.4,conc:[.2]});brush.carry=.37;brush.travel=5.2;
 const bound=localRowPlanBound(brush,sheet,path,options,capacity),flowIndices=[];
 const link={stats:{},brushGpu:true,anyBetween:true,strokePlanCapacity:capacity,notPlanning(){},syncAct(){},wetMask:0,beginPlan:GpuLink.prototype.beginPlan,
 endPlan(s,b,p,lift){this.result={words:p.S0+p.n*p.SP+p.nw+(lift?.length??0),steps:p.n,flows:Array.from({length:p.n},(_,i)=>p.U[p.S0+i*p.SP+6]),records:Array.from(p.F.subarray(0,p.S0+p.n*p.SP)),cells:Array.from(p.CU.subarray(0,p.nw))};},beginStroke(){throw Error('unexpected CPU route');}};
 sheet._gpu=link;stroke(brush,sheet,path,{...options,between(i){flowIndices.push(i);if(i%5===0)GpuLink.prototype.markFlow.call(link,link.planning);}});
 return {bound,actual:link.result,flowIndices,continuation:[brush.carry,brush.travel,sheet.clock],stats:link.stats};
}
test('local word bound contains actual packed production plans for pressure/radius/upright/lift/offhalo',()=>{
 const old=process.env.GPU_LOCAL_ROW_PLAN,resident=process.env.GPU_RESIDENT;process.env.GPU_RESIDENT='1';process.env.GPU_LOCAL_ROW_PLAN='0';
 try{for(const options of [{},{upright:true},{upright:'sweep'},{lift:false},{spacing:1.3}])for(const depositDepth of [0,.03])for(const flat of [false,true])for(const path of [[{x:15,y:12,p:.6,r:2}],[{x:-400,y:-300,p:.1,r:90},{x:10,y:9,p:1.4,r:2},{x:50,y:40,p:.3,r:20}],[{x:7,y:10,p:.7},{x:8,y:10,p:.2}],[{x:-400,y:200},{x:-100,y:100}]]){
 const r=packed(path,options,{flat,splay:.3,depositDepth});assert(r.bound.words>=r.actual.words,JSON.stringify({options,flat,bound:r.bound,actual:r.actual.words}));assert.equal(r.bound.steps,r.actual.steps);assert.equal(r.flowIndices.length,r.actual.steps);assert.equal(r.actual.flows.reduce((a,b)=>a+b,0),Math.floor(r.actual.steps/5));
 }}finally{if(resident===undefined)delete process.env.GPU_RESIDENT;else process.env.GPU_RESIDENT=resident;if(old===undefined)delete process.env.GPU_LOCAL_ROW_PLAN;else process.env.GPU_LOCAL_ROW_PLAN=old;}
});
test('opt-in local eligibility retains identical production records, source callbacks and continuation',()=>{
 const old=process.env.GPU_LOCAL_ROW_PLAN;
 try{const path=[{x:-300,y:12,r:100,p:.1},{x:14,y:12,r:2,p:.8},{x:300,y:12,r:100,p:.1}];process.env.GPU_LOCAL_ROW_PLAN='0';const control=packed(path,{spacing:.8});process.env.GPU_LOCAL_ROW_PLAN='1';const candidate=packed(path,{spacing:.8},{},control.bound.words+1);assert.deepEqual(candidate.actual,control.actual);assert.deepEqual(candidate.flowIndices,control.flowIndices);assert.deepEqual(candidate.continuation,control.continuation);assert.equal(candidate.stats.localRowPlanAdmitted,1);assert(candidate.bound.emptySteps>0);
 }finally{if(old===undefined)delete process.env.GPU_LOCAL_ROW_PLAN;else process.env.GPU_LOCAL_ROW_PLAN=old;}
});
test('capacity and invalid spacing reject without changing inputs',()=>{const b={hairs:[{}],clumps:[],carry:0,radius:4,splay:0},s={K:1,w:16,h:16},p=[{x:0,y:0},{x:100,y:100}];assert.equal(localRowPlanBound(b,s,p,{},100).eligible,false);assert.equal(localRowPlanBound(b,s,p,{spacing:0}).eligible,false);assert.equal(b.carry,0);});
