import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makePaper} from '../../src/media/paper.mjs';
import {createSheet} from '../../src/media/sheet.mjs';
import {createBrush,dip,stroke,candidateContact} from '../../src/media/brush.mjs';
const pigment={K:[1,.5,.2],S:[.1,.1,.1],rho:.1,omega:.2,gamma:.1};
const make=()=>{const sheet=createSheet(makePaper(96,72,{seed:9,fibres:0}),[pigment]);const brush=createBrush({flat:true,radius:12,bristles:24,capacity:100,belly:12,feed:.4,give:.9,free:.4,film:.25,splay:.03,stiffness:8,bridge:.88,wetMix:.55,seed:4});dip(brush,{water:.75,conc:[1]});return {sheet,brush};};
const points=[{x:-4,y:26,r:7,p:.2},{x:38,y:32,r:12,p:1},{x:93,y:45,r:8,p:.3}];
function equal(a,b){assert.deepEqual(b,a);assert.deepEqual(a.cells,[...new Set(a.cells)].sort((x,y)=>x-y));assert.deepEqual(a.neighborIndices,[...new Set(a.neighborIndices)].sort((x,y)=>x-y));}
test('sparse ROW prediction preserves exact full, clipped, lift and halo contracts',()=>{
 for(const spacing of [.7,1.4])for(const upright of [false,true,'sweep'])for(const lift of [true,false]){
  const {sheet,brush}=make();sheet.clip=Uint8Array.from({length:sheet.n},(_,i)=>i%96<90&&i%96!==44);const before=JSON.stringify(brush);const opts={spacing,upright,lift,neighborRadius:3};equal(candidateContact(brush,sheet,points,opts),candidateContact(brush,sheet,points,{...opts,sparseRow:true}));assert.equal(JSON.stringify(brush),before);
 }
});
test('actual prior contact continuation state is preserved without changing live sheet',()=>{
 const {sheet,brush}=make();stroke(brush,sheet,points,{lift:false,upright:false});const before=sheet.W.slice();equal(candidateContact(brush,sheet,points,{lift:false,neighborRadius:3}),candidateContact(brush,sheet,points,{lift:false,neighborRadius:3,sparseRow:true}));assert.deepEqual(sheet.W,before);
});
test('empty, off-sheet and fully clipped predictions remain honest zero contacts',()=>{
 for(const pts of [[],[{x:200,y:200},{x:220,y:220}]]){const {sheet,brush}=make();equal(candidateContact(brush,sheet,pts,{neighborRadius:3}),candidateContact(brush,sheet,pts,{neighborRadius:3,sparseRow:true}));}
 const {sheet,brush}=make();sheet.clip=new Uint8Array(sheet.n);equal(candidateContact(brush,sheet,points,{lift:false}),candidateContact(brush,sheet,points,{lift:false,sparseRow:true}));assert.equal(candidateContact(brush,sheet,points,{lift:false,sparseRow:true}).primaryCellCount,0);
});
test('TUFT fallback retains existing prediction and no sheet-wide fast flags leak',()=>{
 const {sheet}=make();const b=createBrush({model:'tuft',radius:8,bristles:24,capacity:100,seed:3});dip(b,{water:.8,conc:[1]});equal(candidateContact(b,sheet,points,{neighborRadius:2}),candidateContact(b,sheet,points,{neighborRadius:2,sparseRow:true}));
 const s=fs.readFileSync(new URL('../paint-plate.mjs',import.meta.url),'utf8');assert.match(s,/enabled:NATIVE_PAINT_MODE.mode==='fast'&&Boolean\(FAST_SPARSE_CONTACT\)/);assert.equal((s.match(/sparseRow:SPARSE_CONTACT_RECORD.enabled/g)||[]).length,1);assert.match(s,/selectedRowContacts\+\+/);
});
