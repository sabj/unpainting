import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, DEFAULTS } from './sheet.mjs';
import { createBrush, dip, stroke, thirsty } from './brush.mjs';
import { attachFine, fineTotals, fineBytes, fineWaterTotal } from './fine-pigment.mjs';
import { strokeFine } from './fine-brush.mjs';
import { kappaOf } from './tuft-section.mjs';

const pigment={K:[.4,.3,.1],S:[.02,.02,.02],rho:.04,omega:.5,gamma:.8};
const paper=(w,h,mm)=>makePaper(w,h,{seed:9,mmPerCell:mm,cockle:{rmsMm:0}});
const total=brush=>brush.hairs.reduce((s,h)=>s+h.pig[0],brush.resP[0]);
const water=brush=>brush.hairs.reduce((s,h)=>s+h.water,brush.resW);
const close=(a,b)=>assert.ok(Math.abs(a-b)<2e-5*Math.max(1,Math.abs(b)),`${a} against ${b}`);

for(const N of [2,4,8])for(const model of ['row','tuft','section'])test(`fine ${model} brush ratio ${N} matches native contact and conserves sheet plus brush`,()=>{
  const s=createSheet(paper(10,8,.52),[pigment]);
  const F=attachFine(s,paper(10*N,8*N,.52/N),N,{...DEFAULTS,slope:0});
  for(let c=0;c<s.n;c++)if(c%10>4)deposit(s,c,.08);
  F.G[0].fill(.03);F.P[0].fill(.01);F.D[0].fill(.02);
  const makeBrush=()=>{const b=createBrush({model,radius:1.5*N,capacity:3,variety:0,merge:0,wetMix:.3,seed:7});dip(b,{water:.7,conc:[.2]});return b;};
  const actual=makeBrush(),expected=makeBrush(),path=[{x:2*N,y:2*N,p:.7},{x:7*N,y:5*N,p:.6}];
  const reservoirScale=model==='section'?kappaOf(actual,F.paper.mmPerCell)/F.paper.mmPerCell**2:1;
  const native=createSheet(F.paper,[pigment]);
  F.prepareContact(Array.from({length:s.n},(_,i)=>i));
  native.W.set(F.wa);native.s.set(F.sa);
  for(let c=0;c<s.n;c++)for(let a=0;a<N*N;a++){const f=F.blockCells[c*N*N+a];native.M[f]=s.M[c];native.ever[f]=s.ever[c];}
  for(const kind of ['G','P','D'])native[kind][0].set(F[kind][0]);
  const before=fineTotals(F)+total(actual)*reservoirScale/N**2;
  const beforeWater=fineWaterTotal(F)+water(actual)*reservoirScale/N**2;
  stroke(expected,native,path,{spacing:.7});strokeFine(F,actual,path,{spacing:.7});
  for(const kind of ['G','P','D'])assert.deepEqual(F[kind][0],native[kind][0],kind);
  assert.deepEqual(actual.hairs,expected.hairs);close(actual.resW,expected.resW);
  for(let c=0;c<s.n;c++){
    let w=0,p=0,m=0;for(let a=0;a<N*N;a++){const f=F.blockCells[c*N*N+a];if(native.M[f]||native.W[f]>0){w+=native.W[f];m++;}p+=native.s[f];}
    close(s.W[c],m>0?w/m:0);close(s.s[c],p/N**2);
  }
  close(fineTotals(F)+total(actual)*reservoirScale/N**2,before);
  close(fineWaterTotal(F)+water(actual)*reservoirScale/N**2,beforeWater);
  assert.ok(s.G[0].every(v=>v===0),'the coarse sheet remains pigment-free');
  assert.ok(fineBytes(F)>0,'contact workspace is included without following paper or coarse-sheet references');
});

test('fine contact respects fine clips, conserves thirsty pickup and rejects an unconsumed step or in-stroke flow',()=>{
  const N=4,s=createSheet(paper(8,6,.52),[pigment]),F=attachFine(s,paper(32,24,.13),N,{...DEFAULTS,slope:0});
  for(let c=0;c<s.n;c++)deposit(s,c,.4);
  F.G[0].fill(.1);
  const b=createBrush({radius:4,variety:0,merge:0,capacity:2});dip(b,{water:.8,conc:[.2]});
  const clip=Uint8Array.from({length:F.fn},(_,f)=>f%F.FW<16?1:0),before=F.G[0].slice();
  strokeFine(F,b,[{x:8,y:10},{x:25,y:10}],{clip,lift:false});
  for(let f=0;f<F.fn;f++)if(!clip[f])assert.equal(F.G[0][f],before[f]);
  thirsty(b);const mass=fineTotals(F)+total(b)/N**2,load=water(b);
  strokeFine(F,b,[{x:5,y:5},{x:25,y:15}]);
  close(fineTotals(F)+total(b)/N**2,mass);assert.ok(water(b)>load,'thirsty brush picks up water');
  assert.throws(()=>strokeFine(F,b,[],{between:()=>{}}),/in-stroke flow/);
  F.L.begin(.1);assert.throws(()=>strokeFine(F,b,[]),/consume the coarse step/);
});
