import test from 'node:test';import assert from 'node:assert/strict';import {validateProductionDetails,productionDetailContext}from'./semantic-production-details.mjs';
const doc={areas:[{id:'cat',intent:'colored cheek'}],productionDetails:{source:'production-modulate',lightAuthority:'semantic-only',regionIds:['cat'],referenceCue:'target cheek directional broken fur'}};
test('production detail binds original brush/load/owner without changing instrument',()=>{const b={flat:true,model:'row',radius:4,water:.42};const before=JSON.stringify(b);const p={doc,owner:Int16Array.from([0,0,0,0])};const c=productionDetailContext(p,{mid:{x:1,y:1},brush:b,mmPerCell:.5,width:2,water:.42,calibration:1.08});assert.equal(c.key,'cat/production-modulate');assert.equal(c.pass.wetness.required,'dry');assert.equal(c.pass.load.water,.42);assert.equal(c.pass.brush.widthMm,4);assert.equal(JSON.stringify(b),before);p.owner[3]=-1;assert.equal(productionDetailContext(p,{mid:{x:1,y:1},brush:b,mmPerCell:.5,width:2,water:.42}),null);});
test('undeclared detail owners and wrong light authority fail',()=>{assert.ok(validateProductionDetails(doc));assert.throws(()=>validateProductionDetails({...doc,productionDetails:{...doc.productionDetails,lightAuthority:'threshold'}}));assert.throws(()=>validateProductionDetails({...doc,productionDetails:{...doc.productionDetails,regionIds:['fake']}}));});
import {productionChargeLink,productionContinuationReady} from './semantic-production-details.mjs';
test('first charge/different shape cannot borrow a prior wet edge; successful adjacent same-shape charge can',()=>{
 const contact={cells:[2,3],primaryMask:Uint8Array.from([0,0,1,1])};const prev={id:'command-42',status:'executed',shapeKey:'shape-A',primary:new Set([1,2])};
 assert.equal(productionChargeLink(null,'shape-A',contact,.6),null);assert.equal(productionChargeLink(prev,'shape-B',contact,.6),null);assert.equal(productionChargeLink({...prev,status:'failed'},'shape-A',contact,.6),null);
 const link=productionChargeLink(prev,'shape-A',contact,.6);assert.equal(link.priorExecutedCommandId,'command-42');
 const paper={cells:777,waterMax:0,waterP95:0,saturationMax:.6991,moistShare:.005};assert.equal(productionContinuationReady(paper,{water:166,pigment:1},null),false);assert.equal(productionContinuationReady(paper,{water:166,pigment:1},link),true);assert.equal(productionContinuationReady({...paper,waterMax:.61},{water:166,pigment:1},link),false);assert.equal(productionContinuationReady(paper,{water:166,pigment:0},link),false);
});
test('returning path can join an earlier own executed edge, not only the last path',()=>{
 const earlier={id:'own-1',status:'executed',shapeKey:'mass',primary:new Set([10,11])};const recent={id:'own-2',status:'executed',shapeKey:'mass',primary:new Set([90])};const contact={cells:[11,12],primaryMask:Uint8Array.from({length:100},(_,i)=>i===11||i===12?1:0)};
 assert.equal(productionChargeLink(recent,'mass',contact,.6),null);assert.equal(productionChargeLink([earlier,recent],'mass',contact,.6).priorExecutedCommandId,'own-1');assert.equal(productionChargeLink([earlier,recent],'new-mass',contact,.6),null);
});
import {prepareProductionDryContact} from './semantic-production-details.mjs';
import {makePaper} from '../../src/media/paper.mjs';
import {createSheet,dry,DEFAULTS} from '../../src/media/sheet.mjs';
import {measurePaper} from '../../src/paint/methods/wetdry.mjs';
test('strict dry contact prepares an actually damp halo with ordinary physics and fresh measure; continuation/dry contacts skip',()=>{
 const pigment={K:[.4,.2,.1],S:[.02,.02,.02],rho:.05,omega:1.4,gamma:.25};
 const sheet=createSheet(makePaper(12,12,{seed:9}),[pigment]),primary=6*12+6,halo=primary+1;
 sheet.s[halo]=.472699*sheet.paper.capacity[halo];sheet.P[0][halo]=.01;
 assert.equal(measurePaper(sheet,[primary]).dry,true);assert.equal(measurePaper(sheet,[primary,halo]).dry,false);
 const preparation={operation:'ordinary-dry',maxSteps:30000,levelMax:140,dt:2},events=[];let calls=0;
 const args={preparation,observe:()=>measurePaper(sheet,[primary,halo]),dry:q=>{calls++;return dry(sheet,q.maxSteps,DEFAULTS,{levelMax:q.levelMax,dt:q.dt});},record:r=>events.push(r)};
 assert.equal(prepareProductionDryContact({...args,continuation:{own:'actual-command'}}).prepared,false);assert.equal(calls,0);
 const result=prepareProductionDryContact({...args,continuation:null});assert.equal(result.prepared,true);assert.equal(result.paper.dry,true);assert.equal(calls,1);assert.deepEqual(events.map(e=>e.status),['ordinary-dry-requested','ordinary-dry-observed']);assert.ok(events[1].returned>0);
 assert.equal(prepareProductionDryContact(args).prepared,false);assert.equal(calls,1);
 const failed=prepareProductionDryContact({preparation,observe:()=>({cells:1,dry:false}),dry:()=>0});assert.equal(failed.ready,false);assert.equal(failed.paper.dry,false);
});

test('continuation allows one float32 ratio ULP only; physical film bound and finite state stay exact',()=>{
 const link={maxSurfaceWater:.6},paper={cells:417,waterMax:.18914471566677094,waterP95:0,saturationMax:1.0000000692570032,moistShare:.06235011990407674},brush={water:69.03183673469388,pigment:41.82882762184884};
 assert.equal(productionContinuationReady(paper,brush,link),true);
 assert.equal(productionContinuationReady({...paper,saturationMax:1+2**-23},brush,link),true);
 assert.equal(productionContinuationReady({...paper,saturationMax:1+2**-22},brush,link),false);
 assert.equal(productionContinuationReady({...paper,saturationMax:1.001},brush,link),false);
 assert.equal(productionContinuationReady({...paper,waterMax:.60000001},brush,link),false);
 assert.equal(productionContinuationReady({...paper,saturationMax:NaN},brush,link),false);
 assert.equal(productionContinuationReady(paper,brush,null),false);
});

import {productionChargeSupported} from './semantic-production-details.mjs';
import {createBrush,dip,stroke,candidateContact} from '../../src/media/brush.mjs';
import {setClip} from '../../src/media/sheet.mjs';
import {semanticUsesNumericClip} from './semantic-areas.mjs';
test('original centroid rescue keeps positive islands and cannot deposit across unrelated clip holes; zero command skips dip',()=>{
 const sheet=createSheet(makePaper(540,260,{seed:9}),[{K:[.4,.2,.1],S:[.02,.02,.02],rho:.05,omega:1.4,gamma:.25}]);
 const mask=new Uint8Array(540*260);for(let y=225;y<=234;y++)for(let x=295;x<=508;x++)if(x<=315||x>=488)mask[y*540+x]=1;
 assert.equal(semanticUsesNumericClip({pass:{edges:{overlap:true}}}),true);setClip(sheet,mask);
 const b=createBrush({radius:2.8928571428571432,flat:false,bristles:12,capacity:100,belly:12,feed:.4,free:.4,seed:3});
 const path=[{x:294.8859649122807,y:229.67543859649123,r:b.radius,p:.35},{x:401.8859649122807,y:229.67543859649123,r:b.radius,p:.85},{x:508.8859649122807,y:229.67543859649123,r:b.radius,p:.35}];
 const events=[];let loads=0;const predict=path=>candidateContact(b,sheet,path,{upright:'sweep',lift:false});
 const omitted=[{x:59.8,y:-20,r:b.radius,p:.48},{x:58.4,y:-22,r:b.radius,p:.46}];
 if(productionChargeSupported({predict:()=>predict(omitted),record:r=>events.push(r)})){loads++;dip(b,{water:.8,conc:[.2]});}assert.equal(loads,0);assert.equal(events[0].status,'not-executed');
 assert.equal(productionChargeSupported({predict:()=>predict(path)}),true);dip(b,{water:.8,conc:[.2]});stroke(b,sheet,path,{upright:'sweep',lift:false});
 let inside=0,outside=0;for(let i=0;i<mask.length;i++){const v=sheet.G[0][i]+sheet.P[0][i]+sheet.D[0][i];if(mask[i])inside+=v;else outside+=v;}assert.ok(inside>0);assert.equal(outside,0);
});

import fs from 'node:fs';
import nodePath from 'node:path';
import os from 'node:os';
test('actual production support callback writes event to captured output directory, not gesture-array join',()=>{
 const source=fs.readFileSync(new URL('../plate/paint.mjs',import.meta.url),'utf8');
 const declaration=source.split('\n').find(line=>line.includes('const supportedCharge='));
 assert.ok(declaration);
 const out=fs.mkdtempSync(nodePath.join(os.tmpdir(),'production-contact-log-'));
 try {
  const sheet={clip:new Uint8Array([1])},brush={};
  const sh={_semantic:{area:{id:'cat'},key:'cat/source-values',pass:{brush:{orientation:'sweep'}}}};
  let primaryCellCount=3;
  const predict=(actualBrush,actualSheet,points,options)=>{assert.equal(actualBrush,brush);assert.equal(actualSheet,sheet);assert.equal(options.upright,'sweep');assert.deepEqual(points,gesture);return {primaryCellCount};};
  const create=new Function('JSONL','path','out','AREA_NUMERIC_SEQUENCE','productionChargeSupported','candidateContact','brush','sheet','sh','AREA_NUMERIC_CONTACT_STOP','const ctx={AREA_NUMERIC_SEQUENCE,AREA_NUMERIC_CONTACT_STOP,sheet};\n'+declaration+'\nreturn supportedCharge;');
  const supported=create({append:fs.appendFileSync},nodePath,out,{shapeKey:'shape-A'},productionChargeSupported,predict,brush,sheet,sh,null);
  const gesture=[{x:294.886,y:229.675,r:2.89,p:.35},{x:508.886,y:229.675,r:2.89,p:.35}];
  assert.equal(supported(gesture),true);primaryCellCount=0;assert.equal(supported(gesture),false);
  const rows=fs.readFileSync(nodePath.join(out,'semantic-commands.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map(row=>row.status),['supported-before-load','not-executed']);
  assert.deepEqual(rows.map(row=>row.geometry),[gesture,gesture]);
  assert.deepEqual(rows.map(row=>row.primaryCells),[3,0]);
  assert.equal(rows[0].areaId,'cat');assert.equal(rows[0].passId,'cat/source-values');assert.equal(rows[0].shapeKey,'shape-A');
  assert.deepEqual(fs.readdirSync(out),['semantic-commands.jsonl']);
  const stopped=create(fs,nodePath,out,{shapeKey:'shape-A'},productionChargeSupported,predict,brush,sheet,sh,{commandId:'executed-1'});assert.equal(stopped(gesture),false);assert.equal(fs.readFileSync(nodePath.join(out,'semantic-commands.jsonl'),'utf8').trim().split('\n').length,2);
 } finally {fs.rmSync(out,{recursive:true,force:true});}
});

import {validateCompiledAreaStop} from './semantic-production-details.mjs';
test('real compiled checkpoint rejects declared-but-empty pass before unrelated numeric paint/detail',()=>{
 const layer={_semantic:{key:'hair/source-values',area:{id:'hair'},pass:{id:'source-values',stage:'first-wash'}}};
 assert.throws(()=>validateCompiledAreaStop('paper/source-values',[layer]),/no compiled paint layers: paper/);
 validateCompiledAreaStop('hair/source-values',[layer]);validateCompiledAreaStop('hair',[layer]);validateCompiledAreaStop('stage:first-wash',[layer]);validateCompiledAreaStop('',[layer]);
 const read=name=>fs.readFileSync(new URL('../plate/'+name,import.meta.url),'utf8');
 const paint=read('paint.mjs'),finish=read('finish.mjs');
 // the stop is validated before the paint loop defines supportedCharge
 const compiled=paint.indexOf("validateCompiledAreaStop(opt('areastop',''),ctx.layers)");
 assert.ok(compiled>0&&compiled<paint.indexOf('const supportedCharge='));
 // the numeric contact stop is handled in the paint stage, which runs before the finish stage's dry-brush notice
 assert.ok(paint.includes('if(ctx.AREA_NUMERIC_CONTACT_STOP){')&&finish.includes('target-seeded dry-brush marks removed'));
});


import {semanticNumericSequence,prepareSemanticNumericContact} from './semantic-production-details.mjs';
test('ordinary numerical wash selection inherits the existing declared film bound and isolates shape histories',()=>{
 const active={key:'wash/foundation',pass:{source:'numeric',move:'wet on dry',wetness:{required:'dry'}}};
 const seq=semanticNumericSequence({areas:[]},active,0,0);
 assert.ok(seq);assert.equal(seq.settings.maxSurfaceWater,.6);
 const declared={areas:[{id:'wash'}],productionDetails:{source:'production-modulate',lightAuthority:'semantic-only',regionIds:['wash'],numericWashSequence:{mode:'dry-start-linked-adjacent-charges',maxSurfaceWater:.6}}};
 assert.equal(seq.settings.maxSurfaceWater,validateProductionDetails(declared).numericWashSequence.maxSurfaceWater);
 const explicit=semanticNumericSequence(declared,active,0,0);
 assert.equal(explicit.declared,true);assert.equal(explicit.settings,declared.productionDetails.numericWashSequence);
 assert.equal(seq.declared,false);
 assert.equal(semanticNumericSequence(declared,{...active,pass:{...active.pass,move:'wet on wet',wetness:{required:'wet'}}},0,0).settings,explicit.settings);
 assert.equal(semanticNumericSequence({areas:[]},{...active,pass:{...active.pass,source:'authored'}},0,0),null);
 assert.equal(semanticNumericSequence({areas:[]},{...active,pass:{...active.pass,move:'dry brush'}},0,0),null);
 const other=semanticNumericSequence({areas:[]},active,0,1);
 assert.notEqual(seq.shapeKey,other.shapeKey);assert.notEqual(seq.history,other.history);
});
test('ordinary contact preparation forwards complete observations and does not manufacture ownership',()=>{
 const active={key:'wash/foundation',pass:{source:'numeric',move:'wet on dry',wetness:{required:'dry'}}};
 const sequence=semanticNumericSequence({areas:[]},active,0,0);
 const contact={cells:[1],primaryMask:Uint8Array.from([0,1])};
 let calls=0;
 const observed={cells:2,dry:false,waterMax:.45,waterP95:.44,saturationMax:.9,moistShare:.95};
 sequence.history.push({id:'executed-1',status:'executed',shapeKey:sequence.shapeKey,primary:new Set([1])});
 const linked=prepareSemanticNumericContact({sequence,contact,observe:()=>observed,dry:()=>{calls++;}});
 assert.equal(linked.paper,observed);assert.equal(linked.continuation.priorExecutedCommandId,'executed-1');assert.equal(calls,0);
 assert.equal(productionContinuationReady({...observed,waterMax:.61},{water:1,pigment:1},linked.continuation),false);
 const other=semanticNumericSequence({areas:[]},active,0,1);other.history.push(...sequence.history);
 const failed=prepareSemanticNumericContact({sequence:other,contact,observe:()=>observed,dry:()=>{calls++;return 0;}});
 assert.equal(failed.continuation,null);assert.equal(calls,1);assert.equal(failed.paper.dry,false);assert.equal(failed.ready,false);
});

import {fileURLToPath} from 'node:url';
import {sheetAndBrushes} from '../plate/sheet.mjs';
import {EpochCells} from '../../src/paint/epoch-cells.mjs';
import {createAreaExecution} from './semantic-areas.mjs';
import {setStrict,strictChecks} from '../../src/media/checks.mjs';

test('ordinary wash real production strokes link executed contacts and actual dry clears ownership',async()=>{
 const root=fileURLToPath(new URL('../../',import.meta.url)),out=fs.mkdtempSync(nodePath.join(os.tmpdir(),'ordinary-wash-')),wasStrict=strictChecks();
 setStrict(true);
 try{
 const w=48,h=48,n=w*h,events=[],records=[];
 const pigment={name:'test earth',K:[.4,.2,.1],S:[.02,.02,.02],rho:.05,omega:1.4,gamma:.25};
 const flags={gpu:'off',paper:'flat',paperphysical:0,physical:0,look:0,marks:0,frames:0,cal:0};
 const opt=(k,d)=>k in flags?String(flags[k]):d,num=(k,d)=>Number(opt(k,d));
 const area={id:'wash',intent:'one connected pale foundation'};
 const pass={id:'foundation',source:'numeric',move:'wet on dry',brush:{orientation:'sweep'},load:{water:.45,pigmentScale:1,minRemainingFraction:0},wetness:{required:'dry',neighborCells:2},edges:{overlap:true}};
 const active={area,pass,key:'wash/foundation'};
 const ctx={root,out,w,h,n,opt,num,optTrack:{},WASH_FLAT_SPLAY:.03,ENTRY_FILE:nodePath.join(root,'tools/paint-plate.mjs'),
  JSONL:{append:(_p,line)=>records.push(JSON.parse(line))},NATIVE_PAINT_MODE:{mode:'fast'},RUN_CACHE:{enabled:false},CODE_HASH:'test',
  measurePaper,createBrush,physicalStroke:stroke,candidateContact,setClip,PIGS:[pigment],SHEET_PIGS:[pigment],paperRGB:[255,255,255],
  phaseMark:()=>{},clock:(_name,fn)=>fn(),VALUE_OWN_CONTACT:new EpochCells(n),VALUE_PIGMENT_CONTACT:new EpochCells(n),
  AREA_EXEC:createAreaExecution({emit:e=>events.push(e)}),AREA_LOADS:new Map(),AREA_PLAN:{doc:{areas:[area]},film:new Uint8Array(n),reserves:new Uint8Array(n)},
  TONE_MODE:'0',SHEET_TONE:{toned:false},px:new Uint8Array(n*3).fill(220),SRC:new Float32Array(n).fill(.2),layers:[],SEED:3,
  REQUESTED_DRAW_MEDIUM:'graphite',OUTLINE:{medium:'graphite'},GPU_INFO:{backend:'cpu'}};
 await sheetAndBrushes(ctx);
 events.length=0;records.length=0; // Scene assertions exclude completed scrap calibration.
 ctx.AREA_EXEC.set(active);ctx.AREA_NUMERIC_SEQUENCE=semanticNumericSequence(ctx.AREA_PLAN.doc,active,0,0);
 const brush=createBrush({radius:3,bristles:12,capacity:30,belly:3,feed:.25,give:.5,free:.4,film:.1,seed:7});
 const points=[{x:14,y:24,r:3,p:.6},{x:25,y:24,r:3,p:.6}];
 const paint=()=>{ctx.dip(brush,{water:.45,conc:[.08]});return ctx.stroke(brush,ctx.sheet,points,{upright:'sweep',lift:false,spacing:.7});};
 paint();
 assert.equal(ctx.AREA_NUMERIC_SEQUENCE.history.length,1);
 assert.ok(ctx.sheet.G[0].some(v=>v>0),'physical first stroke deposits pigment');
 const first=events.find(e=>e.operation==='physical brush stroke'&&e.status==='executed');
 assert.ok(first?.paper.dry);
 paint();
 const strokes=events.filter(e=>e.operation==='physical brush stroke'&&e.status==='executed');
 assert.equal(strokes.length,2);assert.equal(strokes[1].numericalChargeState.priorExecutedCommandId,first.id);
 assert.ok(strokes[1].numericalChargeState.overlapCells>0);
 assert.equal(events.filter(e=>e.operation==='ordinary physical drying').length,0,'own linked wet edge is not dried');
 // The same coordinates on a calibration sheet cannot borrow or change scene history.
 const sceneIds=ctx.AREA_NUMERIC_SEQUENCE.history.map(r=>r.id);
 const scrap=createSheet(makePaper(w,h,{seed:9}),[pigment]);
 ctx.dip(brush,{water:.45,conc:[.08]});
 ctx.stroke(brush,scrap,points,{upright:'sweep',lift:false,spacing:.7});
 const scrapCommand=events.filter(e=>e.operation==='physical brush stroke'&&e.status==='executed').at(-1);
 assert.equal(scrapCommand.targetSurface,'calibration-or-other');
 assert.equal(scrapCommand.numericalChargeState.priorExecutedCommandId,undefined);
 assert.deepEqual(ctx.AREA_NUMERIC_SEQUENCE.history.map(r=>r.id),sceneIds);
 ctx.dry(scrap,30000,ctx.O,{levelMax:140,dt:2});
 assert.deepEqual(ctx.AREA_NUMERIC_SEQUENCE.history.map(r=>r.id),sceneIds);

 ctx.dry(ctx.sheet,30000,ctx.O,{levelMax:140,dt:2});
 assert.equal(ctx.AREA_NUMERIC_SEQUENCE.history.length,0,'the production dry wrapper clears ownership');
 paint();
 const afterDry=events.filter(e=>e.operation==='physical brush stroke'&&e.status==='executed').at(-1);
 assert.equal(afterDry.numericalChargeState.priorExecutedCommandId,undefined);
 assert.equal(afterDry.paper.dry,true);
 // A new shape at the still-wet contact cannot borrow the old shape's edge.
 ctx.AREA_NUMERIC_SEQUENCE=semanticNumericSequence(ctx.AREA_PLAN.doc,active,0,1);
 paint();
 const final=events.filter(e=>e.operation==='physical brush stroke'&&e.status==='executed').at(-1);
 assert.equal(final.numericalChargeState.priorExecutedCommandId,undefined);
 assert.equal(final.paper.dry,true);
 assert.ok(records.some(r=>r.status==='ordinary-dry-requested'));
 assert.ok(records.some(r=>r.status==='ordinary-dry-observed'&&r.ready));
 // Physically flood the contact: no direct water-field mutation and no limit relaxation.
 const wet=createBrush({radius:5,bristles:20,capacity:120,belly:12,feed:.5,give:.9,free:.4,seed:11});
 let observed;
 for(let k=0;k<20;k++){
  dip(wet,{water:.95,conc:[0]});
  stroke(wet,ctx.sheet,points,{upright:'sweep',lift:false,spacing:.7});
  const c=candidateContact(brush,ctx.sheet,points,{upright:'sweep',lift:false,neighborRadius:2});
  observed=measurePaper(ctx.sheet,[...c.cells,...c.neighborIndices]);
  if(observed.waterMax>.6)break;
 }
 assert.ok(observed.waterMax>.6,'real clean-water strokes exceed the existing film bound');
 const owned=ctx.AREA_NUMERIC_SEQUENCE.history.map(r=>r.id),before=events.filter(e=>e.operation==='physical brush stroke'&&e.status==='executed').length;
 assert.throws(paint,/semantic material gate failed/);
 assert.equal(events.filter(e=>e.operation==='physical brush stroke'&&e.status==='executed').length,before);
 assert.deepEqual(ctx.AREA_NUMERIC_SEQUENCE.history.map(r=>r.id),owned,'failed admission does not create ownership');
 }finally{setStrict(wasStrict);fs.rmSync(out,{recursive:true,force:true});}
});
