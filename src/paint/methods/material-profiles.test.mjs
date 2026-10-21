import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialProfile,prepareDrawing,drawMaterial,sourceDrawingCaps} from './material-profiles.mjs';
import {makePaper} from '../../media/paper.mjs';
import {createSheet,DEFAULTS} from '../../media/sheet.mjs';
const g=[{points:[{x:3,y:8,s:1},{x:12,y:8,s:1},{x:22,y:8,s:1}]}];
test('drawing nib preserves measured hairline and broad widths and sub-mm source marks',()=>{
 const strokes=[.04,.2,.9].map(width=>({points:[{x:2,y:2,nw:width/.1},{x:3,y:2,nw:width/.1}]}));
 const prepared=prepareDrawing(strokes,{medium:'drawing-ink',sourceInk:true,mmPerCell:.1,w:30,h:20});
 assert.equal(prepared.length,3);
 assert.deepEqual(prepared.map(g=>+g.points[0].nw.toFixed(6)),[.4,2,9]);
});
test('an explicit graphite drawing keeps its structure at graphite pressure',()=>{
 const caps=sourceDrawingCaps({medium:'graphite-HB',plannedDrawing:true});
 const strokes=Array.from({length:40},(_,i)=>({points:[{x:2,y:i+2},{x:5,y:i+2}]}));
 const planned=prepareDrawing(strokes,{medium:'graphite-HB',mmPerCell:.5,w:50,h:50,caps});
 assert.equal(planned.length,40);
 assert(planned.every(g=>g.points.every(p=>p.p<=.3)));
 assert.equal(sourceDrawingCaps({medium:'graphite-HB'}).lines,12);
});
test('unknown medium and missing pigment fail instead of taking a blue palette entry',()=>{assert.throws(()=>materialProfile('ultramarine'),/No drawing/);const sheet=createSheet(makePaper(30,20),[materialProfile('black-ink').pigment]);assert.throws(()=>drawMaterial(sheet,g,new Float32Array(600),30,20,{medium:'sepia-ink'}),/missing declared pigment/);});
test('stage budget persists across batches; registered coordinates and mm widths survive density changes',()=>{const state={used:0},opts={medium:'black-ink',mmPerCell:.5,w:30,h:20,state,caps:{lines:1}};const a=prepareDrawing(g,opts);assert.equal(a.length,1);assert.equal(prepareDrawing(g,opts).length,0);assert.equal(a[0].points[0].x,3);assert(a[0].points.every(p=>p.s<=.3&&p.nw*.5<=.4));const b=prepareDrawing(g.map(q=>({...q,points:q.points.map(p=>({...p,x:p.x*2,y:p.y*2}))})),{...opts,state:{used:0},mmPerCell:.25});assert.equal(b[0].points[0].nw*.25,a[0].points[0].nw*.5);});
test('closing drops lights and unsupported painted masses',()=>{const edge=new Float32Array(600);edge[8*30+3]=.8;edge[8*30+12]=.7;const a=prepareDrawing(g,{medium:'sepia-ink',stage:'closing',mmPerCell:.5,w:30,h:20,edgeStrength:edge});assert.equal(a.length,1);assert.equal(a[0].points.length,2);assert(a[0].points.every(p=>p.s<=.4));assert.equal(prepareDrawing(g,{medium:'sepia-ink',stage:'closing',mmPerCell:.5,w:30,h:20}).length,0);});
test('physical dry contact records declared pigment and pressure-capped paths',()=>{const p=materialProfile('black-ink'),sheet=createSheet(makePaper(30,20),[p.pigment]),audit=[];const r=drawMaterial(sheet,g,new Float32Array(600).fill(.8),30,20,{medium:'black-ink',mmPerCell:.5,O:DEFAULTS,audit});assert.equal(r.drawn,1);assert.equal(audit.length,1);assert.equal(audit[0].after.water,0);assert(audit[0].physicalPressure.every(p=>p<=.3));assert.deepEqual(audit[0].instrument.concentration,[4]);assert(sheet.D[0].some(v=>v>0)||sheet.P[0].some(v=>v>0));});
test('graphite pressure remains absolute instead of normalizing every stroke to full pressure',()=>{const p=materialProfile('graphite-HB');const masses=[.05,.25].map(s=>{const sh=createSheet(makePaper(30,20,{seed:5}),[p.pigment]);drawMaterial(sh,g.map(q=>({...q,points:q.points.map(v=>({...v,s}))})),new Float32Array(600),30,20,{medium:'graphite-HB',mmPerCell:.5,O:DEFAULTS});return sh.D[0].reduce((a,b)=>a+b,0);});assert(masses[1]>masses[0]*3);});

test('source ink keeps short descriptive lines while graphite stays sparse',()=>{
 const strokes=Array.from({length:40},(_,i)=>({points:[{x:2,y:i+2},{x:5,y:i+2}]}));
 const opts={medium:'sepia-ink',sourceInk:true,mmPerCell:.5,w:50,h:50};
 assert.equal(prepareDrawing(strokes,opts).length,40);
 assert.equal(prepareDrawing(strokes,{...opts,medium:'graphite-HB'}).length,0);
 assert.equal(prepareDrawing(strokes,{...opts,caps:{lines:7}}).length,7);
 const state={used:0};
 assert.equal(prepareDrawing(strokes.slice(0,4),{...opts,state,caps:{lines:7}}).length,4);
 assert.equal(prepareDrawing(strokes,{...opts,state,caps:{lines:7}}).length,3);
});

test('the physical pen honors its declared load instead of replacing it with profile concentration',()=>{
 const pigment=materialProfile('black-ink').pigment;
 const masses=[1,6].map(conc=>{
  const sheet=createSheet(makePaper(30,20,{seed:9}),[pigment]);
  const audit=[];
  drawMaterial(sheet,g,new Float32Array(600).fill(.8),30,20,{medium:'black-ink',mmPerCell:.5,ink:[conc],O:DEFAULTS,audit});
  assert.deepEqual(audit[0].instrument.concentration,[conc]);
  return sheet.D[0].reduce((a,b)=>a+b,0)+sheet.P[0].reduce((a,b)=>a+b,0);
 });
 assert(masses[1]>masses[0]*4);
});

test('a prepared pen keeps point widths and shares its reservoir across short marks',()=>{
 const opts={medium:'sepia-ink',sourceInk:true,mmPerCell:.25,w:30,h:20};
 const lines=g.map(q=>({...q,points:q.points.map(p=>({...p,nw:.8}))}));
 const prepared=prepareDrawing(lines,opts);
 assert(prepared[0].points.every(p=>p.nw===.8));
 assert.equal(prepared[0].dip,false);
 assert.equal(prepareDrawing(lines,{...opts,stage:'closing'})[0].points.length,3);
 const sheet=createSheet(makePaper(30,20),[materialProfile('sepia-ink').pigment]);
 const r=drawMaterial(sheet,[...lines,...lines],new Float32Array(600).fill(.6),30,20,{...opts,O:DEFAULTS});
 assert.equal(r.drawn,2);assert.equal(r.dips,1);
});

test('source-ink closing pen defaults to light pressure, opening keeps its weight', async () => {
  const { sourceDrawingCaps: drawingCaps, CLOSING_PRESSURE_MAX } = await import('./material-profiles.mjs');
  const closing = drawingCaps({ medium: 'sepia-ink', stage: 'closing', sourceInk: true });
  const opening = drawingCaps({ medium: 'sepia-ink', stage: 'opening', sourceInk: true });
  assert.ok(closing.pressure <= CLOSING_PRESSURE_MAX);
  assert.ok(opening.pressure > closing.pressure);
});

test('damp finish ink admits measured moisture and retains hybrid speed and dwell',()=>{
 const pigment=materialProfile('black-ink').pigment,sh=createSheet(makePaper(80,40),[pigment]);
 for(let i=0;i<sh.n;i++){sh.s[i]=sh.paper.capacity[i]*.35;sh.ever[i]=1;}
 const audit=[],paths=[{dip:.6,low:.03,points:[{x:10,y:20,s:.4,v:.6,dwell:1},{x:10,y:20,s:.4,v:.6},{x:60,y:20,s:.4,v:2}]}];
 drawMaterial(sh,paths,new Float32Array(sh.n),80,40,{medium:'black-ink',stage:'closing',mmPerCell:.2,caps:{lines:10,pressure:.5,edgeMin:0},dryInk:false,O:DEFAULTS,audit});
 assert.equal(audit.length,1);assert.ok(audit[0].before.pore>.3);assert.equal(audit[0].dried,false);
 assert.equal(audit[0].dwellTime,1);assert.equal(audit[0].speeds.at(-1),2);assert.ok(sh.P[0].some(v=>v>0));
});
test('explicit pencil controls reach dry graphite execution',()=>{
 const sh=createSheet(makePaper(30,20),[materialProfile('graphite-HB').pigment]);let seen;
 drawMaterial(sh,g,new Float32Array(600),30,20,{medium:'graphite-HB',mmPerCell:.5,O:DEFAULTS,graphiteOptions:{amount:.12,vary:.35,seed:7},graphiteExecute:(_s,_g,_k,o)=>{seen=o;return {drawn:1};}});
 assert.equal(seen.amount,.12);assert.equal(seen.vary,.35);assert.equal(seen.seed,7);
});

test('an ink width floor widens every contact, past the nib\'s widest when it must', () => {
 const gestures=[{points:[{x:1,y:1,s:.2},{x:9,y:1,s:.2,nw:.1}]},{points:[{x:1,y:3,s:1,nw:20},{x:9,y:3,s:1,nw:20}]}];
 const plain=prepareDrawing(gestures,{medium:'sepia-ink',stage:'closing',mmPerCell:.25,w:10,h:10,state:{used:0},caps:{pressure:1,edgeMin:0}});
 const floored=prepareDrawing(gestures,{medium:'sepia-ink',stage:'closing',mmPerCell:.25,w:10,h:10,state:{used:0},caps:{pressure:1,edgeMin:0},widthFloorMm:.6});
 assert.ok(plain[0].points.every(p=>p.nw*.25<.6));
 assert.ok(floored[0].points.every(p=>Math.abs(p.nw*.25-.6)<1e-9),'thin contacts rise to the floor');
 assert.ok(Math.abs(floored[1].points[0].nw*.25-.6)<1e-9,'the widest contact is the floor when it is above the nib');
 assert.ok(Math.abs(plain[1].points[0].nw*.25-.45)<1e-9);
});
