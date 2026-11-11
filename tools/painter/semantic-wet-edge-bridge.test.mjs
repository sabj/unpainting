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
test('dry-brush mapping is the technique library dry brush: its contact leaves the tooth broken',async()=>{
 const {TECHNIQUES}=await import('../../src/paint/methods/lay.mjs');
 const t=semanticTechnique({pass:{source:'authored',move:'dry brush',load:{water:.28}}},{});
 for(const k of ['bridge','bridgeSoft','wetMix'])assert.equal(t[k],TECHNIQUES['dry brush'][k]);assert.equal(t.intoWet,false);
 const draw=options=>{
  const sh=createSheet(makePaper(96,48,{seed:9,mmPerCell:.125,fibres:.35,tooth:.12,toothScale:.2}),[{K:[.3,.3,.3],S:[.02,.02,.02],rho:.05,omega:1.4,gamma:.25}]);
  const b=createBrush({model:'tuft',radius:12,bristles:24,capacity:40,belly:12,free:.4,film:.25,feed:.4,give:.9,seed:31,...options});
  dip(b,{water:.28,conc:[2]});stroke(b,sh,[{x:10,y:24,p:.9},{x:86,y:24,p:.9}]);return sh;
 };
 // the earlier mapping bridged the tooth like a wet on dry wash (bridge .78); the library dry brush bridges it less
 const old=draw({bridge:.78,bridgeSoft:2.2,wetMix:.1}),current=draw(t);
 const gaps=sh=>{let g=0;for(let y=18;y<30;y++)for(let x=20;x<76;x++){const i=y*96+x;if(sh.G[0][i]+sh.P[0][i]+sh.D[0][i]===0)g++;}return g;};
 const mass=current.G[0].reduce((s,v,i)=>s+v+current.P[0][i]+current.D[0][i],0);
 assert.ok(mass>0,'actual pigment is deposited');
 assert.ok(gaps(current)>0,'intentional dry gaps remain');
 assert.ok(gaps(current)>=gaps(old),`dry gaps ${gaps(current)} against ${gaps(old)} with the wash bridge`);
});
