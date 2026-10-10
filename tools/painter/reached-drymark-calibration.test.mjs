import test from 'node:test';import assert from 'node:assert/strict';
import {calibrateSemanticInstrument} from './semantic-areas.mjs';
import {dryMarkPath,dryMarkBrush} from '../../src/paint/methods/modulate.mjs';
import {DEFAULTS} from '../../src/media/sheet.mjs';
test('existing calibration consumes exact reached shaped points/profile without semantic loadWater override',async()=>{
 const shape={width:.6,length:1.8,water:.42},rB=4.32,mark=Array.from({length:12},(_,i)=>({x:40+i,y:70+.1*i,p:.8,want:.1})),points=dryMarkPath(mark,{SC:1,rB,shape}),profile=dryMarkBrush({rB,shape,seed:7801,len:mark.length});
 const pass={move:'dry brush',brush:{kind:'round',widthMm:2*profile.radius*.5185185,orientation:'follow',pressure:[.22,.95,.22]},load:{water:.42,waterQuantityMm3:22,capacityMm3:22,pigmentScale:1},wetness:{required:'dry',neighborCells:3}};
 const r=await calibrateSemanticInstrument(pass,{mmPerCell:.5185185,paperOptions:{seed:9},pigments:[{K:[.4,.2,.1],S:[.02,.02,.02],rho:.05,omega:1.4,gamma:.25}],physics:DEFAULTS,profile,referenceLengthsMm:[11.0549*.5185185],referenceGrid:{w:42,h:34},referenceGestures:[{points,profile}],exactProfile:true,referenceOptions:{upright:true}});
 const sample=r.samples[0];assert.equal(sample.exactReachedProfile,true);assert.equal(sample.profile.capacity,22);assert.equal(sample.profile.free,.45);assert.equal(sample.profile.bridge,.88);assert.equal(sample.profile.loadWater,undefined);assert.equal(sample.loadFraction,.42);assert.equal(sample.paperBefore.dry,true);assert.ok(sample.delivery>.02&&Number.isFinite(sample.gain));
 assert.deepEqual(sample.points.map(p=>[p.r,p.p]),points.map(p=>[p.r,p.p]));for(let i=1;i<points.length;i++){assert.ok(Math.abs((sample.points[i].x-sample.points[i-1].x)-(points[i].x-points[i-1].x))<1e-12);assert.ok(Math.abs((sample.points[i].y-sample.points[i-1].y)-(points[i].y-points[i-1].y))<1e-12);}
});
