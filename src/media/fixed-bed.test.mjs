import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, step, DEFAULTS } from './sheet.mjs';
const pigment = {K:[.4,.4,.4],S:[.02,.02,.02],rho:.05,omega:1.4,gamma:1};
function fixture(withBed=true) {
  const p=makePaper(5,5);p.height.fill(0);p.height[12]=.8;
  const s=createSheet(p,[pigment]);s.W.fill(.1);s.M.fill(1);s.ever.fill(1);s.D[0][12]=.02;
  if(withBed){const fixed=new Float32Array(25);fixed.fill(.5);fixed[12]=0;s.layers.push([fixed]);}
  return s;
}
// slideFill 2: the fixture's hollow is sized so the deposit fills it at the fill this was written with; fillRef 0 keeps that
// fill (the bed's mean of 0.48 would otherwise scale it to 1.25, sheet.mjs slideFillFor)
const O={...DEFAULTS,flow:0,diffuse:0,evap:0,edgeEvap:0,absorb:0,settle:0,lift:0,scour:0,rewetLift:0,capRate:0,paperDry:0,dt:.1,slideFill:2,fillRef:0};
test('fixed pigment fills the support hollows without changing bound pigment',()=>{
 const old=fixture(),next=fixture();const fixed=next.layers[0][0].slice();
 // Stokes drag (grain-water.mjs) is 0.01308 for this pigment: observe ten
 // seconds of rolling, keeping the original 0.1 s step and all support checks.
 for(let i=0;i<100;i++){step(old,O);step(next,{...O,fixedBed:1});}
 assert.ok(old.D[0][12]<.02*.99,'unfilled support drains the exposed crest');
 assert.equal(next.D[0][12],Math.fround(.02),'filled support retains the newly deposited grains');
 assert.deepEqual(next.layers[0][0],fixed,'support never moves bound pigment');
 const mass=s=>s.D[0].reduce((a,b)=>a+b,0);
 assert.ok(Math.abs(mass(old)-mass(next))<1e-8,'loose pigment is conserved');
});
test('first wash and explicit disabled option preserve ordinary granulation',()=>{
 const a=fixture(false),b=fixture(false);step(a,O);step(b,{...O,fixedBed:1});assert.deepEqual(a.D,b.D);
 const c=fixture(),d=fixture();step(c,O);step(d,{...O,fixedBed:0});assert.deepEqual(c.D,d.D);
});
