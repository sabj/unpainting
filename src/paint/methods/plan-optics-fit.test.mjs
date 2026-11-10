import test from 'node:test';
import assert from 'node:assert/strict';
import {fitPlanOptics,mixtureDensity,reflectedColour} from './plan-optics-fit.mjs';

const pigment={K:[1,1,1],S:[0,0,0]};
test('the linear .55 convention is 10 percent too dark for a pure absorber',()=>{
 const target=-Math.log(128/255),amount=target*.55;
 assert.ok(Math.abs(mixtureDensity([amount],[pigment],[255,255,255])-target*1.1)<1e-12);
 const fit=fitPlanOptics({demand:Float32Array.of(amount),rgb:Uint8Array.of(128,128,128),labels:Uint8Array.of(1),pigments:[pigment],paperRGB:[255,255,255]});
 assert.ok(Math.abs(fit.report[0].factor-10/11)<1e-6);
 assert.ok(Math.abs(fit.report[0].after-target)<1e-6);
});

test('one region factor preserves its internal variation and leaves reserves untouched',()=>{
 const fit=fitPlanOptics({demand:Float32Array.of(.2,.4,.8),rgb:Uint8Array.of(180,180,180,150,150,150,255,255,255),labels:Uint8Array.of(1,1,1),protect:Uint8Array.of(0,0,1),pigments:[pigment],paperRGB:[255,255,255]});
 assert.ok(Math.abs(fit.demand[1]/fit.demand[0]-2)<1e-6);
 assert.equal(fit.demand[2],Math.fround(.8));
 assert.equal(fit.report.length,1);
});

test('an unreachable dark with an opaque pigment keeps its original plan',()=>{
 const p={K:[.01,.01,.01],S:[1,1,1]},fit=fitPlanOptics({demand:Float32Array.of(.2),rgb:Uint8Array.of(1,1,1),labels:Uint8Array.of(1),pigments:[p],paperRGB:[255,255,255]});
 assert.equal(fit.report[0].matched,false);assert.equal(fit.report[0].factor,1);
 assert.equal(fit.demand[0],Math.fround(.2));
});

test('a varying region matches mean reflected light rather than reflection of mean demand',()=>{
 const shades=[200,100],demand=Float32Array.from(shades,v=>-.55*Math.log(v/255));
 const fit=fitPlanOptics({demand,rgb:Uint8Array.from(shades.flatMap(v=>[v,v,v])),labels:Uint8Array.of(1,1),pigments:[pigment],paperRGB:[255,255,255]});
 assert.ok(Math.abs(fit.report[0].factor-10/11)<1e-6);
 const mean=[...fit.demand].reduce((s,d)=>s+reflectedColour([d],[pigment],[255,255,255])[0],0)/2;
 assert.ok(Math.abs(mean-150)<1e-4);
});

test('the separate-pan estimate uses successive layers and differs from a homogeneous mixture',()=>{
 const pigs=[{K:[1,.1,.2],S:[.4,.2,.1]},{K:[.2,.5,.8],S:[.1,.3,.6]}],mix=[1.4,1.2],paper=[252,251,248];
 const stacked=reflectedColour(mix,pigs,paper,1,'separate'),mixed=reflectedColour(mix,pigs,paper,1,'mixed');
 assert.ok(stacked.some((v,c)=>Math.abs(v-mixed[c])>1));
 const rgb=Uint8Array.from(stacked.map(Math.round));
 const fit=fitPlanOptics({demand:Float32Array.from(mix),rgb,labels:Uint8Array.of(1),pigments:pigs,paperRGB:paper,mode:'separate'});
 assert.equal(fit.report[0].model,'separate');assert.ok(Math.abs(fit.report[0].factor-1)<.02);
});
