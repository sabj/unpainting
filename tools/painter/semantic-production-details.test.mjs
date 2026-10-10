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
 const source=fs.readFileSync(new URL('../paint-plate.mjs',import.meta.url),'utf8');
 const declaration=source.split('\n').find(line=>line.includes('const supportedCharge='));
 assert.ok(declaration);
 const out=fs.mkdtempSync(nodePath.join(os.tmpdir(),'production-contact-log-'));
 try {
  const sheet={clip:new Uint8Array([1])},brush={};
  const sh={_semantic:{area:{id:'cat'},key:'cat/source-values',pass:{brush:{orientation:'sweep'}}}};
  let primaryCellCount=3;
  const predict=(actualBrush,actualSheet,points,options)=>{assert.equal(actualBrush,brush);assert.equal(actualSheet,sheet);assert.equal(options.upright,'sweep');assert.deepEqual(points,gesture);return {primaryCellCount};};
  const create=new Function('fs','path','out','AREA_NUMERIC_SEQUENCE','productionChargeSupported','candidateContact','brush','sheet','sh','AREA_NUMERIC_CONTACT_STOP',declaration+'\nreturn supportedCharge;');
  const supported=create(fs,nodePath,out,{shapeKey:'shape-A'},productionChargeSupported,predict,brush,sheet,sh,null);
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
 const source=fs.readFileSync(new URL('../paint-plate.mjs',import.meta.url),'utf8');
 const compiled=source.indexOf("layers=AREA_COMPILED.layers;validateCompiledAreaStop(opt('areastop',''),layers)");
 assert.ok(compiled>0&&compiled<source.indexOf('const supportedCharge='));
 // the numeric contact stop comes before the notice that target-seeded dry-brush marks are removed
 assert.ok(source.indexOf('if(AREA_NUMERIC_CONTACT_STOP){')<source.indexOf("target-seeded dry-brush marks removed"));
});
