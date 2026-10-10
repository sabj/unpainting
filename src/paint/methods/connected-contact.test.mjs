import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {makePaper} from '../../../src/media/paper.mjs';import {createSheet,step,DEFAULTS} from '../../../src/media/sheet.mjs';import {createBrush,dip,stroke,candidateContact} from '../../../src/media/brush.mjs';import {measurePaper,measureBrush} from '../../../src/paint/methods/wetdry.mjs';import {BOX,boxPigment} from '../../../src/crop/box.mjs';
for(const id of ['05-graded','06-variegated'])test(id+' loaded connected field admits exact subsequent native contacts',()=>{
 const s=JSON.parse(fs.readFileSync(new URL('../../../data/technique-microstudies/'+id+'.json',import.meta.url))),g=s.grid,sheet=createSheet(makePaper(g.w,g.h,{...s.paper,seed:s.paperSeed,mmPerCell:g.mmPerCell,coldPress:{...s.paper.coldPress,mmPerCell:g.mmPerCell}}),s.palette.map(k=>({...boxPigment(BOX.find(p=>p.key===k)),key:k}))),rows=[];
 for(const c of s.commands.filter(c=>c.operation==='stroke')){
  const b=createBrush({flat:c.brush.kind==='flat',radius:c.brush.widthMm/2/g.mmPerCell,bristles:24,loadWater:c.load.capacityMm3/g.mmPerCell**2,belly:12,give:.9,feed:.4,free:.4,film:.25,splay:.03,stiffness:3/g.mmPerCell,wetMix:.85,bridge:.98,bridgeSoft:3,seed:s.paperSeed+parseInt(crypto.createHash('sha256').update(c.id).digest('hex').slice(0,7),16)}),paths=c.paths.map(ps=>ps.map(p=>({x:p.x*g.w,y:p.y*g.h,p:p.p,r:p.rMm/g.mmPerCell}))),cells=[...new Set(paths.flatMap(p=>candidateContact(b,sheet,p,{upright:c.brush.orientation==='sweep'?'sweep':false}).cells))],before=measurePaper(sheet,cells);
  if(c.requiredPaper==='dry')assert.equal(before.dry,true);else assert.ok(before.moistShare>=.7,JSON.stringify({id:c.id,before}));
  dip(b,{water:c.load.waterQuantityMm3/c.load.capacityMm3,conc:s.palette.map(k=>c.load.concentration[k]??0)});assert.ok(Math.abs(measureBrush(b).waterMass*g.mmPerCell**2-c.load.waterQuantityMm3)<1e-6);
  let steps=0;sheet.wetting=c.role==='clean-water';for(const p of paths)stroke(b,sheet,p,{upright:c.brush.orientation==='sweep'?'sweep':false,between:()=>{if(++steps%8===0)step(sheet,DEFAULTS);}});sheet.wetting=false;
  const remaining=measureBrush(b).waterMass*g.mmPerCell**2;
  if(c.role==='clean-water'){assert.ok(remaining>=.15*c.load.waterQuantityMm3,'preparation retains deliberate remaining reservoir');assert.ok(sheet.G.every(a=>a.every(v=>v===0)),'no pigment in clean preparation');}
  rows.push({id:c.id,moistShare:before.moistShare,waterMax:before.waterMax,remainingWaterMm3:remaining});
 }
 console.log(JSON.stringify({kind:'CPU controlled contact readiness; not native GPU/artistic acceptance',id,rows}));
});
