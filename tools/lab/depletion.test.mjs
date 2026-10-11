import test from 'node:test';import assert from 'node:assert/strict';
import {makePaper} from '../../src/media/paper.mjs';
import {createSheet,step} from '../../src/media/sheet.mjs';
import {createBrush,dip,stroke} from '../../src/media/brush.mjs';
import {createPen,dipPen,penStroke} from '../../src/media/pen.mjs';
import {handBrushOptions,needsRedip} from '../../docs/lab/brush-load.js';
import {paperOptions} from '../../docs/lab/media/papers.js';
import {measureLoad} from './measure-load.mjs';
const pigment={K:[.4,.6,.9],S:[.01,.01,.01],rho:.05,omega:1.4,gamma:.15};
const sum=a=>a.reduce((s,v)=>s+v,0),water=b=>b.resW+sum(b.hairs.map(h=>h.water)),paint=b=>sum(b.resP)+sum(b.hairs.map(h=>sum(h.pig)));
const path=Array.from({length:17},(_,j)=>[{x:j%2?280:20,y:12+j*10,p:.8,v:.3},{x:j%2?20:280,y:12+j*10,p:.8,v:.3}]).flat();
test('a long brush stroke consumes water and pigment and stays depleted after lifting',()=>{
 const s=createSheet(makePaper(300,200),[pigment]),b=createBrush({radius:6,capacity:12,belly:1.6,feed:.06});dip(b,{water:1,conc:[.5]});const w=water(b),p=paint(b);
 stroke(b,s,path);assert.ok(water(b)<w*.15,`${water(b)}/${w}`);assert.ok(paint(b)<p*.15);
 const before=water(b);stroke(b,s,[{x:20,y:190,p:.8},{x:280,y:190,p:.8}]);assert.ok(water(b)<=before+.001,'lifting does not refill');
 dip(b,{water:1,conc:[.5]});assert.ok(water(b)>before*5,'explicit dip restores supply');
});
test('a slow long pen line consumes its reservoir and skips near its end',()=>{
 const s=createSheet(makePaper(300,200),[pigment]),p=createPen({reservoir:250});dipPen(p,[7]);penStroke(p,s,path);assert.ok(p.ink<25,`ink remaining ${p.ink}`);
 const inkAt=(from,to)=>{let total=0;for(let y=from;y<to;y++)for(let x=0;x<300;x++)total+=s.D[0][y*300+x]+s.P[0][y*300+x];return total;};assert.ok(inkAt(140,180)<inkAt(0,40)*.1,'late line runs dry');
});
test('surface and pore water evaporate without resets or a dryer',()=>{
 const s=createSheet(makePaper(48,32),[pigment]),b=createBrush({radius:4,capacity:12});dip(b,{water:1,conc:[.5]});stroke(b,s,[{x:8,y:16,p:1},{x:40,y:16,p:1}]);
 const before=sum(s.W)+sum(s.s);for(let i=0;i<4000;i++)step(s,{dt:.3});const after=sum(s.W)+sum(s.s);assert.ok(after<before*.1,`${before} → ${after}`);assert.ok(sum(s.G[0])+sum(s.D[0])+sum(s.P[0])>0,'drying leaves pigment');
});

const labPaper=()=>({...makePaper(480,360,paperOptions('cold',60,7)),mmPerCell:25.4/60});
const sweep=j=>[{x:j%2?450:30,y:40+j*55,p:.8,v:.6},{x:j%2?30:450,y:40+j*55,p:.8,v:.6}];
function band(s,j){
 let wet=0,film=0,painted=0,pigment=0,n=0;
 for(let y=25+j*55;y<55+j*55;y++)for(let x=50;x<430;x++){
  const i=y*s.w+x,m=s.G[0][i]+s.D[0][i]+s.P[0][i];
  wet+=s.W[i]>.02;film+=s.W[i];painted+=m>1e-5;pigment+=m;n++;
 }
 return {wet:wet/n,film:film/n,painted:painted/n,pigment};
}
for(const tool of ['round','flat'])test(`one loaded ${tool} brush glazes a broad area evenly, stays wet, then depletes`,()=>{
 const s=createSheet(labPaper(),[pigment]);
 const b=createBrush(handBrushOptions({tool,sizeMm:25,water:2},{seed:149}));
 dip(b,{water:2,conc:[.08]});const initial=water(b),bands=[];
 assert.equal(needsRedip(b),true);
 for(let j=0;j<2;j++){stroke(b,s,sweep(j));bands.push(band(s,j));}
 // Faster wet feed spends one finite load sooner: two broad, even sweeps.
 for(const r of bands){assert.ok(r.wet>.95,`${tool} wet coverage ${r.wet}`);assert.ok(r.film>.1);}
 assert.ok(bands[1].pigment/bands[0].pigment>.85,'glaze concentration stays even');
 const wetArea=()=>s.W.reduce((n,w)=>n+(w>.02),0);
 assert.ok(wetArea()>s.n*.2,`${wetArea()} wet cells`);
 for(let i=0;i<10;i++)step(s,{dt:.3});
 assert.ok(wetArea()>s.n*.2,'water survives settling on the paper');
 assert.ok(water(b)<initial*.5,'load really leaves the brush');
 assert.equal(needsRedip(b),true,'next visitor stroke can re-dip');
 assert.equal(needsRedip(b,false),false,'manual depletion mode does not re-dip');
 for(let j=2;j<6;j++)stroke(b,s,sweep(j));
 assert.ok(water(b)<initial*.01,'continued painting without a dip runs out');
 assert.ok(band(s,5).pigment<bands[0].pigment*.01,'late stroke fades');
});

test('the low-water hand brush skips the tooth and runs dry within one sweep',()=>{
 const s=createSheet(labPaper(),[pigment]),b=createBrush(handBrushOptions({tool:'round',sizeMm:25,water:.15},{seed:149}));
 dip(b,{water:.15,conc:[.5]});const initial=water(b);stroke(b,s,sweep(0));const first=band(s,0);
 assert.ok(first.painted>.05&&first.painted<.5,`broken tooth contact ${first.painted}`);
 assert.equal(first.wet,0);assert.ok(water(b)<initial*.1);
 stroke(b,s,sweep(1));assert.ok(band(s,1).pigment<first.pigment*.1);
});

// Check transverse paint uniformity as well as bare-paper coverage: a striped
// wash can still put a trace of pigment in every cell.
for(const dpi of [15,60,90])for(const tool of ['round','flat'])for(const water of [1.5,3])
 test(`${tool} at water ${water}, ${dpi} dpi keeps loaded lanes even along a long stroke`,()=>{
  const r=measureLoad({dpi,tool,water});
  const loaded=r.bands.filter(b=>b.before<.8&&b.left>.15);
  assert.ok(loaded.length>3);
  for(const b of loaded){
   assert.ok(b.coverage>.99,`coverage ${b.coverage} at load ${b.left}`);
   assert.ok(b.laneCV<.04,`lane variation ${b.laneCV} at load ${b.left}`);
   assert.equal(b.dryHairs,0,'loaded belly keeps all hairs wet');
  }
  const gap=r.bands.find(b=>b.coverage<.95);
  if(gap)assert.ok(gap.before<.08,`breakup starts only near empty: ${gap.before}`);
  if(water===1.5){assert.ok(gap,'finite load eventually breaks up');assert.ok(r.remaining<.01);}
 });
for(const dpi of [15,60,90])test(`low water retains dry-brush breakup at ${dpi} dpi`,()=>{
 const {bands}=measureLoad({dpi,water:.15});
 assert.ok(bands[0].coverage>.05&&bands[0].coverage<.5);
 assert.ok(bands.at(-1).mass<bands[0].mass*.05);
});
for(const fraction of [.25,.4])for(const tool of ['round','flat'])for(const water of [2,3])test(`${tool} water ${water} wash re-dips from ${fraction*100}% and covers the sheet through its end`,()=>{
 const b=createBrush(handBrushOptions({tool,sizeMm:10,water},{dpi:90,seed:149}));
 dip(b,{water,conc:[.5]});
 b.resW*=fraction;b.resP=b.resP.map(p=>p*fraction);
 for(const h of b.hairs){h.water*=fraction;h.pig=h.pig.map(p=>p*fraction);}
 assert.equal(needsRedip(b,false),false,'manual mode keeps the remaining load');
 assert.equal(needsRedip(b),true,'auto mode returns to the palette each wet stroke');
 if(needsRedip(b))dip(b,{water,conc:[.5]});
 const s=createSheet({...makePaper(720,100,paperOptions('cold',90,7)),mmPerCell:25.4/90},[pigment]);
 for(let x=20;x<700;x+=4)stroke(b,s,[{x,y:50,p:.8},{x:x+4,y:50,p:.8}],{lift:false});
 for(let x=660;x<696;x++)for(let y=43;y<57;y++){
  const i=y*s.w+x;assert.ok(s.G[0][i]+s.D[0][i]+s.P[0][i]>1e-5,`end gap at ${x},${y}`);
 }
});
test('auto re-dip leaves a blotted brush finite',()=>{
 const b=createBrush(handBrushOptions({tool:'round',sizeMm:10,water:.15}));
 dip(b,{water:.15,conc:[.5]});assert.equal(needsRedip(b),false);
 b.resW=0;for(const h of b.hairs)h.water=0;
 assert.equal(needsRedip(b),false);
});
