import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticTechnique} from './semantic-areas.mjs';
import {makePaper} from '../../src/media/paper.mjs';
import {createSheet} from '../../src/media/sheet.mjs';
import {createBrush,dip,stroke} from '../../src/media/brush.mjs';
const intent=move=>({pass:{source:'authored',move,load:{water:.8}}});
test('loaded wet-edge continuation uses the deeper wet bridge while keeping existing mixing and softness',()=>{
 const t=semanticTechnique(intent('wet-edge continuation'),{});
 assert.equal(t.bridge,.98);assert.equal(t.bridgeSoft,2.2);assert.equal(t.wetMix,.85);
 assert.equal(t.intoWet,true);assert.equal(t.dryAfter,false);assert.equal(t.water,.8);
 const wet=semanticTechnique(intent('wet on wet'),{}),bounded=semanticTechnique(intent('wet on dry'),{});
 assert.equal(wet.bridge,.98);assert.equal(wet.bridgeSoft,3);assert.equal(bounded.bridge,.78);assert.equal(bounded.dryAfter,true);
});
test('dry-brush mapping retains the exact prior native physical broken contact',()=>{
 const t=semanticTechnique({pass:{source:'authored',move:'dry brush',load:{water:.28}}},{});
 assert.equal(t.bridge,.78);assert.equal(t.bridgeSoft,2.2);assert.equal(t.wetMix,.1);assert.equal(t.intoWet,false);
 const draw=options=>{
  const sh=createSheet(makePaper(96,48,{seed:9,mmPerCell:.125,fibres:.35,tooth:.12,toothScale:.2}),[{K:[.3,.3,.3],S:[.02,.02,.02],rho:.05,omega:1.4,gamma:.25}]);
  const b=createBrush({model:'tuft',radius:12,bristles:24,capacity:40,belly:12,free:.4,film:.25,feed:.4,give:.9,seed:31,...options});
  dip(b,{water:.28,conc:[2]});stroke(b,sh,[{x:10,y:24,p:.9},{x:86,y:24,p:.9}]);return sh;
 };
 const old=draw({bridge:.78,bridgeSoft:2.2,wetMix:.1}),current=draw(t);
 for(const key of ['W','s','M','ever'])assert.deepEqual(current[key],old[key]);
 for(const key of ['G','P','D'])assert.deepEqual(current[key],old[key]);
 const mass=current.G[0].reduce((s,v,i)=>s+v+current.P[0][i]+current.D[0][i],0);
 assert.ok(mass>0,'actual pigment is deposited');
 assert.ok(current.G[0].some((v,i)=>v+current.P[0][i]+current.D[0][i]===0),'intentional dry gaps remain');
});
