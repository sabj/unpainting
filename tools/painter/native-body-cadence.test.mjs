import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nativeBodyCadence} from './native-body-cadence.mjs';
import {makePaper} from '../../src/media/paper.mjs';
import {createSheet,DEFAULTS} from '../../src/media/sheet.mjs';
import {createBrush,dip,stroke,recordMarks} from '../../src/media/brush.mjs';
const ordinary={mode:'fast',enabled:true,technique:'wet on dry',radiusCells:10,mmPerCell:.5,every:24};
test('broad Fast pigment uses half as many travel samples with equal nominal flow distance',()=>assert.deepEqual(nativeBodyCadence(ordinary),{spacing:1.4,every:12,approximated:true}));
test('Full and explicit .7 retain prior schedule',()=>{assert.deepEqual(nativeBodyCadence({...ordinary,mode:'full'}),{spacing:.7,every:24,approximated:false});assert.deepEqual(nativeBodyCadence({...ordinary,spacing:.7}),{spacing:.7,every:24,approximated:false});});
test('small/detail/dry/instruction-bound routes retain prior schedule',()=>{for(const change of [{radiusCells:2},{detail:true},{technique:'dry brush'},{technique:'dry brush graded'},{instructionBound:true},{technique:'clean water'}])assert.deepEqual(nativeBodyCadence({...ordinary,...change}),{spacing:.7,every:24,approximated:false});});
test('invalid settings fail closed',()=>{for(const spacing of [0,NaN,2])assert.throws(()=>nativeBodyCadence({...ordinary,spacing}),/spacing/);});
test('actual production stroke records selected spacing and keeps positive pigment inside original clip',()=>{
 const tape=recordMarks(true), pig={K:[1,.5,.2],S:[.1,.1,.1],rho:.1,omega:.2,gamma:.1};
 const sheet=createSheet(makePaper(64,48,{seed:7,fibres:0,tooth:.4}),[pig]);sheet.clip=Uint8Array.from({length:sheet.n},(_,i)=>i%64>=8&&i%64<55&&!(i%64===32));
 sheet._tape=1;
 const b=createBrush({flat:true,radius:10,bristles:20,capacity:100,belly:12,feed:.4,give:.9,free:.4,film:.25,splay:.03,stiffness:8,bridge:0,wetMix:.55,seed:3});
 dip(b,{water:.62,conc:[1]});const c=nativeBodyCadence(ordinary);let flows=0;
 stroke(b,sheet,[{x:12,y:24,p:.5},{x:32,y:24,p:1},{x:50,y:24,p:.5}],{spacing:c.spacing,upright:false,between:n=>{if(n%c.every===0)flows++;}});
 assert.equal(tape.find(m=>m.k==='s').sp,1.4);assert.ok(flows>0);
 let positive=0;for(let i=0;i<sheet.n;i++){assert.ok(Number.isFinite(sheet.W[i]));assert.ok(Number.isFinite(sheet.G[0][i]));if(sheet.G[0][i]>0)positive++;if(!sheet.clip[i])assert.equal(sheet.G[0][i],0);}
 assert.ok(positive>30,'a real broad loaded contact deposits pigment');recordMarks(false);
});
test('disabled default, semantic instructions and Full keep the original route',()=>{
 for(const change of [{enabled:false},{instructionBound:true},{mode:'full'}])assert.equal(nativeBodyCadence({...ordinary,...change}).approximated,false);
});
test('actual major route sees selected spacing before physical stroke',()=>{
 const source=fs.readFileSync(new URL('../paint-plate.mjs',import.meta.url),'utf8');
 assert.match(source,/instructionBound:!!sh\._semantic,technique:T.name/);
 assert.match(source,/candidateContact\(b,\{\.\.\.target,clip:null\},points,\{\.\.\.options,neighborRadius:3(?:,sparseRow:SPARSE_CONTACT_RECORD.enabled)?\}\)/);
 assert.match(source,/stroke\(b,target,points,\{\.\.\.options,spacing:cadence.spacing\}\)/);
 assert.equal((source.match(/numericalStroke\(brush, sheet,/g)||[]).length,3);
 assert.match(source,/stroke\(wet, sheet, pts, \{ upright: UPRIGHT \}\)/);
 assert.match(source,/approximatedCallsReturned\+\+/);
});
