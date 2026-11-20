import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrush,dip,stroke,candidateContact,setStrokeVariety} from '../brush.mjs';
setStrokeVariety(0);
import {makePaper} from '../paper.mjs';
import {createSheet} from '../sheet.mjs';
const options={model:'tuft',radius:24,bristles:74,capacity:100,belly:12,feed:.06,give:.9,free:.4,film:.25,wetMix:0,bridge:0,stiffness:16,seed:17};
const path=[{x:28,y:70,p:.08,r:1},{x:54,y:42,p:.85,r:22},{x:80,y:52,p:.9,r:25},{x:104,y:72,p:.75,r:20},{x:132,y:80,p:.08,r:1}];
const sheet=()=>createSheet(makePaper(160,128,{mmPerCell:.125,seed:17,fibres:.32,tooth:.3}),[{K:[.7,1.5,.5],S:[.03,.02,.04],rho:.08,omega:1.4,gamma:.25}]);
const total=s=>[s.W,...s.G,...s.P,...s.D].map(a=>a.reduce((v,x)=>v+x,0));
const water=b=>b.resW+b.hairs.reduce((s,h)=>s+h.water,0);
const pigment=b=>b.resP[0]+b.hairs.reduce((s,h)=>s+h.pig[0],0);
// measured on the paper's relief in micrometres (paper-relief.mjs, 2026-11), with the tooth read in the height's own
// units under the hairs (brush.mjs groundAt): a nearly dry tuft touches the crests of the coarse hills it rides
const expected={0.75:[723.7001354230633,723.7001354230633,0,601.4226234525104],0.18:[0.21588481636717916,0.21588481636717916,0,157.8306951290646]};
for(const load of [.75,.18]) test('native tuft matches measured contact contract with load '+load,()=>{
 const a=sheet(),ba=createBrush(options);dip(ba,{water:load,conc:[1]});
 const beforeW=water(ba),beforeP=pigment(ba);
 stroke(ba,a,path,{lift:false});
 const got=total(a),exp=expected[load];
 const max=Math.max(...got.map((v,i)=>Math.abs(v-exp[i])));
 assert.ok(max<1e-6,'physical fields differ from the measured contact contract');
 assert.ok(Math.abs(water(ba)+a.W.reduce((v,x)=>v+x,0)+a.s.reduce((v,x)=>v+x,0)-beforeW)<1e-3,'water conserved across tips, belly, film and absorbed paper');
 const actualP=[...a.G,...a.P,...a.D].reduce((s,f)=>s+f.reduce((v,x)=>v+x,0),0);
 assert.ok(Math.abs(pigment(ba)+actualP-beforeP)<1e-3,'pigment conserved');
});
test('tuft candidate contains real deposit and never mutates observed state',()=>{
 const a=sheet(),b=createBrush({...options,loadWater:5000});dip(b,{water:.72,conc:[1]});
 const state=JSON.stringify({tip:b.tip,bend:b.bend,carry:b.carry,travel:b.travel,water:water(b),pigment:pigment(b),fields:total(a),clock:a.clock,rs:b.rs});
 const f=candidateContact(b,a,path,{lift:false});
 assert.equal(JSON.stringify({tip:b.tip,bend:b.bend,carry:b.carry,travel:b.travel,water:water(b),pigment:pigment(b),fields:total(a),clock:a.clock,rs:b.rs}),state);
 stroke(b,a,path,{lift:false});let deposited=0,missing=0;
 for(let i=0;i<a.n;i++)if(a.G[0][i]+a.P[0][i]+a.D[0][i]>1e-8){deposited++;if(!f.primaryMask[i])missing++;}
 assert.ok(deposited>100);assert.equal(missing,0,'whole admitted contact covers actual deposit');
});
test('zero-pressure tuft connector has no primary material contact',()=>{
 const a=sheet(),b=createBrush(options);dip(b,{water:.75,conc:[1]});const p=[{x:20,y:30,p:0,r:24},{x:100,y:50,p:0,r:24}];
 assert.equal(candidateContact(b,a,p,{lift:false}).primaryCellCount,0);
 stroke(b,a,p,{lift:false});assert.equal(total(a).reduce((v,x)=>v+x,0),0);
});
test('brush model and lag are explicit validated physical inputs',()=>{
 assert.equal(createBrush().model,'row');assert.equal(createBrush({model:'tuft'}).model,'tuft');
 assert.throws(()=>createBrush({model:'invented'}),/Invalid brush model/);assert.throws(()=>createBrush({model:'tuft',lag:-1}),/Invalid tuft lag/);
});
