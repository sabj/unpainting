import test from 'node:test';
import assert from 'node:assert/strict';
import {planLightToDark,valueTechnique} from './light-to-dark.mjs';
import {normalizeWashWeights,softWashBoundary,lightReference,connectedLightTest} from './wash-system.mjs';

test('merged middle washes conserve demand and remove excess accent allocation',()=>{
 const weights=[.1,.2,.2,.5,.5].map(v=>Float32Array.of(v));
 normalizeWashWeights(weights);
 assert.ok(Math.abs(weights.reduce((s,a)=>s+a[0],0)-1)<1e-6);
 assert.equal(weights[2][0],0);
});

test('a mixed dry-paper passage carries both pigments once and has no raw demand field',()=>{
 const w=60,h=40,n=w*h,density=new Float32Array(n).fill(.3);
 const demand=Float32Array.from({length:n*2},(_,i)=>i%2?.1:.2);
 const plan=planLightToDark({w,h,k:2,demand,density,rgb:new Uint8Array(n*3).fill(170),
  shaped:true,washSystem:true,layers:4,paperRGB:[252,251,248],minShapeCells:4});
 const mid=plan.layers.filter(l=>l.value===2);
 assert.equal(mid.length,1);
 assert.equal(mid[0].shapes.length,1);
 const sh=mid[0].shapes[0];
 assert.ok(sh.mix.every(v=>v>0));
 assert.equal(sh.graded,null);
 assert.ok(sh._plane||sh._strokePlan);
 assert.equal(valueTechnique(sh._valuePlan).intoWet,false);
 const mass=plan.layers.flatMap(l=>l.shapes).reduce((s,q)=>s+q.mix.reduce((a,b)=>a+b,0)*q.area,0);
 assert.ok(Math.abs(mass-n*.3)<1e-3);
});

test('connected glaze execution uses the water and pass count of its calibration',()=>{
 const T=valueTechnique({phase:'shadow',move:'wet on dry',load:{water:.45},washSystem:true});
 assert.equal(T.water,.58);assert.equal(T.passes,2);assert.equal(T.intoWet,false);
});

test('a sharp enlarged edge and a shadow edge keep their clip',()=>{
 const w=60,h=10,values=Float32Array.from({length:w*h},(_,i)=>i%w<30?.2:.8);
 assert.equal(softWashBoundary(29,[30],{values,w,h,cellMm:.2,phase:'mid'}),false);
 values.fill(.3);
 assert.equal(softWashBoundary(29,[30],{values,w,h,cellMm:.2,phase:'mid'}),true);
 assert.equal(softWashBoundary(29,[30],{values,w,h,cellMm:.2,phase:'shadow'}),false);
});

test('a bright neutral material can supply lights without becoming the sheet',()=>{
 const rgb=new Uint8Array(300).fill(235),sheet={detected:false,rgb:[252,251,248]};
 const reference=lightReference(rgb,10,10,sheet);
 assert.deepEqual(reference,[235,235,235]);
 assert.equal(connectedLightTest(reference)(rgb,0),true);
 assert.deepEqual(sheet.rgb,[252,251,248]);
});
