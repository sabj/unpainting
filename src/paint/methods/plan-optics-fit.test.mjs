import test from 'node:test';
import assert from 'node:assert/strict';
import {fitPlanOptics,mixtureDensity} from './plan-optics-fit.mjs';

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
