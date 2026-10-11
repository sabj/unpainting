import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { normalize, summarize, loadStats, panelSVG } from './stroke-stats.mjs';
import { evaluateGate, admitStrokePlan } from './stroke-gate.mjs';

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
 assert.equal(admitStrokePlan(plan).ok,true);assert.equal(admitStrokePlan(plan,{mode:'reject'}).ok,false);
 assert.throws(()=>admitStrokePlan(plan,{config:{maxTinyPaintShare:1.1}}),/invalid/);
 assert.throws(()=>evaluateGate(s,{mode:'oops'}),/mode/);
 assert.throws(()=>evaluateGate(s,{config:{typo:1}}),/unknown/);
});
test('missing physical scale or unmeasurable value plan cannot silently pass',()=>{
 const t=tape();delete t.sheetWidthMm;assert.throws(()=>normalize(t),/sheet width/);
 assert.throws(()=>normalize({families:[]}),/no measurable paths/);
 const s=summarize(normalize({...t,sheetWidthMm:200,marks:[]}));assert.equal(evaluateGate(s,{mode:'reject'}).ok,false);
 assert.equal(evaluateGate(s).verified,false);
 assert.throws(()=>evaluateGate({...s,counts:{paint:1},metrics:{}},{mode:'reject'}),/missing/);
});
test('loader decompresses runs and prefers precise run flags over rounded logs',t=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'stroke-stats-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));fs.mkdirSync(path.join(d,'paint'));
 const a=tape();delete a.sheetWidthMm;fs.writeFileSync(path.join(d,'paint/marks.json.gz'),zlib.gzipSync(JSON.stringify(a)));
 fs.writeFileSync(path.join(d,'run.sh'),'node paint --sheetmm 152.4');fs.writeFileSync(path.join(d,'paint.log'),'physical: picture 152 mm wide');
 const s=loadStats(d);assert.equal(s.sheet.widthMm,152.4);
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
 const report=admitStrokePlan(plan,{mode:'reject',config:{maxTinyPaintShare:1,maxUnder1MmShare:1,maxUnder3MmLongShare:1,minLargestPaintWidthSheetFraction:0,minBroadWashAreaShare:0,minEarlyBroadWashCount:0}});assert.equal(report.ok,true);
});
