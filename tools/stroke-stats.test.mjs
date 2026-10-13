import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { normalize, summarize, loadStats, panelSVG } from './stroke-stats.mjs';
import { evaluateGate, admitStrokePlan } from './stroke-gate.mjs';
import { composition } from './stroke-composition.mjs';

const tape = () => ({ w:100,h:50,scale:10,sheetWidthMm:200,brushes:[0,1],brushOpts:[{radius:10},{radius:.2}],pens:[0],penOpts:[{nib:.2,flex:.4}],marks:[
  {k:'m',i:0},{k:'s',b:0,wt:1,d:[[0,100],[900,100]]},
  {k:'s',b:0,d:[[0,100,-1,-1],[900,100,-1,-1]]},
  {k:'m',i:1},{k:'s',b:1,d:[[0,0],[10,0]]},
  {k:'P',pen:0,r:2,d:[[0,0,100,-1,0,40],[1000,0,100,-1,0,40]]}] });
test('tape units, per-point radius sentinel, clean water and fine-sheet pen width are respected',()=>{
 const n=normalize(tape());assert.equal(n.marks[1].widthMm,40);assert.equal(n.marks[1].lengthMm,180);
 assert.equal(n.marks[2].widthMm,.8);assert.equal(n.marks[3].widthMm,.4);assert.equal(n.marks[3].lengthMm,100);
 const s=summarize(n);assert.deepEqual(s.counts,{paint:2,pen:1,water:1});assert.equal(s.metrics.tinyPaintShare,.5);
 assert.equal(s.metrics.largestPaintWidthSheetFraction,.2);assert.equal(s.metrics.earlyBroadWashCount,1);
 assert.ok(s.metrics.broadWashAreaShare>.99);assert.equal(s.marksOverTime[1].pen,1);
 assert.ok(Math.abs(s.histograms.paintAreaByWidth.reduce((a,b)=>a+b.share,0)-1)<1e-10);
});
test('water alone cannot satisfy broad paint area or largest paint contact',()=>{
 const t=tape();t.marks=t.marks.filter(m=>m.wt||m.b===1||m.k==='m');
 const s=summarize(normalize(t));assert.equal(s.metrics.broadWashAreaShare,0);assert.equal(s.metrics.largestPaintWidthMm,.8);
 assert.equal(evaluateGate(s,{mode:'reject'}).ok,false);
});
test('contact radius overrides nominal brush size; path length includes bends',()=>{
 const t=tape();t.marks=[{k:'s',b:0,d:[[0,0,80,5],[100,0,80,5],[100,100,80,5]]}];
 const s=summarize(normalize(t));assert.equal(s.metrics.largestPaintWidthMm,2);assert.equal(s.metrics.paintUnder1MmShare,0);
 assert.equal(s.histograms.lengthMm.find(b=>b.minMm===24).paint,1);
});
test('width and length flags use strict physical bounds, and zero-length dabs count',()=>{
 const plan={grid:{w:100,h:50,mmPerCell:1},commands:[{operation:'stroke',brush:{widthMm:1},paths:[[{x:0,y:0},{x:.03,y:0}],[{x:0,y:0},{x:0,y:0}]]}]};
 const s=summarize(normalize(plan));assert.equal(s.metrics.paintUnder1MmShare,0);assert.equal(s.metrics.paintUnder3MmLongShare,.5);
 assert.equal(admitStrokePlan(plan).ok,false);assert.equal(admitStrokePlan(plan).blocks,false);assert.equal(admitStrokePlan(plan,{mode:'reject'}).blocks,true);
 assert.throws(()=>admitStrokePlan(plan,{config:{maxBroadAreaTinyAreaShare:1.1}}),/invalid/);
 assert.throws(()=>evaluateGate(s,{mode:'oops'}),/mode/);
 assert.throws(()=>evaluateGate(s,{config:{typo:1}}),/unknown/);
});
test('missing physical scale or unmeasurable value plan cannot silently pass',()=>{
 const t=tape();delete t.sheetWidthMm;assert.throws(()=>normalize(t),/sheet width/);
 assert.throws(()=>normalize({families:[]}),/no measurable paths/);
 const s=summarize(normalize({...t,sheetWidthMm:200,marks:[]}));assert.equal(evaluateGate(s,{mode:'reject'}).ok,false);
 assert.equal(evaluateGate(s).verified,false);
 assert.equal(evaluateGate({...s,counts:{paint:1},metrics:{}},{mode:'reject'}).verified,false);
});
test('loader decompresses runs and prefers precise run flags over rounded logs',async t=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'stroke-stats-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));fs.mkdirSync(path.join(d,'paint'));
 const a=tape();delete a.sheetWidthMm;fs.writeFileSync(path.join(d,'paint/marks.json.gz'),zlib.gzipSync(JSON.stringify(a)));
 fs.writeFileSync(path.join(d,'run.sh'),'node paint --sheetmm 152.4');fs.writeFileSync(path.join(d,'paint.log'),'physical: picture 152 mm wide');
 const s=await loadStats(d);assert.equal(s.sheet.widthMm,152.4);
 const svg=panelSVG(s,{title:'a < b & c'});assert.ok(svg.includes('a &lt; b &amp; c'));assert.ok(!svg.includes('NaN'));
 const f=path.join(d,'stats.json');fs.writeFileSync(f,JSON.stringify(s));
 const gate=new URL('./stroke-gate.mjs',import.meta.url).pathname;
 assert.equal(spawnSync(process.execPath,[gate,f]).status,0);assert.equal(spawnSync(process.execPath,[gate,f,'--mode','reject']).status,4);
});
test('run-plan refuses tiny plans before painting, with a configurable exception',t=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'stroke-admit-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const plan={grid:{w:20,h:10,mmPerCell:1},palette:['ultramarine'],commands:[{id:'dab',operation:'stroke',brush:{kind:'round',widthMm:.5},load:{capacityMm3:1,waterQuantityMm3:.5,concentration:{ultramarine:.5}},paths:[[{x:.3,y:.3},{x:.31,y:.3}]]}]};
 const f=path.join(d,'plan.json');fs.writeFileSync(f,JSON.stringify(plan));const runner=new URL('./run-plan.mjs',import.meta.url).pathname;
 const r=spawnSync(process.execPath,[runner,f,'--stroke-gate','reject','--out',path.join(d,'out')]);
 assert.equal(r.status,1);assert.match(r.stderr.toString(),/stroke-size admission refused/);assert.equal(fs.existsSync(path.join(d,'out')),false);
 plan.broadAreas=[];
 const report=admitStrokePlan(plan,{mode:'reject'});assert.equal(report.ok,true);
});

const broadArea = {id:'wall',label:'Wall wash',polygon:[[.1,.2],[.9,.2],[.9,.8],[.1,.8]]};
const depositTape=()=>({w:100,h:60,scale:10,sheetWidthMm:100,base:[255,255,255],pigments:[{K:[1,.5,.2]}],brushes:[0,1],brushOpts:[{radius:15,film:.25,capacity:100},{radius:.4,film:.25,capacity:100}],marks:[{k:'d',b:0,w:1,c:[.5]},{k:'s',b:0,d:[[100,300,100],[900,300,100]]}]});
function weighted(t,areas=[broadArea],context={}) {
 const n=normalize(t);n.broadAreas=areas;return summarize(n,context);
}
test('numerous faint tiny details over a wash do not reject the painting',()=>{
 const t=depositTape();t.marks.push({k:'d',b:1,w:1,c:[.0001]});
 for(let i=0;i<100;i++)t.marks.push({k:'s',b:1,d:[[500,300,100],[510,300,100]]});
 const s=weighted(t);assert.ok(s.metrics.tinyPaintShare>.98);
 assert.ok(s.composition.tinyVisibleShare<.01);assert.ok(s.composition.broadAreas[0].tinyCarriedAreaShare<.01);
 assert.equal(evaluateGate(s,{mode:'reject'}).ok,true);
});
test('tiny marks replacing a broad wash fail by area and visible contribution',()=>{
 const t=depositTape();t.marks=[];
 for(let y=12;y<=48;y+=.5)t.marks.push({k:'d',b:1,w:1,c:[.5]},{k:'s',b:1,d:[[100,y*10,100],[900,y*10,100]]});
 const s=weighted(t),a=s.composition.broadAreas[0];
 assert.ok(a.tinyCarriedAreaShare>.9);assert.equal(a.tinyVisibleShare,1);
 assert.deepEqual(evaluateGate(s).flags.map(f=>f.code),['tinyCarriedAreaShare','tinyVisibleShare']);
});
test('low-count dark tiny paint can dominate a broad area and still be caught',()=>{
 const t=depositTape();t.marks=[];
 for(let i=0;i<30;i++)t.marks.push({k:'d',b:0,w:1,c:[.000001]},{k:'s',b:0,d:[[100,300,100],[900,300,100]]});
 t.marks.push({k:'d',b:1,w:1,c:[100]},{k:'s',b:1,d:[[500,300,100],[510,300,100]]});
 const s=weighted(t);assert.ok(s.metrics.tinyPaintShare<.04);
 assert.ok(s.composition.broadAreas[0].tinyVisibleShare>.3);
 assert.ok(evaluateGate(s).flags.some(f=>f.code==='tinyVisibleShare'));
});
test('planned details and boundaries are exempt even when tiny marks dominate globally',()=>{
 const t=depositTape();t.marks=[];
 for(let y=12;y<=48;y+=.5)t.marks.push({k:'d',b:1,w:1,c:[100]},{k:'s',b:1,d:[[550,y*10,100],[890,y*10,100]]});
 t.marks.push({k:'d',b:0,w:1,c:[.001]},{k:'s',b:0,d:[[150,300,100],[500,300,100]]});
 const area={...broadArea,detailPolygons:[[[.52,0],[1,0],[1,1],[.52,1]]]};
 const s=weighted(t,[area]);assert.ok(s.composition.tinyVisibleShare>.9);
 assert.equal(s.composition.broadAreas[0].tinyVisibleShare,0);assert.equal(evaluateGate(s).passes,true);
 const edge=depositTape();edge.marks.push({k:'d',b:1,w:1,c:[100]},{k:'s',b:1,d:[[100,120,100],[900,120,100]]});
 assert.equal(weighted(edge).composition.broadAreas[0].tinyVisibleShare,0);
});
test('coverage is a clipped union and repeated coats do not inflate covered area',()=>{
 const t=depositTape();t.marks=[{k:'d',b:1,w:1,c:[1]},{k:'s',b:1,d:[[500,300,100],[510,300,100]]}];
 const one=weighted(t);t.marks.push(t.marks[1]);const two=weighted(t);
 assert.equal(two.composition.tinyCoveredSheetShare,one.composition.tinyCoveredSheetShare);
 t.marks.unshift({k:'c',r:[0,100*20]});assert.equal(weighted(t).composition.coveredSheetShare,0);
 const masked=depositTape();masked.marks.unshift({k:'r',m:Array(6000).fill(1)});
 assert.equal(weighted(masked).composition.coveredSheetShare,0);
});
test('clean water, zero pressure and an observed zero deposit do not carry paint',()=>{
 const t=depositTape();t.marks.push({k:'d',b:1,w:1,c:[0]},{k:'s',b:1,d:[[500,300,100],[510,300,100]]});
 const s=weighted(t);assert.equal(s.counts.water,1);assert.equal(s.composition.tinyVisibleShare,0);
 const zero=depositTape();zero.marks[1].d=zero.marks[1].d.map(p=>[p[0],p[1],0]);assert.equal(weighted(zero).composition.coveredSheetShare,0);
 const observed=depositTape(),command={status:'EXECUTED',intent:'wall',geometry:[{x:10,y:30},{x:90,y:30}],brushBefore:{pigmentMass:[1]},brushAfter:{pigmentMass:[1]}};
 assert.equal(weighted(observed,[broadArea],{commands:[command]}).composition.coveredSheetShare,0);
});
test('only broad-area weighted thresholds gate; equality passes and old count configs are errors',()=>{
 const s=weighted(depositTape());s.metrics.tinyPaintShare=1;s.metrics.broadWashAreaShare=0;s.metrics.earlyBroadWashCount=0;
 const a=s.composition.broadAreas[0];a.tinyCarriedAreaShare=.3;a.tinyVisibleShare=.3;
 assert.equal(evaluateGate(s,{mode:'reject'}).ok,true);a.tinyCarriedAreaShare=.300001;
 assert.equal(evaluateGate(s,{mode:'reject'}).ok,false);
 assert.throws(()=>evaluateGate(s,{config:{maxTinyPaintShare:.3}}),/unknown/);
 assert.throws(()=>evaluateGate(s,{config:{maxBroadAreaTinyVisibleShare:NaN}}),/invalid/);
 a.tinyVisibleShare=undefined;assert.throws(()=>evaluateGate(s),/missing/);
});
test('missing area plans or recipes remain unmeasured, rather than judging count share',()=>{
 const t=depositTape(),unplanned=summarize(normalize(t));assert.equal(evaluateGate(unplanned).verified,false);assert.deepEqual(evaluateGate(unplanned).flags,[]);
 delete t.pigments;const s=weighted(t);assert.equal(s.composition.depositMeasured,false);assert.equal(evaluateGate(s,{mode:'reject'}).ok,false);
});
test('the saved final image supplies visible weights, including colour changes and vanished marks',()=>{
 const t=depositTape();t.marks[0].c=[.000001];t.marks.push({k:'d',b:1,w:1,c:[100]},{k:'s',b:1,d:[[500,300,100],[510,300,100]]});
 const n=normalize(t);n.broadAreas=[broadArea];const w=512,h=Math.round(w*.6),blank=Buffer.alloc(w*h*3,255);
 const c=composition(n,{tape:t,finalRGB:blank,paperRGB:t.base});assert.equal(c.depositMeasured,false);assert.equal(c.tinyVisibleShare,null);
 const rgb=Buffer.from(blank);for(let y=Math.floor(.495*h);y<Math.ceil(.505*h);y++)for(let x=Math.floor(.5*w);x<Math.ceil(.51*w);x++)rgb[(y*w+x)*3]=80;
 const coloured=composition(n,{tape:t,finalRGB:rgb,paperRGB:t.base});assert.ok(coloured.tinyVisibleShare>.5);
 assert.ok(Math.abs(coloured.classes.reduce((s,g)=>s+g.visibleShare,0)-1)<1e-8);
 const ink=Buffer.from(rgb);const afterInk=composition(n,{tape:t,finalRGB:rgb,inkRGB:ink,paperRGB:t.base});assert.equal(afterInk.depositMeasured,false);
});

test('broad-area annotations require valid geometry and cannot silently exempt null or duplicate IDs',()=>{
 const t=depositTape();assert.throws(()=>weighted(t,null),/must be an array/);
 assert.throws(()=>weighted(t,[broadArea,broadArea]),/unique/);
 assert.throws(()=>weighted(t,[{...broadArea,edgeClearanceMm:-1}]),/nonnegative/);
 assert.throws(()=>weighted(t,[{...broadArea,polygon:[[2,0],[1,1],[0,1]]}]),/normalized/);
});

test('unattributed final colour stays in each broad area denominator instead of being assigned to tiny paint',()=>{
 const t=depositTape();t.marks=[{k:'d',b:1,w:1,c:[1]},{k:'s',b:1,d:[[500,300,100],[510,300,100]]}];
 const n=normalize(t);n.broadAreas=[broadArea];const w=512,h=Math.round(w*.6),rgb=Buffer.alloc(w*h*3,255);
 for(let y=Math.floor(.2*h);y<Math.ceil(.8*h);y++)for(let x=Math.floor(.1*w);x<Math.ceil(.9*w);x++)rgb[(y*w+x)*3]=80;
 const c=composition(n,{tape:t,finalRGB:rgb,paperRGB:t.base}),a=c.broadAreas[0];
 assert.ok(a.tinyVisibleShare<.01);assert.ok(a.attributedVisibleShare<.01);
});
