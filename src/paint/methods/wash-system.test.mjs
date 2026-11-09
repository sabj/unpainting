import test from 'node:test';
import assert from 'node:assert/strict';
import {planLightToDark,valueTechnique} from './light-to-dark.mjs';
import {normalizeWashWeights,softWashBoundary,lightReference,connectedLightTest,shapeMix} from './wash-system.mjs';
import {shapeDeficit,shapeCharge} from './shape-deficit.mjs';

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
 assert.equal(sh._valuePlan.mixed,true);
 assert.equal(valueTechnique(sh._valuePlan).intoWet,false);
 const mass=plan.layers.flatMap(l=>l.shapes).reduce((s,q)=>s+q.mix.reduce((a,b)=>a+b,0)*q.area,0);
 assert.ok(Math.abs(mass-n*.3)<1e-3);
});

test('connected glaze execution uses the water and pass count of its calibration',()=>{
 const T=valueTechnique({phase:'shadow',move:'wet on dry',load:{water:.45},washSystem:true});
 assert.equal(T.water,.58);assert.equal(T.passes,2);assert.equal(T.intoWet,false);
 assert.equal(valueTechnique({phase:'shadow',washSystem:true},3).passes,3);
});

test('subject ownership splits mixed support once, without duplicating the charge',()=>{
 const w=60,h=40,n=w*h,half=Uint16Array.from({length:n},(_,i)=>i%w<w/2?1:2);
 const subjects={subject:half,wash:half,washIds:[1,2],shadow:new Uint16Array(n).fill(1),shadowIds:[1],
  lights:new Uint8Array(n),formMm:1,labels:half,summary:{groups:[]},
  regions:['a','b'].map(id=>({id,referenceCue:'',baseMove:'wet on dry',descriptiveFamily:null}))};
 const p=planLightToDark({w,h,k:2,demand:Float32Array.from({length:n*2},(_,i)=>i%2?.1:.2),
  density:new Float32Array(n).fill(.3),rgb:new Uint8Array(n*3).fill(170),shaped:true,washSystem:true,
  paperRGB:[252,251,248],minShapeCells:4,subjects});
 const mass=p.layers.flatMap(l=>l.shapes).reduce((s,q)=>s+q.mix.reduce((a,b)=>a+b,0)*q.area,0);
 assert.ok(Math.abs(mass-n*.3)<1e-3);
});

test('a mixture carried by the second pan survives single-pan share filtering',()=>{
 const w=60,h=40,n=w*h;
 const p=planLightToDark({w,h,k:2,demand:Float32Array.from({length:n*2},(_,i)=>i%2?.3:0),
  density:new Float32Array(n).fill(.3),rgb:new Uint8Array(n*3).fill(170),shaped:true,washSystem:true,
  paperRGB:[252,251,248],minShapeCells:4,pigShare:.1});
 const mass=p.layers.flatMap(l=>l.shapes).reduce((s,q)=>s+q.mix[1]*q.area,0);
 assert.ok(Math.abs(mass-n*.3)<1e-3);
});

test('explicit component overrides in the bundle remain real ablations',()=>{
 const w=60,h=40,n=w*h,common={w,h,k:2,demand:Float32Array.from({length:n*2},(_,i)=>i%2?.1:.2),
  density:new Float32Array(n).fill(.3),rgb:new Uint8Array(n*3).fill(170),shaped:true,washSystem:true,
  paperRGB:[252,251,248],minShapeCells:4,layers:4};
 const bundled=planLightToDark(common),separate=planLightToDark({...common,mixedWash:false,mixedShadows:false,scaleCuts:false,gradedLanes:false,softChoice:false});
 assert.ok(bundled.layers.flatMap(l=>l.shapes).some(sh=>sh.mix.filter(v=>v>0).length>1));
 assert.ok(separate.layers.flatMap(l=>l.shapes).every(sh=>sh.mix.filter(v=>v>0).length===1));
 assert.ok(separate.layers.flatMap(l=>l.shapes).every(sh=>!sh._strokePlan));
});

test('an explicit paper-rule override keeps the legacy light rule inside the bundle',()=>{
 const w=30,h=30,n=w*h,rgb=new Uint8Array(n*3),density=new Float32Array(n).fill(.2);
 for(let i=0;i<n;i++)rgb.set([248,245,216],3*i);
 const common={w,h,k:1,rgb,density,demand:density.slice(),shaped:true,washSystem:true,paperRel:true,paperRGB:[252,251,248],minShapeCells:4};
 assert.equal(planLightToDark(common).protectedCells[5*w+5],0,'cream is a wash on the declared white sheet');
 assert.equal(planLightToDark({...common,paperRule:false}).protectedCells[5*w+5],1,'the explicit override retains the old relative-light rule');
});

test('feedback follows the passage mixture when the first pan is already complete',()=>{
 const target=[.02,.5],held=[.02,.1],booked=[.01,.1],mix=shapeMix({mix:target});
 const factor=shapeCharge(shapeDeficit(target,held,{mix}),shapeDeficit(target,booked,{mix}));
 assert.ok(factor>.99&&factor<=1);
 assert.equal(shapeCharge(shapeDeficit(target,held,{pigment:0}),shapeDeficit(target,booked,{pigment:0})),0);
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
